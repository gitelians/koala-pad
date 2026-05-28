import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReadContracts } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { Search, X, Clock, Eye, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getBnbPrice } from '../lib/bnbPrice'
import { POOL_ABI } from '../constants/abis'

const RECENT_SEARCHES_KEY = 'kp:recent_searches'
const RECENT_VISITED_KEY = 'kp:recent_visited_tokens'
const MAX_RECENT_SEARCHES = 8
const MAX_RECENT_VISITED = 10
const TOTAL_SUPPLY = parseEther('21000000')

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

interface TokenResult {
  token_address: string
  name: string
  symbol: string
  image: string | null
  pool_address: string | null
  phase: string
  created_at: string
}

interface UserResult {
  id: string
  username: string | null
  wallet_address: string
  profile_pic: string | null
}

interface VisitedToken {
  token_address: string
  name: string
  symbol: string
  image: string | null
  pool_address: string | null
  phase: string
  visited_at: number
}

// ── localStorage helpers ────────────────────────────────────────────────────

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_SEARCHES) : []
  } catch { return [] }
}

function saveRecentSearches(items: string[]) {
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, MAX_RECENT_SEARCHES))) } catch {}
}

export function pushRecentSearch(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return
  const current = loadRecentSearches().filter(q => q.toLowerCase() !== trimmed.toLowerCase())
  current.unshift(trimmed)
  saveRecentSearches(current)
}

function loadRecentVisited(): VisitedToken[] {
  try {
    const raw = localStorage.getItem(RECENT_VISITED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_VISITED) : []
  } catch { return [] }
}

function saveRecentVisited(items: VisitedToken[]) {
  try { localStorage.setItem(RECENT_VISITED_KEY, JSON.stringify(items.slice(0, MAX_RECENT_VISITED))) } catch {}
}

