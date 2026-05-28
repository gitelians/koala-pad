import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GiKoala } from 'react-icons/gi'
import { Trophy } from 'lucide-react'
import { getKpLeaderboard, LeaderboardEntry } from '../lib/supabaseApi'
import { formatLevelBadge, levelFromKp } from '../utils/gamification'

interface LeaderboardProps {
  highlightUserId?: string | null
}

const TOP_LIMIT = 50

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-gradient-to-br from-yellow-400 to-amber-600 text-gray-900'
  if (rank === 2) return 'bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900'
  if (rank === 3) return 'bg-gradient-to-br from-amber-700 to-amber-900 text-amber-100'
  return 'bg-gray-800 text-gray-400 border border-gray-700'
}

export default function Leaderboard({ highlightUserId }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getKpLeaderboard(TOP_LIMIT)
      .then(rows => { if (!cancelled) setEntries(rows) })
      .catch(err => console.error('Failed to load leaderboard:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="mt-8 md:mt-10">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-violet-400" />
        <h3 className="text-base font-semibold text-gray-100">Leaderboard</h3>
      </div>

      <div className="bg-gray-900/60 rounded-2xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading leaderboard...</div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No players yet.</div>
        ) : (
          <ul className="divide-y divide-gray-800 max-h-[520px] overflow-y-auto">
            {entries.map((e, i) => {
              const rank = i + 1
              const isMe = highlightUserId && e.id === highlightUserId
              const displayName = e.username || `User${e.wallet_address.slice(2, 8)}`
              return (
                <li key={e.id}>
                  <Link
                    to={`/profile/${e.wallet_address}`}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isMe
                        ? 'bg-violet-600/10 hover:bg-violet-600/15'
                        : 'hover:bg-gray-800/40'
                    }`}
                  >
                    {/* Rank badge */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${rankBadgeClass(rank)}`}
                    >
                      {rank}
                    </div>

                    {/* Avatar */}
                    {e.profile_pic ? (
                      <img
                        src={e.profile_pic}
                        alt={displayName}
                        className="w-9 h-9 rounded-full object-cover border border-gray-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {(displayName[0] || '?').toUpperCase()}
                      </div>
                    )}

                    {/* Name + wallet */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-100 truncate">
                          {displayName}
                        </span>
                        {isMe && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-300 bg-violet-600/30 px-1.5 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {/* Derive level from kp so the badge stays in sync with
                            the new 10-tier curve even before the trigger fires. */}
                        <span>{formatLevelBadge(levelFromKp(Number(e.kp ?? 0)))}</span>
                      </div>
                    </div>

                    {/* KP */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-sm font-bold text-white">
                        {Number(e.kp ?? 0).toLocaleString()}
                      </span>
                      <GiKoala className="text-base text-violet-400" />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
