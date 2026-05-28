import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { GiKoala, GiTwoCoins } from "react-icons/gi"
import { SiBinance } from 'react-icons/si'
import { useAuth } from '../context/AuthContext'
import {
  WHEEL_PRIZES,
  isBNBPrize,
  canUseFreeSpin,
  getTimeUntilFreeSpin,
  findMatchingSliceIndexes,
} from '../utils/gamification'
import {
  spinWheel,
  claimWheelBnbPrize,
  getPendingSpin,
  isBoostActive as checkBoostActive,
} from '../lib/supabaseApi'

interface WheelProps {
  treasuryAddress: `0x${string}`
  treasuryABI: any
  disabled?: boolean
  onSpinComplete?: () => Promise<unknown> | void
}

// Module-level stable random data — generated once, no re-render churn
const CONFETTI_COLORS = ['#A78BFA', '#FCD34D', '#F472B6', '#34D399', '#60A5FA', '#FB7185']
const CONFETTI = Array.from({ length: 36 }, (_, i) => {
  const angle = (i / 36) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
  const distance = 140 + Math.random() * 180
  return {
    id: i,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotate: Math.random() * 720 - 360,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: Math.random() * 0.15,
    size: 5 + Math.random() * 6,
  }
})

export default function Wheel({
  treasuryAddress,
  treasuryABI,
  disabled,
  onSpinComplete,
}: WheelProps) {
  const { userId, profile, refreshProfile } = useAuth()
  // Rest rotation = -(360 / sliceCount) / 2 = -22.5° for 8 slices. This shifts
  // slice 0's center (NADA) under the pointer instead of its left edge.
  const REST_ROTATION = -22.5
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(REST_ROTATION)
  const [result, setResult] = useState<{ prizeType: number; kp: number; coins: number; bnb: string } | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [pendingSpinId, setPendingSpinId] = useState<string | null>(null)

  // Free spin state
  const [freeSpinAvailable, setFreeSpinAvailable] = useState(false)
  const [freeSpinCooldown, setFreeSpinCooldown] = useState(0)

  // 2× Rewards boost state
  const [doubleRewardsActive, setDoubleRewardsActive] = useState(false)

  // Bulb chase animation step
  const [chaseStep, setChaseStep] = useState(0)

  // Brief stop-flash when the wheel lands
  const [stopFlash, setStopFlash] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const check = () => {
      checkBoostActive(userId, 'double-rewards-1h').then(active => {
        if (!cancelled) setDoubleRewardsActive(active)
      }).catch(() => {})
    }
    check()
    const interval = setInterval(check, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [userId])

  // Bulb chase loop — only runs while spinning. Idle = static.
  useEffect(() => {
    if (!spinning) return
    const interval = setInterval(() => setChaseStep(s => s + 1), 55)
    return () => clearInterval(interval)
  }, [spinning])

  const { writeContract, data: hash, error: writeError, isPending, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: currentTxHash })

  // Update free spin availability
  useEffect(() => {
    if (!profile) return

    const updateSpinStatus = () => {
      setFreeSpinAvailable(canUseFreeSpin(profile.last_free_spin_at))
      setFreeSpinCooldown(getTimeUntilFreeSpin(profile.last_free_spin_at))
    }

    updateSpinStatus()
    const interval = setInterval(updateSpinStatus, 1000)
    return () => clearInterval(interval)
  }, [profile])

  // Check for pending BNB prize that hasn't been claimed yet.
  useEffect(() => {
    if (!userId) return
    getPendingSpin(userId).then(pending => {
      if (pending && pending.prize_type === 'bnb') {
        setResult({
          prizeType: -1, // marker for BNB resume
          kp: 0,
          coins: 0,
          bnb: String(pending.prize_value),
        })
        setPendingSpinId(pending.id)
        setShowResult(true)
      }
    }).catch(() => {})
  }, [userId])

  // Track new transaction hash
  useEffect(() => {
    if (hash && claiming) {
      setCurrentTxHash(hash)
    }
  }, [hash, claiming])

  // Handle write error
  useEffect(() => {
    if (writeError) {
      console.error('Transaction error:', writeError)
      setClaiming(false)
      setCurrentTxHash(undefined)
      let errorMessage = 'Transaction failed'
      if (writeError.message.includes('User rejected') || writeError.message.includes('User denied')) {
        errorMessage = 'Transaction rejected by user'
      } else if (writeError.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas'
      } else if (writeError.message.includes('Cooldown not elapsed')) {
        errorMessage = 'Cooldown period not elapsed yet'
      }
      alert(errorMessage)
    }
  }, [writeError])

  // Handle successful BNB claim transaction
  useEffect(() => {
    if (isSuccess && currentTxHash && userId && claiming) {
      onSpinComplete?.()
      setResult(null)
      setShowResult(false)
      setClaiming(false)
      setCurrentTxHash(undefined)
      setPendingSpinId(null)
      resetWrite()
      refreshProfile()
    }
  }, [isSuccess, currentTxHash, userId, claiming, onSpinComplete, resetWrite, refreshProfile])

  /**
   * Server-driven spin. The backend rolls the prize, persists the result,
   * deducts COINS for paid spins (via SECURITY DEFINER RPC), and returns
   * the prize for the wheel animation.
   */
  const executeSpin = async () => {
    if (!userId) return

    setSpinning(true)
    setShowResult(false)
    setResult(null)
    setRotation(REST_ROTATION)

    try {
      const { spinId, prize } = await spinWheel()
      setPendingSpinId(spinId)

      // Pick one of the wheel slices that matches the server-rolled prize.
      // Multiple slices can map to the same prize (intentional duplicates) so
      // we randomise to keep visual variety.
      const matches = findMatchingSliceIndexes(prize.prizeType, prize.prizeValue)
      const sliceIdx = matches.length > 0
        ? matches[Math.floor(Math.random() * matches.length)]
        : 0
      const matchedSlice = WHEEL_PRIZES[sliceIdx]
      const sliceCenterAngle = (sliceIdx + 0.5) * sliceAngle
      const randomOffset = (Math.random() - 0.5) * (sliceAngle * 0.7)
      // Land slice center at the pointer (top, -90° in SVG coords). At
      // rotation R, slice i center sits at (i+0.5)*sliceAngle - 90 + R; solve
      // for R = -(i+0.5)*sliceAngle (mod 360). 2160° = 6 full clockwise turns.
      const totalRotation = 2160 - sliceCenterAngle + randomOffset

      setTimeout(() => setRotation(totalRotation), 50)
      setTimeout(async () => {
        setResult({
          prizeType: matchedSlice.id,
          kp: prize.prizeType === 'kp' ? prize.prizeValue : 0,
          coins: prize.prizeType === 'coins' ? prize.prizeValue : 0,
          bnb: prize.prizeType === 'bnb' ? String(prize.prizeValue) : '0',
        })
        setSpinning(false)
        setStopFlash(true)
        setTimeout(() => setStopFlash(false), 900)
        // Brief delay so the user sees the wheel land before the modal appears
        setTimeout(() => setShowResult(true), 550)
        // Await the refresh so KP/coins balances and the cooldown timestamp
        // are up-to-date by the time the modal is interactive.
        await refreshProfile()
        setTimeout(() => setRotation(REST_ROTATION), 800)
      }, 4600)
    } catch (error: any) {
      console.error('Spin failed:', error)
      setSpinning(false)
      setRotation(REST_ROTATION)
      const msg = error?.message ?? ''
      if (msg.includes('cooldown')) alert('Free spin not available yet!')
      else if (msg.includes('insufficient')) alert('Not enough coins!')
      else alert(`Spin failed: ${msg || 'unknown error'}`)
    }
  }

  const handleFreeSpin = () => {
    if (!freeSpinAvailable || spinning || disabled) return
    executeSpin()
  }

  const handleClaim = async () => {
    if (!result || !userId || claiming || isPending || isConfirming) return

    try {
      setClaiming(true)

      const isBnb = isBNBPrize(result.prizeType) || result.prizeType === -1
      if (isBnb && pendingSpinId) {
        const ticket = await claimWheelBnbPrize(pendingSpinId)
        setCurrentTxHash(undefined)
        writeContract({
          address: treasuryAddress,
          abi: treasuryABI,
          functionName: 'claimPrize',
          args: [
            BigInt(ticket.amount),
            BigInt(ticket.nonce),
            BigInt(ticket.deadline),
            ticket.signature as `0x${string}`,
          ],
        })
      } else {
        setResult(null)
        setShowResult(false)
        setClaiming(false)
        setPendingSpinId(null)
        await refreshProfile()
        onSpinComplete?.()
      }
    } catch (error) {
      console.error('Claim failed:', error)
      setClaiming(false)
      setCurrentTxHash(undefined)
      alert('Claim failed. Please try again.')
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  }

  const isBNBReward = result && isBNBPrize(result.prizeType)
  const isWinner = !!result && (result.kp > 0 || result.coins > 0 || result.bnb !== '0')

  // SVG wheel helpers
  const sliceCount = WHEEL_PRIZES.length
  const sliceAngle = 360 / sliceCount
  const radius = 168
  const center = 200

  // Palette tuned for higher contrast and a richer casino feel
  const sliceColors = [
    ['#4338CA', '#1E1B4B'], // indigo deep
    ['#F59E0B', '#B45309'], // gold
    ['#8B5CF6', '#5B21B6'], // violet
    ['#10B981', '#065F46'], // emerald
    ['#EC4899', '#9D174D'], // pink
    ['#06B6D4', '#155E75'], // cyan
    ['#A855F7', '#6B21A8'], // purple
    ['#F97316', '#9A3412'], // orange
  ]

  const getSlicePath = (index: number) => {
    const startAngle = (index * sliceAngle - 90) * (Math.PI / 180)
    const endAngle = ((index + 1) * sliceAngle - 90) * (Math.PI / 180)
    const x1 = center + radius * Math.cos(startAngle)
    const y1 = center + radius * Math.sin(startAngle)
    const x2 = center + radius * Math.cos(endAngle)
    const y2 = center + radius * Math.sin(endAngle)
    return `M${center},${center} L${x1},${y1} A${radius},${radius} 0 0,1 ${x2},${y2} Z`
  }

  const getLabelPosition = (index: number) => {
    const midAngleDeg = (index + 0.5) * sliceAngle
    const midAngle = (midAngleDeg - 90) * (Math.PI / 180)
    const labelRadius = radius * 0.62
    const isBottom = midAngleDeg > 90 && midAngleDeg < 270
    return {
      x: center + labelRadius * Math.cos(midAngle),
      y: center + labelRadius * Math.sin(midAngle),
      rotation: isBottom ? midAngleDeg + 180 : midAngleDeg,
    }
  }

  const getIconPosition = (index: number) => {
    const midAngleDeg = (index + 0.5) * sliceAngle
    const midAngle = (midAngleDeg - 90) * (Math.PI / 180)
    const iconRadius = radius * 0.85
    return {
      x: center + iconRadius * Math.cos(midAngle),
      y: center + iconRadius * Math.sin(midAngle),
    }
  }

  const BULB_COUNT = 28
  const getBulbPosition = (index: number) => {
    const angle = (index * (360 / BULB_COUNT) - 90) * (Math.PI / 180)
    const bulbRadius = radius + 22
    return {
      x: center + bulbRadius * Math.cos(angle),
      y: center + bulbRadius * Math.sin(angle),
    }
  }

  const prizeIcon = (prize: typeof WHEEL_PRIZES[number]) => {
    if (Number(prize.bnb) > 0) return '◆'
    if (prize.kp > 0) return '★'
    if (prize.coins > 0) return '●'
    return ''
  }

  return (
    <div className="flex flex-col items-center flex-1 relative pb-28">
      {/* Title with neon shimmer */}
      <div className="relative z-10 flex items-center gap-3 pt-5 pb-2">
        <motion.div
          animate={{ rotate: spinning ? [0, -8, 8, -4, 4, 0] : 0 }}
          transition={{ duration: 0.8, repeat: spinning ? Infinity : 0 }}
        >
          <GiKoala className="text-3xl text-violet-300" />
        </motion.div>
        <h2
          className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase"
          style={{
            background: 'linear-gradient(180deg, #F5D0FE 0%, #C4B5FD 50%, #7C3AED 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 28px rgba(139,92,246,0.55)',
            letterSpacing: '0.04em',
          }}
        >
          Lucky Wheel
        </h2>
        <motion.div
          animate={{ rotate: spinning ? [0, 8, -8, 4, -4, 0] : 0 }}
          transition={{ duration: 0.8, repeat: spinning ? Infinity : 0 }}
        >
          <GiKoala className="text-3xl text-violet-300 scale-x-[-1]" />
        </motion.div>
      </div>

      {/* Boost banner */}
      {doubleRewardsActive && (
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 mb-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
          style={{
            background: 'linear-gradient(90deg, rgba(251,146,60,0.2), rgba(245,158,11,0.2))',
            border: '1px solid rgba(251,146,60,0.5)',
            color: '#FED7AA',
            boxShadow: '0 0 18px rgba(251,146,60,0.25)',
          }}
        >
          ⚡ 2× Rewards Active
        </motion.div>
      )}

      {/* Wheel Container — 3D perspective stage */}
      <div
        className="relative z-10 flex-1 flex items-center justify-center w-full px-4"
        style={{ perspective: '1600px' }}
      >
        <div
          className="relative w-full"
          style={{
            maxWidth: 'min(460px, 92vw)',
            aspectRatio: '1',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Floor cast-shadow (3D) */}
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: '-4%',
              left: '8%',
              right: '8%',
              height: '22%',
              background:
                'radial-gradient(ellipse, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)',
              transform: 'rotateX(75deg)',
              filter: 'blur(12px)',
            }}
          />


          {/* Stop-landing flash */}
          <AnimatePresence>
            {stopFlash && (
              <motion.div
                key="flash"
                className="absolute inset-0 rounded-full pointer-events-none z-30"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: [0, 1, 0], scale: [0.95, 1.05, 1.15] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                style={{
                  background:
                    'radial-gradient(circle, rgba(252,211,77,0.55) 0%, rgba(167,139,250,0.25) 40%, transparent 70%)',
                  filter: 'blur(8px)',
                }}
              />
            )}
          </AnimatePresence>

          {/* Tilted 3D wheel stack */}
          <div
            className="absolute inset-0"
            style={{
              transform: 'rotateX(8deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Pointer / stopper at top */}
            <div
              className="absolute top-0 left-1/2 z-20"
              style={{ transform: 'translate(-50%, -22%)' }}
            >
              <motion.div
                animate={
                  spinning
                    ? { rotate: [-3, 3, -3], y: [0, -1, 0] }
                    : { rotate: 0, y: 0 }
                }
                transition={{
                  duration: 0.18,
                  repeat: spinning ? Infinity : 0,
                  ease: 'easeInOut',
                }}
                style={{ transformOrigin: '50% 80%' }}
              >
                <svg width="54" height="64" viewBox="0 0 54 64">
                  <defs>
                    <linearGradient id="ptr-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FDE68A" />
                      <stop offset="35%" stopColor="#F59E0B" />
                      <stop offset="100%" stopColor="#92400E" />
                    </linearGradient>
                    <linearGradient id="ptr-shine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="white" stopOpacity="0" />
                      <stop offset="50%" stopColor="white" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </linearGradient>
                    <filter id="ptr-shadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.55" />
                    </filter>
                  </defs>
                  {/* Body */}
                  <path
                    d="M27 4 L48 14 L42 50 L27 60 L12 50 L6 14 Z"
                    fill="url(#ptr-grad)"
                    stroke="#78350F"
                    strokeWidth="1.5"
                    filter="url(#ptr-shadow)"
                  />
                  {/* Pin tip */}
                  <path d="M22 50 L27 62 L32 50 Z" fill="#FCD34D" stroke="#78350F" strokeWidth="1" />
                  {/* Gloss strip */}
                  <path
                    d="M27 6 L42 14 L38 44 L27 52 L16 44 L12 14 Z"
                    fill="url(#ptr-shine)"
                    opacity="0.7"
                  />
                  {/* Rivet */}
                  <circle cx="27" cy="22" r="3" fill="#FEF3C7" stroke="#78350F" strokeWidth="0.8" />
                  <circle cx="27" cy="22" r="1.2" fill="#92400E" />
                </svg>
              </motion.div>
            </div>

            {/* Spinning SVG wheel */}
            <motion.div
              className="w-full h-full"
              initial={{ rotate: REST_ROTATION }}
              animate={{ rotate: rotation }}
              transition={{ duration: 4.5, ease: [0.16, 0.84, 0.2, 1] }}
            >
              <svg viewBox="0 0 400 400" className="w-full h-full">
                <defs>
                  {sliceColors.map(([c1, c2], i) => (
                    <radialGradient key={i} id={`slice-grad-${i}`} cx="50%" cy="35%" r="80%">
                      <stop offset="0%" stopColor={c1} stopOpacity="1" />
                      <stop offset="70%" stopColor={c1} />
                      <stop offset="100%" stopColor={c2} />
                    </radialGradient>
                  ))}

                  {/* Metallic outer rim — gold */}
                  <radialGradient id="rim-grad" cx="50%" cy="30%" r="75%">
                    <stop offset="0%" stopColor="#FEF3C7" />
                    <stop offset="35%" stopColor="#F59E0B" />
                    <stop offset="75%" stopColor="#92400E" />
                    <stop offset="100%" stopColor="#451A03" />
                  </radialGradient>

                  {/* Inner groove */}
                  <radialGradient id="groove-grad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1E1B4B" />
                    <stop offset="100%" stopColor="#0F0A1F" />
                  </radialGradient>

                  {/* Center hub layered metal */}
                  <radialGradient id="hub-outer" cx="50%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#FEF3C7" />
                    <stop offset="50%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#78350F" />
                  </radialGradient>
                  <radialGradient id="hub-inner" cx="50%" cy="35%" r="75%">
                    <stop offset="0%" stopColor="#312E81" />
                    <stop offset="60%" stopColor="#1E1B4B" />
                    <stop offset="100%" stopColor="#0F0A1F" />
                  </radialGradient>

                  {/* Top gloss highlight over slices */}
                  <radialGradient id="gloss" cx="50%" cy="18%" r="60%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.28" />
                    <stop offset="55%" stopColor="white" stopOpacity="0" />
                  </radialGradient>

                  {/* Bottom shading over slices */}
                  <radialGradient id="shade" cx="50%" cy="100%" r="65%">
                    <stop offset="0%" stopColor="black" stopOpacity="0.4" />
                    <stop offset="60%" stopColor="black" stopOpacity="0" />
                  </radialGradient>

                  <filter id="bulb-glow" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="3" />
                  </filter>

                  <filter id="slice-shadow">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.5" />
                  </filter>
                </defs>

                {/* Outer metallic rim */}
                <circle cx={center} cy={center} r={radius + 32} fill="url(#rim-grad)" />
                <circle
                  cx={center}
                  cy={center}
                  r={radius + 32}
                  fill="none"
                  stroke="#451A03"
                  strokeWidth="1.5"
                />
                <circle
                  cx={center}
                  cy={center}
                  r={radius + 28}
                  fill="none"
                  stroke="#FEF3C7"
                  strokeWidth="0.6"
                  opacity="0.4"
                />

                {/* Inner groove */}
                <circle cx={center} cy={center} r={radius + 14} fill="url(#groove-grad)" />
                <circle
                  cx={center}
                  cy={center}
                  r={radius + 14}
                  fill="none"
                  stroke="#312E81"
                  strokeWidth="1"
                />

                {/* Decorative bulbs with chase */}
                {Array.from({ length: BULB_COUNT }).map((_, i) => {
                  const pos = getBulbPosition(i)
                  const phase = (i + chaseStep) % 3
                  const isBright = phase === 0
                  const color = isBright ? '#FDE68A' : phase === 1 ? '#C4B5FD' : '#5B21B6'
                  return (
                    <g key={`bulb-${i}`}>
                      {isBright && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r="8"
                          fill={color}
                          opacity="0.55"
                          filter="url(#bulb-glow)"
                        />
                      )}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r="3.8"
                        fill={color}
                        opacity={isBright ? 1 : 0.55}
                        style={{ transition: 'fill 0.12s, opacity 0.12s' }}
                      />
                      <circle
                        cx={pos.x - 1}
                        cy={pos.y - 1}
                        r="1.2"
                        fill="white"
                        opacity={isBright ? 0.9 : 0.4}
                      />
                    </g>
                  )
                })}

                {/* Prize slices */}
                {WHEEL_PRIZES.map((prize, index) => (
                  <path
                    key={prize.id}
                    d={getSlicePath(index)}
                    fill={`url(#slice-grad-${index})`}
                    stroke="#0F0A1F"
                    strokeWidth="2"
                    filter="url(#slice-shadow)"
                  />
                ))}

                {/* Top gloss highlight */}
                <circle cx={center} cy={center} r={radius} fill="url(#gloss)" pointerEvents="none" />
                {/* Bottom shade */}
                <circle cx={center} cy={center} r={radius} fill="url(#shade)" pointerEvents="none" />

                {/* Divider lines (slightly metallic) */}
                {WHEEL_PRIZES.map((_, index) => {
                  const angle = (index * sliceAngle - 90) * (Math.PI / 180)
                  const x = center + radius * Math.cos(angle)
                  const y = center + radius * Math.sin(angle)
                  return (
                    <line
                      key={`div-${index}`}
                      x1={center}
                      y1={center}
                      x2={x}
                      y2={y}
                      stroke="#FCD34D"
                      strokeWidth="1.2"
                      opacity="0.55"
                    />
                  )
                })}

                {/* Small decorative icon near rim */}
                {WHEEL_PRIZES.map((prize, index) => {
                  const pos = getIconPosition(index)
                  const midAngleDeg = (index + 0.5) * sliceAngle
                  const isBottom = midAngleDeg > 90 && midAngleDeg < 270
                  return (
                    <text
                      key={`ic-${prize.id}`}
                      x={pos.x}
                      y={pos.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={`rotate(${isBottom ? midAngleDeg + 180 : midAngleDeg}, ${pos.x}, ${pos.y})`}
                      fontSize="14"
                      fill="#FDE68A"
                      opacity="0.85"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}
                    >
                      {prizeIcon(prize)}
                    </text>
                  )
                })}

                {/* Prize labels */}
                {WHEEL_PRIZES.map((prize, index) => {
                  const pos = getLabelPosition(index)
                  return (
                    <text
                      key={`label-${prize.id}`}
                      x={pos.x}
                      y={pos.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={`rotate(${pos.rotation}, ${pos.x}, ${pos.y})`}
                      className="font-extrabold"
                      fill="white"
                      fontSize={prize.label.length > 6 ? '12' : '15'}
                      style={{
                        textShadow:
                          '0 1px 3px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.4)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {prize.label === '0' ? 'NADA' : prize.label}
                    </text>
                  )
                })}

                {/* Center hub - layered for depth */}
                <circle cx={center} cy={center} r="56" fill="url(#hub-outer)" />
                <circle
                  cx={center}
                  cy={center}
                  r="56"
                  fill="none"
                  stroke="#451A03"
                  strokeWidth="1.5"
                />
                <circle cx={center} cy={center} r="48" fill="url(#hub-inner)" />
                <circle
                  cx={center}
                  cy={center}
                  r="48"
                  fill="none"
                  stroke="#A78BFA"
                  strokeWidth="0.8"
                  opacity="0.5"
                />
                <circle cx={center} cy={center} r="38" fill="#0F0A1F" opacity="0.6" />
                {/* Koala Pad logo (mirrors Sidebar.tsx svg). The wheel rests at
                    REST_ROTATION (-22.5°); counter-rotate so the logo is upright
                    when idle. */}
                <g
                  transform={`rotate(${-REST_ROTATION} ${center} ${center}) translate(${center - 30}, ${center - 30}) scale(2.5)`}
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
                >
                  <mask id="wheel-face-holes">
                    <circle cx="12" cy="13.2" r="7.2" fill="white" />
                    <circle cx="9" cy="12" r="0.96" fill="black" />
                    <circle cx="15" cy="12" r="0.96" fill="black" />
                    <ellipse cx="12" cy="15.6" rx="1.68" ry="2.64" fill="black" />
                  </mask>
                  <circle cx="6" cy="7.8" r="3.6" fill="#8B5CF6" />
                  <circle cx="18" cy="7.8" r="3.6" fill="#8B5CF6" />
                  <circle cx="12" cy="13.2" r="7.2" fill="#8B5CF6" mask="url(#wheel-face-holes)" />
                </g>
              </svg>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Spin Button — fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 bg-gradient-to-t from-gray-950/98 via-gray-950/95 to-gray-950/80 backdrop-blur-xl border-t border-violet-900/40 px-4 py-4">
        <div className="max-w-sm mx-auto">
          {/* FREE SPIN */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleFreeSpin}
            disabled={!freeSpinAvailable || spinning || disabled}
            className="relative w-full h-14 px-5 rounded-2xl font-bold text-sm uppercase tracking-wider overflow-hidden transition-all disabled:cursor-not-allowed"
            style={{
              background:
                freeSpinAvailable && !spinning && !disabled
                  ? 'linear-gradient(180deg, #10B981 0%, #047857 100%)'
                  : 'linear-gradient(180deg, #1F2937 0%, #111827 100%)',
              border:
                freeSpinAvailable && !spinning && !disabled
                  ? '1px solid #34D399'
                  : '1px solid #374151',
              color:
                freeSpinAvailable && !spinning && !disabled ? '#ECFDF5' : '#6B7280',
              boxShadow:
                freeSpinAvailable && !spinning && !disabled
                  ? '0 0 18px rgba(16,185,129,0.45), inset 0 1px 0 rgba(255,255,255,0.18)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Shine sweep */}
            {freeSpinAvailable && !spinning && !disabled && (
              <motion.div
                className="absolute inset-y-0 w-1/3"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                }}
                animate={{ x: ['-150%', '350%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <div className="relative flex flex-col items-center justify-center leading-tight">
              <span>FREE SPIN</span>
              {!freeSpinAvailable && freeSpinCooldown > 0 && (
                <span className="text-[10px] text-gray-500 font-mono tabular-nums mt-0.5">
                  {formatTime(freeSpinCooldown)}
                </span>
              )}
            </div>
          </motion.button>
        </div>
      </div>

      {/* Result Modal */}
      <AnimatePresence>
        {showResult && result && (
          <motion.div
            className="fixed inset-0 md:left-60 z-50 flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(76,29,149,0.6) 0%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.95) 100%)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {/* Confetti burst (winners only) */}
            {isWinner && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {CONFETTI.map(c => (
                  <motion.div
                    key={c.id}
                    className="absolute"
                    style={{
                      width: c.size,
                      height: c.size * 1.6,
                      backgroundColor: c.color,
                      borderRadius: '2px',
                      boxShadow: `0 0 6px ${c.color}`,
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0, rotate: 0 }}
                    animate={{
                      x: c.x,
                      y: c.y,
                      opacity: [1, 1, 0],
                      scale: 1,
                      rotate: c.rotate,
                    }}
                    transition={{
                      duration: 1.6 + Math.random() * 0.5,
                      delay: c.delay,
                      ease: [0.2, 0.7, 0.4, 1],
                    }}
                  />
                ))}
              </div>
            )}

            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="relative max-w-md w-full rounded-3xl overflow-hidden"
              style={{
                background:
                  'linear-gradient(160deg, rgba(30,27,75,0.95) 0%, rgba(15,10,31,0.98) 100%)',
                border: '1px solid rgba(167,139,250,0.4)',
                boxShadow:
                  '0 30px 80px rgba(0,0,0,0.7), 0 0 60px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              {/* Top accent bar */}
              <div
                className="h-1.5 w-full"
                style={{
                  background: isWinner
                    ? 'linear-gradient(90deg, #FCD34D, #F472B6, #A78BFA, #60A5FA, #34D399)'
                    : 'linear-gradient(90deg, #6B7280, #4B5563)',
                }}
              />

              <div className="p-7 md:p-9">
                <motion.h2
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="text-center text-3xl md:text-4xl font-extrabold mb-6 uppercase tracking-wide"
                  style={{
                    background: isWinner
                      ? 'linear-gradient(180deg, #FEF3C7 0%, #FCD34D 50%, #F59E0B 100%)'
                      : 'linear-gradient(180deg, #E5E7EB 0%, #9CA3AF 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: isWinner ? '0 0 30px rgba(252,211,77,0.5)' : 'none',
                  }}
                >
                  {isWinner ? 'You Won!' : 'So Close!'}
                </motion.h2>

                {/* Prize card */}
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.25, type: 'spring', stiffness: 180 }}
                  className="relative rounded-2xl p-6 md:p-7 mb-5 overflow-hidden"
                  style={{
                    background:
                      'radial-gradient(ellipse at top, rgba(139,92,246,0.18) 0%, rgba(30,27,75,0.5) 60%, rgba(15,10,31,0.6) 100%)',
                    border: '1px solid rgba(167,139,250,0.3)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="text-center">
                    <motion.div
                      className="text-6xl mb-4 flex justify-center"
                      animate={
                        isWinner
                          ? { scale: [1, 1.12, 1], rotate: [0, -5, 5, 0] }
                          : {}
                      }
                      transition={{ duration: 1.4, repeat: isWinner ? Infinity : 0 }}
                    >
                      {result.bnb !== '0' ? (
                        <SiBinance className="text-[#F3BA2F]" style={{ filter: 'drop-shadow(0 0 16px rgba(243,186,47,0.6))' }} />
                      ) : result.kp > 0 ? (
                        <GiKoala className="text-violet-300" style={{ filter: 'drop-shadow(0 0 16px rgba(167,139,250,0.6))' }} />
                      ) : result.coins > 0 ? (
                        <div style={{ filter: 'drop-shadow(0 0 16px rgba(252,211,77,0.6))' }}>
                          <GiTwoCoins size={56} className="text-amber-400" />
                        </div>
                      ) : (
                        <span className="opacity-60">🍃</span>
                      )}
                    </motion.div>
                    <div className="text-2xl md:text-3xl font-extrabold text-white mb-1 tracking-tight">
                      {result.bnb !== '0' && `${result.bnb} BNB`}
                      {result.kp > 0 && `${result.kp} KP`}
                      {result.coins > 0 && `${result.coins} COINS`}
                      {!isWinner && 'Better luck next time!'}
                    </div>
                  </div>
                </motion.div>

                {isBNBReward && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="rounded-xl p-3 mb-5 text-sm text-yellow-100 flex items-center gap-2"
                    style={{
                      background: 'linear-gradient(90deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06))',
                      border: '1px solid rgba(245,158,11,0.35)',
                    }}
                  >
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="flex gap-3"
                >
                  {isWinner ? (
                    <button
                      onClick={handleClaim}
                      disabled={claiming || isPending || isConfirming}
                      className="relative flex-1 font-extrabold py-3.5 px-6 rounded-2xl uppercase tracking-wider text-sm overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                      style={{
                        background: 'linear-gradient(180deg, #8B5CF6 0%, #5B21B6 100%)',
                        border: '1px solid #A78BFA',
                        color: '#F3E8FF',
                        boxShadow:
                          '0 0 24px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.18)',
                      }}
                    >
                      <motion.div
                        className="absolute inset-y-0 w-1/3"
                        style={{
                          background:
                            'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                        }}
                        animate={{ x: ['-150%', '350%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <span className="relative">
                        {claiming || isPending || isConfirming ? 'Claiming…' : 'Claim Prize'}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setResult(null)
                        setShowResult(false)
                        setPendingSpinId(null)
                      }}
                      className="flex-1 font-bold py-3.5 px-6 rounded-2xl uppercase tracking-wider text-sm transition-all"
                      style={{
                        background: 'linear-gradient(180deg, #374151 0%, #1F2937 100%)',
                        border: '1px solid #4B5563',
                        color: '#E5E7EB',
                      }}
                    >
                      Try Again
                    </button>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
