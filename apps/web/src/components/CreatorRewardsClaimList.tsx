import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReadContracts, useWriteContract, usePublicClient } from 'wagmi'
import { formatEther } from 'viem'
import { SiBinance } from 'react-icons/si'
import { POOL_ABI, ICO_ABI } from '../constants/abis'
import { recordCreatorFeeClaim } from '../lib/supabaseApi'
import Toast, { ToastState, showToastFor } from './Toast'

interface CreatorToken {
  token_address: string
  name?: string | null
  symbol?: string | null
  image?: string | null
  pool_address?: string | null
  ico_address?: string | null
}

interface Props {
  tokens: CreatorToken[]
  bnbPrice: number
}

interface PerTokenAccrual {
  token: CreatorToken
  pool: bigint
  ico: bigint
  total: bigint
}

/**
 * The "claimable" section that lives under the daily chart on the Profile
 * page. Reads `creatorFeesAccrued` on every Pool and ICO the user has
 * deployed, aggregates per-token, and offers a single-click "Claim all".
 */
export default function CreatorRewardsClaimList({ tokens, bnbPrice }: Props) {
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const showToast = (m: string, t: ToastState['type']) => showToastFor(setToast, m, t)

  // Build the read list: for each token, query its Pool then its ICO so we
  // can lay out the response array predictably (2N entries).
  const contracts = useMemo(() => {
    const list: any[] = []
    for (const t of tokens) {
      list.push({
        address: (t.pool_address || undefined) as `0x${string}` | undefined,
        abi: POOL_ABI,
        functionName: 'creatorFeesAccrued',
      })
      list.push({
        address: (t.ico_address || undefined) as `0x${string}` | undefined,
        abi: ICO_ABI,
        functionName: 'creatorFeesAccrued',
      })
    }
    return list
  }, [tokens])

  const { data, refetch } = useReadContracts({ contracts })

  // Pair up the (pool, ico) reads per token.
  const accruals: PerTokenAccrual[] = useMemo(() => {
    if (!data) return tokens.map(t => ({ token: t, pool: 0n, ico: 0n, total: 0n }))
    const rows: PerTokenAccrual[] = []
    for (let i = 0; i < tokens.length; i++) {
      const pool = (data[i * 2]?.result as bigint | undefined) ?? 0n
      const ico = (data[i * 2 + 1]?.result as bigint | undefined) ?? 0n
      rows.push({ token: tokens[i], pool, ico, total: pool + ico })
    }
    return rows
  }, [data, tokens])

  const totalAccrued = accruals.reduce((sum, r) => sum + r.total, 0n)
  const totalBnb = parseFloat(formatEther(totalAccrued))
  const totalUsd = totalBnb * bnbPrice

  // Refresh every 30s.
  useEffect(() => {
    const id = setInterval(() => refetch(), 30_000)
    return () => clearInterval(id)
  }, [refetch])

  // Claim every accrued source for a single token (Pool first, ICO second).
  // Returns the BNB amount actually pulled.
  const claimOne = useCallback(async (row: PerTokenAccrual): Promise<bigint> => {
    let pulled = 0n
    if (row.pool > 0n && row.token.pool_address) {
      const hash = await writeContractAsync({
        address: row.token.pool_address as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'claimCreatorFees',
      })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
      pulled += row.pool
      recordCreatorFeeClaim(row.token.token_address, hash).catch(err =>
        console.warn('record fee claim (pool) failed:', err),
      )
    }
    if (row.ico > 0n && row.token.ico_address) {
      const hash = await writeContractAsync({
        address: row.token.ico_address as `0x${string}`,
        abi: ICO_ABI,
        functionName: 'claimCreatorFees',
      })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
      pulled += row.ico
      recordCreatorFeeClaim(row.token.token_address, hash).catch(err =>
        console.warn('record fee claim (ico) failed:', err),
      )
    }
    return pulled
  }, [publicClient, writeContractAsync])

  const handleClaimSingle = useCallback(async (row: PerTokenAccrual) => {
    if (busyId || batchBusy || row.total === 0n) return
    setBusyId(row.token.token_address)
    try {
      const pulled = await claimOne(row)
      if (pulled > 0n) {
        showToast(`+${parseFloat(formatEther(pulled)).toFixed(6)} BNB claimed`, 'success')
      }
    } catch (err: any) {
      console.error('Claim failed:', err)
      showToast(err?.shortMessage || err?.message || 'Claim failed', 'error')
    } finally {
      setBusyId(null)
      refetch()
    }
  }, [busyId, batchBusy, claimOne, refetch])

  const handleClaimAll = useCallback(async () => {
    if (batchBusy || busyId || totalAccrued === 0n) return
    setBatchBusy(true)
    let pulled = 0n
    let failures = 0
    try {
      for (const row of accruals) {
        if (row.total === 0n) continue
        try {
          pulled += await claimOne(row)
        } catch (err) {
          console.warn('Claim-all leg failed for', row.token.token_address, err)
          failures++
        }
      }
      if (pulled > 0n) {
        showToast(
          failures > 0
            ? `Claimed ${parseFloat(formatEther(pulled)).toFixed(6)} BNB (${failures} skipped)`
            : `+${parseFloat(formatEther(pulled)).toFixed(6)} BNB claimed`,
          'success',
        )
      } else if (failures > 0) {
        showToast('Claim all failed — check console', 'error')
      }
    } finally {
      setBatchBusy(false)
      refetch()
    }
  }, [batchBusy, busyId, totalAccrued, accruals, claimOne, refetch])

  // Sort: tokens with > 0 accrued first; then zero ones.
  const ordered = useMemo(() => {
    return [...accruals].sort((a, b) => {
      const aHas = a.total > 0n ? 1 : 0
      const bHas = b.total > 0n ? 1 : 0
      if (aHas !== bHas) return bHas - aHas
      if (a.total === b.total) return 0
      return a.total > b.total ? -1 : 1
    })
  }, [accruals])

  if (tokens.length === 0) {
    return null
  }

  return (
    <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <Toast toast={toast} />
      <div className="p-4 md:p-5 flex items-start justify-between gap-3 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-100">Available to claim</h3>
          </div>
          <p className="text-xs text-gray-500">
            Rewards earned from creator fees.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-emerald-400">${totalUsd.toFixed(2)}</div>
          <div className="text-[10px] text-gray-500 font-mono">{totalBnb.toFixed(6)} BNB</div>
        </div>
      </div>

      <div className="px-4 md:px-5 py-3 flex items-center justify-between border-b border-gray-800/70 bg-gray-900/40">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          {accruals.filter(r => r.total > 0n).length} token{accruals.filter(r => r.total > 0n).length === 1 ? '' : 's'} with rewards
        </span>
        <button
          onClick={handleClaimAll}
          disabled={batchBusy || totalAccrued === 0n}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            totalAccrued === 0n
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : batchBusy
                ? 'bg-emerald-900/30 text-emerald-300 cursor-wait'
                : 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 shadow shadow-emerald-900/40'
          }`}
        >
          {batchBusy ? 'Claiming…' : 'Claim all'}
        </button>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 md:px-5 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800/50">
        <div>Coin</div>
        <div className="text-right">Accrued</div>
        <div className="w-16 text-right" />
      </div>

      <ul className="divide-y divide-gray-800/70 max-h-[360px] overflow-y-auto custom-scrollbar">
        {ordered.map(row => {
          const accruedBnb = parseFloat(formatEther(row.total))
          const accruedUsd = accruedBnb * bnbPrice
          const has = row.total > 0n
          const isBusy = busyId === row.token.token_address
          return (
            <li
              key={row.token.token_address}
              className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 md:px-5 py-3 ${
                has ? '' : 'opacity-50'
              }`}
            >
              <Link
                to={`/token/${row.token.token_address}`}
                className="flex items-center gap-3 min-w-0 hover:text-violet-300 transition-colors"
              >
                {row.token.image ? (
                  <img
                    src={row.token.image}
                    alt={row.token.name || ''}
                    className="w-9 h-9 rounded-full object-cover border border-gray-800 flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {row.token.symbol?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-100 truncate">
                    {row.token.name || '—'}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {row.token.symbol || ''}
                  </div>
                </div>
              </Link>

              <div className="text-right">
                {has ? (
                  <>
                    <div className="text-sm font-semibold text-white tabular-nums">
                      ${accruedUsd.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      <SiBinance className="inline -mt-0.5 mr-0.5 text-[#F3BA2F]" />
                      {accruedBnb.toFixed(6)}
                    </div>
                  </>
                ) : (
                  <span className="text-gray-600 text-sm">—</span>
                )}
              </div>

              <div className="w-16 flex justify-end">
                {has ? (
                  <button
                    onClick={() => handleClaimSingle(row)}
                    disabled={isBusy || batchBusy}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      isBusy
                        ? 'bg-violet-900/40 text-violet-200 cursor-wait'
                        : 'bg-gray-800 text-gray-200 hover:bg-violet-600 hover:text-white border border-gray-700 hover:border-violet-500'
                    }`}
                  >
                    {isBusy ? '…' : 'Claim'}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
