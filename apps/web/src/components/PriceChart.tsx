import { useEffect, useMemo, useRef, useState, memo } from 'react'
import { createDatafeed, type Datafeed } from './tradingview/datafeed'
import type { Currency, Mode, TVWidget } from './tradingview/types'
import { formatMarketCap, formatUsdPrice, formatBnbPrice } from './tradingview/format'

// ── Props ───────────────────────────────────────────────────────────────────

export interface PriceChartProps {
  mint: string
  tokenSymbol: string
  quoteSymbol?: string
  totalSupply: number
  defaultMode?: Mode
  defaultCurrency?: Currency
  defaultInterval?: string
  className?: string
}

// ── Library loader (singleton) ──────────────────────────────────────────────

const LIBRARY_SCRIPT_SRC = '/tradingview/charting_library/charting_library.js'
let libraryPromise: Promise<void> | null = null

function loadChartingLibrary(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.TradingView) return Promise.resolve()
  if (libraryPromise) return libraryPromise

  libraryPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LIBRARY_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Charting Library failed to load')))
      return
    }
    const s = document.createElement('script')
    s.src = LIBRARY_SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      libraryPromise = null
      reject(new Error('Charting Library not found at ' + LIBRARY_SCRIPT_SRC))
    }
    document.head.appendChild(s)
  })
  return libraryPromise
}

// ── Component ───────────────────────────────────────────────────────────────

