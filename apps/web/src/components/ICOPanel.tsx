import { useState, useEffect } from 'react'
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { motion, AnimatePresence } from 'framer-motion'
import { formatEther, parseEther } from 'viem'
import { useAuth } from '../context/AuthContext'
import { ICO_ABI } from '../constants/abis'
import {
  insertIcoContribution,
  updateTokenPhase,
  updateTokenIcoProgress,
  recordCreatorReward,
} from '../lib/supabaseApi'

interface ICOPanelProps {
  icoAddress: `0x${string}`
  tokenAddress: string
  tokenSymbol: string
  onPhaseChange?: (phase: string) => void
  freeFeesActive?: boolean
  bnbPrice: number
}

type Mode = 'buy' | 'withdraw'

export default function ICOPanel({ icoAddress, tokenAddress, tokenSymbol, onPhaseChange, freeFeesActive = false, bnbPrice }: ICOPanelProps) {
  const { address: userAddress } = useAccount()
  const { authenticated, login } = usePrivy()
  const { userId, walletAddress: profileWallet } = useAuth()

  const [mode, setMode] = useState<Mode>('buy')
  const [buyAmount, setBuyAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  // Tracks what kind of tx is currently in flight so the on-success effect
  // knows whether to record a buy (insert ico_contributions row) or a
  // withdraw (negative-ish row tagged kind='withdraw').
  const [pendingAction, setPendingAction] = useState<'buy' | 'withdraw' | null>(null)
  const [pendingAmount, setPendingAmount] = useState<string>('')

  // Native BNB balance for percentage buttons
  const { data: bnbBalanceData } = useBalance({ address: userAddress })
  const bnbBalance = bnbBalanceData?.value ?? 0n

  const { data: icoInfo, refetch: refetchICO } = useReadContract({
    address: icoAddress,
    abi: ICO_ABI,
    functionName: 'getICOInfo',
  })

  const { data: userContribution, refetch: refetchContribution } = useReadContract({
    address: icoAddress,
    abi: ICO_ABI,
    functionName: 'contributions',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  })

  const { data: userTokens, refetch: refetchUserTokens } = useReadContract({
    address: icoAddress,
    abi: ICO_ABI,
    functionName: 'tokensPurchased',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  })

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // getICOInfo returns: (currentRound, tokensSoldInCurrentRound, totalBNBRaised,
  // finalized, currentPrice). See ICO.sol.
  const currentRound = icoInfo ? Number(icoInfo[0]) : 1
  const tokensSoldInRound = icoInfo ? icoInfo[1] : 0n
  const totalBNBRaised = icoInfo ? icoInfo[2] : 0n
  const finalized = icoInfo ? icoInfo[3] : false
  const currentPrice = icoInfo ? icoInfo[4] : 0n

  const tokensPerRound = 1_050_000 // ICO.sol TOKENS_PER_ROUND
  const totalRounds = 10           // ICO.sol TOTAL_ROUNDS
  // Pre-computed sqrt-curve prices in BNB per token
  // (matches ICO.sol getRoundPrice — see CLAUDE.md §7.4).
  const ROUND_PRICE_BNB: number[] = [
    0,                 // 0 unused (rounds are 1-indexed)
    1.85632e-6,
    1.99897e-6,
    2.10856e-6,
    2.20094e-6,
    2.28230e-6,
    2.35584e-6,
    2.42347e-6,
    2.48640e-6,
    2.54556e-6,
    2.60120e-6,
  ]
  const raisedBNB = totalBNBRaised ? parseFloat(formatEther(totalBNBRaised)) : 0
  const tokensRemainingInRound = tokensPerRound - (tokensSoldInRound ? parseFloat(formatEther(tokensSoldInRound)) : 0)

  const icoGoal = 24 // ICO.sol ICO_GOAL (BNB)
  const progress = Math.min((raisedBNB / icoGoal) * 100, 100)
  const raisedUSD = raisedBNB * bnbPrice
  const goalUSD = icoGoal * bnbPrice
  const formatUSD = (value: number) => {
    if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return `$${value.toFixed(2)}`
  }
  const pricePerToken = currentPrice ? parseFloat(formatEther(currentPrice)) : 0

  // Max BNB (net of fee) needed to finish the ICO:
  //   remaining tokens in current round at current price
  // + TOKENS_PER_ROUND * pricePerToken(r) for each future round r.
  let netBNBToFinish = tokensRemainingInRound * pricePerToken
  for (let s = currentRound + 1; s <= totalRounds; s++) {
    netBNBToFinish += tokensPerRound * (ROUND_PRICE_BNB[s] ?? 0)
  }
  // Fee model: 1.2% total (0.85% protocol + 0.35% creator). Matches ICO.sol.
  const feeMultiplier = freeFeesActive ? 1 : 0.988
  const maxBuyBNB = netBNBToFinish > 0 ? (netBNBToFinish / feeMultiplier) * 1.001 : 0

  const estimatedTokens = buyAmount && pricePerToken > 0
    ? (parseFloat(buyAmount) * feeMultiplier) / pricePerToken
    : 0

  const overMax = !!buyAmount && parseFloat(buyAmount) > maxBuyBNB && maxBuyBNB > 0

  // Insufficient-balance guard for the buy form. Compared in BNB (human units)
  // so we don't accidentally allow tx attempts the wallet would reject.
  const bnbBalanceNum = parseFloat(formatEther(bnbBalance))
  const buyAmountNum = buyAmount ? parseFloat(buyAmount) : 0
  const insufficientBalance = buyAmountNum > 0 && buyAmountNum > bnbBalanceNum

  // Withdraw bounds: user can withdraw up to their net contribution.
  const userContributionBNB = userContribution ? parseFloat(formatEther(userContribution)) : 0
  const userTokensFloat = userTokens ? parseFloat(formatEther(userTokens)) : 0
  const withdrawNum = withdrawAmount ? parseFloat(withdrawAmount) : 0
  const overWithdraw = withdrawNum > userContributionBNB
  // Proportional preview: same fraction of user's holdings comes back.
  const tokensReturnedPreview =
    userContributionBNB > 0 && withdrawNum > 0
      ? (userTokensFloat * Math.min(withdrawNum, userContributionBNB)) / userContributionBNB
      : 0
  const netReceivePreview =
    withdrawNum > 0
      ? Math.min(withdrawNum, userContributionBNB) * (freeFeesActive ? 1 : 0.988)
      : 0

  // Handle successful transaction
  useEffect(() => {
    if (!isSuccess) return
    refetchICO()
    refetchContribution()
    refetchUserTokens()

    const contributorWallet = userAddress?.toLowerCase() || profileWallet?.toLowerCase()

    if (pendingAction === 'buy' && contributorWallet && txHash && pendingAmount) {
      insertIcoContribution({
        token_address: tokenAddress,
        wallet_address: contributorWallet,
        user_id: userId || undefined,
        bnb_amount: pendingAmount,
        tokens_received: estimatedTokens.toFixed(0),
        round: currentRound,
        kind: 'buy',
        tx_hash: txHash,
      }).catch(err => console.error('Failed to record ICO contribution:', err))

      updateTokenIcoProgress(tokenAddress, raisedBNB + parseFloat(pendingAmount), currentRound)
        .catch(err => console.error('Failed to update ICO progress:', err))
    }

    if (pendingAction === 'withdraw' && contributorWallet && txHash && pendingAmount) {
      insertIcoContribution({
        token_address: tokenAddress,
        wallet_address: contributorWallet,
        user_id: userId || undefined,
        bnb_amount: pendingAmount,
        tokens_received: tokensReturnedPreview.toFixed(0),
        round: currentRound,
        kind: 'withdraw',
        tx_hash: txHash,
      }).catch(err => console.error('Failed to record ICO withdraw:', err))

      updateTokenIcoProgress(tokenAddress, Math.max(raisedBNB - parseFloat(pendingAmount), 0), currentRound)
        .catch(err => console.error('Failed to update ICO progress:', err))
    }

    // After a buy, the very last purchase can auto-finalize the ICO. Refetch
    // and check; if finalized, record the creator reward (idempotent) and
    // flip phase locally.
    if (pendingAction === 'buy') {
      setTimeout(async () => {
        const result = await refetchICO()
        if (result.data && result.data[3]) {
          // tokens.phase flip happens server-side inside record-creator-reward
          // (so we don't have to do it from the client). Fall back to a
          // direct update if the edge function fails.
          recordCreatorReward(tokenAddress).catch(err => {
            console.error('Failed to record creator reward:', err)
            updateTokenPhase(tokenAddress, 'trading').catch(() => {})
          })
          onPhaseChange?.('trading')
        }
      }, 2000)
    }

    setBuyAmount('')
    setWithdrawAmount('')
    setPendingAction(null)
    setPendingAmount('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const handleBuy = () => {
    if (!buyAmount || parseFloat(buyAmount) <= 0) return
    setPendingAction('buy')
    setPendingAmount(buyAmount)
    writeContract({
      address: icoAddress,
      abi: ICO_ABI,
      functionName: 'buy',
      value: parseEther(buyAmount),
    })
  }

  const handleWithdraw = () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return
    setPendingAction('withdraw')
    setPendingAmount(withdrawAmount)
    writeContract({
      address: icoAddress,
      abi: ICO_ABI,
      functionName: 'withdraw',
      args: [parseEther(withdrawAmount)],
    })
  }

  // ICO Finalized — trading enabled. (No 'cancelled' or 'expired' state
  // anymore — the ICO has no deadline.)
  if (finalized) {
    return (
      <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-4 md:p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-lg md:text-xl font-semibold text-green-400 mb-2">ICO Completed!</h3>
          <p className="text-gray-400 text-sm">
            {raisedBNB.toFixed(4)} BNB raised. Trading is now live!
          </p>
          {userTokens !== undefined && userTokens > 0n && (
            <div className="mt-4 bg-gray-900/50 border border-gray-800 rounded-xl p-3">
              <div className="text-sm text-green-400">You purchased</div>
              <div className="text-lg font-semibold text-white">
                {parseFloat(formatEther(userTokens)).toLocaleString()} {tokenSymbol}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800">
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-md font-semibold text-gray-100">ICO</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* BNB Goal Progress Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-400">ICO goal progress</span>
            <span className="text-gray-100">{progress.toFixed(1)}%</span>
          </div>
          <div className="relative h-3 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(progress, 0.5)}%`,
                background: 'linear-gradient(90deg, #7c3aed, #8b5cf6, #a855f7)',
                boxShadow: '0 0 12px rgba(139, 92, 246, 0.6), 0 0 24px rgba(168, 85, 247, 0.3)',
              }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
              style={{ width: `${Math.max(progress, 0.5)}%` }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                  animation: 'shimmer 2s ease-in-out infinite',
                }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="text-gray-400">{raisedBNB.toFixed(4)} BNB</span>
            <span className="text-gray-100">
              {formatUSD(raisedUSD)} <span className="text-gray-400">of {formatUSD(goalUSD)} goal</span>
            </span>
          </div>
        </div>

        {/* Round Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Current round</div>
            <div className="text-base md:text-lg font-semibold text-white">
              {currentRound > totalRounds ? totalRounds : currentRound} / {totalRounds}
            </div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Price</div>
            <div className="text-base md:text-lg font-semibold text-white break-all">
              ${(pricePerToken * bnbPrice).toFixed(6)}
            </div>
          </div>
        </div>

        {/* Tokens remaining in round */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
          <div className="text-xs text-gray-500 mb-1">Tokens left to the next round</div>
          <div className="text-sm font-semibold text-gray-100">
            {tokensRemainingInRound.toLocaleString()} / {tokensPerRound.toLocaleString()} {tokenSymbol}
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
            <div
              className="bg-violet-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(tokensRemainingInRound / tokensPerRound) * 100}%` }}
            />
          </div>

          {/* Previous / Next round prices with delta */}
          {(() => {
            const safeRound = Math.min(Math.max(currentRound, 1), totalRounds)
            const prevRoundPrice = safeRound > 1 ? ROUND_PRICE_BNB[safeRound - 1] : null
            const POOL_OPEN_BNB = 2.7381e-6
            const isFinalRound = safeRound >= totalRounds
            const nextRoundPrice = isFinalRound
              ? POOL_OPEN_BNB
              : ROUND_PRICE_BNB[safeRound + 1]

            const prevDelta = prevRoundPrice
              ? ((pricePerToken - prevRoundPrice) / prevRoundPrice) * 100
              : null
            const nextDelta = nextRoundPrice
              ? ((nextRoundPrice - pricePerToken) / pricePerToken) * 100
              : null

            return (
              <div className="flex justify-between gap-3 mt-3 pt-3 border-t border-gray-800/70">
                <div className="text-left">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    {prevRoundPrice ? 'Last price' : ''}
                  </div>
                  {prevRoundPrice ? (
                    <>
                      <div className="text-xs font-semibold text-gray-200">
                        ${(prevRoundPrice * bnbPrice).toFixed(6)}
                      </div>
                      {prevDelta !== null && (
                        <div className="text-[10px] text-rose-400 font-medium">
                          {prevDelta >= 0 ? '+' : ''}{prevDelta.toFixed(2)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[10px] text-gray-600">—</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    {isFinalRound ? 'Pool open price' : 'Next price'}
                  </div>
                  {nextRoundPrice ? (
                    <>
                      <div className="text-xs font-semibold text-gray-200">
                        ${(nextRoundPrice * bnbPrice).toFixed(6)}
                      </div>
                      {nextDelta !== null && (
                        <div className="text-[10px] text-emerald-400 font-medium">
                          +{nextDelta.toFixed(2)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[10px] text-gray-600">—</div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Buy / Withdraw toggle — the active pill is a shared-layout element
            (layoutId) so framer-motion animates it sliding between buttons. */}
        <div className="relative flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
          {(['buy', 'withdraw'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`relative flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors z-10 ${
                mode === m ? 'text-violet-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {mode === m && (
                <motion.span
                  layoutId="ico-mode-pill"
                  className="absolute inset-0 rounded-md bg-violet-600/20 shadow-inner -z-10"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              {m === 'buy' ? 'Buy' : 'Withdraw'}
            </button>
          ))}
        </div>

        {/* Buy form */}
        {mode === 'buy' && (
          <div className="space-y-3">
            <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-gray-400">Amount (BNB)</label>
                  <span className="text-xs text-gray-400 truncate ml-2">
                    Balance: {bnbBalanceNum.toFixed(4)}
                  </span>
                </div>
                <input
                  type="number"
                  value={buyAmount}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || maxBuyBNB <= 0 || parseFloat(v) <= maxBuyBNB) {
                      setBuyAmount(v)
                    } else {
                      setBuyAmount(maxBuyBNB.toFixed(6))
                    }
                  }}
                  placeholder="0.0"
                  min="0"
                  max={maxBuyBNB > 0 ? maxBuyBNB : undefined}
                  step="any"
                  className={`w-full px-4 py-3 bg-gray-900 border rounded-lg focus:ring-1 focus:border-transparent outline-none text-gray-100 placeholder-gray-600 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                    insufficientBalance
                      ? 'border-rose-500/70 focus:ring-rose-500'
                      : 'border-gray-800 focus:ring-violet-500'
                  }`}
                />

                <AnimatePresence>
                  {isInputFocused && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex gap-2 mt-2 overflow-hidden"
                    >
                      {[25, 50, 75, 100].map((percent) => (
                        <button
                          key={percent}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (bnbBalance === 0n) return
                            const amount = (bnbBalance * BigInt(percent)) / 100n
                            let formatted = parseFloat(formatEther(amount))
                            if (maxBuyBNB > 0 && formatted > maxBuyBNB) formatted = maxBuyBNB
                            setBuyAmount(formatted.toFixed(6))
                          }}
                          className="flex-1 py-1 text-xs font-medium text-gray-400 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-violet-400 hover:border-violet-900 transition-all"
                        >
                          {percent === 100 ? 'MAX' : `${percent}%`}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {insufficientBalance && (
                  <div className="mt-1 text-xs text-rose-400">
                    Insufficient balance
                  </div>
                )}
              </div>

              {estimatedTokens > 0 && !insufficientBalance && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-400">Estimated: </span>
                  <span className="text-violet-400 font-semibold">
                    ~{estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} {tokenSymbol}
                  </span>
                </div>
              )}

              {authenticated ? (
                <button
                  onClick={handleBuy}
                  disabled={isPending || !buyAmount || parseFloat(buyAmount) <= 0 || insufficientBalance || overMax}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg disabled:opacity-40 active:scale-95"
                >
                  {isPending ? 'Confirming...' : 'Buy Tokens'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => login()}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg active:scale-95"
                >
                  Log in to trade
                </button>
              )}

              {freeFeesActive && (
                <div className="text-xs text-center">
                  <span className="text-green-400">⚡ Free Fees active — no fee on this transaction</span>
                </div>
              )}
          </div>
        )}

        {/* Withdraw form */}
        {mode === 'withdraw' && (
          <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-gray-400">Amount (BNB)</label>
                  <span className="text-xs text-gray-400 truncate ml-2">
                    Contributed: {userContributionBNB.toFixed(4)}
                  </span>
                </div>
                <input
                  type="number"
                  value={withdrawAmount}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || userContributionBNB <= 0 || parseFloat(v) <= userContributionBNB) {
                      setWithdrawAmount(v)
                    } else {
                      setWithdrawAmount(userContributionBNB.toFixed(6))
                    }
                  }}
                  placeholder="0.0"
                  min="0"
                  max={userContributionBNB > 0 ? userContributionBNB : undefined}
                  step="any"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-violet-500 focus:border-transparent outline-none text-gray-100 placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />

                <AnimatePresence>
                  {isInputFocused && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex gap-2 mt-2 overflow-hidden"
                    >
                      {[25, 50, 75, 100].map((percent) => (
                        <button
                          key={percent}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (userContributionBNB <= 0) return
                            const amount = (userContributionBNB * percent) / 100
                            setWithdrawAmount(amount.toFixed(6))
                          }}
                          className="flex-1 py-1 text-xs font-medium text-gray-400 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-violet-400 hover:border-violet-900 transition-all"
                        >
                          {percent === 100 ? 'MAX' : `${percent}%`}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {tokensReturnedPreview > 0 && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tokens returned</span>
                    <span className="text-violet-400 font-semibold">
                      ~{tokensReturnedPreview.toLocaleString(undefined, { maximumFractionDigits: 0 })} {tokenSymbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">You'll receive</span>
                    <span className="text-emerald-400 font-semibold">
                      ~{netReceivePreview.toFixed(6)} BNB
                    </span>
                  </div>
                </div>
              )}

              {authenticated ? (
                <button
                  onClick={handleWithdraw}
                  disabled={
                    isPending ||
                    !withdrawAmount ||
                    parseFloat(withdrawAmount) <= 0 ||
                    userContributionBNB <= 0 ||
                    overWithdraw
                  }
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg disabled:opacity-40 active:scale-95"
                >
                  {isPending ? 'Confirming...' : 'Withdraw'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => login()}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg active:scale-95"
                >
                  Log in to trade
                </button>
              )}

              {freeFeesActive && (
                <div className="text-xs text-center">
                  <span className="text-green-400">⚡ Free Fees active — no fee on this transaction</span>
                </div>
              )}
          </div>
        )}

        {/* User Stats */}
        {userContribution !== undefined && userContribution > 0n && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 space-y-2">
            <div className="text-xs text-gray-500 font-semibold">Your Contribution</div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">BNB</span>
              <span className="text-white font-semibold">{userContributionBNB.toFixed(4)} BNB</span>
            </div>
            {userTokens !== undefined && userTokens > 0n && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tokens Received</span>
                <span className="text-white font-semibold">
                  {userTokensFloat.toLocaleString()} {tokenSymbol}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
