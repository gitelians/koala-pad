import { useChainId, useReadContracts } from 'wagmi'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { getAllTokens } from '../lib/supabaseApi'
import { ICO_ABI } from '../constants/abis'

const MORALIS_KEY = import.meta.env.VITE_MORALIS_API_KEY as string | undefined

function moralisChainParam(chainId: number): string | null {
  if (chainId === 56) return 'bsc'
  if (chainId === 97) return 'bsc testnet'
  return null
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

interface MoralisToken {
  token_address: string
  symbol: string
  name: string
  logo: string | null
  thumbnail: string | null
  decimals: number
  balance: string
  balance_formatted: string
  usd_price: number | null
  usd_value: number | null
  native_token: boolean
  possible_spam?: boolean
}

interface BalancesTabProps {
  userAddress: `0x${string}` | undefined
  bnbPrice: number
}

type SubTab = 'ico' | 'trading'

export default function BalancesTab({ userAddress, bnbPrice }: BalancesTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('ico')
  const [koalaTokens, setKoalaTokens] = useState<any[]>([])

  useEffect(() => {
    getAllTokens().then(setKoalaTokens).catch(console.error)
  }, [])

  return (
    <div>
      {/* Sub-tabs: ICO (locked contributions in live ICOs) and Trading
          (ERC-20 wallet balances, populated once ICO finalizes). */}
      <div className="flex gap-2 mb-3">
        {(['ico', 'trading'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setSubTab(st)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              subTab === st
                ? 'bg-violet-600/20 text-violet-300 border-violet-500/40'
                : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300'
            }`}
          >
            {st === 'ico' ? 'ICO' : 'Trading'}
          </button>
        ))}
      </div>

      {subTab === 'ico' ? (
        <IcoHoldings userAddress={userAddress} bnbPrice={bnbPrice} koalaTokens={koalaTokens} />
      ) : (
        <WalletHoldings userAddress={userAddress} bnbPrice={bnbPrice} koalaTokens={koalaTokens} />
      )}
    </div>
  )
}

const rowClass =
  'flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors'

// ────────────────────────────────────────────────────────────────────────────
// Wallet token balances (via Moralis), enriched with KoalaPad metadata.
// ────────────────────────────────────────────────────────────────────────────
function WalletHoldings({
  userAddress,
  bnbPrice,
  koalaTokens,
}: {
  userAddress: `0x${string}` | undefined
  bnbPrice: number
  koalaTokens: any[]
}) {
  const chainId = useChainId()
  const [holdings, setHoldings] = useState<MoralisToken[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userAddress) {
      setHoldings([])
      setLoading(false)
      return
    }
    const chain = moralisChainParam(chainId)
    if (!chain) {
      setError('Unsupported chain')
      setLoading(false)
      return
    }
    if (!MORALIS_KEY) {
      setError('VITE_MORALIS_API_KEY is not configured')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const url =
      `https://deep-index.moralis.io/api/v2.2/wallets/${userAddress}/tokens` +
      `?chain=${encodeURIComponent(chain)}&exclude_spam=true`
    fetch(url, {
      headers: { accept: 'application/json', 'X-API-Key': MORALIS_KEY },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Moralis ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (cancelled) return
        setHoldings((j.result ?? []) as MoralisToken[])
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load token balances:', err)
        setError('Failed to load balances')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userAddress, chainId])

  const koalaIndex = useMemo(() => {
    const map = new Map<string, any>()
    for (const t of koalaTokens) {
      if (t.token_address) map.set((t.token_address as string).toLowerCase(), t)
    }
    return map
  }, [koalaTokens])

  const rows = useMemo(() => {
    if (!holdings) return []
    return holdings
      .map((h) => {
        const koala = koalaIndex.get(h.token_address.toLowerCase())
        const balanceNum = parseFloat(h.balance_formatted)
        let usdValue = typeof h.usd_value === 'number' ? h.usd_value : 0
        // Testnet has no real market for native BNB — derive from mainnet rate
        // so the user sees a meaningful sort key and total.
        if (h.native_token && !usdValue && Number.isFinite(balanceNum)) {
          usdValue = balanceNum * bnbPrice
        }
        return { moralis: h, koala, balanceNum, usdValue }
      })
      .filter((r) => Number.isFinite(r.balanceNum) && r.balanceNum > 0)
      .sort((a, b) => b.usdValue - a.usdValue)
  }, [holdings, koalaIndex, bnbPrice])

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>
  if (error) return <p className="text-sm text-rose-400 py-8 text-center">{error}</p>
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        No tokens held on this network.
      </p>
    )
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
      {rows.map(({ moralis, koala, balanceNum, usdValue }) => {
        const phase: string | null = koala?.phase ?? null
        const phaseBadge =
          phase === 'ico'
            ? { label: 'ICO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
            : phase === 'trading'
              ? { label: 'Trading', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
              : phase
                ? { label: 'Airdrop', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }
                : moralis.native_token
                  ? { label: 'Native', color: 'bg-[#F3BA2F]/20 text-[#F3BA2F] border-[#F3BA2F]/30' }
                  : null

        const image = koala?.image || moralis.logo || moralis.thumbnail
        const name = koala?.name || moralis.name || moralis.symbol
        const symbol = koala?.symbol || moralis.symbol
        const key = moralis.native_token ? 'native' : moralis.token_address

        const inner = (
          <>
            {image ? (
              <img src={image} alt={name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-800/40 flex-shrink-0 flex items-center justify-center text-sm font-bold text-white/80">
                {(symbol || '?')[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">{name}</div>
              <div className="text-xs text-gray-300/50 truncate">${symbol}</div>
            </div>
            {phaseBadge && (
              <div className="hidden sm:flex items-center">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${phaseBadge.color}`}>
                  {phaseBadge.label}
                </span>
              </div>
            )}
            <div className="text-right flex flex-col items-end gap-0.5 min-w-[90px]">
              <div className="text-sm font-bold text-gray-100 whitespace-nowrap">
                {usdValue > 0 ? formatCompactUsd(usdValue) : '—'}
              </div>
              <div className="text-[11px] text-gray-400 whitespace-nowrap truncate max-w-[160px]">
                {balanceNum.toLocaleString(undefined, { maximumFractionDigits: 4 })} {symbol}
              </div>
            </div>
          </>
        )

        if (koala) {
          return (
            <Link key={key} to={`/token/${koala.token_address}`} className={rowClass}>
              {inner}
            </Link>
          )
        }
        return (
          <div key={key} className={rowClass}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ICO participations — tokens still in their ICO phase where this wallet has a
// net contribution > 0 on-chain (locked positions not yet reflected as ERC-20
// balances, so they never show up under the Tokens sub-tab).
// ────────────────────────────────────────────────────────────────────────────
function IcoHoldings({
  userAddress,
  bnbPrice,
  koalaTokens,
}: {
  userAddress: `0x${string}` | undefined
  bnbPrice: number
  koalaTokens: any[]
}) {
  const icoTokens = useMemo(
    () =>
      koalaTokens.filter(
        (t) => (!t.phase || t.phase === 'ico') && t.ico_address,
      ),
    [koalaTokens],
  )

  // Two reads per ICO: net BNB contribution + tokens purchased. Flattened into
  // one multicall; results are paired back up by index below.
  const contracts = useMemo(() => {
    if (!userAddress) return []
    return icoTokens.flatMap((t) => [
      {
        address: t.ico_address as `0x${string}`,
        abi: ICO_ABI,
        functionName: 'contributions' as const,
        args: [userAddress] as const,
      },
      {
        address: t.ico_address as `0x${string}`,
        abi: ICO_ABI,
        functionName: 'tokensPurchased' as const,
        args: [userAddress] as const,
      },
    ])
  }, [icoTokens, userAddress])

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: !!userAddress && contracts.length > 0 },
  })

  const rows = useMemo(() => {
    if (!data) return []
    return icoTokens
      .map((token, i) => {
        const contribution = data[i * 2]?.result as bigint | undefined
        const purchased = data[i * 2 + 1]?.result as bigint | undefined
        const contributionBNB = contribution ? parseFloat(formatEther(contribution)) : 0
        const purchasedNum = purchased ? parseFloat(formatEther(purchased)) : 0
        return { token, contributionBNB, purchasedNum }
      })
      .filter((r) => r.contributionBNB > 0)
      .sort((a, b) => b.contributionBNB - a.contributionBNB)
  }, [data, icoTokens])

  if (!userAddress) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        Connect a wallet to see ICO participations.
      </p>
    )
  }
  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        No active ICO participations.
      </p>
    )
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
      {rows.map(({ token, contributionBNB, purchasedNum }) => {
        const usdValue = contributionBNB * bnbPrice
        return (
          <Link key={token.token_address} to={`/token/${token.token_address}`} className={rowClass}>
            {token.image ? (
              <img src={token.image} alt={token.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-800/40 flex-shrink-0 flex items-center justify-center text-sm font-bold text-white/80">
                {(token.symbol || '?')[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">{token.name}</div>
              <div className="text-xs text-gray-300/50 truncate">${token.symbol}</div>
            </div>
            <div className="text-right flex flex-col items-end gap-0.5 min-w-[90px]">
              <div className="text-sm font-bold text-gray-100 whitespace-nowrap">
                {usdValue > 0 ? formatCompactUsd(usdValue) : `${contributionBNB.toFixed(4)} BNB`}
              </div>
              <div className="text-[11px] text-gray-400 whitespace-nowrap truncate max-w-[160px]">
                {purchasedNum > 0
                  ? `${purchasedNum.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${token.symbol}`
                  : `${contributionBNB.toFixed(4)} BNB`}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
