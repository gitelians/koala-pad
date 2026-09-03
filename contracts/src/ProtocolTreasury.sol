// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ProtocolTreasury
 * @notice Receives protocol fees and manages two role separations:
 *
 *         - owner (multisig): can withdraw funds and rotate roles.
 *         - feeExemptionGranter: a hot wallet (the backend) that can call
 *           grantFeeExemption() but cannot move funds.
 *         - airdropSigner: the public address whose signatures the
 *           AirdropVault accepts. Held off-chain by the same backend.
 */
contract ProtocolTreasury is Ownable2Step, ReentrancyGuard {
    /// @notice Address allowed to grant fee exemptions (backend hot wallet).
    address public feeExemptionGranter;

    /// @notice Address whose signatures are trusted by AirdropVault.
    address public airdropSigner;

    /// @notice Maps user address to timestamp until which they are exempt from protocol fees.
    mapping(address => uint256) public feeExemptUntil;

    event Received(address indexed from, uint256 amount, string source);
    event Withdrawn(address indexed to, uint256 amount);
    event FeeExemptionGranted(address indexed user, uint256 expiresAt);
    event FeeExemptionGranterUpdated(address indexed oldGranter, address indexed newGranter);
    event AirdropSignerUpdated(address indexed oldSigner, address indexed newSigner);

    constructor(address _owner) Ownable(_owner) {}

    modifier onlyGranter() {
        require(msg.sender == feeExemptionGranter, "Not granter");
        _;
    }

    /**
     * @notice Rotate the fee-exemption granter (hot wallet).
     */
    function setFeeExemptionGranter(address newGranter) external onlyOwner {
        emit FeeExemptionGranterUpdated(feeExemptionGranter, newGranter);
        feeExemptionGranter = newGranter;
    }

    /**
     * @notice Rotate the airdrop signer.
     */
    function setAirdropSigner(address newSigner) external onlyOwner {
        emit AirdropSignerUpdated(airdropSigner, newSigner);
        airdropSigner = newSigner;
    }

    /**
     * @notice Grant fee exemption to a user until a given timestamp.
     *         Only the hot-wallet granter may call this; the granter has
     *         no authority to withdraw funds.
     */
    function grantFeeExemption(address user, uint256 expiresAt) external onlyGranter {
        require(user != address(0), "Invalid address");
        require(expiresAt <= block.timestamp + 7 days, "Exemption too long");
        feeExemptUntil[user] = expiresAt;
        emit FeeExemptionGranted(user, expiresAt);
    }

    function isFeeExempt(address user) external view returns (bool) {
        return feeExemptUntil[user] > block.timestamp;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value, "receive");
    }

    function deposit(string calldata source) external payable {
        emit Received(msg.sender, msg.value, source);
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
