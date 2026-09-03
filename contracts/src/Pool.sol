// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libs/Math.sol";
import "./ProtocolTreasury.sol";

/**
 * @title Pool
 * @notice Constant-product TOKEN/BNB AMM with a 1.2% total fee, split into a
 *         0.85% protocol cut (pushed to the treasury on every swap) and a
 *         0.35% creator cut (accrued in-contract and claimed by the creator
 *         via {claimCreatorFees}).
 *
 *         The pool is initialised exactly once by its associated ICO contract;
 *         all other callers are rejected.
 *
 *         Deployed as an EIP-1167 minimal proxy. The implementation locks
 *         itself in its constructor; each clone is wired by the factory via
 *         {init} immediately after creation.
 */
contract Pool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public protocolTreasury;
    address public factory;
    /// @notice Token creator — receives the accrued 0.35% creator fee.
    address public creator;

    /// @notice ICO contract authorised to seed initial liquidity. Set once
    ///         by the factory after the ICO is deployed.
    address public ico;
    /// @notice True once initial liquidity has been added.
    bool public initialized;

    uint256 public reserveToken;
    uint256 public reserveBNB;

    // Fee schedule (basis points; 10_000 = 100%).
    uint256 public constant PROTOCOL_FEE_BPS = 85;  // 0.85%
    uint256 public constant CREATOR_FEE_BPS  = 35;  // 0.35%
    uint256 public constant TOTAL_FEE_BPS    = PROTOCOL_FEE_BPS + CREATOR_FEE_BPS; // 1.20%
    uint256 public constant FEE_DENOMINATOR  = 10_000;

    /// @notice Accumulated creator-fee BNB awaiting `claimCreatorFees()`.
    uint256 public creatorFeesAccrued;

    /// @notice Clone-init guard. Implementation sets `true` in its
    ///         constructor; each clone flips it via {init}.
    bool private _setupDone;

    event Swap(
        address indexed user,
        uint256 amountIn,
        uint256 amountOut,
        bool isBuyingToken
    );
    event LiquidityAdded(uint256 tokenAmount, uint256 bnbAmount);
    event Sync(uint256 reserveToken, uint256 reserveBNB);
    event ICOSet(address indexed ico);
    event CreatorFeesAccrued(uint256 amount);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    constructor() {
        // Lock the implementation against direct init.
        _setupDone = true;
    }

    /**
     * @notice One-shot setup for a freshly cloned pool. Callable only
     *         once. The caller becomes the bound factory (i.e. the only
     *         address allowed to later call {setICO}).
     * @param _token            Token contract address.
     * @param _protocolTreasury Protocol treasury for fees.
     * @param _creator          Token creator (recipient of accrued creator fees).
     */
    function init(
        address _token,
        address _protocolTreasury,
        address _creator
    ) external {
        require(!_setupDone, "Already initialized");
        require(_token != address(0), "Zero token");
        require(_protocolTreasury != address(0), "Zero treasury");
        require(_creator != address(0), "Zero creator");
        _setupDone = true;

        token = IERC20(_token);
        protocolTreasury = _protocolTreasury;
        creator = _creator;
        factory = msg.sender;
    }

    /**
     * @notice Bind this pool to its ICO. Only the deploying factory can
     *         do this, and only once.
     */
    function setICO(address _ico) external {
        require(msg.sender == factory, "Only factory");
        require(ico == address(0), "ICO already set");
        require(_ico != address(0), "Zero ICO");
        ico = _ico;
        emit ICOSet(_ico);
    }

    /**
     * @notice Add initial liquidity. Only callable by the bound ICO and
     *         only once.
     * @param tokenAmount Token amount to add.
     */
    function addInitialLiquidity(uint256 tokenAmount) external payable nonReentrant {
        require(msg.sender == ico, "Only ICO");
        require(!initialized, "Already initialized");
        require(tokenAmount > 0, "Invalid token amount");
        require(msg.value > 0, "Invalid BNB amount");

        // Tokens are minted directly to the pool by Token.initialize().
        require(token.balanceOf(address(this)) >= tokenAmount, "Insufficient token balance");

        initialized = true;
        reserveToken = tokenAmount;
        reserveBNB = msg.value;

        emit LiquidityAdded(tokenAmount, msg.value);
        emit Sync(reserveToken, reserveBNB);
    }

    /**
     * @notice Swap exact BNB for tokens.
     * @param minTokenOut Minimum tokens to receive (slippage protection).
     */
    function swapExactBNBForTokens(uint256 minTokenOut)
        external
        payable
        nonReentrant
        returns (uint256 tokenOut)
    {
        require(initialized, "Pool not initialized");
        require(msg.value > 0, "Invalid BNB amount");

        bool exempt = ProtocolTreasury(payable(protocolTreasury)).isFeeExempt(msg.sender);

        uint256 protocolFee;
        uint256 creatorFee;
        uint256 bnbAfterFee;
        if (exempt) {
            bnbAfterFee = msg.value;
        } else {
            protocolFee = (msg.value * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
            creatorFee  = (msg.value * CREATOR_FEE_BPS)  / FEE_DENOMINATOR;
            bnbAfterFee = msg.value - protocolFee - creatorFee;
        }

        tokenOut = getAmountOut(bnbAfterFee, reserveBNB, reserveToken);
        require(tokenOut >= minTokenOut, "Slippage exceeded");
        require(tokenOut < reserveToken, "Insufficient liquidity");

        reserveBNB += bnbAfterFee;
        reserveToken -= tokenOut;

        if (creatorFee > 0) {
            creatorFeesAccrued += creatorFee;
            emit CreatorFeesAccrued(creatorFee);
        }

        token.safeTransfer(msg.sender, tokenOut);

        if (protocolFee > 0) {
            (bool success, ) = payable(protocolTreasury).call{value: protocolFee}("");
            require(success, "Fee transfer failed");
        }

        emit Swap(msg.sender, msg.value, tokenOut, true);
        emit Sync(reserveToken, reserveBNB);
    }

    /**
     * @notice Swap exact tokens for BNB.
     */
    function swapExactTokensForBNB(uint256 tokenIn, uint256 minBNBOut)
        external
        nonReentrant
        returns (uint256 bnbOut)
    {
        require(initialized, "Pool not initialized");
        require(tokenIn > 0, "Invalid token amount");

        bool exempt = ProtocolTreasury(payable(protocolTreasury)).isFeeExempt(msg.sender);

        uint256 bnbBeforeFee = getAmountOut(tokenIn, reserveToken, reserveBNB);
        uint256 protocolFee;
        uint256 creatorFee;
        if (exempt) {
            bnbOut = bnbBeforeFee;
        } else {
            protocolFee = (bnbBeforeFee * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
            creatorFee  = (bnbBeforeFee * CREATOR_FEE_BPS)  / FEE_DENOMINATOR;
            bnbOut = bnbBeforeFee - protocolFee - creatorFee;
        }

        require(bnbOut >= minBNBOut, "Slippage exceeded");
        require(bnbOut < reserveBNB, "Insufficient liquidity");

        token.safeTransferFrom(msg.sender, address(this), tokenIn);

        reserveToken += tokenIn;
        reserveBNB -= bnbBeforeFee;

        if (creatorFee > 0) {
            creatorFeesAccrued += creatorFee;
            emit CreatorFeesAccrued(creatorFee);
        }

        (bool success1, ) = payable(msg.sender).call{value: bnbOut}("");
        require(success1, "BNB transfer failed");

        if (protocolFee > 0) {
            (bool success2, ) = payable(protocolTreasury).call{value: protocolFee}("");
            require(success2, "Fee transfer failed");
        }

        emit Swap(msg.sender, tokenIn, bnbOut, false);
        emit Sync(reserveToken, reserveBNB);
    }

    /**
     * @notice Withdraw all accrued creator fees to the creator. Only the
     *         creator may call this. The amount returned is the running
     *         `creatorFeesAccrued` balance at the time of the call.
     * @return amount BNB transferred to the creator.
     */
    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        require(msg.sender == creator, "Only creator");
        amount = creatorFeesAccrued;
        require(amount > 0, "Nothing to claim");
        creatorFeesAccrued = 0;
        (bool ok, ) = payable(creator).call{value: amount}("");
        require(ok, "BNB transfer failed");
        emit CreatorFeesClaimed(creator, amount);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "Invalid input amount");
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves");

        uint256 numerator = amountIn * reserveOut;
        uint256 denominator = reserveIn + amountIn;
        amountOut = numerator / denominator;
    }

    function getPrice() external view returns (uint256) {
        if (reserveToken == 0) return 0;
        return (reserveBNB * 1e18) / reserveToken;
    }

    function getMarketCap(uint256 totalSupply) external view returns (uint256) {
        if (reserveToken == 0) return 0;
        return (reserveBNB * totalSupply) / reserveToken;
    }

    receive() external payable {}
}
