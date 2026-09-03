import { expect } from "chai";
import { ethers } from "hardhat";
import { LaunchpadFactory, ProtocolTreasury, LuckyWheel, Token, Pool } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const ZERO = "0x0000000000000000000000000000000000000000";

describe("LaunchpadFactory", function () {
  let factory: LaunchpadFactory;
  let treasury: ProtocolTreasury;
  let wheel: LuckyWheel;
  let owner: SignerWithAddress;
  let creator: SignerWithAddress;
  let signer: SignerWithAddress;

  beforeEach(async function () {
    [owner, creator, signer] = await ethers.getSigners();

    const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    treasury = (await ProtocolTreasury.deploy(owner.address)) as ProtocolTreasury;
    await treasury.setAirdropSigner(signer.address);

    const LuckyWheel = await ethers.getContractFactory("LuckyWheel");
    wheel = (await LuckyWheel.deploy(owner.address, signer.address)) as LuckyWheel;

    // Deploy the four child implementations once. The factory clones them
    // (EIP-1167) on every createToken() call.
    const TokenF = await ethers.getContractFactory("Token");
    const tokenImpl = await TokenF.deploy();
    const PoolF = await ethers.getContractFactory("Pool");
    const poolImpl = await PoolF.deploy();
    const ICOF = await ethers.getContractFactory("ICO");
    const icoImpl = await ICOF.deploy();
    const VaultF = await ethers.getContractFactory("AirdropVault");
    const vaultImpl = await VaultF.deploy();

    const LaunchpadFactory = await ethers.getContractFactory("LaunchpadFactory");
    factory = (await LaunchpadFactory.deploy(
      await treasury.getAddress(),
      await wheel.getAddress(),
      await tokenImpl.getAddress(),
      await poolImpl.getAddress(),
      await icoImpl.getAddress(),
      await vaultImpl.getAddress(),
    )) as LaunchpadFactory;
  });

  async function createToken(name = "Test", symbol = "TEST") {
    const tx = await factory.connect(creator).createToken(name, symbol);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map(l => { try { return factory.interface.parseLog(l as any) } catch { return null } })
      .find(e => e?.name === "TokenCreated") as any;
    return {
      tokenAddr: event.args.token as string,
      poolAddr: event.args.pool as string,
      icoAddr: event.args.ico as string,
      vaultAddr: event.args.vault as string,
    };
  }

  describe("Token Creation", function () {
    it("emits TokenCreated with addresses", async function () {
      const { tokenAddr, poolAddr, icoAddr, vaultAddr } = await createToken();
      expect(tokenAddr).to.not.equal(ZERO);
      expect(poolAddr).to.not.equal(ZERO);
      expect(icoAddr).to.not.equal(ZERO);
      expect(vaultAddr).to.not.equal(ZERO);
    });

    it("mints 50/40/10 distribution", async function () {
      const { tokenAddr, poolAddr, icoAddr, vaultAddr } = await createToken();
      const token = (await ethers.getContractAt("Token", tokenAddr)) as Token;
      const max = ethers.parseEther("21000000");
      expect(await token.balanceOf(icoAddr)).to.equal(max * 50n / 100n);
      expect(await token.balanceOf(poolAddr)).to.equal(max * 40n / 100n);
      expect(await token.balanceOf(vaultAddr)).to.equal(max * 10n / 100n);
    });

    it("rejects empty name / symbol", async function () {
      await expect(
        factory.connect(creator).createToken("", "TEST"),
      ).to.be.revertedWith("Bad name length");
      await expect(
        factory.connect(creator).createToken("Test", ""),
      ).to.be.revertedWith("Bad symbol length");
    });
    // Note: there is intentionally no token-creation fee. createToken() is
    // non-payable; sending value would revert at the EVM level. Treasury is
    // funded by ICO finalisation creator/pool splits and by AMM swap fees.
  });

  describe("Pool gating", function () {
    it("anyone calling addInitialLiquidity reverts before ICO finalize", async function () {
      const { poolAddr } = await createToken();
      const pool = (await ethers.getContractAt("Pool", poolAddr)) as Pool;
      await expect(
        pool.connect(creator).addInitialLiquidity(1, { value: 1 }),
      ).to.be.revertedWith("Only ICO");
    });
  });

  describe("Pagination", function () {
    it("getTokens paginates", async function () {
      for (let i = 0; i < 3; i++) await createToken(`T${i}`, `S${i}`);
      const page1 = await factory.getTokens(0, 2);
      expect(page1.length).to.equal(2);
      const page2 = await factory.getTokens(2, 2);
      expect(page2.length).to.equal(1);
    });

    it("getTokensByCreator paginates", async function () {
      for (let i = 0; i < 3; i++) await createToken(`T${i}`, `S${i}`);
      expect(await factory.getCreatorTokenCount(creator.address)).to.equal(3);
      const page = await factory.getTokensByCreator(creator.address, 0, 2);
      expect(page.length).to.equal(2);
    });
  });
});
