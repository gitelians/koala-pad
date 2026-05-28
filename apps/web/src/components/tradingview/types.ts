// Minimal ambient types for the TradingView Advanced Charts global.
// The full type definitions ship with the Charting Library at
// /public/tradingview/charting_library/charting_library.d.ts — once you drop
// the library in, you can switch to importing from there for stronger types.

export type Mode = 'marketcap' | 'price'
export type Currency = 'USD' | 'BNB'

export interface Bar {
  time: number      // milliseconds (TradingView convention)
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface LibrarySymbolInfo {
  ticker?: string
  name: string
  full_name: string
  description: string
  type: string
  session: string
  exchange: string
  listed_exchange: string
  timezone: string
  format: string
  pricescale: number
  minmov: number
  has_intraday: boolean
  has_seconds?: boolean
  has_daily: boolean
  has_weekly_and_monthly: boolean
  supported_resolutions: string[]
  volume_precision: number
  data_status: 'streaming' | 'endofday' | 'pulsed' | 'delayed_streaming'
}

export interface PeriodParams {
  from: number          // unix seconds
  to: number            // unix seconds
  countBack: number
  firstDataRequest: boolean
}

export interface DatafeedConfiguration {
  supported_resolutions: string[]
  exchanges: { value: string; name: string; desc: string }[]
  symbols_types: { value: string; name: string }[]
  supports_marks: boolean
  supports_timescale_marks: boolean
  supports_search: boolean
  supports_group_request: boolean
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: any) => TVWidget
      version?: () => string
    }
  }
}

export interface TVWidget {
  onChartReady: (cb: () => void) => void
  remove: () => void
  setSymbol: (symbol: string, interval: string, cb?: () => void) => void
  chart: () => any
  activeChart: () => any
}
