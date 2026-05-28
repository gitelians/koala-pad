import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { ChevronLeft, ChevronRight, Flame, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ICO_ABI } from '../constants/abis'
import { getBnbPrice } from '../lib/bnbPrice'

interface HotIcoRow {
  token_address: string
  name: string
  symbol: string
  image: string | null
  ico_address: string | null
  bnb_3h: number
  unique_buyers_3h: number
}

const ICO_GOAL_BNB = 24
const WINDOW_HOURS = 3

export default function HotIcos() {
  const [rows, setRows] = useState<HotIcoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [bnbPrice, setBnbPrice] = useState(600)
  const scrollRef = useRef<HTMLDivElement>(null)

  const formatUSD = (value: number) => {
    if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return `$${value.toFixed(2)}`
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)

        const { data: tokens } = await supabase
          .from('tokens')
          .select('token_address, name, symbol, image, ico_address, phase')
          .eq('phase', 'ico')

        if (!tokens || tokens.length === 0) {
          if (!cancelled) { setRows([]); setLoading(false) }
          return
        }

        const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
        const addresses = tokens.map((t: any) => t.token_address.toLowerCase())

        const { data: contributions } = await supabase
          .from('ico_contributions')
          .select('token_address, wallet_address, bnb_amount')
          .in('token_address', addresses)
          .eq('kind', 'buy')
          .gte('created_at', since)

        const perToken = new Map<string, { bnb: number; buyers: Set<string> }>()
        for (const c of (contributions || []) as any[]) {
          const key = String(c.token_address).toLowerCase()
          const bnb = Number(c.bnb_amount)
          if (!Number.isFinite(bnb) || bnb <= 0) continue
          const wallet = String(c.wallet_address).toLowerCase()
          const entry = perToken.get(key)
          if (!entry) perToken.set(key, { bnb, buyers: new Set([wallet]) })
          else { entry.bnb += bnb; entry.buyers.add(wallet) }
        }

        const computed: HotIcoRow[] = tokens
          .map((t: any) => {
            const key = t.token_address.toLowerCase()
            const m = perToken.get(key)
            return {
              token_address: t.token_address,
              name: t.name,
              symbol: t.symbol,
              image: t.image,
              ico_address: t.ico_address,
              bnb_3h: m?.bnb ?? 0,
              unique_buyers_3h: m?.buyers.size ?? 0,
            }
          })
          .filter(r => r.bnb_3h > 0)
          .sort((a, b) => b.bnb_3h - a.bnb_3h)
          .slice(0, 10)

        if (!cancelled) setRows(computed)
      } catch (err) {
        console.error('Failed to load hot ICOs:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    getBnbPrice().then(p => setBnbPrice(p))
    return () => { cancelled = true }
  }, [])

  // Batch on-chain reads: currentRound + totalBNBRaised per ICO contract.
  const icoContracts = useMemo(() => rows.flatMap(r => ([
    { address: (r.ico_address || undefined) as `0x${string}` | undefined, abi: ICO_ABI, functionName: 'currentRound' as const },
    { address: (r.ico_address || undefined) as `0x${string}` | undefined, abi: ICO_ABI, functionName: 'totalBNBRaised' as const },
  ])), [rows])
  const { data: icoData } = useReadContracts({ contracts: icoContracts })

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <section className="mb-6 md:mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base md:text-lg font-medium text-gray-100">Hot ICOs</h2>
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
          <Flame size={16} className="text-orange-400" />
          <h2 className="text-base md:text-lg font-medium text-gray-100">Hot ICOs</h2>
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
          const round = icoData?.[i * 2]?.result as bigint | undefined
          const raisedRaw = icoData?.[i * 2 + 1]?.result as bigint | undefined
          const totalRaised = raisedRaw ? parseFloat(formatEther(raisedRaw)) : 0
          const fillPct = Math.min(100, (totalRaised / ICO_GOAL_BNB) * 100)
          const roundNum = round ? Number(round) : null
          const raisedUSD = totalRaised * bnbPrice
          const goalUSD = ICO_GOAL_BNB * bnbPrice
          return (
            <Link
              key={r.token_address}
              to={`/token/${r.token_address}`}
              className="snap-start flex-shrink-0 w-44 md:w-52 bg-gray-900 rounded-2xl border border-gray-800 transition-all overflow-hidden"
            >
              <div className="relative aspect-square">
                {r.image ? (
                  <img src={r.image} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-orange-600/40 to-rose-800/40" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
                <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm border bg-orange-500/20 text-orange-300 border-orange-500/30 flex items-center gap-1">
                  <Flame size={10} />
                  +{r.bnb_3h.toFixed(3)} BNB
                </span>
                {roundNum != null && roundNum > 0 && (
                  <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm border bg-gray-900/60 text-gray-200 border-gray-700">
                    R{roundNum}/10
                  </span>
                )}
                <div className="absolute bottom-2 left-3 right-3">
                  <h3 className="text-sm font-bold text-white truncate drop-shadow-lg">{r.name}</h3>
                  <p className="text-gray-300/50 text-xs font-semibold drop-shadow-lg truncate">${r.symbol}</p>
                </div>
              </div>
              <div className="px-3 py-2 space-y-2">
                <div>
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-gray-500">ICO Progress</span>
                    <span className="text-gray-200 font-semibold">{fillPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-rose-500"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Users size={11} />
                    {r.unique_buyers_3h}
                  </span>
                  <span className="text-gray-100">
                    {formatUSD(raisedUSD)}<span className="text-gray-400">/{formatUSD(goalUSD)}</span>
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
