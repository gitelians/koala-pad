import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useSendTransaction, useBalance, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { useAuth } from '../context/AuthContext'
import { SiBinance } from 'react-icons/si'
import { GiTwoCoins } from 'react-icons/gi'
import {
  purchaseBoost,
  isBoostActive as checkBoostActive,
  getBoostExpiry,
  creditCoinsAfterPayment,
  grantOnChainFeeExemption,
} from '../lib/supabaseApi'
import Toast, { ToastState, showToastFor } from '../components/Toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const TREASURY_ADDRESS = import.meta.env.VITE_PROTOCOL_TREASURY as `0x${string}`

// ─── Types & static data ──────────────────────────────────────────────────────

interface Boost {
  id: string
  title: string
  description: string
  cost: number
  duration: number  // ms; 0 = instant
  icon: React.ReactNode
  gradient: string
  border: string
  badge?: string
}

interface CoinsPackage {
  id: number
  coins: number
  formattedCoins: string
  bnb: string
  tag?: string
  highlight?: boolean
}

const BOOSTS: Boost[] = [
  {
    id: 'free-fees-1h',
    title: '1h Free Fees',
    description: 'Zero trading fees on all swaps for a full hour.',
    cost: 500,
    duration: 60 * 60 * 1000,
    icon: 
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-8 text-yellow-400">
      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
    </svg>,
    gradient: 'from-yellow-500/20 via-yellow-600/10 to-transparent',
    border: 'border-yellow-500/30',
  },
  {
    id: 'double-rewards-1h',
    title: '2× Rewards',
    description: 'Double KP, COINS & BNB earnings for 1 full hour.',
    cost: 1000,
    duration: 60 * 60 * 1000,
    icon: 
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-8 text-orange-600">
      <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" clipRule="evenodd" />
    </svg>,
    gradient: 'from-orange-500/20 via-orange-600/10 to-transparent',
    border: 'border-orange-500/30',
    badge: 'MOST LOVED',
  },
]

