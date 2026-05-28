// Shared BNB-USD price fetcher with module-level caching and in-flight
// deduplication. Multiple components used to call CoinGecko independently
// (Token, Profile, AllTokens, PriceChartLite, datafeed), tripping the free-tier
// rate limit and producing "Failed to fetch" errors. This funnels every caller
// through one cached request.

const FALLBACK = 600
const TTL_MS = 60_000 // refresh at most once per minute across the whole app

let cached: { price: number; ts: number } | null = null
let inflight: Promise<number> | null = null

const URL = 'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd'

const fetchFresh = async (): Promise<number> => {
  try {
    const r = await fetch(URL)
    if (!r.ok) return cached?.price ?? FALLBACK
    const j = await r.json()
    const p = Number(j?.binancecoin?.usd)
    if (Number.isFinite(p) && p > 0) {
      cached = { price: p, ts: Date.now() }
      return p
    }
  } catch {
    // network/rate-limit; fall through to last known value
  }
  return cached?.price ?? FALLBACK
}

/**
 * Returns the BNB price in USD. Cached for {@link TTL_MS}; concurrent callers
 * share the same in-flight promise. Never throws — falls back to the last
 * cached value or {@link FALLBACK} on failure.
 */
export const getBnbPrice = async (): Promise<number> => {
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.price
  if (inflight) return inflight
  inflight = fetchFresh().finally(() => { inflight = null })
  return inflight
}

/** Synchronous best-effort read for components that just need a starting value. */
export const getCachedBnbPrice = (): number => cached?.price ?? FALLBACK
