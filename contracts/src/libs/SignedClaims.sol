// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SignedClaimsBase
 * @notice Mixin that lets a contract authorise individual claims via an
 *         off-chain ECDSA signature. The backend signs a tuple of
 *         (chainId, contract, user, ...payload, nonce, deadline) and the
 *         contract verifies it before paying out.
 *
 *         Each (user, nonce) is single-use to prevent replays. The owner
 *         can rotate the signer key.
 */
abstract contract SignedClaimsBase is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /// @notice Address authorised to sign claim payloads.
    address public claimSigner;

    /// @notice Tracks consumed nonces per user so signatures can't be replayed.
    mapping(address => mapping(uint256 => bool)) public usedNonce;

    event ClaimSignerUpdated(address indexed oldSigner, address indexed newSigner);

    error InvalidSignature();
    error SignatureExpired();
    error NonceAlreadyUsed();
    error SignerNotSet();

    constructor(address _signer) {
        claimSigner = _signer;
    }

    /**
     * @notice Rotate the claim signer.
     * @dev Only the contract owner (multisig) can call.
     */
    function setClaimSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero signer");
        emit ClaimSignerUpdated(claimSigner, newSigner);
        claimSigner = newSigner;
    }

    /**
     * @notice Verify a claim signature and consume its nonce.
     * @param digest The keccak256 hash of the abi-encoded claim payload.
     *               Caller is responsible for including chainid, this
     *               address, the user, and any sensitive parameters.
     * @param user Address that the claim was issued for.
     * @param nonce Single-use identifier for this claim.
     * @param deadline Unix timestamp after which the signature is no
     *        longer valid.
     * @param signature 65-byte ECDSA signature produced by `claimSigner`.
     */
    function _consumeClaim(
        bytes32 digest,
        address user,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) internal {
        if (claimSigner == address(0)) revert SignerNotSet();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (usedNonce[user][nonce]) revert NonceAlreadyUsed();

        bytes32 ethSigned = digest.toEthSignedMessageHash();
        address recovered = ethSigned.recover(signature);
        if (recovered != claimSigner) revert InvalidSignature();

        usedNonce[user][nonce] = true;
    }
}
