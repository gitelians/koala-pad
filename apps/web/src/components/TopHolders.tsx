import { useState, useEffect, useMemo, useCallback } from 'react'
import { useReadContracts } from 'wagmi'
import { parseEther } from 'viem'
import { TOKEN_ABI } from '../constants/abis'

interface TopHoldersProps {
  tokenAddress: `0x${string}`
  poolAddress?: `0x${string}`
  icoAddress?: `0x${string}`
  vaultAddress?: `0x${string}`
  phase: string
  // Parent bumps this to force a recompute (e.g. after a swap success).
  refreshKey?: number
}

// Top holders are derived from two sources:
//  - Protocol contracts (Pool / ICO / AirdropVault): read authoritatively via
//    wagmi's useReadContracts, because their initial allocation comes from
//    Token.initialize() — an on-chain transfer that never appears in `trades`
//    or `ico_contributions`. Without this read, the three protocol contracts
//    always showed up as 0% in the Top Holders list.
//  - User balances: computed client-side from trades + ICO contributions
//    (no shared subgraph). Withdraw rows (kind='withdraw') return tokens to
//    the ICO contract, so they subtract from the buyer's balance and from
//    the ICO contract's net-credited total.
export default function TopHolders({
  tokenAddress,
  poolAddress,
  icoAddress,
  vaultAddress,
  phase,
  refreshKey,
}: TopHoldersProps) {
  const [topHolders, setTopHolders] = useState<Array<{ address: string; percentage: number }>>([])

  const protocolAddrs = useMemo(
    () =>
      [poolAddress, icoAddress, vaultAddress]
        .filter((a): a is `0x${string}` => !!a)
        .map(a => a.toLowerCase() as `0x${string}`),
    [poolAddress, icoAddress, vaultAddress],
  )

  const protocolBalanceContracts = useMemo(() => {
    if (!tokenAddress) return []
    return protocolAddrs.map(holder => ({
      address: tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'balanceOf' as const,
      args: [holder],
    }))
  }, [tokenAddress, protocolAddrs])

  // Poll every 15s so ICO purchases/withdrawals (which happen inside ICOPanel
  // and don't route through Token.tsx's swap-success effect) still refresh
  // the protocol-contract balances in the Top Holders list.
  const { data: protocolBalanceResults, refetch: refetchProtocolBalances } = useReadContracts({
    contracts: protocolBalanceContracts,
    query: {
      enabled: protocolBalanceContracts.length > 0,
      refetchInterval: 15_000,
    },
  })

  const refetchHolders = useCallback(() => {
    if (!tokenAddress || !poolAddress) return
    import('../lib/supabaseApi').then(({ getTradesForToken, getIcoContributions }) => {
      Promise.all([
        getTradesForToken(tokenAddress, 10000),
        getIcoContributions(tokenAddress),
      ])
        .then(([trades, contribs]) => {
          // Supabase NUMERIC columns are returned as decimal strings in human
          // token units (e.g. "2523965.827376..."), not wei.
          const toWei = (v: unknown): bigint => {
            if (v == null) return 0n
            const [whole, frac = ''] = String(v).split('.')
            const cleanWhole = whole.replace(/^-/, '').replace(/^0+(?=\d)/, '') || '0'
            const fracPadded = (frac + '000000000000000000').slice(0, 18)
            const wei = BigInt(cleanWhole) * 10n ** 18n + BigInt(fracPadded)
            return whole.startsWith('-') ? -wei : wei
          }
          const balances = new Map<string, bigint>()
          for (const t of trades) {
            const a = (t.maker_address as string).toLowerCase()
            // Protocol contracts never trade as a user — their balance is read
            // authoritatively below.
            if (protocolAddrs.includes(a as `0x${string}`)) continue
            const amt = toWei(t.token_amount)
            const cur = balances.get(a) ?? 0n
            balances.set(a, t.is_buy ? cur + amt : cur - amt)
          }
          for (const c of contribs) {
            const a = (c.wallet_address as string).toLowerCase()
            if (protocolAddrs.includes(a as `0x${string}`)) continue
            const cur = balances.get(a) ?? 0n
            const amt = toWei(c.tokens_received)
            // Withdraws return the buyer's tokens to the ICO allocation, so
            // they subtract from the user's effective holding.
            const delta = c.kind === 'withdraw' ? -amt : amt
            balances.set(a, cur + delta)
          }
          // Overlay authoritative on-chain balances for the protocol contracts.
          // Special case for the ICO contract: ICO.buy() only *credits* tokens
          // internally (tokensPurchased[buyer]); the actual ERC-20 transfer to
          // each buyer doesn't happen until claimTokens() after finalization.
          // So balanceOf(ico) is pinned at 10.5M for the whole sale and would
          // double-count against the buyer rows (which we also surface via
          // ico_contributions). During the ICO phase we subtract the NET sum
          // of credited contributions (buys minus withdraws) — withdraws
          // return tokens to the ICO, so the contract's effective remaining
          // supply grows back. Once trading starts, claimTokens() drains the
          // ICO balance on-chain and we use it as-is.
          const icoLower = icoAddress?.toLowerCase()
          const netCreditedToBuyers =
            phase === 'ico'
              ? contribs.reduce((acc, c) => {
                  const amt = toWei(c.tokens_received)
                  return c.kind === 'withdraw' ? acc - amt : acc + amt
                }, 0n)
              : 0n
          if (protocolBalanceResults) {
            protocolBalanceResults.forEach((res, i) => {
              const bal = res?.result as bigint | undefined
              const addr = protocolAddrs[i]
              if (typeof bal !== 'bigint' || !addr) return
              let effective = bal
              if (icoLower && addr === icoLower) {
                effective = bal > netCreditedToBuyers ? bal - netCreditedToBuyers : 0n
              }
              if (effective > 0n) balances.set(addr, effective)
            })
          }
          const TOTAL = parseEther('21000000')
          const holders = Array.from(balances.entries())
            .filter(([_, bal]) => bal > 0n)
            .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
            .slice(0, 20)
            .map(([address, bal]) => ({
              address,
              percentage: Number((bal * 10_000n) / TOTAL) / 100,
            }))
          setTopHolders(holders)
        })
        .catch(err => console.error('Failed to compute top holders:', err))
    })
  }, [tokenAddress, poolAddress, icoAddress, phase, protocolAddrs, protocolBalanceResults])

  useEffect(() => {
    refetchHolders()
  }, [refetchHolders])

  // When the parent signals a swap/ICO action just happened, force-refresh
  // both the on-chain protocol balances and the off-chain holder list.
  useEffect(() => {
    if (refreshKey === undefined) return
    refetchProtocolBalances()
    refetchHolders()
  }, [refreshKey, refetchProtocolBalances, refetchHolders])

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-md font-semibold text-gray-100">Top holders</h3>
      </div>
      <div className="p-4 max-h-96 overflow-y-auto">
        {topHolders.length > 0 ? (
          topHolders.map((holder, index) => (
            <div
              key={index}
              className="flex justify-between items-center py-2 border-b border-gray-800 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 font-mono">
                  {holder.address.toLowerCase() === poolAddress?.toLowerCase()
                    ? 'Liquidity pool'
                    : holder.address.toLowerCase() === icoAddress?.toLowerCase()
                    ? 'ICO Contract'
                    : holder.address.toLowerCase() === vaultAddress?.toLowerCase()
                    ? 'Airdrop Vault'
                    : `${holder.address.slice(0, 4)}...${holder.address.slice(-4)}`}
                </span>
                {holder.address.toLowerCase() === poolAddress?.toLowerCase() && (
                  <span className="text-violet-400" title="Liquidity Pool">
                    💧
                  </span>
                )}
                {holder.address.toLowerCase() === icoAddress?.toLowerCase() && (
                  <span className="text-yellow-400" title="ICO Contract">
                    🚀
                  </span>
                )}
                {holder.address.toLowerCase() === vaultAddress?.toLowerCase() && (
                  <span className="text-purple-400" title="Airdrop Vault">
                    🔒
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-white">
                {holder.percentage.toFixed(2)}%
              </span>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-sm text-gray-500">Loading holders...</div>
        )}
      </div>
    </div>
  )
}
