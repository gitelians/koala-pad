import { expect } from "chai";
import { ethers } from "hardhat";
import { LuckyWheel } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Negative tests against the previously-catastrophic withdrawal paths.
 */
describe("Signed-claim contracts (audit fixes)", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let signer: SignerWithAddress;
  let attacker: SignerWithAddress;

  beforeEach(async function () {
    [owner, user, signer, attacker] = await ethers.getSigners();
  });

  async function signClaim(
    contract: string,
    abiTypes: string[],
    abiValues: any[],
    signerWallet = signer,
  ) {
    const types = ["uint256", "address", ...abiTypes];
    const values = [(await ethers.provider.getNetwork()).chainId, contract, ...abiValues];
    const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(types, values));
    return signerWallet.signMessage(ethers.getBytes(digest));
  }

  describe("LuckyWheel", function () {
    let wheel: LuckyWheel;
    beforeEach(async function () {
      const LuckyWheel = await ethers.getContractFactory("LuckyWheel");
      wheel = (await LuckyWheel.deploy(owner.address, signer.address)) as LuckyWheel;
      await user.sendTransaction({ to: await wheel.getAddress(), value: ethers.parseEther("10") });
    });

    it("rejects an attacker-signed prize", async function () {
      const amount = ethers.parseEther("0.001");
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const sig = await signClaim(
        await wheel.getAddress(),
        ["address", "uint256", "uint256", "uint256"],
        [attacker.address, amount, 1, deadline],
        attacker,
      );
      await expect(
        wheel.connect(attacker).claimPrize(amount, 1, deadline, sig),
      ).to.be.revertedWithCustomError(wheel, "InvalidSignature");
    });
  });
});
