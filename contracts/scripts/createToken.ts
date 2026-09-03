import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🪙 Creating a test token...\n");

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployments/bscTestnet.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Deployment file not found. Run deploy script first.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const factoryAddress = deployment.contracts.LaunchpadFactory;

  const [creator] = await ethers.getSigners();
  console.log("Creator address:", creator.address);

  // Connect to factory
  const factory = await ethers.getContractAt("LaunchpadFactory", factoryAddress);

  // Token parameters
  const name = "Test Meme Coin";
  const symbol = "TMC";

  console.log(`Creating token: ${name} (${symbol})\n`);

  // Create token. createToken() is non-payable — the ICO seeds the pool
  // with BNB raised during the pre-sale, so no creator deposit is required.
  const tx = await factory.createToken(name, symbol);
  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...\n");

  const receipt = await tx.wait();

  // Parse event to get addresses
  const event = receipt?.logs
    .map((log: any) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e: any) => e?.name === "TokenCreated");

  if (event) {
    console.log("✅ Token created successfully!\n");
    console.log("Token address:", event.args.token);
    console.log("Pool address:", event.args.pool);
    console.log("ICO address:", event.args.ico);
    console.log("Vault address:", event.args.vault);
    console.log("\nYou can now interact with this token in the web app!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
