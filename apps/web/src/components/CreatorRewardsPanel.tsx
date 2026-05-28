import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReadContracts, useWriteContract, usePublicClient } from 'wagmi'
import { formatEther } from 'viem'
import { Sparkles } from 'lucide-react'
import { POOL_ABI, ICO_ABI } from '../constants/abis'
import { recordCreatorFeeClaim } from '../lib/supabaseApi'
import Toast, { ToastState, showToastFor } from './Toast'

interface CreatorRewardsPanelProps {
  tokenAddress: string
  poolAddress?: `0x${string}`
  icoAddress?: `0x${string}`
  bnbPrice: number
}

/**
 * Creator-only panel surfacing the BNB that's been accrued from the 0.35%
 * creator fee across this token's Pool and ICO contracts. The creator can
 * pull everything down in one click — the panel runs the Pool claim first,
 * the ICO claim second, and records each tx with the backend so it shows
 * up in the daily Creator Rewards chart.
 */
export default function CreatorRewardsPanel({
  tokenAddress,
  poolAddress,
  icoAddress,
  bnbPrice,
}: CreatorRewardsPanelProps) {
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const showToast = (m: string, t: ToastState['type']) => showToastFor(setToast, m, t)

  // Read accrued balances from both contracts. We always issue both reads;
  // wagmi just returns `undefined` for any missing address.
  const contracts = useMemo(() => {
    const c: any[] = []
    if (poolAddress) c.push({ address: poolAddress, abi: POOL_ABI, functionName: 'creatorFeesAccrued' })
    if (icoAddress)  c.push({ address: icoAddress,  abi: ICO_ABI,  functionName: 'creatorFeesAccrued' })
    return c
  }, [poolAddress, icoAddress])

  const { data, refetch } = useReadContracts({ contracts })

  const poolAccrued = (data?.[0]?.result as bigint | undefined) ?? 0n
  const icoAccrued =
    poolAddress
      ? (data?.[1]?.result as bigint | undefined) ?? 0n
      : (data?.[0]?.result as bigint | undefined) ?? 0n

  const totalAccrued = poolAccrued + icoAccrued
  const totalBnb = parseFloat(formatEther(totalAccrued))
  const totalUsd = totalBnb * bnbPrice

  // Refresh every 30s so the displayed amount stays current after swaps
  // happen on the token.
  useEffect(() => {
    const id = setInterval(() => refetch(), 30_000)
    return () => clearInterval(id)
  }, [refetch])

  const handleClaim = useCallback(async () => {
    if (busy || totalAccrued === 0n) return
    setBusy(true)
    let claimed = 0n
    try {
      // 1. Pool side (most common — every swap adds to this).
      if (poolAccrued > 0n && poolAddress) {
        const hash = await writeContractAsync({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'claimCreatorFees',
        })
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
        claimed += poolAccrued
        // Record in DB (idempotent on tx_hash).
        recordCreatorFeeClaim(tokenAddress, hash).catch(err =>
          console.warn('record-creator-fee-claim (pool) failed:', err),
        )
      }

      // 2. ICO side (ICO buy/withdraw fees).
      if (icoAccrued > 0n && icoAddress) {
        const hash = await writeContractAsync({
          address: icoAddress,
          abi: ICO_ABI,
          functionName: 'claimCreatorFees',
        })
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
        claimed += icoAccrued
        recordCreatorFeeClaim(tokenAddress, hash).catch(err =>
          console.warn('record-creator-fee-claim (ico) failed:', err),
        )
      }

      if (claimed > 0n) {
        showToast(`+${parseFloat(formatEther(claimed)).toFixed(6)} BNB claimed`, 'success')
      }
    } catch (err: any) {
      console.error('Creator fee claim failed:', err)
      const msg = err?.shortMessage || err?.message || 'Claim failed'
      showToast(msg, 'error')
    } finally {
      setBusy(false)
      refetch()
    }
  }, [busy, totalAccrued, poolAccrued, icoAccrued, poolAddress, icoAddress, publicClient, writeContractAsync, tokenAddress, refetch])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-900/30 via-fuchsia-900/15 to-gray-900/40">
      <Toast toast={toast} />
      <div className="absolute inset-0 pointer-events-none opacity-40 mix-blend-screen"
           style={{ background: 'radial-gradient(120% 80% at 100% 0%, rgba(168,85,247,0.18), transparent 60%)' }} />

      <div className="relative p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-violet-300" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-200">
            Your creator rewards
          </h3>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] text-violet-300/80 uppercase tracking-wider mb-1">Available to claim</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">
                ${totalUsd.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {totalBnb.toFixed(6)} BNB
              </span>
            </div>
          </div>
          <button
            onClick={handleClaim}
            disabled={busy || totalAccrued === 0n}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0 ${
              totalAccrued === 0n
                ? 'bg-gray-800/60 text-gray-500 cursor-not-allowed'
                : busy
                  ? 'bg-violet-700/40 text-violet-200 cursor-wait'
                  : 'bg-violet-600 text-white hover:bg-violet-500 active:scale-95 shadow shadow-violet-900/50'
            }`}
          >
            {busy ? 'Claiming…' : 'Claim'}
          </button>
        </div>
      </div>
    </div>
  )
}
