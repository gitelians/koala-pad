import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  addToWatchlist,
  getWatchlistByUser,
  removeFromWatchlist,
} from '../lib/supabaseApi'

const STORAGE_KEY = 'koala-pad-watchlist'

function load(): string[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : []
  } catch {
    return []
  }
}

function save(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore quota / privacy mode */
  }
}

/**
 * Watchlist of the *currently signed-in* user.
 *
 * Sourced from Supabase when authed (so it follows the user across devices and
 * is visible on their public profile). Falls back to localStorage when signed
 * out so the star button still works for anonymous browsing.
 *
 * Writes update local state optimistically, persist to Supabase, and mirror to
 * localStorage for snappy first-paint on next load.
 */
export function useWatchlist() {
  const { userId } = useAuth()
  const [watchlist, setWatchlist] = useState<string[]>(load)

  // Sync from Supabase when the signed-in user changes. Unions any pre-existing
  // localStorage entries with the server list so users don't lose stars they
  // saved before this hook started persisting to Supabase.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getWatchlistByUser(userId)
      .then(async remote => {
        if (cancelled) return
        const remoteLower = remote.map(a => a.toLowerCase())
        const local = load().map(a => a.toLowerCase())
        const localOnly = local.filter(a => !remoteLower.includes(a))
        const merged = [...remoteLower, ...localOnly]
        setWatchlist(merged)
        save(merged)
        // Push localStorage-only entries up to Supabase, one-time.
        for (const addr of localOnly) {
          try {
            await addToWatchlist(userId, addr)
          } catch (err) {
            console.error('Failed to migrate local watchlist entry:', err)
          }
        }
      })
      .catch(err => console.error('Failed to load watchlist:', err))
    return () => {
      cancelled = true
    }
  }, [userId])

  const toggle = (tokenAddress: string) => {
    const addr = tokenAddress.toLowerCase()
    setWatchlist(prev => {
      const present = prev.includes(addr)
      const next = present ? prev.filter(a => a !== addr) : [...prev, addr]
      save(next)
      if (userId) {
        const op = present
          ? removeFromWatchlist(userId, addr)
          : addToWatchlist(userId, addr)
        op.catch(err => console.error('Failed to persist watchlist change:', err))
      }
      return next
    })
  }

  const isWatchlisted = (tokenAddress: string) =>
    watchlist.includes(tokenAddress.toLowerCase())

  return { watchlist, toggle, isWatchlisted }
}
