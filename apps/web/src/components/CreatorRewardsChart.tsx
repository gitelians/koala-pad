import { useEffect, useMemo, useState } from 'react'
import {
  getCreatorRewardsDaily,
  getCreatorRewardsTotal,
  CreatorRewardDay,
} from '../lib/supabaseApi'

interface CreatorRewardsChartProps {
  userId: string
  days?: number
}

interface DayPoint {
  day: string // YYYY-MM-DD
  usd: number
}

const CHART_W = 700
const CHART_H = 240
const PAD = { top: 12, right: 16, bottom: 12, left: 16 }
const INNER_W = CHART_W - PAD.left - PAD.right
const INNER_H = CHART_H - PAD.top - PAD.bottom

function buildDailySeries(rows: CreatorRewardDay[], days: number): DayPoint[] {
  // Zero-fill the timeline so empty days have a flat trendline.
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.day, r.total_usd)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const points: DayPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(today.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    points.push({ day: key, usd: map.get(key) || 0 })
  }
  return points
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return `$${value.toFixed(0)}`
  return `$${value.toFixed(2)}`
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function CreatorRewardsChart({ userId, days = 30 }: CreatorRewardsChartProps) {
  const [series, setSeries] = useState<DayPoint[]>([])
  const [total, setTotal] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getCreatorRewardsDaily(userId, days),
      getCreatorRewardsTotal(userId),
    ])
      .then(([daily, totals]) => {
        if (cancelled) return
        setSeries(buildDailySeries(daily, days))
        setTotal(totals.total_usd)
      })
      .catch(err => console.error('Failed to load creator rewards:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId, days])

  // Adaptive Y axis: max = max daily value × 1.2, with a floor so empty
  // series still render a visible baseline.
  const maxVal = useMemo(() => {
    const m = series.reduce((acc, p) => Math.max(acc, p.usd), 0)
    return Math.max(m * 1.2, 1)
  }, [series])

  const toX = (i: number) =>
    PAD.left + (series.length <= 1 ? 0 : (i / (series.length - 1)) * INNER_W)
  const toY = (v: number) => PAD.top + INNER_H - (v / maxVal) * INNER_H

  const linePath = useMemo(() => {
    if (series.length === 0) return ''
    return series
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.usd).toFixed(1)}`)
      .join(' ')
  }, [series, maxVal])

  const areaPath = useMemo(() => {
    if (series.length === 0) return ''
    const baseY = PAD.top + INNER_H
    return `${linePath} L ${toX(series.length - 1).toFixed(1)} ${baseY.toFixed(1)} L ${toX(0).toFixed(1)} ${baseY.toFixed(1)} Z`
  }, [linePath, series])

  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => (maxVal / 4) * i), [maxVal])

  // X ticks: ~6 labels evenly spaced across the window
  const xTickIndices = useMemo(() => {
    if (series.length === 0) return []
    const count = Math.min(6, series.length)
    const idxs: number[] = []
    for (let i = 0; i < count; i++) {
      idxs.push(Math.round((i / (count - 1 || 1)) * (series.length - 1)))
    }
    return Array.from(new Set(idxs))
  }, [series])

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (series.length === 0) return
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const x = ratio * CHART_W
    const localX = Math.min(Math.max(x - PAD.left, 0), INNER_W)
    const i = Math.round((localX / INNER_W) * (series.length - 1))
    setHoverIndex(Math.max(0, Math.min(series.length - 1, i)))
  }

  const hoverPoint = hoverIndex != null ? series[hoverIndex] : null

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-4 md:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
            Total rewards
          </div>
          <div className="text-2xl md:text-3xl font-semibold text-white leading-tight">
            {loading ? '—' : formatUSD(total)}
          </div>
        </div>
        <div className="text-xs text-gray-500">Last {days} days</div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading rewards...</div>
      ) : series.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">No reward data yet.</div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              {/* userSpaceOnUse so the gradient still renders when the path's bbox collapses to zero height (e.g. flat zero line) */}
              <linearGradient
                id="crLine"
                gradientUnits="userSpaceOnUse"
                x1={PAD.left}
                y1="0"
                x2={PAD.left + INNER_W}
                y2="0"
              >
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <linearGradient
                id="crArea"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1={PAD.top}
                x2="0"
                y2={PAD.top + INNER_H}
              >
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
              {/* Extend below the baseline so the zero line's stroke (and rounded cap) isn't clipped */}
              <clipPath id="crClip">
                <rect x={PAD.left} y={PAD.top} width={INNER_W} height={INNER_H + 4} />
              </clipPath>
            </defs>

            {/* Y labels */}
            {yTicks.map((tick, i) => (
              <text
                key={`yl-${i}`}
                x={PAD.left - 8}
                y={toY(tick) + 4}
                textAnchor="end"
                fill="transparent"
                fontSize="11"
                fontFamily="monospace"
              >
                {formatUSD(tick)}
              </text>
            ))}

            {/* X labels */}
            {xTickIndices.map((idx) => (
              <text
                key={`xl-${idx}`}
                x={toX(idx)}
                y={PAD.top + INNER_H + 18}
                textAnchor="middle"
                fill="transparent"
                fontSize="10"
                fontFamily="monospace"
              >
                {formatDay(series[idx].day)}
              </text>
            ))}

            <g clipPath="url(#crClip)">
              <path d={areaPath} fill="url(#crArea)" />
              <path
                d={linePath}
                fill="none"
                stroke="url(#crLine)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* Hover marker */}
            {hoverPoint && hoverIndex != null && (
              <>
                <line
                  x1={toX(hoverIndex)}
                  y1={PAD.top}
                  x2={toX(hoverIndex)}
                  y2={PAD.top + INNER_H}
                  stroke="#a855f7"
                  strokeOpacity="0.4"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={toX(hoverIndex)}
                  cy={toY(hoverPoint.usd)}
                  r="4"
                  fill="#a855f7"
                />
                <circle
                  cx={toX(hoverIndex)}
                  cy={toY(hoverPoint.usd)}
                  r="2"
                  fill="white"
                />
              </>
            )}
          </svg>

          {/* Hover tooltip */}
          {hoverPoint && hoverIndex != null && (
            <div
              className="absolute pointer-events-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg"
              style={{
                left: `${(toX(hoverIndex) / CHART_W) * 100}%`,
                top: `${(toY(hoverPoint.usd) / CHART_H) * 100}%`,
                transform: 'translate(-50%, calc(-100% - 8px))',
              }}
            >
              <div className="text-gray-400">{formatDay(hoverPoint.day)}</div>
              <div className="text-white font-semibold">{formatUSD(hoverPoint.usd)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
