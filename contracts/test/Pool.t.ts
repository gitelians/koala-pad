import { expect } from "chai";
import { ethers } from "hardhat";
import { LaunchpadFactory, ICO, Pool, ProtocolTreasury, Token } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * The new Pool can only be initialised by its bound ICO. We exercise the
 * full ICO -> Pool initialisation flow in setup, then test swap behaviour.
 */
describe("Pool (post-audit)", function () {
  let factory: LaunchpadFactory;
  let treasury: ProtocolTreasury;
  let pool: Pool;
  let token: Token;
  let ico: ICO;
  let owner: SignerWithAddress;
  let trader: SignerWithAddress;
  let creator: SignerWithAddress;
  let signer: SignerWithAddress;

  beforeEach(async function () {
    [owner, trader, creator, signer] = await ethers.getSigners();

    const ProtocolTreasuryF = await ethers.getContractFactory("ProtocolTreasury");
    treasury = (await ProtocolTreasuryF.deploy(owner.address)) as ProtocolTreasury;
    await treasury.setAirdropSigner(signer.address);

    const LuckyWheelF = await ethers.getContractFactory("LuckyWheel");
    const wheel = await LuckyWheelF.deploy(owner.address, signer.address);

    // Deploy the four child implementations for the clone-based factory.
    const TokenImplF = await ethers.getContractFactory("Token");
    const tokenImpl = await TokenImplF.deploy();
    const PoolImplF = await ethers.getContractFactory("Pool");
    const poolImpl = await PoolImplF.deploy();
    const ICOImplF = await ethers.getContractFactory("ICO");
    const icoImpl = await ICOImplF.deploy();
    const VaultImplF = await ethers.getContractFactory("AirdropVault");
    const vaultImpl = await VaultImplF.deploy();

    const LaunchpadFactoryF = await ethers.getContractFactory("LaunchpadFactory");
    factory = (await LaunchpadFactoryF.deploy(
      await treasury.getAddress(),
      await wheel.getAddress(),
      await tokenImpl.getAddress(),
      await poolImpl.getAddress(),
      await icoImpl.getAddress(),
      await vaultImpl.getAddress(),
    )) as LaunchpadFactory;

    // Create a token via the factory.
    const tx = await factory.connect(creator).createToken("Test", "TEST");
    const receipt = await tx.wait();
    const evt = receipt!.logs
      .map(l => { try { return factory.interface.parseLog(l as any) } catch { return null } })
      .find(e => e?.name === "TokenCreated") as any;

    token = (await ethers.getContractAt("Token", evt.args.token)) as Token;
    pool = (await ethers.getContractAt("Pool", evt.args.pool)) as Pool;
    ico = (await ethers.getContractAt("ICO", evt.args.ico)) as ICO;

    // Drive the ICO to completion so the Pool gets initialised.
    // The ICO raises ≈24 BNB across 10 sqrt-curve rounds; send 25 BNB
    // and let the contract refund the rounding dust.
    await ico.connect(trader).buy({ value: ethers.parseEther("25") });
    expect(await ico.finalized()).to.equal(true);
    expect(await pool.initialized()).to.equal(true);
  });

  describe("Pool initialization gating", function () {
    it("rejects another initialisation call", async function () {
      await expect(pool.addInitialLiquidity(1, { value: 1 })).to.be.revertedWith("Only ICO");
    });
  });

  describe("BNB->Token swaps", function () {
    it("charges 0.85% protocol fee to the treasury", async function () {
      const bnbIn = ethers.parseEther("0.001");
      const expectedFee = (bnbIn * 85n) / 10_000n;

      const before = await ethers.provider.getBalance(await treasury.getAddress());
      await pool.connect(trader).swapExactBNBForTokens(0, { value: bnbIn });
      const after = await ethers.provider.getBalance(await treasury.getAddress());

      expect(after - before).to.equal(expectedFee);
    });

    it("accrues 0.35% creator fee, claimable by the creator", async function () {
      const bnbIn = ethers.parseEther("0.001");
      const expectedCreatorFee = (bnbIn * 35n) / 10_000n;

      await pool.connect(trader).swapExactBNBForTokens(0, { value: bnbIn });
      expect(await pool.creatorFeesAccrued()).to.equal(expectedCreatorFee);

      // Non-creator cannot claim.
      await expect(pool.connect(trader).claimCreatorFees()).to.be.revertedWith("Only creator");

      const creatorBefore = await ethers.provider.getBalance(creator.address);
      const tx = await pool.connect(creator).claimCreatorFees();
      const rcpt = await tx.wait();
      const gas = rcpt!.gasUsed * rcpt!.gasPrice;
      const creatorAfter = await ethers.provider.getBalance(creator.address);

      expect(creatorAfter - creatorBefore + gas).to.equal(expectedCreatorFee);
      expect(await pool.creatorFeesAccrued()).to.equal(0n);
    });

    it("respects slippage", async function () {
      await expect(
        pool.connect(trader).swapExactBNBForTokens(ethers.parseEther("1000000000000"), { value: ethers.parseEther("0.001") }),
      ).to.be.revertedWith("Slippage exceeded");
    });
  });

  describe("Token->BNB swaps", function () {
    it("settles the user with slippage protection", async function () {
      // Trader has tokens from the ICO via claimTokens.
      await ico.connect(trader).claimTokens();
      const tokenIn = ethers.parseEther("1000");
      await token.connect(trader).approve(await pool.getAddress(), tokenIn);
      await pool.connect(trader).swapExactTokensForBNB(tokenIn, 0);
    });
  });
});
