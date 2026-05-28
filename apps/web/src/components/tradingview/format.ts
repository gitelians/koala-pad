// Compact market-cap formatter — "24.3M", "1.2B", "915K".
export function formatMarketCap(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3)  return `${(v / 1e3).toFixed(2)}K`
  return v.toFixed(2)
}

export function formatUsdPrice(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0'
  if (v < 0.0001) return `$${v.toExponential(2)}`
  if (v < 1)      return `$${v.toFixed(6)}`
  return `$${v.toFixed(4)}`
}

export function formatBnbPrice(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0'
  if (v < 0.00000001) return v.toExponential(2)
  if (v < 0.0001) return v.toFixed(10)
  if (v < 1) return v.toFixed(8)
  return v.toFixed(4)
}
