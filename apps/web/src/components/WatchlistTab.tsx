import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useReadContracts } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { useWatchlist } from '../hooks/useWatchlist'
import { getTokenByAddress, getWatchlistByUser } from '../lib/supabaseApi'
import { POOL_ABI } from '../constants/abis'

type PhaseKey = 'ico' | 'trading' | 'airdrop_complete'

function resolvePhase(meta: any): PhaseKey {
  return (meta?.phase as PhaseKey) || 'ico'
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

interface WatchlistTabProps {
  bnbPrice: number
  /** When provided, render that user's watchlist (foreign profile). */
  foreignUserId?: string
}

export default function WatchlistTab({ bnbPrice, foreignUserId }: WatchlistTabProps) {
  const { watchlist: ownWatchlist } = useWatchlist()
  const [foreignList, setForeignList] = useState<string[] | null>(null)
  const [foreignLoading, setForeignLoading] = useState(false)

  useEffect(() => {
    if (!foreignUserId) {
      setForeignList(null)
      return
    }
    setForeignLoading(true)
    getWatchlistByUser(foreignUserId)
      .then(list => setForeignList(list.map(a => a.toLowerCase())))
      .catch(err => {
        console.error('Failed to load foreign watchlist:', err)
        setForeignList([])
      })
      .finally(() => setForeignLoading(false))
  }, [foreignUserId])

  const watchlist = foreignUserId ? (foreignList ?? []) : ownWatchlist
  const [tokensMeta, setTokensMeta] = useState<Map<string, any>>(new Map())

  useEffect(() => {
    if (watchlist.length === 0) {
      setTokensMeta(new Map())
      return
    }

    Promise.all(watchlist.map(addr => getTokenByAddress(addr))).then(results => {
      const map = new Map<string, any>()
      results.forEach((meta, i) => {
        if (meta) map.set(watchlist[i], meta)
      })
      setTokensMeta(map)
    })
  }, [watchlist.join(',')])

  const poolContracts = useMemo(() =>
    watchlist.map(addr => {
      const meta = tokensMeta.get(addr)
      return {
        address: (meta?.pool_address || undefined) as `0x${string}` | undefined,
        abi: POOL_ABI,
        functionName: 'getMarketCap' as const,
        args: [parseEther('21000000')],
      }
    }),
    [watchlist, tokensMeta],
  )

  const { data: marketCaps } = useReadContracts({
    contracts: poolContracts.length > 0 ? poolContracts : [],
  })

  if (foreignUserId && foreignLoading && (foreignList?.length ?? 0) === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">Loading watchlist...</p>
  }

  if (watchlist.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        {foreignUserId
          ? 'This user has no tokens in their watchlist.'
          : 'No tokens in your watchlist yet. Star a token to add it here.'}
      </p>
    )
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
      {watchlist.map((tokenAddr, i) => {
        const meta = tokensMeta.get(tokenAddr)
        if (!meta) return null

        const mcRaw = marketCaps?.[i]?.result as bigint | undefined
        const marketCapUsd = mcRaw ? Number(formatEther(mcRaw)) * bnbPrice : null

        const phase = resolvePhase(meta)
        const phaseBadge = phase === 'ico'
          ? { label: 'ICO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
          : phase === 'trading'
            ? { label: 'Trading', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
            : { label: 'Airdrop', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }

        const icoRound = meta?.ico_current_round ? Number(meta.ico_current_round) : 1
        const mcDisplay =
          phase === 'ico'
            ? `R${Math.min(Math.max(icoRound, 1), 10)}/10`
            : marketCapUsd != null
              ? formatCompactUsd(marketCapUsd)
              : '—'

        return (
          <Link
            key={tokenAddr}
            to={`/token/${tokenAddr}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors"
          >
            {meta.image ? (
              <img
                src={meta.image}
                alt={meta.name || 'Token'}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-800/40 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-100 truncate">{meta.name || 'Loading...'}</div>
              <div className="text-xs text-gray-300/50 truncate">${meta.symbol || '...'}</div>
            </div>
            {/* Token phase badge */}
            <div className="hidden sm:flex items-center mr-8">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${phaseBadge.color}`}>
                {phaseBadge.label}
              </span>
            </div>
            {/* Round or market cap */}
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-100 whitespace-nowrap">
                {mcDisplay}
                {phase !== 'ico' && marketCapUsd != null && (
                  <span className="text-gray-500 font-normal text-[10px] ml-1">MC</span>
                )}
              </div>
              <div className="text-[10px] text-gray-500 sm:hidden">{phaseBadge.label}</div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
