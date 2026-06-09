import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { useAuth } from '../context/AuthContext'
import { getTokensByCreator } from '../lib/supabaseApi'
import { getBnbPrice } from '../lib/bnbPrice'
import CreatedTokensTab from './CreatedTokensTab'
import WatchlistTab from './WatchlistTab'
import BalancesTab from './BalancesTab'

type TabKey = 'created' | 'balances' | 'watchlist'

interface MyTokensModalProps {
  open: boolean
  onClose: () => void
}

export default function MyTokensModal({ open, onClose }: MyTokensModalProps) {
  const { userId } = useAuth()
  const { address } = useAccount()
  const [activeTab, setActiveTab] = useState<TabKey>('created')
  const [createdTokens, setCreatedTokens] = useState<any[]>([])
  const [loadingCreated, setLoadingCreated] = useState(false)
  const [bnbPrice, setBnbPrice] = useState(600)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getBnbPrice().then(p => { if (!cancelled) setBnbPrice(p) })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open || !userId) {
      setCreatedTokens([])
      return
    }
    setLoadingCreated(true)
    getTokensByCreator(userId)
      .then(setCreatedTokens)
      .catch(err => console.error('Failed to load created tokens:', err))
      .finally(() => setLoadingCreated(false))
  }, [open, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-16 md:pt-24">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-100">My Tokens</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 md:gap-6 px-4 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('created')}
            className={`relative px-1 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'created' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Created Tokens
            {activeTab === 'created' && (
              <motion.div
                layoutId="my-tokens-tab-underline"
                className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`relative px-1 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'balances' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Balances
            {activeTab === 'balances' && (
              <motion.div
                layoutId="my-tokens-tab-underline"
                className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('watchlist')}
            className={`relative px-1 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'watchlist' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Watchlist
            {activeTab === 'watchlist' && (
              <motion.div
                layoutId="my-tokens-tab-underline"
                className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
              />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {!userId ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              Sign in to see your tokens.
            </p>
          ) : activeTab === 'created' ? (
            <CreatedTokensTab
              tokens={createdTokens}
              loading={loadingCreated}
              bnbPrice={bnbPrice}
              onTokenClick={onClose}
            />
          ) : activeTab === 'balances' ? (
            <BalancesTab
              userAddress={(address || undefined) as `0x${string}` | undefined}
              bnbPrice={bnbPrice}
            />
          ) : (
            <WatchlistTab bnbPrice={bnbPrice} />
          )}
        </div>
      </div>
    </div>
  )
}
