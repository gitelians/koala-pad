import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// One queued airdrop notification — combines the airdrop row with token meta.
interface AirdropNotice {
  airdropId: string
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  tokenImage: string | null
  amount: string
}

// Routes where the popup should NOT appear (active gameplay).
const SUPPRESSED_PATHS = ['/lucky-wheel']

async function fetchTokenMeta(tokenAddress: string) {
  const { data } = await supabase
    .from('tokens')
    .select('token_address, name, symbol, image')
    .eq('token_address', tokenAddress.toLowerCase())
    .maybeSingle()
  return data
}

async function loadPendingAirdrops(walletAddress: string): Promise<AirdropNotice[]> {
  // Pull every airdrop row that targets this wallet and hasn't yet been
  // marked as notified. The recipient set is decided server-side, so any row
  // that exists for this wallet is one we want to celebrate.
  const { data, error } = await supabase
    .from('airdrops')
    .select('id, token_address, tokens_received')
    .eq('wallet_address', walletAddress.toLowerCase())
    .is('notified_at', null)
    .order('created_at', { ascending: true })
  if (error || !data) return []

  const notices: AirdropNotice[] = []
  for (const row of data) {
    const meta = await fetchTokenMeta(row.token_address)
    notices.push({
      airdropId: row.id,
      tokenAddress: row.token_address,
      tokenName: meta?.name || 'Unknown token',
      tokenSymbol: meta?.symbol || '',
      tokenImage: meta?.image || null,
      amount: row.tokens_received,
    })
  }
  return notices
}

export default function AirdropPopup() {
  const { walletAddress } = useAuth()
  const location = useLocation()
  const [queue, setQueue] = useState<AirdropNotice[]>([])
  const suppressed = SUPPRESSED_PATHS.some(p => location.pathname.startsWith(p))

  // Initial load + realtime subscription
  useEffect(() => {
    if (!walletAddress) return
    const wallet = walletAddress.toLowerCase()
    let cancelled = false

    loadPendingAirdrops(wallet).then(notices => {
      if (!cancelled) setQueue(prev => mergeUnique(prev, notices))
    })

    const channel = supabase
      .channel(`airdrops:${wallet}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'airdrops',
          filter: `wallet_address=eq.${wallet}`,
        },
        async (payload) => {
          const row: any = payload.new
          if (!row || row.notified_at) return
          const meta = await fetchTokenMeta(row.token_address)
          const notice: AirdropNotice = {
            airdropId: row.id,
            tokenAddress: row.token_address,
            tokenName: meta?.name || 'Unknown token',
            tokenSymbol: meta?.symbol || '',
            tokenImage: meta?.image || null,
            amount: row.tokens_received,
          }
          setQueue(prev => mergeUnique(prev, [notice]))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [walletAddress])

  const current = queue[0]
  const visible = !!current && !suppressed

  const dismiss = async () => {
    if (!current) return
    const id = current.airdropId
    setQueue(prev => prev.filter(n => n.airdropId !== id))
    try {
      await supabase.rpc('mark_airdrop_notified', { p_airdrop_id: id })
    } catch (err) {
      console.error('Failed to mark airdrop as notified:', err)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="airdrop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={dismiss}
        >
          <motion.div
            key={current.airdropId}
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-gradient-to-br from-violet-900/40 via-gray-900 to-gray-900 border border-violet-500/40 rounded-3xl p-4 md:p-6 shadow-2xl shadow-violet-900/40 overflow-hidden"
          >
            {/* Animated glow ring */}
            <motion.div
              className="absolute -inset-px rounded-3xl pointer-events-none"
              style={{
                background:
                  'conic-gradient(from 0deg, rgba(139,92,246,0.0), rgba(168,85,247,0.6), rgba(139,92,246,0.0))',
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
                  className="w-14 h-14 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center mb-3"
                >
                  <Sparkles className="text-violet-300" size={26} />
                </motion.div>

                <div className="text-xs uppercase tracking-widest text-violet-300 font-bold">
                  Airdrop received
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mt-1">You got tokens!</h2>

                <div className="w-full mt-5 bg-gray-900/70 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
                  {current.tokenImage ? (
                    <img
                      src={current.tokenImage}
                      alt={current.tokenName}
                      className="w-12 h-12 rounded-xl object-cover border border-gray-800 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center text-white font-bold shrink-0">
                      {current.tokenSymbol[0] || '?'}
                    </div>
                  )}
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-semibold text-white truncate">{current.tokenName}</div>
                    <div className="text-violet-400 font-semibold text-sm">${current.tokenSymbol}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Amount</div>
                    <div className="text-base font-bold text-white">
                      {formatAmount(current.amount)}
                    </div>
                  </div>
                </div>

                <Link
                  to={`/token/${current.tokenAddress}`}
                  onClick={dismiss}
                  className="mt-5 w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all shadow-lg active:scale-95 text-center"
                >
                  Go to token
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

function mergeUnique(prev: AirdropNotice[], next: AirdropNotice[]) {
  const seen = new Set(prev.map(n => n.airdropId))
  const additions = next.filter(n => !seen.has(n.airdropId))
  return additions.length > 0 ? [...prev, ...additions] : prev
}

function formatAmount(raw: string): string {
  const n = Number(raw)
  if (!isFinite(n)) return raw
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
