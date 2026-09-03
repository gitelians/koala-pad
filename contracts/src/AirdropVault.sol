// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./Pool.sol";

interface IAirdropSignerRegistry {
    function airdropSigner() external view returns (address);
}

/**
 * @title AirdropVault
 * @notice Holds 10% of token supply locked until pool liquidity reaches
 *         a threshold. Distribution recipients/amounts are computed
 *         off-chain by the protocol and authorised via an ECDSA signature
 *         from a known signer (read from the protocol treasury).
 *
 *         Deployed as an EIP-1167 minimal proxy. The implementation locks
 *         itself in its constructor; each clone is wired by the factory
 *         via {init} immediately after creation.
 */
contract AirdropVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IERC20 public token;
    Pool public pool;
    /// @notice Address that hosts the airdrop signer (the ProtocolTreasury).
    address public signerRegistry;

    bool public airdropTriggered;
    /// @notice Pool BNB reserve threshold gating airdrop distribution (50 BNB).
    uint256 public constant THRESHOLD = 50 ether;
    /// @notice Sanity cap on the recipient list to bound gas.
    /// @dev    Recipients are computed off-chain as the top 20% of unique
    ///         token holders by balance at the moment the threshold is hit;
    ///         the list is then signed by the airdrop signer and submitted
    ///         here. This contract enforces the threshold + signature check
    ///         only — the holder ranking lives in the off-chain backend.
    uint256 public constant MAX_RECIPIENTS = 200;

    mapping(address => bool) public excluded;

    /// @notice Clone-init guard.
    bool private _setupDone;

    event AirdropDistributed(uint256 totalTokens, uint256 recipientCount, bytes32 listHash);

    constructor() {
        // Lock the implementation against direct init.
        _setupDone = true;
    }

    /**
     * @notice One-shot setup for a freshly cloned vault. Callable only
     *         once, typically by the factory immediately after deploying
     *         the clone.
     */
    function init(
        address _token,
        address _pool,
        address _ico,
        address _signerRegistry
    ) external {
        require(!_setupDone, "Already initialized");
        require(_token != address(0), "Zero token");
        require(_pool != address(0), "Zero pool");
        require(_ico != address(0), "Zero ICO");
        require(_signerRegistry != address(0), "Zero registry");
        _setupDone = true;

        token = IERC20(_token);
        pool = Pool(payable(_pool));
        signerRegistry = _signerRegistry;

        excluded[_pool] = true;
        excluded[_ico] = true;
        excluded[address(this)] = true;
        excluded[address(0)] = true;
    }

    function isEligible() external view returns (bool) {
        return !airdropTriggered && pool.reserveBNB() >= THRESHOLD;
    }

    /**
     * @notice Trigger the airdrop using a backend-signed recipient list.
     *         The signer (read from the registry) must be the same one
     *         the protocol uses for off-chain claim authorisation.
     * @param recipients Holder addresses receiving the airdrop.
     * @param amounts Token amounts per recipient.
     * @param deadline Unix timestamp after which the signature is invalid.
     * @param signature ECDSA signature of the abi-encoded payload.
     */
    function triggerAirdrop(
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(!airdropTriggered, "Airdrop already triggered");
        require(pool.reserveBNB() >= THRESHOLD, "Pool threshold not reached");
        require(recipients.length > 0, "No recipients");
        require(recipients.length <= MAX_RECIPIENTS, "Too many recipients");
        require(recipients.length == amounts.length, "Length mismatch");
        require(block.timestamp <= deadline, "Signature expired");

        uint256 vaultBalance = token.balanceOf(address(this));
        require(vaultBalance > 0, "No tokens to distribute");

        // Verify signature.
        bytes32 listHash = keccak256(abi.encode(recipients, amounts));
        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                "airdrop",
                listHash,
                vaultBalance,
                deadline
            )
        );
        address recovered = digest.toEthSignedMessageHash().recover(signature);
        address expected = IAirdropSignerRegistry(signerRegistry).airdropSigner();
        require(expected != address(0) && recovered == expected, "Invalid signature");

        // Verify amounts sum and each recipient is valid.
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        require(totalAmount == vaultBalance, "Amount mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(!excluded[recipients[i]], "Excluded address");
            require(amounts[i] > 0, "Zero amount");
        }

        airdropTriggered = true;

        for (uint256 i = 0; i < recipients.length; i++) {
            token.safeTransfer(recipients[i], amounts[i]);
        }

        emit AirdropDistributed(vaultBalance, recipients.length, listHash);
    }
}
