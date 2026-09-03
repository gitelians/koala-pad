/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACTORY_ADDRESS: string
  readonly VITE_PROTOCOL_TREASURY: string
  readonly VITE_WHEEL_TREASURY: string
  readonly VITE_BSC_TESTNET_RPC: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_KEY: string
  readonly VITE_PRIVY_APP_ID: string
  readonly VITE_MORALIS_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
