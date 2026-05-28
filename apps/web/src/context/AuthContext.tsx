import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useSignMessage as useWagmiSignMessage } from 'wagmi'
import { supabase, setSupabaseAuthToken } from '../lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  wallet_address: string | null
  username: string | null
  profile_pic: string | null
  kp: number
  coins: number
  level: number
  total_coins_spent: number
  total_boosts_bought: number
  last_free_spin_at: string | null
  /** X (Twitter) handle without leading '@', or null when unlinked. Mirrored
   *  from Privy's linked_accounts on every bridge by the privy-auth fn. */
  x_username: string | null
  created_at: string
}

interface AuthContextType {
  userId: string | null
  walletAddress: string | null
  profile: UserProfile | null
  session: { user: { id: string } } | null
  isLoading: boolean
  isAuthenticating: boolean
  refreshProfile: () => Promise<void>
  /** Re-runs the privy-auth bridge so the server re-reads Privy's
   *  linked_accounts (wallets, twitter). Call this after the frontend
   *  triggers Privy's linkTwitter/unlinkTwitter so the X handle in
   *  users.x_username stays in sync without waiting for the next 50-minute
   *  refresh tick. */
  syncFromPrivy: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  walletAddress: null,
  profile: null,
  session: null,
  isLoading: true,
  isAuthenticating: false,
  refreshProfile: async () => {},
  syncFromPrivy: async () => {},
})

export const useAuth = () => useContext(AuthContext)