const COINS_PACKAGES: CoinsPackage[] = [
  { id: 0, coins: 500,   formattedCoins: '500',    bnb: '0.01' },
  { id: 1, coins: 1500,  formattedCoins: '1,500',  bnb: '0.025', tag: 'MOST POPULAR' },
  { id: 2, coins: 5000,  formattedCoins: '5,000',  bnb: '0.07',  tag: 'BEST-SELLER', highlight: true },
  { id: 3, coins: 15000, formattedCoins: '15,000', bnb: '0.18', tag: 'KING OF KOALA PAD', highlight: true },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function Shop() {
  const { address, isConnected } = useAccount()
  const { userId, profile, refreshProfile } = useAuth()
  const { sendTransactionAsync } = useSendTransaction()
  const { data: bnbBalance } = useBalance({ address })

  // Track pending coin-purchase tx so we can credit only after confirmation.
  const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>(undefined)
  const [pendingPackageId, setPendingPackageId] = useState<number | null>(null)
  const { isSuccess: pendingTxSuccess } = useWaitForTransactionReceipt({ hash: pendingTx })
  const creditedTxRef = useRef<string | null>(null)

  const [tick, setTick]                     = useState(0)
  const [toast, setToast]                   = useState<ToastState | null>(null)
  const [purchasingId, setPurchasingId]     = useState<number | null>(null)
  const [buyingBoostId, setBuyingBoostId]   = useState<string | null>(null)

  // Boost active state & expiry times
  const [boostStates, setBoostStates] = useState<Record<string, { active: boolean; expiresAt: string | null }>>({})

  const coins = profile?.coins ?? 0

  // Fetch boost states from Supabase
  const refreshBoostStates = useCallback(async () => {
    if (!userId) return
    const states: Record<string, { active: boolean; expiresAt: string | null }> = {}
    for (const boost of BOOSTS) {
      if (boost.duration > 0) {
        const active = await checkBoostActive(userId, boost.id)
        const expiresAt = active ? await getBoostExpiry(userId, boost.id) : null
        states[boost.id] = { active, expiresAt }
      }
    }
    setBoostStates(states)
  }, [userId])

  // Initial load + periodic tick for timer re-render
  useEffect(() => {
    refreshBoostStates()
    const id = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [refreshBoostStates])

  // Re-check boost expiry every 30 seconds
  useEffect(() => {
    if (tick > 0 && tick % 30 === 0) {
      refreshBoostStates()
    }
  }, [tick, refreshBoostStates])

  const getRemainingTime = (boostId: string): string => {
    const state = boostStates[boostId]
    if (!state?.expiresAt) return ''
    const remaining = new Date(state.expiresAt).getTime() - Date.now()
    if (remaining <= 0) return ''
    const m = Math.floor(remaining / 60000)
    const s = Math.floor((remaining % 60000) / 1000)
    return `${m}m ${s}s`
  }

  const showToast = (message: string, type: ToastState['type']) =>
    showToastFor(setToast, message, type)

  // ── Boost purchase ──────────────────────────────────────────────────────────

  const handleBuyBoost = async (boost: Boost) => {
    if (!userId)               return showToast('Connect your wallet first.', 'error')
    if (coins < boost.cost)    return showToast('Not enough COINS.', 'error')
    if (boost.duration > 0 && boostStates[boost.id]?.active)
                               return showToast('This boost is already active!', 'error')

    setBuyingBoostId(boost.id)

    try {
      await purchaseBoost(boost.id)

      // If Free Fees boost, grant on-chain fee exemption (server uses
      // the verified wallet on file).
      if (boost.id === 'free-fees-1h') {
        try {
          await grantOnChainFeeExemption()
        } catch (err) {
          console.error('Failed to grant on-chain fee exemption:', err)
        }
      }

      await refreshProfile()
      await refreshBoostStates()
      showToast(`${boost.title} activated!`, 'success')
    } catch (err: any) {
      console.error('Failed to buy boost:', err)
      showToast(err.message || 'Failed to buy boost.', 'error')
    } finally {
      setTimeout(() => setBuyingBoostId(null), 600)
    }
  }

  // ── COINS purchase ──────────────────────────────────────────────────────────

  const handleBuyCoins = async (pkg: CoinsPackage) => {
    if (!userId) return showToast('Connect your wallet first.', 'error')
    setPurchasingId(pkg.id)
    try {
      const hash = await sendTransactionAsync({
        to: TREASURY_ADDRESS,
        value: parseEther(pkg.bnb),
      })
      setPendingPackageId(pkg.id)
      setPendingTx(hash)
    } catch (err: any) {
      const rejected = err?.message?.toLowerCase?.().includes?.('rejected')
      showToast(rejected ? 'Transaction rejected.' : 'Transaction failed. Try again.', 'error')
      setPurchasingId(null)
    }
  }

  // Credit COINS only after the BNB tx is confirmed AND verified server-side.
  useEffect(() => {
    if (!pendingTxSuccess || !pendingTx || pendingPackageId === null) return
    if (creditedTxRef.current === pendingTx) return
    creditedTxRef.current = pendingTx
    const txHash = pendingTx
    const pkgId = pendingPackageId
    creditCoinsAfterPayment(txHash, pkgId)
      .then(async () => {
        await refreshProfile()
        const pkg = COINS_PACKAGES.find(p => p.id === pkgId)
        showToast(`${pkg?.formattedCoins ?? ''} COINS added to your balance!`, 'success')
      })
      .catch(err => {
        console.error('Failed to credit coins:', err)
        showToast('Tx confirmed but credit failed. Contact support.', 'error')
      })
      .finally(() => {
        setPurchasingId(null)
        setPendingTx(undefined)
        setPendingPackageId(null)
      })
  }, [pendingTxSuccess, pendingTx, pendingPackageId, refreshProfile])

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full pb-20">
      <Toast toast={toast} />

      {/* Header row: title left, balances right */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <h1 className="text-xl font-bold text-gray-100">Shop</h1>

        {isConnected && address && (
          <div className="flex items-center gap-2 sticky top-4 z-10">
            <div className="flex items-center gap-2 bg-gray-900/60 backdrop-blur-xl border border-gray-800/50 rounded-xl px-3 py-2">
              <GiTwoCoins size={16} className="text-amber-400" />
              <span className="text-white font-semibold text-sm">{coins.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-900/60 backdrop-blur-xl border border-gray-800/50 rounded-xl px-3 py-2">
              <SiBinance className="text-sm text-[#F3BA2F]" />
              <span className="text-gray-100 font-semibold text-sm">
                {parseFloat(bnbBalance?.formatted || '0').toFixed(4)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── BOOSTS ── */}
      <div className="mb-8 md:mb-10">
        <h2 className="text-md font-medium text-gray-100 mb-2">Boosts</h2>
        <p className="text-gray-400 text-sm mb-4 md:mb-6">
            Spend COINS to activate temporary superpowers.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          {BOOSTS.map((boost) => {
            const active    = boostStates[boost.id]?.active ?? false
            const timeLeft  = getRemainingTime(boost.id)
            const canAfford = coins >= boost.cost
            const loading   = buyingBoostId === boost.id

            return (
              <div
                key={boost.id}
                className={`bg-gray-900 border border-gray-700 hover:border-violet-500/40 rounded-2xl p-4 md:p-5 flex flex-col items-center text-center gap-3 md:gap-4 relative ${
                  active ? 'border-green-500/40' : 'border-gray-800'
                }`}
              >
                {boost.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                    {boost.badge}
                  </span>
                )}

                <div className="text-4xl mt-1">{boost.icon}</div>

                <div>
                  <p className="font-bold text-white text-sm uppercase">{boost.title}</p>
                  <p className="text-gray-500 text-xs mt-1 leading-relaxed">{boost.description}</p>
                  {active && timeLeft && (
                    <p className="text-xs text-green-400 font-medium mt-2">Active — {timeLeft}</p>
                  )}
                </div>

                <button
                  onClick={() => handleBuyBoost(boost)}
                  disabled={!isConnected || !canAfford || active || loading}
                  className={`mt-auto w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    active
                      ? 'bg-green-500/20 text-green-400 cursor-default'
                      : loading
                      ? 'bg-violet-700 text-violet-300 cursor-wait'
                      : canAfford && isConnected
                      ? 'bg-violet-600 hover:bg-violet-500 text-white active:scale-95'
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {active
                    ? 'Active'
                    : loading
                    ? '...'
                    : (
                      <span className="flex items-center justify-center gap-1.5">
                        {boost.cost.toLocaleString()}
                        <GiTwoCoins size={16} className="text-amber-400" />
                      </span>
                    )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── BUY COINS ── */}
      <div>
        <h2 className="text-md font-medium text-gray-100 mb-2">Buy COINS</h2>
        <p className="text-gray-400 text-sm mb-4 md:mb-6">
            Buy COINS with BNB and spend them in the Shop.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          {COINS_PACKAGES.map((pkg) => {
            const isLoading = purchasingId === pkg.id
            const isDisabled = !isConnected || purchasingId !== null

            return (
              <div
                key={pkg.id}
                className={`bg-gray-900 border border-gray-700 hover:border-violet-500/40 rounded-2xl p-4 md:p-5 flex flex-col items-center text-center gap-3 md:gap-4 relative ${
                  pkg.highlight
                    ? 'border-violet-500/60'
                    : pkg.tag === 'KING OF KOALA PAD'
                    ? 'border-yellow-500/40'
                    : 'border-gray-800'
                }`}
              >
                {pkg.tag && (
                  <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    pkg.highlight
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {pkg.tag}
                  </span>
                )}

                <GiTwoCoins size={32} className="text-amber-400" />

                <div>
                  <p className="text-xl md:text-2xl font-extrabold text-white leading-none">
                    {pkg.formattedCoins}
                  </p>
                  <p className="text-gray-500 text-xs mt-1 font-medium uppercase tracking-wider">
                    COINS
                  </p>
                </div>

                <button
                  onClick={() => handleBuyCoins(pkg)}
                  disabled={isDisabled}
                  className={`mt-auto w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isLoading
                      ? 'bg-violet-700 text-violet-300 cursor-wait'
                      : !isDisabled
                      ? 'bg-violet-600 hover:bg-violet-500 text-white active:scale-95'
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12" cy="12" r="10"
                          stroke="currentColor" strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8z"
                        />
                      </svg>
                      Pending…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      {pkg.bnb}
                      <SiBinance className="text-[16px] text-[#F3BA2F]" />
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {!isConnected && (
          <p className="text-gray-600 text-xs mt-4 text-center">
            Connect your wallet to purchase COINS.
          </p>
        )}
      </div>
    </div>
  )
}
