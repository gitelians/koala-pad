import { Link, useLocation } from 'react-router-dom'
import { useDisconnect } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { useState, useEffect, useRef } from 'react'
import { Search, Menu, User, LogOut, Coins } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getQuestProgress } from '../lib/supabaseApi'
import SearchModal from './SearchModal'
import MyTokensModal from './MyTokensModal'
import WalletBalanceButton from './WalletBalanceButton'

const QUEST_THRESHOLDS: Record<string, number[]> = {
  create: [1, 3, 5, 10],
  buy: [1, 3, 5, 10],
  hold: [1, 3, 5, 10],
  trade: [10, 20, 50, 100],
  spin: [1, 3, 5, 10],
  coins: [1000, 2500, 5000, 10000],
  boost: [1, 3, 5, 10],
}

interface HeaderProps {
  onMenuToggle: () => void
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { disconnect } = useDisconnect()
  const { login, logout, authenticated } = usePrivy()
  const { userId, profile } = useAuth()
  const address = profile?.wallet_address ?? null
  const location = useLocation()

  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [myTokensOpen, setMyTokensOpen] = useState(false)
  const [hasClaimable, setHasClaimable] = useState(false)

  useEffect(() => {
    if (!userId) {
      setHasClaimable(false)
      return
    }

    let cancelled = false
    const check = async () => {
      try {
        const [claimedQuestsRes, progress] = await Promise.all([
          supabase.from('claimed_quests').select('quest_id').eq('user_id', userId),
          getQuestProgress(userId),
        ])

        const claimedQuestIds = new Set((claimedQuestsRes.data || []).map((r: any) => r.quest_id))
        let hasClaimableQuest = false
        for (const [category, thresholds] of Object.entries(QUEST_THRESHOLDS)) {
          const current = progress[category] ?? 0
          thresholds.forEach((target, idx) => {
            const questId = `${category}-${idx + 1}`
            if (current >= target && !claimedQuestIds.has(questId)) {
              hasClaimableQuest = true
            }
          })
        }

        if (!cancelled) setHasClaimable(hasClaimableQuest)
      } catch (e) {
        console.error('Failed to check claimable rewards:', e)
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [userId, profile?.level])

  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl+K opens the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = async () => {
    // Disconnect the wagmi connector FIRST so MetaMask (or any external
    // wallet) doesn't auto-reattach on the next login. Without this, the
    // browser extension stays linked to the dApp and the next "Sign in
    // with Google" picks the lingering external wallet over the embedded
    // one Privy would otherwise create.
    try {
      await disconnect()
    } catch (e) {
      console.warn('wagmi disconnect failed:', e)
    }
    await logout()
    setMenuOpen(false)
  }

  const isProfileActive = location.pathname === '/profile'

  return (
    <>
    <header className="md:bg-gray-900/60 md:backdrop-blur-xl md:border-b md:border-gray-800/50 md:rounded-none bg-gray-900/60 backdrop-blur-xl border border-gray-800/50 rounded-full">
      <div className="px-4 py-2 flex items-center justify-between gap-4">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
        >
          <Menu size={24} />
        </button>

        {/* My Tokens (created + watchlist) */}
        <button
          type="button"
          onClick={() => setMyTokensOpen(true)}
          className="flex items-center gap-2 h-10 px-4 bg-gray-900/50 border border-gray-800 rounded-full hover:bg-gray-800/50 hover:border-gray-700 transition-all duration-200 text-sm text-gray-300 hover:text-white"
        >
          <Coins size={16} />
          <span className="hidden md:inline">My Tokens</span>
        </button>

        <div className="flex-1" />

        {/* Search Button & Wallet */}
        <div className="flex items-center gap-2 md:gap-4">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 h-10 px-4 bg-gray-900/50 border border-gray-800 rounded-full hover:bg-gray-800/50 hover:border-gray-700 transition-all duration-200 text-sm text-gray-500 hover:text-gray-300 md:w-60 w-auto"
          >
            <Search size={16} />
            <span className="hidden md:inline">Search for coins...</span>
          </button>

          {/* Wallet balance (only when signed in) */}
          {authenticated && address && (
            <WalletBalanceButton address={address as `0x${string}`} />
          )}

          {/* Auth Button */}
          <div className="relative">
            {!authenticated ? (
              <button
                onClick={login}
                className="h-10 flex items-center justify-center gap-2 bg-violet-600 text-white font-medium rounded-full hover:bg-violet-700 active:scale-95 transition-all duration-200 shadow-[0_0_8px_rgba(139,92,246,0.3)] hover:shadow-[0_0_16px_rgba(139,92,246,0.5)] md:px-5 px-3"
              >
                <User size={18} />
                <span className="hidden md:inline">Sign in</span>
              </button>
            ) : (
              <div ref={profileRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="relative flex items-center gap-2 h-10 bg-gray-900/50 border border-gray-800 rounded-full hover:bg-gray-800/50 active:scale-95 transition-colors md:px-4 px-3"
                >
                  <User size={18} className="text-gray-300" />
                  <span className="hidden md:inline text-sm font-medium text-gray-200 max-w-[100px] truncate">
                    {address
                      ? `${address.slice(0, 6)}...${address.slice(-4)}`
                      : 'Connected'}
                  </span>
                  {hasClaimable && (
                    <span
                      aria-label="You have rewards to claim"
                      title="You have rewards to claim"
                      className="absolute -top-1 -right-1 md:static md:ml-1 flex items-center justify-center"
                    >
                      <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-violet-500 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.9)]" />
                    </span>
                  )}
                </button>

                <div
                  className="absolute right-0 mt-2 w-48 z-50 grid transition-all duration-200 ease-in-out"
                  style={{ gridTemplateRows: menuOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="bg-gray-900 rounded-lg shadow-xl border border-gray-700 py-1">
                      <Link
                        to="/profile"
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition-colors ${
                          isProfileActive
                            ? 'bg-gray-800 text-violet-400'
                            : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
                        }`}
                      >
                        <User size={16} className={isProfileActive ? 'text-violet-400' : ''} />
                        <span className="font-medium">Profile</span>
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/50 hover:text-white transition-colors"
                      >
                        <LogOut size={16} />
                        <span className="font-medium">Logout</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    <MyTokensModal open={myTokensOpen} onClose={() => setMyTokensOpen(false)} />
    </>
  )
}
