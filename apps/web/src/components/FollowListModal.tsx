import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getFollowers, getFollowing, FollowEntry } from '../lib/supabaseApi'

interface FollowListModalProps {
  userId: string | null
  kind: 'followers' | 'following' | null
  onClose: () => void
}

export default function FollowListModal({ userId, kind, onClose }: FollowListModalProps) {
  const [entries, setEntries] = useState<FollowEntry[]>([])
  const [loading, setLoading] = useState(false)

  const open = !!(userId && kind)

  useEffect(() => {
    if (!open || !userId || !kind) return
    setLoading(true)
    const fetch = kind === 'followers' ? getFollowers : getFollowing
    fetch(userId)
      .then(setEntries)
      .catch(err => console.error('Failed to load follow list:', err))
      .finally(() => setLoading(false))
  }, [open, userId, kind])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-base font-semibold text-gray-100 capitalize">{kind}</h3>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="py-10 text-center text-sm text-gray-500">Loading...</div>
              ) : entries.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  {kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </div>
              ) : (
                <ul className="divide-y divide-gray-800">
                  {entries.map(e => (
                    <li key={e.id}>
                      <Link
                        to={`/profile/${e.wallet_address}`}
                        onClick={onClose}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-gray-800/40 transition-colors"
                      >
                        {e.profile_pic ? (
                          <img
                            src={e.profile_pic}
                            alt={e.username || 'user'}
                            className="w-9 h-9 rounded-full object-cover border border-gray-800"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                            {(e.username?.[0] || e.wallet_address?.[2] || '?').toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-100 truncate">
                            {e.username || `User${e.wallet_address.slice(2, 8)}`}
                          </div>
                          <div className="text-xs text-gray-500 font-mono truncate">
                            {e.wallet_address.slice(0, 6)}...{e.wallet_address.slice(-4)}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
