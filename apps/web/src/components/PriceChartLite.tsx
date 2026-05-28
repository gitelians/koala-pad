import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react'
// BNB/USD price — shared module-level cache (avoids duplicate CoinGecko hits).
import { getBnbPrice as getBnbUsd } from '../lib/bnbPrice'
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts'
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  UTCTimestamp,
} from 'lightweight-charts'
import { supabase } from '../lib/supabase'
import type { Currency, Mode } from './tradingview/types'
import { formatMarketCap, formatUsdPrice, formatBnbPrice } from './tradingview/format'

// ── Props ───────────────────────────────────────────────────────────────────

export interface PriceChartLiteProps {
  mint: string
  tokenSymbol: string
  quoteSymbol?: string
  totalSupply: number
  defaultMode?: Mode
  defaultCurrency?: Currency
  defaultInterval?: Interval
  className?: string
}

// ── Intervals ───────────────────────────────────────────────────────────────

type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

const INTERVALS: { label: string; value: Interval }[] = [
  { label: '1m',  value: '1m'  },
  { label: '5m',  value: '5m'  },
  { label: '15m', value: '15m' },
  { label: '1h',  value: '1h'  },
  { label: '4h',  value: '4h'  },
  { label: '1D',  value: '1d'  },
]

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}

// ── Types from RPC ──────────────────────────────────────────────────────────

interface CandleRow {
  bucket_time: string
  open: number
  high: number
  low: number
  close: number
  volume_bnb: number
  volume_usd: number
  trade_count: number
}

interface TradePayload {
  token_address: string
  price_bnb: number | null
  bnb_amount: string
  token_amount: string
  usd_value: number | null
  is_buy: boolean
  created_at: string
}

// Derive a BNB price for a trade even when `price_bnb` is missing.
function priceFromTrade(t: { price_bnb?: number | null; bnb_amount?: string | number; token_amount?: string | number }): number | null {
  if (t.price_bnb && Number.isFinite(Number(t.price_bnb)) && Number(t.price_bnb) > 0) {
    return Number(t.price_bnb)
  }
  const bnb = Number(t.bnb_amount)
  const tok = Number(t.token_amount)
  if (Number.isFinite(bnb) && bnb > 0 && Number.isFinite(tok) && tok > 0) return bnb / tok
  return null
}

// Client-side OHLCV bucketing. Returns a CONTIGUOUS series — every bucket
// from the first traded bucket up to the current "now" bucket exists. Empty
// buckets are filled with a flat doji (open=high=low=close = previous close,
// volume=0), so the time axis never jumps.
function bucketTrades(
  trades: { created_at: string; price_bnb?: number | null; bnb_amount?: string | number; token_amount?: string | number; usd_value?: number | null }[],
  intervalSecs: number,
): CandleRow[] {
  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume_bnb: number; volume_usd: number; trade_count: number; ts: number }>()
  const sorted = [...trades].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  for (const t of sorted) {
    const price = priceFromTrade(t)
    if (price == null) continue
    const tradeSec = Math.floor(new Date(t.created_at).getTime() / 1000)
    const bucketSec = Math.floor(tradeSec / intervalSecs) * intervalSecs
    const existing = buckets.get(bucketSec)
    if (!existing) {
      buckets.set(bucketSec, {
        open: price,
        high: price,
        low: price,
        close: price,
        volume_bnb: Number(t.bnb_amount) || 0,
        volume_usd: Number(t.usd_value) || 0,
        trade_count: 1,
        ts: bucketSec,
      })
    } else {
      existing.high = Math.max(existing.high, price)
      existing.low  = Math.min(existing.low,  price)
      existing.close = price
      existing.volume_bnb += Number(t.bnb_amount) || 0
      existing.volume_usd += Number(t.usd_value) || 0
      existing.trade_count += 1
    }
  }

  if (buckets.size === 0) return []

  const sortedBuckets = [...buckets.values()].sort((a, b) => a.ts - b.ts)
  const firstTs = sortedBuckets[0].ts
  const nowSec = Math.floor(Date.now() / 1000)
  const lastTs = Math.floor(nowSec / intervalSecs) * intervalSecs

  // Walk the time axis, filling empty buckets with a flat doji at prev close.
  const out: CandleRow[] = []
  let prevClose = sortedBuckets[0].open
  let cursor = 0
  for (let ts = firstTs; ts <= lastTs; ts += intervalSecs) {
    const real = sortedBuckets[cursor]?.ts === ts ? sortedBuckets[cursor] : null
    if (real) {
      // Make the OPEN of a real bucket continuous with the previous close, so
      // the chart shows a real wick/body instead of disconnected segments.
      // (Only when prev close exists — first bar keeps its own open.)
      const open = ts === firstTs ? real.open : prevClose
      const high = Math.max(real.high, open, real.close)
      const low  = Math.min(real.low,  open, real.close)
      out.push({
        bucket_time: new Date(ts * 1000).toISOString(),
        open,
        high,
        low,
        close: real.close,
        volume_bnb: real.volume_bnb,
        volume_usd: real.volume_usd,
        trade_count: real.trade_count,
      })
      prevClose = real.close
      cursor++
    } else {
      // Empty bucket: flat doji at previous close.
      out.push({
        bucket_time: new Date(ts * 1000).toISOString(),
        open: prevClose,
        high: prevClose,
        low: prevClose,
        close: prevClose,
        volume_bnb: 0,
        volume_usd: 0,
        trade_count: 0,
      })
    }
  }
  return out
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const getStorageKey = (mint: string) => `chart_interval_${mint.toLowerCase()}`

