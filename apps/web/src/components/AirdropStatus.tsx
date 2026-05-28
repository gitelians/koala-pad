import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther } from 'viem'
import { VAULT_ABI, POOL_ABI } from '../constants/abis'
import { markAirdropTriggered, requestAirdropSignature } from '../lib/supabaseApi'

interface AirdropStatusProps {
  vaultAddress: `0x${string}`
  poolAddress: `0x${string}`
  tokenAddress: `0x${string}`
  icoAddress?: `0x${string}`
  tokenSymbol: string
  onAirdropTriggered?: () => void
}

export default function AirdropStatus({
  vaultAddress,
  poolAddress,
  tokenAddress,
  icoAddress,
  onAirdropTriggered,
}: AirdropStatusProps) {
  const { isConnected } = useAccount()
  const [isTriggering, setIsTriggering] = useState(false)

  const { data: airdropTriggered, refetch: refetchTriggered } = useReadContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: 'airdropTriggered',
  })

  const { data: isEligible } = useReadContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: 'isEligible',
  })

  const { data: reserveBNB } = useReadContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'reserveBNB',
  })

  const { writeContractAsync, data: txHash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const threshold = 50
  const currentReserveBNB = reserveBNB ? parseFloat(formatEther(reserveBNB)) : 0
  const progress = Math.min((currentReserveBNB / threshold) * 100, 100)

  useEffect(() => {
    if (isSuccess && isTriggering) {
      setIsTriggering(false)
      refetchTriggered()
      markAirdropTriggered(tokenAddress).catch(err => console.error('Failed to mark airdrop:', err))
      onAirdropTriggered?.()
    }
  }, [isSuccess, isTriggering, tokenAddress, refetchTriggered, onAirdropTriggered])

  /**
   * Ask the backend to compute and sign the recipient list, then submit
   * it on chain. The vault verifies the signature so the list cannot be
   * tampered with by the caller.
   */
  const handleTriggerAirdrop = async () => {
    setIsTriggering(true)
    try {
      const ticket = await requestAirdropSignature({
        tokenAddress,
        vaultAddress,
        poolAddress,
        icoAddress: icoAddress ?? '0x0000000000000000000000000000000000000000',
      })
      await writeContractAsync({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'triggerAirdrop',
        args: [
          ticket.recipients as `0x${string}`[],
          ticket.amounts.map(a => BigInt(a)),
          BigInt(ticket.deadline),
          ticket.signature as `0x${string}`,
        ],
      })
    } catch (err) {
      setIsTriggering(false)
      console.error(err)
      alert((err as Error).message)
    }
  }

  if (airdropTriggered) {
    return (
      <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-4">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-lg">🎁</span>
          <div>
            <div className="text-sm font-semibold text-green-400">Airdrop Distributed</div>
            <div className="text-xs text-gray-400">10% of supply has been distributed to top 20% holders</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-semibold text-gray-100">Airdrop progress</h3>
          <span className="text-sm text-violet-400 font-semibold">{progress.toFixed(1)}%</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-500">Pool Liquidity</span>
            <span className="text-gray-400">{currentReserveBNB.toFixed(2)} / {threshold} BNB</span>
          </div>
          <div className="w-full bg-gray-900 rounded-full h-2 border border-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #7c3aed, #8b5cf6, #a855f7)',
                boxShadow: '0 0 12px rgba(139, 92, 246, 0.6)',
              }}
            />
          </div>
        </div>
        {isEligible && (
          <button
            onClick={handleTriggerAirdrop}
            disabled={isPending || !isConnected || isTriggering}
            className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed text-sm active:scale-95"
          >
            {isPending || isTriggering ? 'Triggering...' : '🎁 Trigger Airdrop'}
          </button>
        )}
      </div>
    </div>
  )
}
