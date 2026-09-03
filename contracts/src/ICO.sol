// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Pool.sol";
import "./ProtocolTreasury.sol";

/**
 * @title ICO
 * @notice ICO contract for token launch with 10 rounds priced on a
 *         square-root curve. The sale stays open with no deadline until
 *         every round is sold out, at which point _finalize() is invoked
 *         automatically.
 *
 *         Deployed as an EIP-1167 minimal proxy. The implementation locks
 *         itself in its constructor; each clone is wired by the factory
 *         via {init} immediately after creation.
 *
 *         During the sale, BNB is collected and the user's allocation is
 *         credited in `tokensPurchased`. Tokens are NOT transferred until
 *         finalize() runs.
 *
 *         Buyers may withdraw their contribution at any time before
 *         finalisation. A withdraw returns BNB minus the 1.2% total fee
 *         and proportionally returns the buyer's credited tokens to the
 *         pre-sale allocation (rolling the round counter backwards if the
 *         current round overflows).
 *
 *         Fee split on both buy() and withdraw():
 *           0.85% → protocol treasury (sent immediately)
 *           0.35% → creator (accrued in this contract; creator claims via
 *                   {claimCreatorFees})
 *
 *         On finalize: 1 BNB to creator, remainder seeded into the pool.
 *         `creatorFeesAccrued` is held back from the pool seed and remains
 *         claimable by the creator at any time, including after finalize.
 */