function toUTC(isoString: string): UTCTimestamp {
  return Math.floor(new Date(isoString).getTime() / 1000) as UTCTimestamp
}

function bucketFor(epochSeconds: number, interval: Interval): UTCTimestamp {
  const s = INTERVAL_SECONDS[interval]
  return (Math.floor(epochSeconds / s) * s) as UTCTimestamp
}

function intervalFromTV(tv: string): Interval {
  switch (tv) {
    case '1':    return '1m'
    case '5':    return '5m'
    case '15':   return '15m'
    case '60':   return '1h'
    case '240':  return '4h'
    case '720':
    case '1440':
    case 'D':
    case '1D':
    case '1d':   return '1d'
    default:     return '5m'
  }
}

// ── Component ───────────────────────────────────────────────────────────────

function PriceChartLite({
  mint,
  tokenSymbol,
  quoteSymbol = 'BNB',
  totalSupply,
  defaultMode = 'marketcap',
  defaultCurrency = 'USD',
  defaultInterval,
  className = '',
}: PriceChartLiteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const lastCandleRef = useRef<CandlestickData<UTCTimestamp> | null>(null)
  const multiplierRef = useRef<number>(1)

  const initialInterval: Interval = useMemo(() => {
    if (defaultInterval && INTERVAL_SECONDS[defaultInterval]) return defaultInterval
    try {
      const stored = localStorage.getItem(getStorageKey(mint))
      if (stored && INTERVAL_SECONDS[stored as Interval]) return stored as Interval
    } catch { /* ignore */ }
    // Map a TV-style default ("1440") to our internal interval
    return intervalFromTV(defaultInterval ?? '60')
  }, [mint, defaultInterval])

  const [interval, setIntervalState] = useState<Interval>(initialInterval)
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [bnbUsd, setBnbUsd] = useState<number>(() => cachedBnb?.price ?? 600)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(false)
  const [lastPrice, setLastPrice] = useState<number | null>(null)

  const setInterval = useCallback((v: Interval) => {
    setIntervalState(v)
    try { localStorage.setItem(getStorageKey(mint), v) } catch { /* ignore */ }
  }, [mint])

  // Multiplier converts raw BNB price → display unit (price/marketcap × USD/BNB)
  const multiplier = useMemo(() => {
    let m = 1
    if (currency === 'USD') m *= bnbUsd
    if (mode === 'marketcap') m *= totalSupply
    return m
  }, [currency, mode, bnbUsd, totalSupply])

  useEffect(() => { multiplierRef.current = multiplier }, [multiplier])

  // ── Fetch BNB/USD periodically ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const p = await getBnbUsd()
      if (!cancelled) setBnbUsd(p)
    }
    refresh()
    const id = window.setInterval(refresh, 60_000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  // ── Build chart once ────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#18181b' }, // zinc-900 — matches webapp surfaces
        textColor: '#9ca3af',
        fontSize: 12,
        fontFamily: 'inherit',
      },
      grid: {
        vertLines: { color: 'rgba(75, 85, 99, 0.15)' },
        horzLines: { color: 'rgba(75, 85, 99, 0.15)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: 'rgba(75, 85, 99, 0.4)',
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(75, 85, 99, 0.4)',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (price: number) => {
          // Read from refs so the formatter always reflects current toggles.
          const m = modeRef.current
          const c = currencyRef.current
          if (m === 'marketcap') {
            return c === 'USD' ? `$${formatMarketCap(price)}` : formatMarketCap(price)
          }
          return c === 'USD' ? formatUsdPrice(price) : formatBnbPrice(price)
        },
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceLineVisible: false,   // suppress full-width horizontal "last price" line
      lastValueVisible: true,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => {
          const m = modeRef.current
          const c = currencyRef.current
          if (m === 'marketcap') {
            return c === 'USD' ? `$${formatMarketCap(price)}` : formatMarketCap(price)
          }
          return c === 'USD' ? formatUsdPrice(price) : formatBnbPrice(price)
        },
        minMove: 0.0000000001,
      },
      // Pad the auto price range so flat / single-candle charts still show a
      // visible body. Without this, lightweight-charts auto-scales to the
      // exact min/max which collapses to a horizontal line for clustered prices.
      autoscaleInfoProvider: (original: any) => {
        const info = original?.()
        if (!info?.priceRange) return info ?? null
        const { minValue, maxValue } = info.priceRange
        const span = maxValue - minValue
        const mid = (maxValue + minValue) / 2
        // If the visible range is < 2% of the mid value, expand to ±5%.
        if (mid > 0 && (span === 0 || span / mid < 0.02)) {
          return {
            ...info,
            priceRange: {
              minValue: mid * 0.95,
              maxValue: mid * 1.05,
            },
          }
        }
        return info
      },
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      lastCandleRef.current = null
    }
  }, [])

  // Keep refs in sync for the priceFormatter closure above.
  const modeRef = useRef(mode)
  const currencyRef = useRef(currency)
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { currencyRef.current = currency }, [currency])

  // ── Fetch + apply candles ───────────────────────────────────────────────

  const applyCandles = useCallback((rows: CandleRow[]) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return
    const m = multiplierRef.current

    const candles: CandlestickData<UTCTimestamp>[] = rows.map(r => ({
      time: toUTC(r.bucket_time),
      open: Number(r.open) * m,
      high: Number(r.high) * m,
      low:  Number(r.low)  * m,
      close: Number(r.close) * m,
    }))

    const volumes: HistogramData<UTCTimestamp>[] = rows.map(r => ({
      time: toUTC(r.bucket_time),
      value: Number(r.volume_usd) || 0,
      color: Number(r.close) >= Number(r.open)
        ? 'rgba(34, 197, 94, 0.4)'
        : 'rgba(239, 68, 68, 0.4)',
    }))

    candleSeriesRef.current.setData(candles)
    volumeSeriesRef.current.setData(volumes)

    lastCandleRef.current = candles.length > 0 ? candles[candles.length - 1] : null
    setIsEmpty(candles.length === 0)
    setLastPrice(candles.length > 0 ? candles[candles.length - 1].close : null)

    if (candles.length > 0) {
      chartRef.current?.timeScale().fitContent()
    }
  }, [])

  const fetchCandles = useCallback(async (): Promise<CandleRow[]> => {
    // PRIMARY: bucket the raw `trades` table client-side. This is correct
    // regardless of whether `price_bnb` was populated at insert time, because
    // `priceFromTrade()` falls back to `bnb_amount / token_amount`.
    //
    // The server-side `get_token_candles` RPC is intentionally NOT used as the
    // primary source because it filters out trades whose `price_bnb` column is
    // null (which happens whenever the on-chain `getPrice()` read returned 0
    // when the trade was inserted) — that produced charts with 1 candle for
    // tokens that had ~50 trades.
    const tradesRes = await supabase
      .from('trades')
      .select('created_at, price_bnb, bnb_amount, token_amount, usd_value')
      .eq('token_address', mint.toLowerCase())
      .order('created_at', { ascending: true })
      .limit(5000)

    if (!tradesRes.error && (tradesRes.data || []).length > 0) {
      return bucketTrades(tradesRes.data as any, INTERVAL_SECONDS[interval])
    }

    // FALLBACK: only if the trades table is unavailable, fall back to RPC.
    const rpc = await supabase.rpc('get_token_candles', {
      p_token_address: mint.toLowerCase(),
      p_interval: interval,
      p_limit: 500,
    })
    if (rpc.error) {
      throw new Error(tradesRes.error?.message || rpc.error.message)
    }
    return (rpc.data || []) as CandleRow[]
    // (debug stash intentionally removed)
  }, [mint, interval])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCandles()
      .then(rows => { if (!cancelled) { applyCandles(rows); setLoading(false) } })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load chart data')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [fetchCandles, applyCandles, multiplier])
  // ↑ Re-render data when multiplier changes (mode / currency / bnbUsd)

  // ── Realtime subscription ──────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`lite_trades:${mint.toLowerCase()}:${interval}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `token_address=eq.${mint.toLowerCase()}`,
        },
        (payload) => {
          const trade = payload.new as TradePayload
          if (!candleSeriesRef.current || !volumeSeriesRef.current) return
          // Derive price from price_bnb OR bnb_amount/token_amount — the trade
          // table sometimes stores trades without `price_bnb` populated.
          const rawPrice = priceFromTrade(trade)
          if (rawPrice == null || !trade.created_at) return

          const tradeSec = Math.floor(new Date(trade.created_at).getTime() / 1000)
          const bucket = bucketFor(tradeSec, interval)
          const price = rawPrice * multiplierRef.current
          const last = lastCandleRef.current

          const wasEmpty = last == null

          if (last && bucket === last.time) {
            // Trade lands in the still-open current bucket → update OHLC.
            const updated: CandlestickData<UTCTimestamp> = {
              time: last.time,
              open: last.open,
              high: Math.max(last.high, price),
              low:  Math.min(last.low,  price),
              close: price,
            }
            candleSeriesRef.current.update(updated)
            lastCandleRef.current = updated
            setLastPrice(price)

            volumeSeriesRef.current.update({
              time: last.time,
              value: Number(trade.usd_value) || 0,
              color: updated.close >= updated.open
                ? 'rgba(34, 197, 94, 0.4)'
                : 'rgba(239, 68, 68, 0.4)',
            })
          } else if (last && bucket < last.time) {
            // Late-arriving trade older than current head: ignore to keep series monotonic.
            return
          } else {
            // Trade lands in a NEW bucket. Two things must happen:
            //   1. Seal the previous bucket — its close stays where it is.
            //   2. Fill any empty buckets between the old head and the new
            //      bucket with flat dojis at prev close, so the time axis
            //      never jumps (e.g. 5m chart goes 15:05 → 15:10 → 15:15
            //      even if no trades happened at 15:10).
            const bucketSecs = INTERVAL_SECONDS[interval]
            const prevClose = last?.close ?? price
            if (last) {
              for (let t = (last.time as number) + bucketSecs; t < (bucket as number); t += bucketSecs) {
                const filler: CandlestickData<UTCTimestamp> = {
                  time: t as UTCTimestamp,
                  open: prevClose,
                  high: prevClose,
                  low:  prevClose,
                  close: prevClose,
                }
                candleSeriesRef.current.update(filler)
                volumeSeriesRef.current.update({
                  time: t as UTCTimestamp,
                  value: 0,
                  color: 'rgba(75, 85, 99, 0.3)',
                })
              }
            }

            // The new bucket opens at prev close so the candle is visually
            // continuous with the previous bar (real-feeling wick/body).
            const open = last ? prevClose : price
            const fresh: CandlestickData<UTCTimestamp> = {
              time: bucket,
              open,
              high: Math.max(open, price),
              low:  Math.min(open, price),
              close: price,
            }
            candleSeriesRef.current.update(fresh)
            lastCandleRef.current = fresh
            setLastPrice(price)

            volumeSeriesRef.current.update({
              time: bucket,
              value: Number(trade.usd_value) || 0,
              color: fresh.close >= fresh.open
                ? 'rgba(34, 197, 94, 0.4)'
                : 'rgba(239, 68, 68, 0.4)',
            })
          }

          // Clear empty-state overlay + scroll-into-view as soon as we have a bar.
          if (wasEmpty) {
            setIsEmpty(false)
            chartRef.current?.timeScale().fitContent()
          }
        },
      )
      .subscribe((status) => {
        // If Realtime is misconfigured (table not in supabase_realtime publication,
        // RLS blocking SELECT, or WebSocket failure), surface it via a single warn
        // so it shows up in the console — the polling fallback still drives the chart.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[PriceChartLite] Realtime subscription status:', status, '— chart will rely on polling fallback')
        }
      })

    return () => { channel.unsubscribe() }
  }, [mint, interval])

  // ── Time-axis ticker ────────────────────────────────────────────────────
  // Even when no trades arrive, walk the chart forward by emitting flat-doji
  // bars for every empty bucket up to "now". This is what makes the chart
  // *feel* live (e.g. on a 5m chart, a new flat candle appears every 5 min)
  // and prevents the time axis from jumping when activity resumes.

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return
    const bucketSecs = INTERVAL_SECONDS[interval]
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const last = lastCandleRef.current
      if (!last || !candleSeriesRef.current || !volumeSeriesRef.current) return
      const nowSec = Math.floor(Date.now() / 1000)
      const currentBucket = Math.floor(nowSec / bucketSecs) * bucketSecs
      if (currentBucket <= (last.time as number)) return

      const prevClose = last.close
      for (let t = (last.time as number) + bucketSecs; t <= currentBucket; t += bucketSecs) {
        const filler: CandlestickData<UTCTimestamp> = {
          time: t as UTCTimestamp,
          open: prevClose,
          high: prevClose,
          low:  prevClose,
          close: prevClose,
        }
        candleSeriesRef.current.update(filler)
        volumeSeriesRef.current.update({
          time: t as UTCTimestamp,
          value: 0,
          color: 'rgba(75, 85, 99, 0.3)',
        })
        lastCandleRef.current = filler
      }
    }

    // Run once on interval change, then tick every second so we catch the
    // exact bucket boundary regardless of clock drift.
    tick()
    const id = window.setInterval(tick, 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [interval])

  // ── Polling fallback ────────────────────────────────────────────────────
  // Belt-and-braces: if Realtime isn't enabled on `trades` (or RLS blocks
  // the listen, or the WebSocket drops), this poller still drives the chart.
  // Faster cadence while empty so the *first* trade shows up quickly.

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      try {
        const rows = await fetchCandles()
        if (cancelled || !candleSeriesRef.current || !volumeSeriesRef.current) return
        if (rows.length === 0) return

        const m = multiplierRef.current
        const wasEmpty = lastCandleRef.current == null
        const lastTime = lastCandleRef.current?.time
        // Only push rows AT or AFTER the current head — never re-write a
        // sealed bucket. Equal time means in-place update of the still-open
        // current bucket, which is fine.
        const incoming = rows
          .filter(r => {
            const t = toUTC(r.bucket_time)
            return lastTime == null || t >= lastTime
          })

        for (const r of incoming) {
          const t = toUTC(r.bucket_time)
          candleSeriesRef.current.update({
            time: t,
            open: Number(r.open) * m,
            high: Number(r.high) * m,
            low:  Number(r.low)  * m,
            close: Number(r.close) * m,
          })
          volumeSeriesRef.current.update({
            time: t,
            value: Number(r.volume_usd) || 0,
            color: Number(r.close) >= Number(r.open)
              ? 'rgba(34, 197, 94, 0.4)'
              : 'rgba(239, 68, 68, 0.4)',
          })
        }

        const tail = rows[rows.length - 1]
        const tailClose = Number(tail.close) * m
        lastCandleRef.current = {
          time: toUTC(tail.bucket_time),
          open: Number(tail.open) * m,
          high: Number(tail.high) * m,
          low:  Number(tail.low)  * m,
          close: tailClose,
        }
        setLastPrice(tailClose)

        if (wasEmpty) {
          setIsEmpty(false)
          chartRef.current?.timeScale().fitContent()
        }
      } catch { /* silent */ }
    }

    const schedule = () => {
      if (cancelled) return
      // Tighter cadence while the chart has no data, so the first trade lands fast.
      const delay = lastCandleRef.current == null ? 4_000 : 15_000
      timer = window.setTimeout(async () => {
        await tick()
        schedule()
      }, delay)
    }
    schedule()

    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [fetchCandles])

  // ── Render ──────────────────────────────────────────────────────────────

  const lastPriceLabel = useMemo(() => {
    if (lastPrice == null) return null
    if (mode === 'marketcap') {
      return currency === 'USD' ? `$${formatMarketCap(lastPrice)}` : formatMarketCap(lastPrice)
    }
    return currency === 'USD' ? formatUsdPrice(lastPrice) : `${formatBnbPrice(lastPrice)} BNB`
  }, [lastPrice, mode, currency])

  return (
    <div className={`w-full bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base md:text-lg font-medium text-gray-100">
            {tokenSymbol} / {quoteSymbol}
          </h3>
          {lastPriceLabel && (
            <span className="text-sm font-mono text-gray-300">{lastPriceLabel}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            {(['marketcap', 'price'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {m === 'marketcap' ? 'Market Cap' : 'Price'}
              </button>
            ))}
          </div>

          {/* Currency toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            {(['USD', 'BNB'] as const).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  currency === c
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Interval */}
          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            {INTERVALS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setInterval(value)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  interval === value
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative" style={{ height: '500px' }}>
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Loading chart…</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <span className="text-sm text-red-400">{error}</span>
              <button
                onClick={async () => {
                  setLoading(true)
                  setError(null)
                  try {
                    const rows = await fetchCandles()
                    applyCandles(rows)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to load')
                  }
                  setLoading(false)
                }}
                className="px-4 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {isEmpty && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="flex flex-col items-center gap-2 text-center px-4">
              <span className="text-lg text-gray-300">No trades yet</span>
              <span className="text-sm text-gray-500">Be the first to trade!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(PriceChartLite)
