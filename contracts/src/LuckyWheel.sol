// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libs/SignedClaims.sol";

/**
 * @title LuckyWheel
 * @notice BNB prize redemption for the off-chain lucky wheel.
 *         The wheel result and any active boost (e.g., 2x rewards) are
 *         determined by the backend, which signs the resulting payout.
 *         The contract enforces that only signed claims can withdraw BNB.
 */
contract LuckyWheel is Ownable, ReentrancyGuard, SignedClaimsBase {
    /// @notice Hard cap so a compromised signer cannot drain everything.
    uint256 public maxClaimAmount = 0.05 ether;

    event Received(address indexed from, uint256 amount);
    event PrizeAwarded(address indexed user, uint256 amount, uint256 nonce);
    event Withdrawn(address indexed to, uint256 amount);
    event MaxClaimAmountUpdated(uint256 oldMax, uint256 newMax);

    constructor(address _owner, address _signer)
        Ownable(_owner)
        SignedClaimsBase(_signer)
    {}

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice Claim a BNB prize from the wheel using a backend-signed ticket.
     * @param amount Prize amount to send.
     * @param nonce Single-use claim id assigned by the backend (e.g., spin id).
     * @param deadline Unix timestamp after which the signature expires.
     * @param signature ECDSA signature of (chainId, this, msg.sender, amount, nonce, deadline).
     */
    function claimPrize(
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(amount <= maxClaimAmount, "Amount exceeds cap");
        require(address(this).balance >= amount, "Insufficient treasury balance");

        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                msg.sender,
                amount,
                nonce,
                deadline
            )
        );
        _consumeClaim(digest, msg.sender, nonce, deadline, signature);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "BNB transfer failed");

        emit PrizeAwarded(msg.sender, amount, nonce);
    }

    /**
     * @notice Owner-only safety cap.
     */
    function setMaxClaimAmount(uint256 newMax) external onlyOwner {
        require(newMax > 0, "Zero max");
        emit MaxClaimAmountUpdated(maxClaimAmount, newMax);
        maxClaimAmount = newMax;
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(owner(), amount);
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }
}
