import { useState } from 'react'
import { formatEther, parseEther } from 'viem'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useBalance } from 'wagmi'

interface SwapPanelProps {
  tokenSymbol: string
  reserveToken: bigint
  reserveBNB: bigint
  userTokenBalance: bigint
  onSwap: (isBuyingToken: boolean, amount: string, slippageBps: number) => Promise<void>
  disabled?: boolean
  freeFeesActive?: boolean
}

export default function SwapPanel({
  tokenSymbol,
  reserveToken,
  reserveBNB,
  userTokenBalance,
  onSwap,
  disabled,
  freeFeesActive = false,
}: SwapPanelProps) {
  const [isBuying, setIsBuying] = useState(true)
  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  // Slippage tolerance in basis points; default 1%.
  const [slippageBps, setSlippageBps] = useState(100)

  // Fetch native BNB balance
  const { address } = useAccount()
  const { data: bnbBalanceData } = useBalance({ address })
  const bnbBalance = bnbBalanceData?.value ?? 0n

  // Determine which balance to use for calculations
  const activeBalance = isBuying ? bnbBalance : userTokenBalance

  // Fee schedule (mirrors Pool.sol — 0.85% protocol + 0.35% creator = 1.2% total).
  const TOTAL_FEE_BPS = 120n
  const FEE_DEN = 10_000n
  const AFTER_FEE_BPS = FEE_DEN - TOTAL_FEE_BPS // 9880

  const calculateOutput = (input: string) => {
    if (!input || parseFloat(input) <= 0) {
      setOutputAmount('')
      return
    }

    try {
      const inputAmt = parseEther(input)

      if (isBuying) {
        const inputAfterFee = freeFeesActive ? inputAmt : (inputAmt * AFTER_FEE_BPS) / FEE_DEN
        const numerator = inputAfterFee * reserveToken
        const denominator = reserveBNB + inputAfterFee
        const output = numerator / denominator
        setOutputAmount(formatEther(output))
      } else {
        const numerator = inputAmt * reserveBNB
        const denominator = reserveToken + inputAmt
        const outputBeforeFee = numerator / denominator
        const output = freeFeesActive ? outputBeforeFee : (outputBeforeFee * AFTER_FEE_BPS) / FEE_DEN
        setOutputAmount(formatEther(output))
      }
    } catch {
      setOutputAmount('')
    }
  }

  const calculateInput = (output: string) => {
    if (!output || parseFloat(output) <= 0) {
      setInputAmount('')
      return
    }

    try {
      const outputAmt = parseEther(output)

      if (isBuying) {
        const numerator = outputAmt * reserveBNB
        const denominator = reserveToken - outputAmt
        const inputBeforeFee = numerator / denominator
        const input = freeFeesActive ? inputBeforeFee : (inputBeforeFee * FEE_DEN) / AFTER_FEE_BPS
        setInputAmount(formatEther(input))
      } else {
        const outputBeforeFee = freeFeesActive ? outputAmt : (outputAmt * FEE_DEN) / AFTER_FEE_BPS
        const numerator = outputBeforeFee * reserveToken
        const denominator = reserveBNB - outputBeforeFee
        const input = numerator / denominator
        setInputAmount(formatEther(input))
      }
    } catch {
      setInputAmount('')
    }
  }

  const handleInputChange = (value: string) => {
    setInputAmount(value)
    calculateOutput(value)
  }

  const handleOutputChange = (value: string) => {
    setOutputAmount(value)
    calculateInput(value)
  }

  // Handle percentage button clicks
  const handlePercentage = (percent: number) => {
    if (activeBalance === 0n) return

    // Calculate raw amount
    const amount = (activeBalance * BigInt(percent)) / 100n
    
    // Format to string and update input
    const formattedAmount = formatEther(amount)
    handleInputChange(formattedAmount)
  }

  const toggleDirection = () => {
    setIsBuying(!isBuying)
    setInputAmount('')
    setOutputAmount('')
    setIsInputFocused(false) // Reset focus state
  }

  const handleSwap = async () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) return
    await onSwap(isBuying, inputAmount, slippageBps)
    setInputAmount('')
    setOutputAmount('')
  }

  const price = reserveToken > 0n 
    ? parseFloat(formatEther(reserveBNB)) / parseFloat(formatEther(reserveToken))
    : 0

  const isConnected = !!address

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-md font-semibold text-gray-100">Swap</h3>
      </div>

      <div className="p-4 space-y-3 flex flex-col">
        <div className="space-y-3">
          {/* From Section */}
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 focus-within:ring-1 focus-within:ring-violet-500 focus-within:border-transparent transition-all">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-gray-500 font-medium">From</span>
              <span className="text-xs text-gray-400 truncate ml-2">
                Balance: {parseFloat(formatEther(activeBalance)).toFixed(4)}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={inputAmount}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="0.0"
                min="0"
                step="any"
                className="flex-1 bg-transparent text-lg md:text-xl font-semibold outline-none min-w-0 text-white placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg font-semibold text-sm whitespace-nowrap flex-shrink-0 text-gray-200">
                {isBuying ? 'BNB' : tokenSymbol}
              </div>
            </div>

            {/* Percentage Buttons */}
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
                      // Prevent default on mouse down so input doesn't lose focus
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handlePercentage(percent)}
                      className="flex-1 py-1 text-xs font-medium text-gray-400 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-violet-400 hover:border-violet-900 transition-all"
                    >
                      {percent === 100 ? 'MAX' : `${percent}%`}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center -my-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleDirection}
              className="p-2 bg-violet-900/30 border border-violet-800/50 rounded-full hover:bg-violet-900/50 transition-colors z-10"
            >
              <svg
                className="w-5 h-5 text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
            </motion.button>
          </div>

          {/* To Section */}
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 focus-within:ring-1 focus-within:ring-violet-500 focus-within:border-transparent transition-all">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-gray-500 font-medium">To</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={outputAmount}
                onChange={(e) => handleOutputChange(e.target.value)}
                placeholder="0.0"
                min="0"
                step="any"
                className="flex-1 bg-transparent text-lg md:text-xl font-semibold outline-none text-white min-w-0 placeholder-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg font-semibold text-sm whitespace-nowrap flex-shrink-0 text-gray-200">
                {isBuying ? tokenSymbol : 'BNB'}
              </div>
            </div>
          </div>

          {/* Price info */}
          <div className="text-xs text-gray-500 text-center font-medium">
            1 {tokenSymbol} ≈ {price.toFixed(8)} BNB
          </div>

          {/* Slippage tolerance */}
          <div className="flex items-center gap-2 justify-center text-xs text-gray-400">
            <span>Slippage</span>
            {[50, 100, 300, 1000].map((bps) => (
              <button
                key={bps}
                onClick={() => setSlippageBps(bps)}
                className={`px-2 py-0.5 rounded-md border ${
                  slippageBps === bps
                    ? 'bg-violet-600/30 border-violet-500 text-violet-100'
                    : 'border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {(bps / 100).toFixed(bps < 100 ? 1 : 0)}%
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {/* Swap Action Button */}
          <button
            onClick={handleSwap}
            disabled={disabled || !inputAmount || parseFloat(inputAmount) <= 0}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg disabled:opacity-40 active:scale-95"
          >
            {disabled ? 'Processing...' : 'Swap'}
          </button>

          {/* Notices on Swap button */}
          {!disabled && (!isConnected || !inputAmount || parseFloat(inputAmount) <= 0) && (
            <div className="text-xs text-center text-amber-400">
              {!isConnected
                ? 'Sign in to swap'
                : 'Enter an amount greater than 0'}
            </div>
          )}

          {/* Fee notice */}
          <div className="text-xs text-center">
            {freeFeesActive ? (
              <span className="text-green-400">⚡ Free Fees active — no fee on this swap</span>
            ) : (
              <span className="text-gray-500">
                1.2% fee · <span className="text-gray-400">0.85%</span> protocol + <span className="text-violet-400">0.35%</span> creator
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}