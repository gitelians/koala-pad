import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Gift, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// A pending "you can claim this airdrop" notice. Fired when the user's wallet
// is in the top-20% cohort for a token whose vault is eligible-but-not-yet
// -triggered.
interface ClaimableNotice {
  notificationId: string
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  tokenImage: string | null
}

// Don't interrupt active gameplay.
const SUPPRESSED_PATHS = ['/lucky-wheel']

async function fetchTokenMeta(tokenAddress: string) {
  const { data } = await supabase
    .from('tokens')
    .select('token_address, name, symbol, image')
    .eq('token_address', tokenAddress.toLowerCase())
    .maybeSingle()
  return data
}

async function loadPendingNotifications(userId: string): Promise<ClaimableNotice[]> {
  const { data, error } = await supabase
    .from('claimable_airdrop_notifications')
    .select('id, token_address')
    .eq('user_id', userId)
    .is('notified_at', null)
    .order('created_at', { ascending: true })
  if (error || !data) return []

  const notices: ClaimableNotice[] = []
  for (const row of data) {
    const meta = await fetchTokenMeta(row.token_address)
    notices.push({
      notificationId: row.id,
      tokenAddress: row.token_address,
      tokenName: meta?.name || 'Unknown token',
      tokenSymbol: meta?.symbol || '',
      tokenImage: meta?.image || null,
    })
  }
  return notices
}

export default function ClaimableAirdropPopup() {
  const { userId } = useAuth()
  const location = useLocation()
  const [queue, setQueue] = useState<ClaimableNotice[]>([])
  const suppressed = SUPPRESSED_PATHS.some(p => location.pathname.startsWith(p))

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    loadPendingNotifications(userId).then(notices => {
      if (!cancelled) setQueue(prev => mergeUnique(prev, notices))
    })

    const channel = supabase
      .channel(`claimable_airdrops:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'claimable_airdrop_notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const row: any = payload.new
          if (!row || row.notified_at) return
          const meta = await fetchTokenMeta(row.token_address)
          const notice: ClaimableNotice = {
            notificationId: row.id,
            tokenAddress: row.token_address,
            tokenName: meta?.name || 'Unknown token',
            tokenSymbol: meta?.symbol || '',
            tokenImage: meta?.image || null,
          }
          setQueue(prev => mergeUnique(prev, [notice]))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  const current = queue[0]
  const visible = !!current && !suppressed

  const dismiss = async () => {
    if (!current) return
    const id = current.notificationId
    setQueue(prev => prev.filter(n => n.notificationId !== id))
    try {
      await supabase.rpc('mark_claimable_airdrop_notified', { p_notification_id: id })
    } catch (err) {
      console.error('Failed to mark claimable airdrop as notified:', err)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="claimable-airdrop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={dismiss}
        >
          <motion.div
            key={current.notificationId}
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-gradient-to-br from-amber-900/40 via-gray-900 to-gray-900 border border-amber-500/40 rounded-3xl p-4 md:p-6 shadow-2xl shadow-amber-900/40 overflow-hidden"
          >
            {/* Animated glow ring */}
            <motion.div
              className="absolute -inset-px rounded-3xl pointer-events-none"
              style={{
                background:
                  'conic-gradient(from 0deg, rgba(245,158,11,0.0), rgba(251,191,36,0.6), rgba(245,158,11,0.0))',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative">
              <button
                onClick={dismiss}
                className="absolute -top-1 -right-1 text-gray-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              <div className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 260 }}
                  className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center mb-3"
                >
                  <Gift className="text-amber-300" size={26} />
                </motion.div>

                <div className="text-xs uppercase tracking-widest text-amber-300 font-bold">
                  Airdrop available
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
                  You're eligible to claim!
                </h2>

                <div className="w-full mt-5 bg-gray-900/70 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
                  {current.tokenImage ? (
                    <img
                      src={current.tokenImage}
                      alt={current.tokenName}
                      className="w-12 h-12 rounded-xl object-cover border border-gray-800 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white font-bold shrink-0">
                      {current.tokenSymbol[0] || '?'}
                    </div>
                  )}
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-semibold text-white truncate">{current.tokenName}</div>
                    <div className="text-amber-400 font-semibold text-sm">${current.tokenSymbol}</div>
                  </div>
                </div>

                <Link
                  to={`/token/${current.tokenAddress}`}
                  onClick={dismiss}
                  className="mt-5 w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold tracking-wide transition-all shadow-lg active:scale-95 text-center"
                >
                  GO CLAIM IT!
                </Link>
                <button
                  onClick={dismiss}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function mergeUnique(prev: ClaimableNotice[], next: ClaimableNotice[]) {
  const seen = new Set(prev.map(n => n.notificationId))
  const additions = next.filter(n => !seen.has(n.notificationId))
  return additions.length > 0 ? [...prev, ...additions] : prev
}
