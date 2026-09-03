import { createConfig, http } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Wallet management is handled entirely by Privy (PrivyProvider in main.tsx).
// We expose only the `injected` connector so wagmi has a fallback transport
// for users who already have a browser wallet — Privy's wagmi bridge fills
// in everything else.
//
// Removed: `walletConnect()`. It was producing 403/400 calls to
//   - https://api.web3modal.org/appkit/v1/config
//   - https://pulse.walletconnect.org/e
// because we have no Reown/WalletConnect project and we don't need one —
// Privy already provides WalletConnect for users who pick that login method.

// Same endpoint (and same env var) used by the read-only RPC calls elsewhere,
// with the public BSC Testnet node as fallback.
const RPC_URL =
  import.meta.env.VITE_BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'

export const config = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: http(RPC_URL),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