/** Call when a user lands on a token page. */
export function pushRecentVisitedToken(t: {
  token_address: string
  name: string
  symbol: string
  image?: string | null
  pool_address?: string | null
  phase?: string | null
}) {
  if (!t?.token_address) return
  const addr = t.token_address.toLowerCase()
  const current = loadRecentVisited().filter(v => v.token_address.toLowerCase() !== addr)
  current.unshift({
    token_address: t.token_address,
    name: t.name,
    symbol: t.symbol,
    image: t.image ?? null,
    pool_address: t.pool_address ?? null,
    phase: t.phase || 'ico',
    visited_at: Date.now(),
  })
  saveRecentVisited(current)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function timeAgo(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  const mo = Math.floor(d / 30)
  const y = Math.floor(d / 365)
  if (y > 0) return `${y}y ago`
  if (mo > 0) return `${mo}mo ago`
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'just now'
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [tokens, setTokens] = useState<TokenResult[]>([])
  const [users, setUsers] = useState<UserResult[]>([])
  const [searching, setSearching] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [recentVisited, setRecentVisited] = useState<VisitedToken[]>([])
  const [bnbPrice, setBnbPrice] = useState(600)

  useEffect(() => {
    if (open) {
      setRecentSearches(loadRecentSearches())
      setRecentVisited(loadRecentVisited())
      // Focus shortly after mount-in to ensure transitions don't steal focus.
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setTokens([])
      setUsers([])
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    getBnbPrice().then(p => { if (!cancelled) setBnbPrice(p) })
    return () => { cancelled = true }
  }, [])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) { setTokens([]); setUsers([]); return }

    setSearching(true)
    const handle = setTimeout(async () => {
      try {
        const like = `%${q}%`
        const [tokRes, userRes] = await Promise.all([
          supabase
            .from('tokens')
            .select('token_address, name, symbol, image, pool_address, phase, created_at')
            .or(`name.ilike.${like},symbol.ilike.${like}`)
            .limit(10),
          supabase
            .from('users')
            .select('id, username, wallet_address, profile_pic')
            .ilike('username', like)
            .limit(8),
        ])
        if (tokRes.error) console.error(tokRes.error)
        if (userRes.error) console.error(userRes.error)
        setTokens((tokRes.data || []) as TokenResult[])
        setUsers((userRes.data || []) as UserResult[])
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, open])

  // Batch market cap reads for the visible token list.
  const visibleTokens: TokenResult[] = query.trim() ? tokens : []
  const mcContracts = useMemo(() => visibleTokens.map(t => ({
    address: (t.pool_address || undefined) as `0x${string}` | undefined,
    abi: POOL_ABI,
    functionName: 'getMarketCap' as const,
    args: [TOTAL_SUPPLY],
  })), [visibleTokens])
  const { data: mcData } = useReadContracts({ contracts: mcContracts })

  const visitedMcContracts = useMemo(() => recentVisited.map(v => ({
    address: (v.pool_address || undefined) as `0x${string}` | undefined,
    abi: POOL_ABI,
    functionName: 'getMarketCap' as const,
    args: [TOTAL_SUPPLY],
  })), [recentVisited])
  const { data: visitedMcData } = useReadContracts({ contracts: visitedMcContracts })

  const handleTokenClick = (t: TokenResult) => {
    if (query.trim()) pushRecentSearch(query)
    pushRecentVisitedToken(t)
    navigate(`/token/${t.token_address}`)
    onClose()
  }

  const handleUserClick = (u: UserResult) => {
    if (query.trim()) pushRecentSearch(query)
    navigate(`/profile/${u.wallet_address}`)
    onClose()
  }

  const handleRecentSearchClick = (q: string) => {
    setQuery(q)
    inputRef.current?.focus()
  }

  const handleClearSearches = () => {
    saveRecentSearches([])
    setRecentSearches([])
  }

  const handleClearVisited = () => {
    saveRecentVisited([])
    setRecentVisited([])
  }

  const handleViewAllResults = () => {
    if (!query.trim()) return
    pushRecentSearch(query)
    navigate(`/?q=${encodeURIComponent(query.trim())}&sort=marketcap`)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-16 md:pt-24">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search input */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
          <Search size={18} className="text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for coins or users..."
            className="flex-1 bg-transparent outline-none text-gray-100 placeholder-gray-500 text-sm"
          />
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {query.trim() ? (
            <>
              {/* View all results */}
              <button
                onClick={handleViewAllResults}
                className="w-full px-4 py-3 text-center text-violet-400 hover:bg-gray-800/60 transition-colors text-sm font-semibold flex items-center justify-center gap-1.5 border-b border-gray-800"
              >
                View all results <ArrowRight size={14} />
              </button>

              {/* Tokens */}
              <div className="px-4 pt-4">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Coins</div>
              </div>

              {searching && tokens.length === 0 && users.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">Searching…</div>
              ) : tokens.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500">No coins found</div>
              ) : (
                <ul>
                  {tokens.map((t, i) => {
                    const mcRaw = mcData?.[i]?.result as bigint | undefined
                    const mcUsd = mcRaw ? parseFloat(formatEther(mcRaw)) * bnbPrice : null
                    return (
                      <li key={t.token_address}>
                        <button
                          onClick={() => handleTokenClick(t)}
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-800/60 transition-colors text-left"
                        >
                          {t.image ? (
                            <img src={t.image} alt={t.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-gray-100 truncate">{t.symbol}</span>
                              <span className="text-xs text-gray-500 truncate">{t.name}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono truncate">
                              {`${t.token_address.slice(0, 6)}…${t.token_address.slice(-4)}`}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-gray-100">
                              {t.phase === 'ico' ? '—' : mcUsd != null ? formatCompactUsd(mcUsd) : '—'}
                            </div>
                            <div className="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                              <Clock size={9} />{timeAgo(t.created_at)}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* Users */}
              {users.length > 0 && (
                <>
                  <div className="px-4 pt-4">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Users</div>
                  </div>
                  <ul className="pb-2">
                    {users.map(u => (
                      <li key={u.id}>
                        <button
                          onClick={() => handleUserClick(u)}
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-800/60 transition-colors text-left"
                        >
                          {u.profile_pic ? (
                            <img src={u.profile_pic} alt={u.username || 'user'} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                              {(u.username?.[0] || '?').toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-100 truncate">
                              {u.username || `User${u.wallet_address.slice(2, 8)}`}
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono truncate">
                              {`${u.wallet_address.slice(0, 6)}…${u.wallet_address.slice(-4)}`}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <div className="py-3">
              {/* Recently Searched */}
              <div className="px-4 pt-1 pb-2 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Recently Searched</div>
                {recentSearches.length > 0 && (
                  <button
                    onClick={handleClearSearches}
                    className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors font-semibold"
                  >
                    Clear
                  </button>
                )}
              </div>
              {recentSearches.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500">No recent searches</div>
              ) : (
                <ul>
                  {recentSearches.map((q) => (
                    <li key={q}>
                      <button
                        onClick={() => handleRecentSearchClick(q)}
                        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-800/60 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center">
                          <Search size={12} className="text-gray-400" />
                        </div>
                        <span className="text-sm text-gray-200">{q}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Recently Visited */}
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Recently Visited</div>
                {recentVisited.length > 0 && (
                  <button
                    onClick={handleClearVisited}
                    className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors font-semibold"
                  >
                    Clear
                  </button>
                )}
              </div>
              {recentVisited.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500 flex items-center gap-2">
                  <Eye size={12} /> Visit a token to see it here
                </div>
              ) : (
                <ul>
                  {recentVisited.map((v, i) => {
                    const mcRaw = visitedMcData?.[i]?.result as bigint | undefined
                    const mcUsd = mcRaw ? parseFloat(formatEther(mcRaw)) * bnbPrice : null
                    return (
                      <li key={v.token_address}>
                        <button
                          onClick={() => handleTokenClick({
                            token_address: v.token_address,
                            name: v.name,
                            symbol: v.symbol,
                            image: v.image,
                            pool_address: v.pool_address,
                            phase: v.phase,
                            created_at: new Date(v.visited_at).toISOString(),
                          })}
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-800/60 transition-colors text-left"
                        >
                          {v.image ? (
                            <img src={v.image} alt={v.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-gray-100 truncate">{v.symbol}</span>
                              <span className="text-xs text-gray-500 truncate">{v.name}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono truncate">
                              {`${v.token_address.slice(0, 6)}…${v.token_address.slice(-4)}`}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-gray-100">
                              {v.phase === 'ico' ? '—' : mcUsd != null ? formatCompactUsd(mcUsd) : '—'}
                            </div>
                            <div className="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                              <Clock size={9} />{timeAgo(v.visited_at)}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
