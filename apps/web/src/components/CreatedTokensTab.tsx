import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useReadContracts } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { Clock, BadgeDollarSign } from 'lucide-react'
import { POOL_ABI } from '../constants/abis'

const TOTAL_SUPPLY = parseEther('21000000')

interface CreatedTokensTabProps {
  tokens: any[]
  loading: boolean
  bnbPrice: number
  /** Optional row-click handler — e.g. close the modal that hosts this tab. */
  onTokenClick?: () => void
  emptyMessage?: string
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

export default function CreatedTokensTab({
  tokens,
  loading,
  bnbPrice,
  onTokenClick,
  emptyMessage = "You haven't created any tokens yet.",
}: CreatedTokensTabProps) {
  // Market caps for the listed tokens. Lives here so the profile page and the
  // My Tokens modal share one read path instead of duplicating it.
  const mcContracts = useMemo(() =>
    tokens.map(t => ({
      address: (t.pool_address || undefined) as `0x${string}` | undefined,
      abi: POOL_ABI,
      functionName: 'getMarketCap' as const,
      args: [TOTAL_SUPPLY],
    })),
    [tokens],
  )
  const { data: marketCaps } = useReadContracts({ contracts: mcContracts })

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Loading...</p>
  }

  if (tokens.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">{emptyMessage}</p>
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
      {tokens.map((token, i) => {
        const phase = token.phase || 'ico'
        const phaseBadge = phase === 'ico'
          ? { label: 'ICO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
          : phase === 'trading'
            ? { label: 'Trading', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
            : { label: 'Airdrop', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }

        const mcRaw = marketCaps?.[i]?.result as bigint | undefined
        const mcUsd = mcRaw ? parseFloat(formatEther(mcRaw)) * bnbPrice : null
        const timeAgo = getTimeAgo(new Date(token.created_at).getTime())

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
            onClick={onTokenClick}
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
            {/* Token phase badge */}
            <div className="hidden sm:flex items-center mr-8">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${phaseBadge.color}`}>
                {phaseBadge.label}
              </span>
            </div>
            {/* Time ago */}
            <div className="hidden md:flex items-center gap-1 text-[11px] text-gray-500 w-20 justify-start">
              <Clock size={11} />
              <span>{timeAgo}</span>
            </div>
            {/* Round or market cap */}
            <div className="text-right flex flex-col items-end gap-0.5 min-w-[40px]">
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
}
