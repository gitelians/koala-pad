import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReadContracts } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { X, Clock, BadgeDollarSign } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { getTokensByCreator } from '../lib/supabaseApi'
import { getBnbPrice } from '../lib/bnbPrice'
import { POOL_ABI } from '../constants/abis'
import WatchlistTab from './WatchlistTab'

const TOTAL_SUPPLY = parseEther('21000000')

type TabKey = 'created' | 'watchlist'

interface MyTokensModalProps {
  open: boolean
  onClose: () => void
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'Just now'
}

export default function MyTokensModal({ open, onClose }: MyTokensModalProps) {
  const { userId } = useAuth()
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

  const mcContracts = useMemo(() =>
    createdTokens.map(t => ({
      address: (t.pool_address || undefined) as `0x${string}` | undefined,
      abi: POOL_ABI,
      functionName: 'getMarketCap' as const,
      args: [TOTAL_SUPPLY],
    })),
    [createdTokens],
  )
  const { data: createdTokenMCs } = useReadContracts({ contracts: mcContracts })

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
            loadingCreated ? (
              <p className="text-sm text-gray-500 py-8 text-center">Loading...</p>
            ) : createdTokens.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                You haven't created any tokens yet.
              </p>
            ) : (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
                {createdTokens.map((token, i) => {
                  const phase = token.phase || 'ico'
                  const phaseBadge = phase === 'ico'
                    ? { label: 'ICO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
                    : phase === 'trading'
                      ? { label: 'Trading', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
                      : { label: 'Airdrop', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }

                  const mcRaw = createdTokenMCs?.[i]?.result as bigint | undefined
                  const mcUsd = mcRaw ? parseFloat(formatEther(mcRaw)) * bnbPrice : null
                  const ago = timeAgo(new Date(token.created_at).getTime())

                  const mcDisplay =
                    phase === 'ico'
                      ? `R${Math.min(Math.max(Number(token.ico_current_round) || 1, 1), 10)}/10`
                      : mcUsd != null
                        ? formatCompactUsd(mcUsd)
                        : '—'

                  return (
                    <Link
                      key={token.token_address}
                      to={`/token/${token.token_address}`}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors"
                    >
                      {token.image ? (
                        <img
                          src={token.image}
                          alt={token.name}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-800/40 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-100 truncate">{token.name}</div>
                        <div className="text-xs text-gray-300/50 truncate">${token.symbol}</div>
                      </div>
                      <div className="hidden sm:flex items-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${phaseBadge.color}`}>
                          {phaseBadge.label}
                        </span>
                      </div>
                      <div className="hidden md:flex items-center gap-1 text-[11px] text-gray-500 whitespace-nowrap">
                        <Clock size={11} />
                        <span>{ago}</span>
                      </div>
                      <div className="text-right flex flex-col items-end gap-0.5">
                        <div className="flex items-center justify-end gap-1 text-sm font-semibold text-gray-100 whitespace-nowrap">
                          {phase !== 'ico' && mcUsd != null && (
                            <BadgeDollarSign size={14} className="text-gray-400" />
                          )}
                          {mcDisplay}
                        </div>
                        <div className="text-[10px] text-gray-500 sm:hidden">{phaseBadge.label}</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )
          ) : (
            <WatchlistTab bnbPrice={bnbPrice} />
          )}
        </div>
      </div>
    </div>
  )
}
