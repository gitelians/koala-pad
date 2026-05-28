import { supabase } from '../../lib/supabase'
// BNB/USD price — shared module-level cache (avoids duplicate CoinGecko hits).
import { getBnbPrice as getBnbUsd } from '../../lib/bnbPrice'
import type {
  Bar,
  Currency,
  DatafeedConfiguration,
  LibrarySymbolInfo,
  Mode,
  PeriodParams,
} from './types'

// ── Resolution mapping ──────────────────────────────────────────────────────
// TradingView "resolution" strings → our Supabase RPC `p_interval` values.

const RES_TO_INTERVAL: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '720': '1d',   // 12h not supported in DB; fall back to daily
  '1440': '1d',
  '1D': '1d',
  'D': '1d',
}

const RES_TO_SECONDS: Record<string, number> = {
  '1': 60,
  '5': 300,
  '15': 900,
  '60': 3600,
  '240': 14400,
  '720': 43200,
  '1440': 86400,
  '1D': 86400,
  'D': 86400,
}

export const SUPPORTED_RESOLUTIONS = ['1', '5', '15', '60', '240', '1440']

// ── Bar transformation ──────────────────────────────────────────────────────

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

interface DatafeedConfig {
  mint: string
  tokenSymbol: string
  quoteSymbol: string
  totalSupply: number
  getMode: () => Mode
  getCurrency: () => Currency
}

function transformRow(
  row: CandleRow,
  mode: Mode,
  currency: Currency,
  totalSupply: number,
  bnbUsd: number,
): Bar {
  // Multiplier: convert raw `price_bnb` candle → desired display unit.
  let mult = 1
  if (currency === 'USD') mult *= bnbUsd
  if (mode === 'marketcap') mult *= totalSupply

  const time = Math.floor(new Date(row.bucket_time).getTime() / 1000) * 1000
  return {
    time,
    open: Number(row.open) * mult,
    high: Number(row.high) * mult,
    low: Number(row.low) * mult,
    close: Number(row.close) * mult,
    volume: Number(row.volume_usd) || 0,
  }
}

// ── Datafeed factory ────────────────────────────────────────────────────────