function PriceChart({
  mint,
  tokenSymbol,
  quoteSymbol = 'BNB',
  totalSupply,
  defaultMode = 'marketcap',
  defaultCurrency = 'USD',
  defaultInterval = '1440',
  className = '',
}: PriceChartProps) {
  const containerId = useMemo(() => `tv_chart_container_${mint.replace(/[^a-zA-Z0-9]/g, '')}`, [mint])
  const widgetRef = useRef<TVWidget | null>(null)
  const datafeedRef = useRef<Datafeed | null>(null)

  const [mode, setMode] = useState<Mode>(defaultMode)
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-library' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Stable refs for the datafeed factory closures.
  const modeRef = useRef(mode)
  const currencyRef = useRef(currency)
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { currencyRef.current = currency }, [currency])

  // ── Mount widget ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    const datafeed = createDatafeed({
      mint,
      tokenSymbol,
      quoteSymbol,
      totalSupply,
      getMode: () => modeRef.current,
      getCurrency: () => currencyRef.current,
    })
    datafeedRef.current = datafeed

    loadChartingLibrary()
      .then(() => {
        if (cancelled) return
        if (!window.TradingView?.widget) {
          setStatus('missing-library')
          return
        }

        const initialSymbol = `${tokenSymbol}/${quoteSymbol} ${defaultMode === 'marketcap' ? 'Market Cap' : 'Price'} (${defaultCurrency})`

        const widget = new window.TradingView.widget({
          // Core
          container: containerId,
          library_path: '/tradingview/charting_library/',
          locale: 'en',
          timezone: 'Etc/UTC',
          autosize: true,
          fullscreen: false,
          debug: false,
          theme: 'dark',
          client_id: window.location.hostname || 'localhost',
          user_id: 'public',
          charts_storage_url: 'https://saveload.tradingview.com',
          charts_storage_api_version: '1.1',

          // Default symbol & interval
          symbol: initialSymbol,
          interval: defaultInterval,

          // Chart appearance
          loading_screen: { backgroundColor: '#131722' },
          overrides: {
            'mainSeriesProperties.showCountdown': false,
            'linetoolcircle.color': '#3B82F6',
            'linetoolcircle.backgroundColor': '#3B82F6',
            'linetoolcircle.fillBackground': true,
            'linetooltrendline.linecolor': '#60A5FA',
            'linetoolcircle.linewidth': 2,
            'paneProperties.backgroundType': 'solid',
            'paneProperties.background': '#18181b',
          },
          studies_overrides: {},

          time_frames: [
            { text: '1d', resolution: '15',  description: '1 Day',   title: '1D' },
            { text: '5d', resolution: '60',  description: '5 Days',  title: '5D' },
            { text: '1m', resolution: '720', description: '1 Month', title: '1M' },
          ],

          disabled_features: [
            'header_symbol_search',
            'symbol_search_hot_key',
            'search_button',
            'symbol_search',
            'header_compare',
            'compare_symbol',
            'header_widget_buttons_mode',
            'show_symbol_logo_in_header',
            'use_localstorage_for_settings',
            'header_screenshot',
            'header_undo_redo',
            'header_fullscreen_button',
            'header_settings',
            'header_indicators',
            'display_market_status',
            'header_saveload',
          ],

          enabled_features: [
            'create_volume_indicator_by_default',
            'header_widget',
            'seconds_resolution',
            'two_character_bar_marks_labels',
          ],

          favorites: {
            intervals: [],
            chartTypes: [],
            indicators: [],
            drawingTools: [],
          },

          logo: {},

          widgetbar: {
            details: false,
            watchlist: false,
            news: false,
            datawindow: false,
            watchlist_settings: { default_symbols: [] },
          },

          custom_formatters: {
            priceFormatterFactory: () => ({
              format: (price: number) => {
                const m = modeRef.current
                const c = currencyRef.current
                if (m === 'marketcap') {
                  return c === 'USD' ? `$${formatMarketCap(price)}` : formatMarketCap(price)
                }
                return c === 'USD' ? formatUsdPrice(price) : formatBnbPrice(price)
              },
            }),
          },

          datafeed,
        })

        widgetRef.current = widget
        widget.onChartReady(() => {
          if (!cancelled) setStatus('ready')
        })
      })
      .catch((e: Error) => {
        if (cancelled) return
        if (/not found/.test(e.message)) {
          setStatus('missing-library')
        } else {
          setStatus('error')
          setErrorMsg(e.message)
        }
      })

    return () => {
      cancelled = true
      try { widgetRef.current?.remove() } catch { /* ignore */ }
      widgetRef.current = null
      datafeedRef.current = null
    }
    // We deliberately exclude default* — they're initial values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, tokenSymbol, quoteSymbol, totalSupply, containerId])

  // ── React to mode/currency toggles ─────────────────────────────────────
  // Re-resolve symbol so the price scale and symbol name update.

  useEffect(() => {
    const w = widgetRef.current
    const df = datafeedRef.current
    if (!w || !df || status !== 'ready') return

    df.__invalidate()
    const newSymbol = mode === 'marketcap'
      ? `${tokenSymbol}/${quoteSymbol} Market Cap (${currency})`
      : `${tokenSymbol}/${quoteSymbol} Price (${currency})`
    try {
      w.setSymbol(newSymbol, w.activeChart().resolution(), () => { /* done */ })
    } catch { /* widget may not be ready in some edge cases */ }
  }, [mode, currency, status, tokenSymbol, quoteSymbol])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={`w-full bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden ${className}`}>
      {/* Header — mode + currency toggles, matching the rest of the app */}
      <div className="px-4 py-3 border-b border-gray-800 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-medium text-gray-100">
          {tokenSymbol} / {quoteSymbol}
        </h3>

        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Chart container */}
      <div className="relative" style={{ height: '500px' }}>
        <div id={containerId} className="w-full h-full" />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#131722] z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Loading chart…</span>
            </div>
          </div>
        )}

        {status === 'missing-library' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#131722] z-10 px-6">
            <div className="max-w-lg text-center text-sm text-gray-300 space-y-2">
              <div className="text-base font-semibold text-gray-100">TradingView Charting Library not installed</div>
              <p className="text-gray-400">
                Apply for access at{' '}
                <a
                  className="text-violet-400 underline"
                  href="https://www.tradingview.com/HTML5-stock-forex-bitcoin-charting-library/"
                  target="_blank"
                  rel="noreferrer"
                >
                  tradingview.com
                </a>
                , then unzip the build into{' '}
                <code className="text-violet-300">apps/web/public/tradingview/charting_library/</code>.
              </p>
              <p className="text-xs text-gray-500">
                Expected entry point: <code>/tradingview/charting_library/charting_library.js</code>
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#131722] z-10">
            <span className="text-sm text-red-400">{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(PriceChart)
