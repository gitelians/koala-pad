import { useState, useEffect, useRef, useCallback, useMemo, MouseEvent as ReactMouseEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { ICO_ABI } from '../constants/abis'
import { supabase } from '../lib/supabase'

interface ICOProgressHeroProps {
  icoAddress: `0x${string}`
  bnbPrice: number
}

// X-axis is event count. index 0 = pre-ICO origin (value $0); indices 1..N
// are buy/withdraw events in order. Y value is cumulative USD raised
// through that point (buys add, withdraws subtract).
interface DataPoint {
  index: number
  value: number
}

const VISIBLE_WINDOW = 20

export default function ICOProgressHero({ icoAddress, bnbPrice }: ICOProgressHeroProps) {
  const { address: routeTokenAddress } = useParams<{ address: string }>()
  const filterAddress = (routeTokenAddress || icoAddress).toLowerCase()

  const [dataPoints, setDataPoints] = useState<DataPoint[]>([{ index: 0, value: 0 }])
  const [viewOffset, setViewOffset] = useState(0)
  const cumulativeBNBRef = useRef<number>(0)
  const currentUSDRef = useRef<number>(0)

  const { data: icoInfo } = useReadContract({
    address: icoAddress,
    abi: ICO_ABI,
    functionName: 'getICOInfo',
    query: { refetchInterval: 5000 },
  })

  // getICOInfo: (currentRound, tokensSoldInCurrentRound, totalBNBRaised,
  // finalized, currentPrice). See ICO.sol.
  const totalBNBRaised = icoInfo ? icoInfo[2] : 0n

  const icoGoal = 24 // ICO.sol ICO_GOAL (BNB)
  const raisedBNB = totalBNBRaised ? parseFloat(formatEther(totalBNBRaised)) : 0
  const currentUSD = raisedBNB * bnbPrice
  const goalUSD = icoGoal * bnbPrice
  currentUSDRef.current = currentUSD
  const progress = Math.min((raisedBNB / icoGoal) * 100, 100)

  useEffect(() => {
    let cancelled = false
    const addrLower = filterAddress

    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('ico_contributions')
        .select('bnb_amount, kind, created_at')
        .ilike('token_address', filterAddress)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (error) console.error('[ICOProgressHero] Supabase fetch error:', error)

      const rows = data || []
      const points: DataPoint[] = [{ index: 0, value: 0 }]
      let cumulativeBNB = 0
      let idx = 0

      for (const row of rows) {
        const amt = parseFloat(row.bnb_amount)
        if (isNaN(amt) || amt <= 0) continue
        const signed = (row as any).kind === 'withdraw' ? -amt : amt
        cumulativeBNB = Math.max(cumulativeBNB + signed, 0)
        idx += 1
        points.push({ index: idx, value: cumulativeBNB * bnbPrice })
      }

      cumulativeBNBRef.current = cumulativeBNB

      // Reconcile end-of-series with on-chain total only if it's higher
      // (never overwrite a real value with a stale smaller read).
      if (points.length > 1 && currentUSDRef.current > 0) {
        const last = points[points.length - 1]
        if (currentUSDRef.current > last.value) {
          points[points.length - 1] = { ...last, value: currentUSDRef.current }
        }
      }

      setDataPoints(points)
      setViewOffset(0)
    }

    fetchHistory()

    const channel = supabase
      .channel(`ico_contributions_${addrLower}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ico_contributions',
          filter: `token_address=eq.${addrLower}`,
        },
        (payload) => {
          const row = payload.new as { bnb_amount?: string; kind?: string }
          const amt = parseFloat(row.bnb_amount || '')
          if (isNaN(amt) || amt <= 0) return
          const signed = row.kind === 'withdraw' ? -amt : amt
          cumulativeBNBRef.current = Math.max(cumulativeBNBRef.current + signed, 0)
          const newValue = cumulativeBNBRef.current * bnbPrice

          setDataPoints((prev) => {
            const nextIdx = prev.length > 0 ? prev[prev.length - 1].index + 1 : 1
            return [...prev, { index: nextIdx, value: newValue }]
          })
          setViewOffset(0)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAddress, bnbPrice])

  // Reconcile last point upward when chain reports more than the DB sum.
  // For downward divergence (a withdraw race condition) we leave it — the
  // realtime insert will catch up.
  useEffect(() => {
    if (currentUSD <= 0) return
    setDataPoints((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last.index === 0) return prev
      if (currentUSD <= last.value) return prev
      return [...prev.slice(0, -1), { ...last, value: currentUSD }]
    })
  }, [currentUSD])

  const cta =
    progress >= 100
      ? 'Goal reached — finalizing!'
      : progress >= 90
      ? 'Final push — so close!'
      : progress >= 75
      ? 'Almost there — don\'t miss out!'
      : progress >= 50
      ? 'Over halfway — momentum is building!'
      : progress >= 25
      ? 'Gaining traction — join the early backers!'
      : 'Just getting started — be an early backer!'

  const formatUSD = (value: number) => {
    if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return `$${value.toFixed(2)}`
  }

  const purchaseCount = Math.max(0, dataPoints.length - 1)
  const maxOffset = Math.max(0, purchaseCount - VISIBLE_WINDOW)
  const clampedOffset = Math.min(Math.max(viewOffset, 0), maxOffset)

  const handleScroll = useCallback(
    (delta: number) => {
      setViewOffset((prev) => {
        const next = prev + delta
        const max = Math.max(0, purchaseCount - VISIBLE_WINDOW)
        return Math.min(Math.max(next, 0), max)
      })
    },
    [purchaseCount],
  )

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-4 md:p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/10 via-transparent to-purple-900/10 pointer-events-none" />

      <div className="relative z-10">
        <div className="mb-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Raised</div>
          <div className="text-2xl md:text-3xl font-semibold text-white leading-tight">
            {formatUSD(currentUSD)}
          </div>
          <div className="text-sm text-gray-500">of {formatUSD(goalUSD)} goal</div>
        </div>

        <TrendingChart
          dataPoints={dataPoints}
          goalUSD={goalUSD}
          currentUSD={currentUSD}
          viewOffset={clampedOffset}
          maxOffset={maxOffset}
          onScroll={handleScroll}
        />

        <p className="text-sm text-gray-400 mt-4 text-center italic">{cta}</p>
      </div>
    </div>
  )
}

// ─── Trending Line Chart ─────────────────────────────────────────────

interface TrendingChartProps {
  dataPoints: DataPoint[]
  goalUSD: number
  currentUSD: number
  viewOffset: number
  maxOffset: number
  onScroll: (delta: number) => void
}

const CHART_W = 500
const CHART_H = 180
const PAD = { top: 20, right: 50, bottom: 25, left: 55 }
const INNER_W = CHART_W - PAD.left - PAD.right
const INNER_H = CHART_H - PAD.top - PAD.bottom

function TrendingChart({
  dataPoints,
  goalUSD,
  currentUSD,
  viewOffset,
  maxOffset,
  onScroll,
}: TrendingChartProps) {
  const formatCompact = useCallback((value: number) => {
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
    if (value >= 1) return `$${value.toFixed(0)}`
    return `$${value.toFixed(2)}`
  }, [])

  const purchaseCount = Math.max(0, dataPoints.length - 1)

  const xRight = Math.max(purchaseCount - viewOffset, VISIBLE_WINDOW)
  const xLeft = Math.max(0, xRight - VISIBLE_WINDOW)
  const xSpan = xRight - xLeft

  const toX = (index: number) =>
    PAD.left + ((index - xLeft) / (xSpan || 1)) * INNER_W

  const visiblePoints = useMemo(() => {
    return dataPoints.filter((p) => p.index >= xLeft - 1 && p.index <= xRight + 1)
  }, [dataPoints, xLeft, xRight])

  const dataMax = Math.max(currentUSD, ...dataPoints.map((p) => p.value), 0)
  const zoomedMax = Math.max(dataMax * 1.5, 1)
  const goalFits = goalUSD * 1.15 <= zoomedMax * 4
  const maxVal = goalFits ? goalUSD * 1.15 || 1 : zoomedMax
  const goalInView = goalUSD <= maxVal

  const toY = (v: number) => PAD.top + INNER_H - (v / maxVal) * INNER_H

  const renderPts: DataPoint[] =
    visiblePoints.length > 0 ? visiblePoints : [{ index: 0, value: 0 }]

  const linePath = renderPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(1)} ${toY(p.value).toFixed(1)}`)
    .join(' ')

  const firstX = toX(renderPts[0].index)
  const lastPoint = renderPts[renderPts.length - 1]
  const lastX = toX(lastPoint.index)
  const baseY = PAD.top + INNER_H

  const areaPath = `${linePath} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`

  const goalY = toY(goalUSD)

  const yTicks = Array.from({ length: 5 }, (_, i) => (maxVal / 4) * i)

  const xTickCount = 5
  const xStep = Math.max(1, Math.ceil(xSpan / xTickCount))
  const xTicks: number[] = []
  for (let t = xLeft; t <= xRight; t += xStep) xTicks.push(t)
  if (xTicks[xTicks.length - 1] !== xRight) xTicks.push(xRight)

  const dotX = lastX
  const dotY = toY(lastPoint.value)

  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ point: DataPoint; x: number; y: number } | null>(null)

  const formatUSDFull = useCallback((value: number) => {
    if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return `$${value.toFixed(2)}`
  }, [])

  const handleMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || renderPts.length === 0) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return
    const svgX = ((e.clientX - rect.left) / rect.width) * CHART_W
    if (svgX < PAD.left || svgX > CHART_W - PAD.right) {
      setHover(null)
      return
    }
    let nearest = renderPts[0]
    let minDist = Infinity
    for (const p of renderPts) {
      const px = toX(p.index)
      const d = Math.abs(px - svgX)
      if (d < minDist) {
        minDist = d
        nearest = p
      }
    }
    setHover({ point: nearest, x: toX(nearest.index), y: toY(nearest.value) })
  }

  const handleMouseLeave = () => setHover(null)

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (maxOffset <= 0) return
    e.preventDefault()
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : -e.deltaY
    const step = dx > 0 ? -1 : 1
    onScroll(step)
  }

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="goalGlow" x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="plotClip">
            <rect x={PAD.left} y={PAD.top} width={INNER_W} height={INNER_H} />
          </clipPath>
        </defs>

        {yTicks.map((tick, i) => (
          <line
            key={`ygrid-${i}`}
            x1={PAD.left}
            y1={toY(tick)}
            x2={CHART_W - PAD.right}
            y2={toY(tick)}
            stroke="#1f2937"
            strokeWidth="1"
          />
        ))}

        {yTicks.map((tick, i) => (
          <text
            key={`ytick-${i}`}
            x={PAD.left - 8}
            y={toY(tick) + 4}
            textAnchor="end"
            fill="#6b7280"
            fontSize="10"
            fontFamily="monospace"
          >
            {formatCompact(tick)}
          </text>
        ))}

        <line
          x1={PAD.left}
          y1={baseY}
          x2={CHART_W - PAD.right}
          y2={baseY}
          stroke="#374151"
          strokeWidth="1"
        />

        {xTicks.map((tick) => (
          <g key={`xtick-${tick}`}>
            <text
              x={toX(tick)}
              y={baseY + 14}
              textAnchor="middle"
              fill="transparent"
              fontSize="9"
              fontFamily="monospace"
            >
              {tick}
            </text>
          </g>
        ))}

        {goalInView ? (
          <>
            <line
              x1={PAD.left}
              y1={goalY}
              x2={CHART_W - PAD.right}
              y2={goalY}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              filter="url(#goalGlow)"
              opacity="0.8"
            />
            <text
              x={CHART_W - PAD.right + 5}
              y={goalY + 4}
              fill="#f59e0b"
              fontSize="10"
              fontWeight="bold"
              fontFamily="monospace"
              filter="url(#goalGlow)"
            >
              GOAL
            </text>
          </>
        ) : (
          <text
            x={CHART_W - PAD.right}
            y={PAD.top - 6}
            textAnchor="end"
            fill="#30c60a"
            fontSize="10"
            fontWeight="bold"
            fontFamily="monospace"
            filter="url(#goalGlow)"
          >
            {`GOAL ${formatCompact(goalUSD)} ↑`}
          </text>
        )}

        <g clipPath="url(#plotClip)">
          <path d={areaPath} fill="url(#areaGrad)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#lineGlow)"
          />
        </g>

        {lastPoint.index > 0 && (
          <>
            <circle cx={dotX} cy={dotY} r="5" fill="#a855f7" filter="url(#dotGlow)">
              <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={dotX} cy={dotY} r="2.5" fill="white" />
          </>
        )}

        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              y1={PAD.top}
              x2={hover.x}
              y2={baseY}
              stroke="#a855f7"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
            />
            <circle cx={hover.x} cy={hover.y} r="5" fill="#a855f7" filter="url(#dotGlow)" />
            <circle cx={hover.x} cy={hover.y} r="2.5" fill="white" />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="absolute pointer-events-none px-2 py-1 rounded-md bg-gray-900/95 border border-purple-500/40 text-xs text-white shadow-lg whitespace-nowrap"
          style={{
            left: `${(hover.x / CHART_W) * 100}%`,
            top: `${(hover.y / CHART_H) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 10px))',
          }}
        >
          <div className="font-semibold text-purple-300">{formatUSDFull(hover.point.value)}</div>
        </div>
      )}
    </div>
  )
}
