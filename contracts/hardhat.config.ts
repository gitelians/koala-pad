import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      // viaIR + low `runs` optimises for bytecode size rather than runtime
      // gas. LaunchpadFactory inlines four child contracts' init code via
      // `new Token/Pool/ICO/AirdropVault(...)`, which pushes the factory's
      // deployed bytecode past the EIP-170 24,576-byte cap with the default
      // legacy pipeline. viaIR shrinks it back under the limit.
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
    },
  },
};

export default config;
