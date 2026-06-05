import { useReadContract, useReadContracts } from 'wagmi'
import { Link, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { formatEther, parseEther } from 'viem'
import { Clock, Filter, ArrowUpNarrowWide, ArrowDownWideNarrow, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAllTokens } from '../lib/supabaseApi'
import { getBnbPrice } from '../lib/bnbPrice'
import { supabase } from '../lib/supabase'
import { FACTORY_ABI, POOL_ABI } from '../constants/abis'

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS as `0x${string}`

const TOKEN_ABI = [
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

type PhaseFilter = 'ico' | 'trading' | 'airdrop_complete'
type SortMode = 'age' | 'progress' | 'marketcap'
type SortDir = 'asc' | 'desc'
type Range = [number, number]

const MCAP_MAX = 100_000_000
const VOL_MAX = 1_000_000
const ROUND_MIN = 1
const ROUND_MAX = 10
const ICO_GOAL_BNB = 24 // mirrors ICO.sol ICO_GOAL

// Cumulative BNB raised at the END of each ICO round (index 0 = before round 1).
// Mirrors the per-round economics from ICO.sol (square-root curve, sums to 24 BNB).
const ROUND_CUMULATIVE_BNB = [
  0,        // start of round 1
  1.9491,   // end of round 1
  4.0480,   // end of round 2
  6.2620,
  8.5730,
  10.9694,
  13.4430,
  15.9876,
  18.5983,
  21.2711,
  24.0024,  // end of round 10
]

// Translate a round-range to the % progress envelope it covers.
function progressFromRounds([rLo, rHi]: Range): Range {
  const lo = (ROUND_CUMULATIVE_BNB[rLo - 1] / ICO_GOAL_BNB) * 100
  const hi = (ROUND_CUMULATIVE_BNB[rHi] / ICO_GOAL_BNB) * 100
  return [Math.round(lo), Math.round(Math.min(hi, 100))]
}

// Translate a % progress range to the rounds that contain its endpoints.
function roundsFromProgress([pLo, pHi]: Range): Range {
  const bnbLo = (pLo / 100) * ICO_GOAL_BNB
  const bnbHi = (pHi / 100) * ICO_GOAL_BNB
  let rLo = ROUND_MIN
  for (let r = ROUND_MIN; r <= ROUND_MAX; r++) {
    if (bnbLo >= ROUND_CUMULATIVE_BNB[r - 1]) rLo = r
  }
  let rHi = ROUND_MAX
  for (let r = ROUND_MAX; r >= ROUND_MIN; r--) {
    if (bnbHi <= ROUND_CUMULATIVE_BNB[r]) rHi = r
  }
  if (rHi < rLo) rHi = rLo
  return [rLo, rHi]
}

// Resolve phase: null/undefined defaults to 'ico' (same as Token.tsx)
function resolvePhase(meta: any): PhaseFilter {
  return (meta?.phase as PhaseFilter) || 'ico'
}

export default function Coins() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const initialSort = (searchParams.get('sort') as SortMode) || 'age'

  const [phaseFilters, setPhaseFilters] = useState<Set<PhaseFilter>>(new Set())
  const [sortBy, setSortBy] = useState<SortMode>(initialSort)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [searchTerm, setSearchTerm] = useState<string>(initialQ)
  const [tokensMeta, setTokensMeta] = useState<Map<string, any>>(new Map())
  const [creators, setCreators] = useState<Map<string, { username: string | null; profile_pic: string | null; wallet_address: string }>>(new Map())
  const [bnbPrice, setBnbPrice] = useState<number>(600)
  const [volumes24h, setVolumes24h] = useState<Map<string, number>>(new Map())

  // Filter popup state — `range*` are the pending values inside the popup,
  // `active*` are the applied filters that drive `displayIndices`.
  const [filterOpen, setFilterOpen] = useState<boolean>(false)
  const [rangeRound, setRangeRound] = useState<Range>([ROUND_MIN, ROUND_MAX])
  const [rangeProgress, setRangeProgress] = useState<Range>([0, 100])
  const [rangeMcap, setRangeMcap] = useState<Range>([0, MCAP_MAX])
  const [rangeVol, setRangeVol] = useState<Range>([0, VOL_MAX])
  const [activeRound, setActiveRound] = useState<Range | null>(null)
  const [activeProgress, setActiveProgress] = useState<Range | null>(null)
  const [activeMcap, setActiveMcap] = useState<Range | null>(null)
  const [activeVol, setActiveVol] = useState<Range | null>(null)
  const hasActiveFilters = !!(activeRound || activeProgress || activeMcap || activeVol)

  const { data: tokenCount } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getTokenCount',
  })

  const hasTokens = tokenCount ? Number(tokenCount) > 0 : false
  const count = Number(tokenCount || 0)
  const tokenIndices = useMemo(() => Array.from({ length: count }, (_, i) => i), [count])

  // Batch read all token info from factory
  const { data: allTokenInfo } = useReadContracts({
    contracts: tokenIndices.map(i => ({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'tokens' as const,
      args: [BigInt(i)],
    })),
  })

  // Batch read market caps from all pool addresses (for sorting & display)
  const poolContracts = useMemo(() => {
    if (!allTokenInfo) return []
    return allTokenInfo.map(info => {
      const poolAddr = info?.result?.[1] as `0x${string}` | undefined
      return {
        address: poolAddr,
        abi: POOL_ABI,
        functionName: 'getMarketCap' as const,
        args: [parseEther('21000000')],
      }
    })
  }, [allTokenInfo])

  const { data: allMarketCaps } = useReadContracts({
    contracts: poolContracts.length > 0 ? poolContracts : [],
  })

  // Fetch all token metadata from Supabase
  useEffect(() => {
    getAllTokens().then(async tokens => {
      const map = new Map<string, any>()
      tokens.forEach(t => map.set(t.token_address.toLowerCase(), t))
      setTokensMeta(map)

      // Fetch creators for all tokens
      const creatorIds = [...new Set(tokens.map((t: any) => t.creator_id).filter(Boolean))]
      if (creatorIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, username, wallet_address, profile_pic')
          .in('id', creatorIds)
        const cmap = new Map<string, { username: string | null; profile_pic: string | null; wallet_address: string }>()
        ;(users || []).forEach((u: any) => {
          cmap.set(u.id, { username: u.username, profile_pic: u.profile_pic, wallet_address: u.wallet_address })
          if (u.wallet_address) {
            cmap.set(u.wallet_address.toLowerCase(), { username: u.username, profile_pic: u.profile_pic, wallet_address: u.wallet_address })
          }
        })
        setCreators(cmap)
      }
    }).catch(() => {})
  }, [])

  // BNB price — shared cached fetcher.
  useEffect(() => {
    let cancelled = false
    getBnbPrice().then(p => { if (!cancelled) setBnbPrice(p) })
    return () => { cancelled = true }
  }, [])

  // Aggregate 24h volumes per token (single query, summed client-side).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('trades')
        .select('token_address, usd_value')
        .gte('created_at', oneDayAgo)
      if (cancelled) return
      const m = new Map<string, number>()
      ;(data || []).forEach((r: any) => {
        const k = (r.token_address || '').toLowerCase()
        m.set(k, (m.get(k) || 0) + (Number(r.usd_value) || 0))
      })
      setVolumes24h(m)
    })().catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Build filtered & sorted indices
  const displayIndices = useMemo(() => {
    if (!allTokenInfo) return []

    const q = searchTerm.trim().toLowerCase()
    let indices = tokenIndices.filter(i => {
      const info = allTokenInfo[i]
      if (!info?.result) return false

      // Phase filtering
      if (phaseFilters.size > 0) {
        const tokenAddr = (info.result[0] as string).toLowerCase()
        const meta = tokensMeta.get(tokenAddr)
        const phase = resolvePhase(meta)
        if (!phaseFilters.has(phase)) return false
      }

      // Search filter (matches name OR symbol — both come from Supabase meta).
      if (q) {
        const tokenAddr = (info.result[0] as string).toLowerCase()
        const meta = tokensMeta.get(tokenAddr)
        const name = (meta?.name || '').toLowerCase()
        const symbol = (meta?.symbol || '').toLowerCase()
        if (!name.includes(q) && !symbol.includes(q)) return false
      }

      // Advanced filters from the popup. Upper-bound at the slider's max
      // is treated as "no upper bound" so users can include outliers.
      if (activeRound || activeProgress || activeMcap || activeVol) {
        const tokenAddr = (info.result[0] as string).toLowerCase()
        const meta = tokensMeta.get(tokenAddr)

        if (activeRound) {
          const round = Math.min(Math.max(meta?.ico_current_round ? Number(meta.ico_current_round) : 1, ROUND_MIN), ROUND_MAX)
          if (round < activeRound[0] || round > activeRound[1]) return false
        }
        if (activeProgress) {
          const raised = Number(meta?.ico_bnb_raised || 0)
          const pct = Math.min((raised / ICO_GOAL_BNB) * 100, 100)
          if (pct < activeProgress[0] || pct > activeProgress[1]) return false
        }
        if (activeMcap) {
          const mc = allMarketCaps?.[i]?.result as bigint | undefined
          const mcUsd = mc ? Number(formatEther(mc)) * bnbPrice : 0
          if (mcUsd < activeMcap[0]) return false
          if (activeMcap[1] < MCAP_MAX && mcUsd > activeMcap[1]) return false
        }
        if (activeVol) {
          const vol = volumes24h.get(tokenAddr) || 0
          if (vol < activeVol[0]) return false
          if (activeVol[1] < VOL_MAX && vol > activeVol[1]) return false
        }
      }

      return true
    })

    // Sorting
    const dirMul = sortDir === 'desc' ? 1 : -1
    if (sortBy === 'marketcap' && allMarketCaps) {
      indices.sort((a, b) => {
        const mcA = allMarketCaps[a]?.result as bigint | undefined
        const mcB = allMarketCaps[b]?.result as bigint | undefined
        const valA = mcA ? Number(formatEther(mcA)) : 0
        const valB = mcB ? Number(formatEther(mcB)) : 0
        return (valB - valA) * dirMul
      })
    } else if (sortBy === 'progress') {
      // ICO goal progress (raised / ICO_GOAL_BNB). Trading/airdrop tokens
      // are treated as 100% (fully raised) so they don't dominate the top
      // when sorting desc — they pin to the bottom in asc.
      indices.sort((a, b) => {
        const addrA = (allTokenInfo[a]?.result?.[0] as string)?.toLowerCase()
        const addrB = (allTokenInfo[b]?.result?.[0] as string)?.toLowerCase()
        const metaA = addrA ? tokensMeta.get(addrA) : null
        const metaB = addrB ? tokensMeta.get(addrB) : null
        const progA = resolvePhase(metaA) === 'ico'
          ? Math.min(Number(metaA?.ico_bnb_raised || 0) / ICO_GOAL_BNB, 1)
          : 1
        const progB = resolvePhase(metaB) === 'ico'
          ? Math.min(Number(metaB?.ico_bnb_raised || 0) / ICO_GOAL_BNB, 1)
          : 1
        return (progB - progA) * dirMul
      })
    } else {
      // 'age': highest index = newest
      indices.sort((a, b) => (b - a) * dirMul)
    }

    return indices
  }, [tokenIndices, allTokenInfo, allMarketCaps, phaseFilters, sortBy, sortDir, tokensMeta, searchTerm, activeRound, activeProgress, activeMcap, activeVol, volumes24h, bnbPrice])

  const togglePhase = (phase: PhaseFilter) => {
    setPhaseFilters(prev => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }

  const tagFilters: { key: PhaseFilter; label: string; color: string }[] = [
    { key: 'ico', label: 'ICO', color: 'bg-yellow-400' },
    { key: 'trading', label: 'Trading', color: 'bg-green-400' },
    { key: 'airdrop_complete', label: 'Airdrop', color: 'bg-purple-400' },
  ]

  const sortOptions: { key: SortMode; label: string; color: string }[] = [
    { key: 'age', label: 'Age', color: 'bg-cyan-400' },
    { key: 'progress', label: 'Progress', color: 'bg-violet-400' },
    { key: 'marketcap', label: 'Market Cap', color: 'bg-orange-400' },
  ]

  const handleSortClick = (key: SortMode) => {
    // "Progress" defaults to descending the first time it's selected so the
    // closest-to-launching tokens appear first. Users can still flip with the
    // asc/desc buttons after.
    if (key === 'progress' && sortBy !== 'progress') setSortDir('desc')
    setSortBy(key)
  }

  const clearSearch = () => {
    setSearchTerm('')
    const next = new URLSearchParams(searchParams)
    next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const openFilterPopup = () => {
    // Sync pending values to currently-applied filters when opening. Keep
    // round / progress consistent so the bidirectional link starts coherent.
    const initialRound = activeRound ?? [ROUND_MIN, ROUND_MAX]
    setRangeRound(initialRound)
    setRangeProgress(activeProgress ?? progressFromRounds(initialRound))
    setRangeMcap(activeMcap ?? [0, MCAP_MAX])
    setRangeVol(activeVol ?? [0, VOL_MAX])
    setFilterOpen(true)
  }

  const applyFilters = () => {
    setActiveRound(rangeRound[0] === ROUND_MIN && rangeRound[1] === ROUND_MAX ? null : rangeRound)
    setActiveProgress(rangeProgress[0] === 0 && rangeProgress[1] === 100 ? null : rangeProgress)
    setActiveMcap(rangeMcap[0] === 0 && rangeMcap[1] === MCAP_MAX ? null : rangeMcap)
    setActiveVol(rangeVol[0] === 0 && rangeVol[1] === VOL_MAX ? null : rangeVol)
    setFilterOpen(false)
  }

  const clearFilters = () => {
    setRangeRound([ROUND_MIN, ROUND_MAX])
    setRangeProgress([0, 100])
    setRangeMcap([0, MCAP_MAX])
    setRangeVol([0, VOL_MAX])
    setActiveRound(null)
    setActiveProgress(null)
    setActiveMcap(null)
    setActiveVol(null)
  }

  return (
    <div className="w-full">
      <div className="mb-4 md:mb-6">
        <h2 className="text-lg font-medium text-gray-100">All Tokens</h2>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 md:mb-6">
        {tagFilters.map((tag) => {
          const active = phaseFilters.has(tag.key)
          return (
            <button
              key={tag.key}
              onClick={() => togglePhase(tag.key)}
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                active
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${tag.color} ${active ? '' : 'opacity-40'}`} />
              {tag.label}
            </button>
          )
        })}

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {sortOptions.map((opt) => {
          const active = sortBy === opt.key
          return (
            <button
              key={opt.key}
              onClick={() => handleSortClick(opt.key)}
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                active
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${opt.color} ${active ? '' : 'opacity-40'}`} />
              {opt.label}
            </button>
          )
        })}

        {searchTerm.trim() && (
          <button
            onClick={clearSearch}
            className="ml-2 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 transition-all"
            title="Clear search"
          >
            Search: <span className="text-white">{searchTerm}</span>
            <span className="text-violet-200">✕</span>
          </button>
        )}

        {/* Right-aligned filter / sort-direction group */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => (filterOpen ? setFilterOpen(false) : openFilterPopup())}
            title="Filters"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${
              hasActiveFilters || filterOpen
                ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30 hover:bg-violet-500/20'
                : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-400'
            }`}
          >
            <Filter size={14} />
          </button>

          <button
            onClick={() => setSortDir('asc')}
            title="Ascending"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${
              sortDir === 'asc'
                ? 'bg-gray-800 text-white border border-gray-800'
                : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-400'
            }`}
          >
            <ArrowUpNarrowWide size={14} />
          </button>
          <button
            onClick={() => setSortDir('desc')}
            title="Descending"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${
              sortDir === 'desc'
                ? 'bg-gray-800 text-white border border-gray-800'
                : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-400'
            }`}
          >
            <ArrowDownWideNarrow size={14} />
          </button>
        </div>
      </div>

      <FilterModal
        open={filterOpen}
        rangeRound={rangeRound} setRangeRound={setRangeRound}
        rangeProgress={rangeProgress} setRangeProgress={setRangeProgress}
        rangeMcap={rangeMcap} setRangeMcap={setRangeMcap}
        rangeVol={rangeVol} setRangeVol={setRangeVol}
        onClear={clearFilters}
        onApply={applyFilters}
        onClose={() => setFilterOpen(false)}
      />

      {hasTokens ? (
        // 4 token cards per row on large screens, 2 on medium screens, and 1 on mobile
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 md:gap-6">
          {displayIndices.map((index) => {
            const info = allTokenInfo?.[index]?.result
            const tokenAddr = info?.[0] as string | undefined
            const meta = tokenAddr ? tokensMeta.get(tokenAddr.toLowerCase()) : null
            const mcRaw = allMarketCaps?.[index]?.result as bigint | undefined
            const marketCapUsd = mcRaw ? Number(formatEther(mcRaw)) * bnbPrice : null
            const creatorInfo = meta?.creator_id
              ? creators.get(meta.creator_id)
              : undefined
            return (
              <CoinCard
                key={tokenAddr || index}
                index={index}
                meta={meta}
                marketCapUsd={marketCapUsd}
                creator={creatorInfo}
              />
            )
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800">
          <div className="text-6xl mb-4">🪙</div>
          <div className="text-xl text-gray-300 mb-6">No coins created yet</div>
          <Link
            to="/create"
            className="inline-block px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg font-semibold hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg"
          >
            Create First Coin
          </Link>
        </div>
      )}
    </div>
  )
}

function CoinCard({ index, meta, marketCapUsd, creator }: { index: number; meta: any | null; marketCapUsd: number | null; creator?: { username: string | null; profile_pic: string | null; wallet_address: string } }) {
  const { data: tokenInfo } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'tokens',
    args: [BigInt(index)],
  })

  const { data: tokenName } = useReadContract({
    address: tokenInfo?.[0] as `0x${string}` | undefined,
    abi: TOKEN_ABI,
    functionName: 'name',
  })

  const { data: tokenSymbol } = useReadContract({
    address: tokenInfo?.[0] as `0x${string}` | undefined,
    abi: TOKEN_ABI,
    functionName: 'symbol',
  })

  if (!tokenInfo) return null

  const tokenImage = meta?.image || null
  const phase = resolvePhase(meta)

  const createdAt = Number(tokenInfo[5]) * 1000
  const timeAgo = getTimeAgo(createdAt)

  const phaseBadge = phase === 'ico'
    ? { label: 'ICO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    : phase === 'trading'
      ? { label: 'Trading', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
      : { label: 'Airdrop', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }

  const creatorWallet = tokenInfo[4] as string
  const creatorDisplay =
    creator?.username ||
    (creatorWallet ? `${creatorWallet.slice(0, 6)}...${creatorWallet.slice(-4)}` : '—')
  const icoRound = Math.min(Math.max(meta?.ico_current_round ? Number(meta.ico_current_round) : 1, 1), 10)
  const icoRaisedBnb = Number(meta?.ico_bnb_raised || 0)
  const icoFillPct = Math.min(100, (icoRaisedBnb / ICO_GOAL_BNB) * 100)
  const mcDisplay =
    phase === 'ico'
      ? null
      : marketCapUsd != null
        ? formatCompactUsd(marketCapUsd)
        : '—'

  return (
    <Link
      to={`/token/${tokenInfo[0]}`}
      className="block bg-gray-900 rounded-2xl border border-gray-800 hover:border-violet-500/40 transition-all duration-200 relative overflow-hidden transform-gpu will-change-transform isolate hover:scale-105"
      style={{ WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}
    >
      {/* Image hero section */}
      <div className="relative aspect-square bg-gray-900">
        {tokenImage ? (
          <img
            src={tokenImage}
            alt={tokenName || 'Token'}
            className="block w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-600/40 to-purple-800/40" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

        {/* ICO round badge — top-left, matches HotICOs style */}
        {phase === 'ico' && (
          <span className="absolute top-3 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm border bg-gray-900/60 text-gray-200 border-gray-700">
            R{icoRound}/10
          </span>
        )}

        {/* Phase badge */}
        <span className={`absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm ${phaseBadge.color}`}>
          {phaseBadge.label}
        </span>

        {/* Name + symbol + market cap on bottom of image */}
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="text-base font-bold text-white truncate drop-shadow-lg">{tokenName || 'Loading...'}</h3>
          <div className="flex items-baseline justify-between gap-2 leading-5">
            <p className="text-gray-300/50 font-semibold text-sm leading-5 drop-shadow-lg truncate">${tokenSymbol || '...'}</p>
            {mcDisplay && (
              <p className="font-bold text-white text-base leading-5 drop-shadow-lg whitespace-nowrap">
                {mcDisplay}
                {marketCapUsd != null && (
                  <span className="text-gray-400 text-[10px] font-semibold ml-1">MC</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info section */}
      <div className="relative -mt-px p-4 text-xs bg-gray-900">
        {/* Creator + Created — right-aligned with icons */}
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-1.5 text-gray-300">
            {creator?.profile_pic ? (
              <img
                src={creator.profile_pic}
                alt={creatorDisplay}
                className="w-4 h-4 rounded-full object-cover"
              />
            ) : (
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-purple-800" />
            )}
            <span className="truncate max-w-[120px]">{creatorDisplay}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock size={16} />
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* ICO progress bar — percentage sits inline to the left of the bar */}
        {phase === 'ico' && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-200 whitespace-nowrap tabular-nums">
              {icoFillPct.toFixed(1)}%
            </span>
            <div className="h-1.5 flex-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all"
                style={{ width: `${icoFillPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Filter modal ────────────────────────────────────────────────────

interface FilterModalProps {
  open: boolean
  rangeRound: Range
  setRangeRound: (r: Range) => void
  rangeProgress: Range
  setRangeProgress: (r: Range) => void
  rangeMcap: Range
  setRangeMcap: (r: Range) => void
  rangeVol: Range
  setRangeVol: (r: Range) => void
  onClear: () => void
  onApply: () => void
  onClose: () => void
}

function FilterModal({
  open,
  rangeRound, setRangeRound,
  rangeProgress, setRangeProgress,
  rangeMcap, setRangeMcap,
  rangeVol, setRangeVol,
  onClear, onApply, onClose,
}: FilterModalProps) {
  // Bidirectional link between ICO round and ICO goal progress. Each handler
  // updates BOTH state slices directly, so there's no useEffect loop.
  const handleRoundChange = (next: Range) => {
    setRangeRound(next)
    setRangeProgress(progressFromRounds(next))
  }
  const handleProgressChange = (next: Range) => {
    setRangeProgress(next)
    setRangeRound(roundsFromProgress(next))
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <style>{`
            .koala-range { -webkit-appearance: none; appearance: none; background: transparent; outline: none; height: 20px; }
            .koala-range::-webkit-slider-runnable-track { background: transparent; height: 20px; }
            .koala-range::-moz-range-track { background: transparent; height: 20px; }
            .koala-range::-webkit-slider-thumb {
              -webkit-appearance: none; appearance: none;
              width: 16px; height: 16px; border-radius: 50%;
              background: #8b5cf6; border: 2px solid #2e1065;
              cursor: pointer; pointer-events: auto;
              box-shadow: 0 0 0 1px rgba(139,92,246,0.35);
              margin-top: 0;
            }
            .koala-range::-moz-range-thumb {
              width: 16px; height: 16px; border-radius: 50%;
              background: #8b5cf6; border: 2px solid #2e1065;
              cursor: pointer; pointer-events: auto;
              box-shadow: 0 0 0 1px rgba(139,92,246,0.35);
            }
          `}</style>
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-violet-400" />
                <h3 className="text-base font-semibold text-gray-100">Filters</h3>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
              <RangeField
                label="ICO Round"
                min={ROUND_MIN}
                max={ROUND_MAX}
                step={1}
                value={rangeRound}
                onChange={handleRoundChange}
                format={(v) => `${v}`}
                maxLabel={`${ROUND_MAX}`}
              />
              <RangeField
                label="ICO Goal Progress"
                min={0}
                max={100}
                step={1}
                value={rangeProgress}
                onChange={handleProgressChange}
                format={(v) => `${v}%`}
                maxLabel="100%"
              />

              <div className="h-px bg-gray-800 my-4" />

              <RangeField
                label="Market Cap"
                min={0}
                max={MCAP_MAX}
                step={100_000}
                value={rangeMcap}
                onChange={setRangeMcap}
                format={formatCompactUsd}
                maxLabel={`${formatCompactUsd(MCAP_MAX)}+`}
                parseInput={parseCompactNumber}
                placeholder="e.g., 5k, 100k"
              />
              <RangeField
                label="24h Volume"
                min={0}
                max={VOL_MAX}
                step={5_000}
                value={rangeVol}
                onChange={setRangeVol}
                format={formatCompactUsd}
                maxLabel={`${formatCompactUsd(VOL_MAX)}+`}
                parseInput={parseCompactNumber}
                placeholder="e.g., 5k, 100k"
              />
            </div>

            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-800 bg-gray-900/60">
              <button
                onClick={onClear}
                className="flex-1 text-xs font-semibold px-3 py-2.5 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all"
              >
                Clear all
              </button>
              <button
                onClick={onApply}
                className="flex-1 text-xs font-semibold px-3 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg"
              >
                Apply filters
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface RangeFieldProps {
  label: string
  min: number
  max: number
  step: number
  value: Range
  onChange: (r: Range) => void
  format: (v: number) => string
  maxLabel?: string
  parseInput?: (s: string) => number | null
  placeholder?: string
}

function RangeField({ label, min, max, step, value, onChange, format, maxLabel, parseInput, placeholder }: RangeFieldProps) {
  const [lo, hi] = value
  const pctLo = ((lo - min) / (max - min)) * 100
  const pctHi = ((hi - min) / (max - min)) * 100
  const atMaxHi = hi >= max
  const displayHi = atMaxHi && maxLabel ? maxLabel : format(hi)
  const [minInput, setMinInput] = useState<string>(format(lo))
  const [maxInput, setMaxInput] = useState<string>(format(hi))

  // Keep the text inputs in sync with the slider unless the field is focused.
  useEffect(() => { setMinInput(format(lo)) }, [lo, format])
  useEffect(() => { setMaxInput(format(hi)) }, [hi, format])

  const parse = parseInput || ((s: string) => {
    const n = Number(s)
    return isNaN(n) ? null : n
  })

  const commitMin = () => {
    const n = parse(minInput)
    if (n == null) { setMinInput(format(lo)); return }
    const clamped = Math.max(min, Math.min(n, hi))
    onChange([clamped, hi])
  }

  const commitMax = () => {
    const n = parse(maxInput)
    if (n == null) { setMaxInput(format(hi)); return }
    const clamped = Math.min(max, Math.max(n, lo))
    onChange([lo, clamped])
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs text-gray-400">{format(lo)} - {displayHi}</span>
      </div>

      <div className="relative h-5">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-gray-700 rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-violet-500 rounded-full"
          style={{ left: `${pctLo}%`, right: `${100 - pctHi}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className="koala-range absolute top-0 left-0 w-full pointer-events-none"
          style={{ zIndex: lo > max - (max - min) * 0.05 ? 5 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className="koala-range absolute top-0 left-0 w-full pointer-events-none"
          style={{ zIndex: 4 }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1">
        <span>{format(min)}</span>
        <span>{maxLabel || format(max)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-400 font-medium">Minimum</span>
          <input
            type="text"
            value={minInput}
            placeholder={placeholder}
            onChange={(e) => setMinInput(e.target.value)}
            onBlur={commitMin}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded-md border border-gray-700 focus:border-violet-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-400 font-medium">Maximum</span>
          <input
            type="text"
            value={maxInput}
            placeholder={placeholder}
            onChange={(e) => setMaxInput(e.target.value)}
            onBlur={commitMax}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded-md border border-gray-700 focus:border-violet-400 focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}

// Accepts "5k", "1.2M", "1,000", "500" etc. Returns null when unparseable.
function parseCompactNumber(input: string): number | null {
  if (!input) return null
  const cleaned = input.trim().toLowerCase().replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const m = cleaned.match(/^(-?\d*\.?\d+)([kmb])?$/)
  if (!m) return null
  const num = parseFloat(m[1])
  if (isNaN(num)) return null
  const mult = m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : m[2] === 'b' ? 1_000_000_000 : 1
  return num * mult
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function getTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}