contract ICO is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    Pool public pool;
    address public creator;
    address public protocolTreasury;

    // ─────────────────────────────────────────────────────────────────────
    // Constants — see CLAUDE.md / spec for derivation.
    //
    // Distribution of the 21M total supply:
    //   ICO     : 10,500,000 (50%)  → split across 10 rounds of 1,050,000
    //   POOL    :  8,400,000 (40%)  → seeds AMM at finalisation
    //   AIRDROP :  2,100,000 (10%)  → AirdropVault, locked until pool TVL
    //
    // Pricing — square-root curve:
    //   pricePerToken(round) = A + B * sqrt(round)
    //     A = 1_511_700_000_000   wei per 1e18 token (≈ 1.5117e-6 BNB)
    //     B =   344_620_000_000   wei per 1e18 token (≈ 0.34462e-6 BNB)
    //
    // Round prices are pre-computed (table below) to avoid integer-sqrt
    // precision loss and to save gas.
    //
    // BNB raised if all 10 rounds sell out: ≈ 24.0024 BNB (≈ ICO_GOAL).
    // Pool opening price ≈ 2.7381e-6 BNB/token, +5.3% above round 10
    // (2.6012e-6) — this protects late ICO buyers from opening underwater.
    // ─────────────────────────────────────────────────────────────────────

    uint256 public constant ICO_GOAL = 24 ether;
    uint256 public constant CREATOR_SHARE = 1 ether;
    uint256 public constant POOL_SHARE = 23 ether;

    uint256 public constant TOTAL_ROUNDS = 10;
    uint256 public constant TOKENS_PER_ROUND = 1_050_000 * 1e18;

    // Sqrt-curve constants (kept as constants for documentation /
    // off-chain verification).
    uint256 public constant PRICE_A = 1_511_700_000_000;
    uint256 public constant PRICE_B = 344_620_000_000;

    // Fee schedule (basis points; 10_000 = 100%). Matches Pool.sol.
    uint256 public constant PROTOCOL_FEE_BPS = 85;  // 0.85%
    uint256 public constant CREATOR_FEE_BPS  = 35;  // 0.35%
    uint256 public constant TOTAL_FEE_BPS    = PROTOCOL_FEE_BPS + CREATOR_FEE_BPS; // 1.20%
    uint256 public constant FEE_DENOMINATOR  = 10_000;

    uint256 public currentRound; // 1-indexed
    uint256 public tokensSoldInCurrentRound;
    uint256 public totalBNBRaised;
    bool public finalized;

    /// @notice Accumulated creator-fee BNB awaiting `claimCreatorFees()`.
    uint256 public creatorFeesAccrued;

    /// @notice Clone-init guard.
    bool private _setupDone;

    mapping(address => uint256) public contributions;
    mapping(address => uint256) public tokensPurchased;
    mapping(address => bool) public tokensClaimed;

    event TokensPurchased(address indexed buyer, uint256 round, uint256 tokens, uint256 bnb);
    event TokensWithdrawn(address indexed buyer, uint256 grossBnb, uint256 netBnb, uint256 tokensReturned);
    event RoundCompleted(uint256 indexed round, uint256 bnbRaisedInRound);
    event ICOCompleted(uint256 totalRaised);
    event ICOFinalized(uint256 totalRaised);
    event TokensClaimed(address indexed user, uint256 amount);
    event CreatorFeesAccrued(uint256 amount);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    constructor() {
        // Lock the implementation against direct init.
        _setupDone = true;
    }

    /**
     * @notice One-shot setup for a freshly cloned ICO. Callable only
     *         once, typically by the factory immediately after deploying
     *         the clone.
     */
    function init(
        address _token,
        address _pool,
        address _creator,
        address _protocolTreasury
    ) external {
        require(!_setupDone, "Already initialized");
        require(_token != address(0), "Zero token");
        require(_pool != address(0), "Zero pool");
        require(_creator != address(0), "Zero creator");
        require(_protocolTreasury != address(0), "Zero treasury");
        _setupDone = true;

        token = IERC20(_token);
        pool = Pool(payable(_pool));
        creator = _creator;
        protocolTreasury = _protocolTreasury;
        currentRound = 1;
    }

    /**
     * @notice BNB price per 1e18 token at a given round (1-indexed).
     *
     *         Values are pre-computed from the curve A + B*sqrt(round) and
     *         hard-coded to (a) preserve the spec's exact wei values and
     *         (b) avoid the gas + precision cost of an on-chain sqrt.
     */
    function getRoundPrice(uint256 round) public pure returns (uint256 pricePerToken) {
        require(round >= 1 && round <= TOTAL_ROUNDS, "Invalid round");
        if (round == 1)  return 1_856_320_000_000;
        if (round == 2)  return 1_998_970_000_000;
        if (round == 3)  return 2_108_560_000_000;
        if (round == 4)  return 2_200_940_000_000;
        if (round == 5)  return 2_282_300_000_000;
        if (round == 6)  return 2_355_840_000_000;
        if (round == 7)  return 2_423_470_000_000;
        if (round == 8)  return 2_486_400_000_000;
        if (round == 9)  return 2_545_560_000_000;
        return                2_601_200_000_000; // round 10
    }

    /**
     * @notice Buy tokens at the current ICO price. Tokens are credited
     *         (not yet transferred) until finalize() is called.
     *
     *         Excess BNB (rounding dust beyond what fills the remaining
     *         rounds) is refunded to the buyer in the same transaction.
     */
    function buy() external payable nonReentrant {
        require(!finalized, "ICO already finalized");
        require(currentRound <= TOTAL_ROUNDS, "All rounds sold");
        require(msg.value > 0, "Must send BNB");

        bool exempt = ProtocolTreasury(payable(protocolTreasury)).isFeeExempt(msg.sender);
        uint256 protocolFee;
        uint256 creatorFee;
        if (!exempt) {
            protocolFee = (msg.value * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
            creatorFee  = (msg.value * CREATOR_FEE_BPS)  / FEE_DENOMINATOR;
        }
        if (protocolFee > 0) {
            (bool feeSuccess, ) = payable(protocolTreasury).call{value: protocolFee}("");
            require(feeSuccess, "Fee transfer failed");
        }
        if (creatorFee > 0) {
            creatorFeesAccrued += creatorFee;
            emit CreatorFeesAccrued(creatorFee);
        }

        uint256 bnbRemaining = msg.value - protocolFee - creatorFee;
        uint256 totalTokensBought = 0;
        uint256 startRound = currentRound;
        uint256 bnbInRound = 0;

        while (bnbRemaining > 0 && currentRound <= TOTAL_ROUNDS) {
            uint256 pricePerToken = getRoundPrice(currentRound);
            uint256 tokensAvailableInRound = TOKENS_PER_ROUND - tokensSoldInCurrentRound;

            uint256 costForRemaining = (tokensAvailableInRound * pricePerToken) / 1e18;

            if (bnbRemaining >= costForRemaining) {
                totalTokensBought += tokensAvailableInRound;
                bnbRemaining -= costForRemaining;
                bnbInRound += costForRemaining;
                emit RoundCompleted(currentRound, bnbInRound);
                tokensSoldInCurrentRound = 0;
                bnbInRound = 0;
                currentRound++;
            } else {
                uint256 tokensBought = (bnbRemaining * 1e18) / pricePerToken;
                if (tokensBought > tokensAvailableInRound) {
                    tokensBought = tokensAvailableInRound;
                }
                totalTokensBought += tokensBought;
                tokensSoldInCurrentRound += tokensBought;
                bnbRemaining = 0;
            }
        }

        uint256 bnbSpent = msg.value - protocolFee - creatorFee - bnbRemaining;
        require(bnbSpent > 0, "No tokens purchased");

        totalBNBRaised += bnbSpent;
        contributions[msg.sender] += bnbSpent;
        tokensPurchased[msg.sender] += totalTokensBought;

        // Refund excess BNB (rounding dust beyond the final round).
        if (bnbRemaining > 0) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: bnbRemaining}("");
            require(refundSuccess, "Refund failed");
        }

        emit TokensPurchased(msg.sender, startRound, totalTokensBought, bnbSpent);

        // Auto-finalize once every round is sold.
        if (currentRound > TOTAL_ROUNDS) {
            emit ICOCompleted(totalBNBRaised);
            _finalize();
        }
    }

    /**
     * @notice Withdraw a portion (or all) of one's ICO contribution before
     *         finalisation. The buyer specifies the GROSS BNB to remove
     *         from their `contributions` balance; they receive that minus
     *         the 1.2% total fee (0.85% protocol + 0.35% creator-accrued).
     *
     *         The buyer's `tokensPurchased` credit is reduced proportionally
     *         to how much of their contribution they pull out. Those tokens
     *         are returned to the pre-sale allocation by rewinding
     *         `tokensSoldInCurrentRound` (and stepping `currentRound` back
     *         if the returned tokens overflow the current round).
     */
    function withdraw(uint256 grossBnb) external nonReentrant {
        require(!finalized, "ICO already finalized");
        require(grossBnb > 0, "Must withdraw > 0");

        uint256 userContribution = contributions[msg.sender];
        require(grossBnb <= userContribution, "Exceeds contribution");

        uint256 userTokens = tokensPurchased[msg.sender];
        // Proportional: tokensToReturn / userTokens == grossBnb / userContribution.
        // Equivalent to "the same fraction of the user's holdings comes back".
        uint256 tokensToReturn = (userTokens * grossBnb) / userContribution;

        contributions[msg.sender] = userContribution - grossBnb;
        tokensPurchased[msg.sender] = userTokens - tokensToReturn;
        totalBNBRaised -= grossBnb;

        // Rewind the round counter. If the returned tokens exceed what was
        // sold in the current round, step back to the previous round whose
        // 1,050,000-token bucket re-fills, and continue draining from there.
        uint256 remaining = tokensToReturn;
        while (remaining > 0) {
            if (remaining <= tokensSoldInCurrentRound) {
                tokensSoldInCurrentRound -= remaining;
                remaining = 0;
            } else {
                remaining -= tokensSoldInCurrentRound;
                require(currentRound > 1, "Cannot rewind past round 1");
                currentRound--;
                tokensSoldInCurrentRound = TOKENS_PER_ROUND;
            }
        }

        bool exempt = ProtocolTreasury(payable(protocolTreasury)).isFeeExempt(msg.sender);
        uint256 protocolFee;
        uint256 creatorFee;
        if (!exempt) {
            protocolFee = (grossBnb * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
            creatorFee  = (grossBnb * CREATOR_FEE_BPS)  / FEE_DENOMINATOR;
        }
        uint256 netToUser = grossBnb - protocolFee - creatorFee;

        if (protocolFee > 0) {
            (bool feeOk, ) = payable(protocolTreasury).call{value: protocolFee}("");
            require(feeOk, "Fee transfer failed");
        }
        if (creatorFee > 0) {
            creatorFeesAccrued += creatorFee;
            emit CreatorFeesAccrued(creatorFee);
        }
        (bool ok, ) = payable(msg.sender).call{value: netToUser}("");
        require(ok, "Withdraw failed");

        emit TokensWithdrawn(msg.sender, grossBnb, netToUser, tokensToReturn);
    }

    /**
     * @notice Withdraw all accrued creator fees to the creator. Only the
     *         creator may call this. May be called before or after the ICO
     *         has finalised.
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

    /**
     * @notice Finalize the ICO: pay the creator (fixed 1 BNB), seed the
     *         pool with the remainder, then tokens become claimable.
     *
     *         The pool seed deliberately excludes `creatorFeesAccrued` so
     *         those funds remain claimable by the creator after finalize.
     *
     *         Checks-effects-interactions: state flags are flipped before
     *         any external call. Pool seeding asserts the opening price
     *         is strictly above the last ICO round price (the late-buyer
     *         protection invariant).
     */
    function _finalize() internal {
        finalized = true;

        // Spendable balance = total - amount reserved for creator-fee claims.
        uint256 bal = address(this).balance - creatorFeesAccrued;

        // Fixed 1 BNB creator fee, paid before pool seeding (CEI).
        uint256 creatorAmount = CREATOR_SHARE;
        if (creatorAmount > bal) creatorAmount = bal; // pathological under-fund safety
        uint256 poolAmount = bal - creatorAmount;

        // Pay creator first. If the creator is malicious / has a reverting
        // fallback, route their share into the pool instead of bricking.
        (bool creatorSuccess, ) = payable(creator).call{value: creatorAmount, gas: 30_000}("");
        if (!creatorSuccess) {
            poolAmount = bal;
            creatorAmount = 0;
        }

        uint256 poolTokenBalance = token.balanceOf(address(pool));

        // Late-buyer protection: opening price must strictly exceed the
        // last ICO round price (round 10). Comparing wei-per-1e18-token:
        //   open = poolAmount * 1e18 / poolTokenBalance
        //   last = getRoundPrice(TOTAL_ROUNDS)
        uint256 openPricePerToken = (poolAmount * 1e18) / poolTokenBalance;
        require(
            openPricePerToken > getRoundPrice(TOTAL_ROUNDS),
            "Pool open price must exceed last round"
        );

        pool.addInitialLiquidity{value: poolAmount}(poolTokenBalance);

        emit ICOFinalized(totalBNBRaised);
    }

    /**
     * @notice After the ICO is finalized, claim your purchased tokens.
     */
    function claimTokens() external nonReentrant {
        require(finalized, "ICO not finalized");
        require(!tokensClaimed[msg.sender], "Already claimed");
        uint256 amount = tokensPurchased[msg.sender];
        require(amount > 0, "Nothing to claim");

        tokensClaimed[msg.sender] = true;
        token.safeTransfer(msg.sender, amount);
        emit TokensClaimed(msg.sender, amount);
    }

    function getICOInfo() external view returns (
        uint256 _currentRound,
        uint256 _tokensSoldInCurrentRound,
        uint256 _totalBNBRaised,
        bool _finalized,
        uint256 _currentPrice
    ) {
        _currentRound = currentRound;
        _tokensSoldInCurrentRound = tokensSoldInCurrentRound;
        _totalBNBRaised = totalBNBRaised;
        _finalized = finalized;
        _currentPrice = currentRound <= TOTAL_ROUNDS ? getRoundPrice(currentRound) : 0;
    }

    receive() external payable {}
}
