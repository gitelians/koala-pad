import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys the post-audit Koala Pad contracts.
 *
 * Required env:
 *   CLAIM_SIGNER_ADDRESS    - public address whose signatures the
 *                             LevelRewards/LuckyWheel/Vault accept.
 *   FEE_EXEMPTION_GRANTER   - public address allowed to call
 *                             ProtocolTreasury.grantFeeExemption (no withdrawals).
 *   AIRDROP_SIGNER_ADDRESS  - public address whose signatures the AirdropVault accepts.
 *   PROTOCOL_OWNER          - (optional) multisig that becomes treasury / contract owner.
 */
async function main() {
  console.log("🚀 Deploying Koala Pad contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  const claimSigner = process.env.CLAIM_SIGNER_ADDRESS;
  const granter = process.env.FEE_EXEMPTION_GRANTER ?? deployer.address;
  const airdropSigner = process.env.AIRDROP_SIGNER_ADDRESS ?? claimSigner;
  const owner = process.env.PROTOCOL_OWNER ?? deployer.address;

  if (!claimSigner) throw new Error("CLAIM_SIGNER_ADDRESS env var is required");

  // 1. ProtocolTreasury
  console.log("📦 ProtocolTreasury...");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const treasury = await ProtocolTreasury.deploy(owner);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log("   →", treasuryAddr);

  // Wire the granter and airdrop signer (deployer must still be owner here).
  if (owner === deployer.address) {
    await (await treasury.setFeeExemptionGranter(granter)).wait();
    if (airdropSigner) await (await treasury.setAirdropSigner(airdropSigner)).wait();
    console.log("   roles set: granter=" + granter + ", airdropSigner=" + airdropSigner);
  } else {
    console.log("   ⚠️  owner is a multisig - call setFeeExemptionGranter / setAirdropSigner manually");
  }

  // 2. LuckyWheel
  console.log("📦 LuckyWheel...");
  const LuckyWheel = await ethers.getContractFactory("LuckyWheel");
  const wheel = await LuckyWheel.deploy(owner, claimSigner);
  await wheel.waitForDeployment();
  const wheelAddr = await wheel.getAddress();
  console.log("   →", wheelAddr);

  // 3. Child implementations (EIP-1167 templates).
  // Each is deployed exactly once. The factory clones them per createToken()
  // call, which keeps token-creation gas low and the factory's own bytecode
  // well under EIP-170.
  console.log("📦 Token implementation...");
  const TokenImpl = await ethers.getContractFactory("Token");
  const tokenImpl = await TokenImpl.deploy();
  await tokenImpl.waitForDeployment();
  const tokenImplAddr = await tokenImpl.getAddress();
  console.log("   →", tokenImplAddr);

  console.log("📦 Pool implementation...");
  const PoolImpl = await ethers.getContractFactory("Pool");
  const poolImpl = await PoolImpl.deploy();
  await poolImpl.waitForDeployment();
  const poolImplAddr = await poolImpl.getAddress();
  console.log("   →", poolImplAddr);

  console.log("📦 ICO implementation...");
  const ICOImpl = await ethers.getContractFactory("ICO");
  const icoImpl = await ICOImpl.deploy();
  await icoImpl.waitForDeployment();
  const icoImplAddr = await icoImpl.getAddress();
  console.log("   →", icoImplAddr);

  console.log("📦 AirdropVault implementation...");
  const VaultImpl = await ethers.getContractFactory("AirdropVault");
  const vaultImpl = await VaultImpl.deploy();
  await vaultImpl.waitForDeployment();
  const vaultImplAddr = await vaultImpl.getAddress();
  console.log("   →", vaultImplAddr);

  // 4. Factory
  console.log("📦 LaunchpadFactory...");
  const LaunchpadFactory = await ethers.getContractFactory("LaunchpadFactory");
  const factory = await LaunchpadFactory.deploy(
    treasuryAddr,
    wheelAddr,
    tokenImplAddr,
    poolImplAddr,
    icoImplAddr,
    vaultImplAddr,
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("   →", factoryAddr);

  // LevelRewards was removed when on-chain level rewards were dropped — see
  // CLAUDE.md §14. Levels are now status-only.

  const deployment = {
    network: process.env.HARDHAT_NETWORK || "unknown",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    owner,
    claimSigner,
    feeExemptionGranter: granter,
    airdropSigner,
    contracts: {
      LaunchpadFactory: factoryAddr,
      ProtocolTreasury: treasuryAddr,
      LuckyWheel: wheelAddr,
      TokenImpl: tokenImplAddr,
      PoolImpl: poolImplAddr,
      ICOImpl: icoImplAddr,
      AirdropVaultImpl: vaultImplAddr,
    },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);
  const deploymentPath = path.join(deploymentsDir, `${deployment.network}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n📝 Saved to", deploymentPath);
  console.log("\nFrontend env:");
  console.log(`VITE_PROTOCOL_TREASURY=${treasuryAddr}`);
  console.log(`VITE_WHEEL_TREASURY=${wheelAddr}`);
  console.log(`VITE_FACTORY_ADDRESS=${factoryAddr}`);
  console.log("\nEdge-function env:");
  console.log(`PROTOCOL_TREASURY_ADDRESS=${treasuryAddr}`);
  console.log(`LUCKY_WHEEL_ADDRESS=${wheelAddr}`);
  console.log(`LAUNCHPAD_FACTORY_ADDRESS=${factoryAddr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error(error); process.exit(1); });
