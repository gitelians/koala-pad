import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getBnbPrice } from '../lib/bnbPrice'
import { POOL_ABI } from '../constants/abis'

interface BestTokenRow {
  token_address: string
  name: string
  symbol: string
  image: string | null
  pool_address: string | null
  phase: string
  perf_24h: number
}

const TOTAL_SUPPLY = parseEther('21000000')

export default function BestTokens() {
  const [rows, setRows] = useState<BestTokenRow[]>([])
  const [bnbPrice, setBnbPrice] = useState(600)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    getBnbPrice().then(p => { if (!cancelled) setBnbPrice(p) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)

        // Fetch all tradeable tokens (skip ICO phase).
        const { data: tokens } = await supabase
          .from('tokens')
          .select('token_address, name, symbol, image, pool_address, phase')
          .in('phase', ['trading', 'airdrop_complete'])

        if (!tokens || tokens.length === 0) {
          if (!cancelled) { setRows([]); setLoading(false) }
          return
        }

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const addresses = tokens.map((t: any) => t.token_address.toLowerCase())

        // Pull all 24h trades for these tokens in one go.
        const { data: trades } = await supabase
          .from('trades')
          .select('token_address, price_bnb, bnb_amount, token_amount, created_at')
          .in('token_address', addresses)
          .gte('created_at', since)
          .order('created_at', { ascending: true })

        // First / last price per token over the window.
        const perToken = new Map<string, { first: number; last: number }>()
        for (const t of (trades || []) as any[]) {
          let price = Number(t.price_bnb)
          if (!Number.isFinite(price) || price <= 0) {
            const bnb = Number(t.bnb_amount)
            const tok = Number(t.token_amount)
            if (bnb > 0 && tok > 0) price = bnb / tok
            else continue
          }
          const key = String(t.token_address).toLowerCase()
          const entry = perToken.get(key)
          if (!entry) perToken.set(key, { first: price, last: price })
          else entry.last = price
        }

        const computed: BestTokenRow[] = tokens
          .map((t: any) => {
            const key = t.token_address.toLowerCase()
            const m = perToken.get(key)
            const perf = m && m.first > 0 ? ((m.last - m.first) / m.first) * 100 : 0
            return {
              token_address: t.token_address,
              name: t.name,
              symbol: t.symbol,
              image: t.image,
              pool_address: t.pool_address,
              phase: t.phase,
              perf_24h: perf,
            }
          })
          .sort((a, b) => b.perf_24h - a.perf_24h)
          .slice(0, 10)

        if (!cancelled) setRows(computed)
      } catch (err) {
        console.error('Failed to load best tokens:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Batch read current market caps for display.
  const mcContracts = useMemo(() => rows.map(r => ({
    address: (r.pool_address || undefined) as `0x${string}` | undefined,
    abi: POOL_ABI,
    functionName: 'getMarketCap' as const,
    args: [TOTAL_SUPPLY],
  })), [rows])
  const { data: mcData } = useReadContracts({ contracts: mcContracts })

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <section className="mb-6 md:mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base md:text-lg font-medium text-gray-100">Best Tokens</h2>
        </div>
        <div className="h-40 bg-gray-900/50 rounded-2xl border border-gray-800 animate-pulse" />
      </section>
    )
  }

  if (rows.length === 0) return null

  return (
    <section className="mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base md:text-lg font-medium text-gray-100">Best Tokens</h2>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">24h</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => scrollBy(-320)}
            className="p-1.5 rounded-full bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-violet-500/40 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scrollBy(320)}
            className="p-1.5 rounded-full bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-violet-500/40 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto custom-scrollbar pb-2 snap-x snap-mandatory"
      >
        {rows.map((r, i) => {
          const mcRaw = mcData?.[i]?.result as bigint | undefined
          const mcUsd = mcRaw ? parseFloat(formatEther(mcRaw)) * bnbPrice : null
          const positive = r.perf_24h >= 0
          return (
            <Link
              key={r.token_address}
              to={`/token/${r.token_address}`}
              className="snap-start flex-shrink-0 w-44 md:w-52 bg-gray-900 rounded-2xl border border-gray-800 hover:border-violet-500/40 transition-all overflow-hidden"
            >
              <div className="relative aspect-square">
                {r.image ? (
                  <img src={r.image} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-violet-600/40 to-purple-800/40" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
                <span
                  className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm border flex items-center gap-1 ${
                    positive
                      ? 'bg-green-500/20 text-green-300 border-green-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {positive ? '+' : ''}{r.perf_24h.toFixed(2)}%
                </span>
                <div className="absolute bottom-2 left-3 right-3">
                  <h3 className="text-sm font-bold text-white truncate drop-shadow-lg">{r.name}</h3>
                  <p className="text-gray-300/50 text-xs font-semibold drop-shadow-lg truncate">${r.symbol}</p>
                </div>
              </div>
              <div className="px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">MC</span>
                  <span className="text-gray-100 font-semibold">
                    {mcUsd != null ? formatCompactUsd(mcUsd) : '—'}
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}