export function createDatafeed(cfg: DatafeedConfig) {
  // Per-resolution cache so panning doesn't refetch on every getBars.
  const cache = new Map<string, Bar[]>()
  let lastBar: Bar | null = null
  const subscribers = new Map<string, ReturnType<typeof startSubscription>>()

  async function fetchAllBars(resolution: string): Promise<Bar[]> {
    const interval = RES_TO_INTERVAL[resolution] ?? '1h'
    const cached = cache.get(resolution)
    if (cached) return cached

    const { data, error } = await supabase.rpc('get_token_candles', {
      p_token_address: cfg.mint.toLowerCase(),
      p_interval: interval,
      p_limit: 1000,
    })
    if (error) throw new Error(error.message)

    const bnbUsd = await getBnbUsd()
    const mode = cfg.getMode()
    const currency = cfg.getCurrency()
    const bars = (data || [])
      .map((r: CandleRow) => transformRow(r, mode, currency, cfg.totalSupply, bnbUsd))
      .sort((a: Bar, b: Bar) => a.time - b.time)

    cache.set(resolution, bars)
    return bars
  }

  function invalidate() {
    cache.clear()
    lastBar = null
  }

  function startSubscription(
    resolution: string,
    onTick: (bar: Bar) => void,
  ) {
    const interval = RES_TO_INTERVAL[resolution] ?? '1h'
    const bucketSecs = RES_TO_SECONDS[resolution] ?? 3600

    const channel = supabase
      .channel(`tv_trades:${cfg.mint.toLowerCase()}:${resolution}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `token_address=eq.${cfg.mint.toLowerCase()}`,
        },
        async (payload) => {
          const trade = payload.new as { price_bnb?: number; bnb_amount?: string; created_at?: string; usd_value?: number }
          if (!trade?.price_bnb || !trade?.created_at) return

          const bnbUsd = await getBnbUsd()
          const mode = cfg.getMode()
          const currency = cfg.getCurrency()
          let mult = 1
          if (currency === 'USD') mult *= bnbUsd
          if (mode === 'marketcap') mult *= cfg.totalSupply

          const tradeSec = Math.floor(new Date(trade.created_at).getTime() / 1000)
          const bucketSec = Math.floor(tradeSec / bucketSecs) * bucketSecs
          const bucketMs = bucketSec * 1000
          const price = Number(trade.price_bnb) * mult

          if (lastBar && bucketMs === lastBar.time) {
            const updated: Bar = {
              time: lastBar.time,
              open: lastBar.open,
              high: Math.max(lastBar.high, price),
              low: Math.min(lastBar.low, price),
              close: price,
              volume: (lastBar.volume ?? 0) + (Number(trade.usd_value) || 0),
            }
            lastBar = updated
            onTick(updated)
          } else {
            const fresh: Bar = {
              time: bucketMs,
              open: price,
              high: price,
              low: price,
              close: price,
              volume: Number(trade.usd_value) || 0,
            }
            lastBar = fresh
            onTick(fresh)
          }

          // Keep cache coherent
          const arr = cache.get(resolution)
          if (arr && lastBar) {
            if (arr.length && arr[arr.length - 1].time === lastBar.time) {
              arr[arr.length - 1] = lastBar
            } else {
              arr.push(lastBar)
            }
          }
          // suppress unused var lint
          void interval
        },
      )
      .subscribe()

    return channel
  }

  return {
    onReady(cb: (config: DatafeedConfiguration) => void) {
      setTimeout(() => cb({
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        exchanges: [{ value: 'KOALA', name: 'Koala Pad', desc: 'Koala Pad' }],
        symbols_types: [{ value: 'crypto', name: 'Crypto' }],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_search: false,
        supports_group_request: false,
      }), 0)
    },

    searchSymbols() { /* disabled */ },

    resolveSymbol(
      _symbolName: string,
      onResolve: (info: LibrarySymbolInfo) => void,
      _onError: (e: string) => void,
    ) {
      const mode = cfg.getMode()
      const currency = cfg.getCurrency()
      const display = mode === 'marketcap'
        ? `${cfg.tokenSymbol}/${cfg.quoteSymbol} Market Cap (${currency})`
        : `${cfg.tokenSymbol}/${cfg.quoteSymbol} Price (${currency})`

      const pricescale = mode === 'marketcap' ? 100 : 1_000_000_000
      const info: LibrarySymbolInfo = {
        ticker: display,
        name: display,
        full_name: display,
        description: display,
        type: 'crypto',
        session: '24x7',
        exchange: 'KOALA',
        listed_exchange: 'KOALA',
        timezone: 'Etc/UTC',
        format: 'price',
        pricescale,
        minmov: 1,
        has_intraday: true,
        has_seconds: false,
        has_daily: true,
        has_weekly_and_monthly: true,
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        volume_precision: 2,
        data_status: 'streaming',
      }
      setTimeout(() => onResolve(info), 0)
    },

    async getBars(
      _symbolInfo: LibrarySymbolInfo,
      resolution: string,
      periodParams: PeriodParams,
      onResult: (bars: Bar[], meta: { noData: boolean }) => void,
      onError: (e: string) => void,
    ) {
      try {
        const all = await fetchAllBars(resolution)
        const fromMs = periodParams.from * 1000
        const toMs = periodParams.to * 1000
        const bars = all.filter(b => b.time >= fromMs && b.time < toMs)

        if (periodParams.firstDataRequest && all.length > 0) {
          lastBar = all[all.length - 1]
        }

        if (bars.length === 0) {
          onResult([], { noData: true })
        } else {
          onResult(bars, { noData: false })
        }
      } catch (e) {
        onError(e instanceof Error ? e.message : 'fetch failed')
      }
    },

    subscribeBars(
      _symbolInfo: LibrarySymbolInfo,
      resolution: string,
      onTick: (bar: Bar) => void,
      listenerGuid: string,
    ) {
      const channel = startSubscription(resolution, onTick)
      subscribers.set(listenerGuid, channel)
    },

    unsubscribeBars(listenerGuid: string) {
      const ch = subscribers.get(listenerGuid)
      if (ch) {
        try { ch.unsubscribe() } catch { /* ignore */ }
        subscribers.delete(listenerGuid)
      }
    },

    // Custom helper used by the React wrapper when toggling mode/currency.
    __invalidate: invalidate,
  }
}

export type Datafeed = ReturnType<typeof createDatafeed>