const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy()
  // Wagmi state — used only to detect whether an external wallet is currently
  // connected. SIWE signing is *optional*: the backend's primary path is
  // verifying the wallet via Privy's REST API. SIWE is a fallback that fires
  // only when wagmi has an active connector, so we never trigger
  // ConnectorNotConnectedError on embedded-wallet (email/social) sessions.
  const { isConnected: wagmiConnected } = useAccount()
  const { signMessageAsync: wagmiSignMessage } = useWagmiSignMessage()

  const [session, setSession] = useState<{ user: { id: string } } | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  const authInProgress = useRef(false)
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('Failed to fetch profile:', error)
      return null
    }
    return data as UserProfile
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return
    const data = await fetchProfile(session.user.id)
    if (data) setProfile(data)
  }, [session, fetchProfile])

  /**
   * Build the auth payload for the privy-auth edge function.
   *
   * - Embedded Privy wallets (`walletClientType === 'privy'`): trust Privy's
   *   own provisioning; no signature needed. The edge function verifies the
   *   wallet via the Privy REST API (linked_accounts).
   *
   * - External wallets (MetaMask, WalletConnect, etc.): sign a SIWE-style
   *   message containing the user's privyDid + a fresh timestamp. The edge
   *   function recovers the signer and matches it against the asserted wallet.
   *   This produces the second wallet prompt during the login flow.
   */
  const buildAuthPayload = useCallback(async (privyToken: string) => {
    const walletAccount = user?.linkedAccounts?.find((a: any) => a.type === 'wallet') as any
    const walletAddress = (walletAccount?.address || '').toLowerCase()
    if (!walletAddress) {
      // No wallet yet — bridge without a wallet (refresh path or pre-provisioning).
      return { privyToken }
    }

    // Privy already verifies wallet ownership during its own link flow:
    //  - Embedded wallets are auto-provisioned and trusted by Privy.
    //  - External wallets (MetaMask etc.) prompt their OWN signature inside
    //    Privy's connect modal before the wallet is added to linked_accounts.
    // Either way the backend resolves linked_accounts via the Privy REST API
    // and verifies the wallet from there — no SIWE step from us is required.
    //
    // We only attempt an extra SIWE proof if wagmi reports a live external
    // connection (defense in depth for any wallet that somehow isn't yet in
    // Privy's linked_accounts). If wagmi has no active connector we MUST NOT
    // call signMessage — it throws ConnectorNotConnectedError, which then
    // breaks the bridge for embedded-wallet sessions.
    const isEmbedded = walletAccount?.walletClientType === 'privy'
    if (isEmbedded || !wagmiConnected) {
      return { privyToken, walletAddress }
    }

    const privyDid = (user as any)?.id ?? ''
    const message = [
      'Koala Pad — sign in',
      `Privy DID: ${privyDid}`,
      `Wallet: ${walletAddress}`,
      `Issued: ${new Date().toISOString()}`,
    ].join('\n')

    try {
      const signature = await wagmiSignMessage({ message })
      return { privyToken, walletAddress, signedMessage: message, signature }
    } catch (err) {
      // Non-fatal — the backend can still verify via the Privy REST API path.
      console.warn('Optional SIWE sign skipped:', err)
      return { privyToken, walletAddress }
    }
  }, [user, wagmiConnected, wagmiSignMessage])

  const bridgeToSupabase = useCallback(async () => {
    if (authInProgress.current) return
    authInProgress.current = true
    setIsAuthenticating(true)

    try {
      const privyToken = await getAccessToken()
      if (!privyToken) throw new Error('Failed to get Privy access token')

      const payload = await buildAuthPayload(privyToken)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
      const response = await fetch(`${supabaseUrl}/functions/v1/privy-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as any).error || 'Auth bridge failed')
      }
      const { access_token, user: supabaseUser } = await response.json()
      setSupabaseAuthToken(access_token)
      setSession({ user: { id: supabaseUser.id } })

      const profileData = await fetchProfile(supabaseUser.id)
      if (profileData) setProfile(profileData)
    } catch (error: any) {
      console.error('Privy→Supabase bridge failed:', error)
    } finally {
      setIsAuthenticating(false)
      authInProgress.current = false
    }
  }, [getAccessToken, buildAuthPayload, fetchProfile])

  const startTokenRefresh = useCallback(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current)
    refreshTimer.current = setInterval(async () => {
      try {
        const privyToken = await getAccessToken()
        if (!privyToken) return
        // Refresh does NOT re-prompt the user for a wallet signature; we only
        // re-issue the supabase JWT against the existing privy session.
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
        const response = await fetch(`${supabaseUrl}/functions/v1/privy-auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ privyToken }),
        })
        if (response.ok) {
          const { access_token } = await response.json()
          setSupabaseAuthToken(access_token)
        }
      } catch (error) {
        console.error('Token refresh failed:', error)
      }
    }, TOKEN_REFRESH_INTERVAL)
  }, [getAccessToken])

  const stopTokenRefresh = useCallback(() => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current)
      refreshTimer.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (authenticated && user) {
      // Wait until Privy has provisioned/linked a wallet before bridging.
      // Embedded wallets are created asynchronously on first login (per
      // https://docs.privy.io/welcome) and only appear in `linkedAccounts`
      // once provisioning completes. Bridging without a wallet would write
      // a NULL `wallet_address` to public.users, which is invalid because
      // every downstream feature (creation, swap, claims) keys off it.
      const hasWallet = !!user.linkedAccounts?.some((a: any) => a.type === 'wallet')
      if (!hasWallet) return
      bridgeToSupabase().then(() => startTokenRefresh())
    } else if (!authenticated && session) {
      setSupabaseAuthToken(null)
      setSession(null)
      setProfile(null)
      stopTokenRefresh()
    }
    if (ready && !authenticated) setIsLoading(false)
  }, [
    ready,
    authenticated,
    user?.id,
    // Re-run once Privy provisions/links a wallet so the bridge can fire.
    user?.linkedAccounts?.some((a: any) => a.type === 'wallet'),
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (session) setIsLoading(false)
  }, [session])

  useEffect(() => () => stopTokenRefresh(), [stopTokenRefresh])

  const syncFromPrivy = useCallback(async () => {
    await bridgeToSupabase()
    await refreshProfile()
  }, [bridgeToSupabase, refreshProfile])

  return (
    <AuthContext.Provider
      value={{
        userId: session?.user?.id ?? null,
        walletAddress: profile?.wallet_address ?? null,
        profile,
        session,
        isLoading: !ready || isLoading,
        isAuthenticating,
        refreshProfile,
        syncFromPrivy,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
