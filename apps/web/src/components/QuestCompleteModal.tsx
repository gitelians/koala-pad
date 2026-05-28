import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { GiKoala, GiTrophyCup, GiTwoCoins } from 'react-icons/gi'
import { FiX } from 'react-icons/fi'

interface QuestLike {
  id: string
  title: string
  kpReward: number
  coinsReward?: number
  category: string
  target: number
}

interface QuestCompleteModalProps {
  quest: QuestLike | null
  onClaim: () => void
  onLater: () => void
  onClose: () => void
  claiming?: boolean
}

// Simple deterministic sparkle positions so layout doesn't reshuffle every render
const SPARKLES = Array.from({ length: 14 }).map((_, i) => ({
  id: i,
  x: Math.cos((i / 14) * Math.PI * 2) * (120 + (i % 3) * 18),
  y: Math.sin((i / 14) * Math.PI * 2) * (120 + (i % 3) * 18),
  delay: (i % 7) * 0.08,
  size: 6 + (i % 4) * 2,
}))

export default function QuestCompleteModal({
  quest,
  onClaim,
  onLater,
  onClose,
  claiming = false,
}: QuestCompleteModalProps) {
  // Lock body scroll while open
  useEffect(() => {
    if (!quest) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [quest])

  const hasCoins = useMemo(() => !!quest?.coinsReward && quest.coinsReward > 0, [quest])

  return (
    <AnimatePresence>
      {quest && (
        <motion.div
          key="quest-complete-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={onClose}
        >
          {/* Radial glow behind the card */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute w-[560px] h-[560px] rounded-full blur-3xl bg-gradient-to-br from-violet-600/40 via-purple-600/30 to-fuchsia-500/20"
          />

          {/* Sparkles */}
          {SPARKLES.map((s) => (
            <motion.span
              key={s.id}
              aria-hidden
              className="pointer-events-none absolute rounded-full bg-violet-300/80 shadow-[0_0_12px_rgba(167,139,250,0.9)]"
              style={{ width: s.size, height: s.size }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0.6, 0],
                x: s.x,
                y: s.y,
                scale: [0, 1.2, 1, 0.6],
              }}
              transition={{
                duration: 1.6,
                delay: s.delay,
                repeat: Infinity,
                repeatDelay: 1.2,
                ease: 'easeOut',
              }}
            />
          ))}

          {/* Card */}
          <motion.div
            key="quest-complete-card"
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl overflow-hidden border border-violet-500/40 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 shadow-[0_0_80px_-10px_rgba(139,92,246,0.55)]"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-20 p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <FiX size={18} />
            </button>

            {/* Animated header band */}
            <div className="relative h-32 overflow-hidden">
              <motion.div
                aria-hidden
                initial={{ backgroundPosition: '0% 50%' }}
                animate={{ backgroundPosition: '200% 50%' }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(110deg, rgba(139,92,246,0.35) 0%, rgba(168,85,247,0.25) 35%, rgba(236,72,153,0.25) 65%, rgba(139,92,246,0.35) 100%)',
                  backgroundSize: '200% 100%',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-900" />

              {/* Trophy icon */}
              <motion.div
                initial={{ rotate: -20, scale: 0, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.15 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 blur-2xl bg-violet-400/60 rounded-full"
                  />
                  <GiTrophyCup className="relative text-yellow-300 drop-shadow-[0_0_18px_rgba(253,224,71,0.8)]" size={72} />
                </div>
              </motion.div>
            </div>

            {/* Body */}
            <div className="relative px-6 pt-2 pb-6 text-center">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400 mb-1"
              >
                Quest Complete
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-lg md:text-xl font-extrabold leading-snug bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent drop-shadow"
              >
                Congrats! You completed{' '}
                <span className="whitespace-nowrap">{quest.title}</span> quest.
              </motion.h2>

              {/* Rewards */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="mt-5 flex items-stretch justify-center gap-3"
              >
                <div className="flex-1 max-w-[140px] rounded-2xl border border-violet-500/30 bg-violet-500/10 px-3 py-3 flex flex-col items-center gap-1">
                  <GiKoala className="text-violet-300" size={22} />
                  <div className="text-xl font-extrabold text-white leading-none">
                    +{quest.kpReward}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-violet-300 font-semibold">
                    KP
                  </div>
                </div>
                {hasCoins && (
                  <div className="flex-1 max-w-[140px] rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-3 flex flex-col items-center gap-1">
                    <GiTwoCoins size={22} className="text-amber-400" />
                    <div className="text-xl font-extrabold text-white leading-none">
                      +{quest.coinsReward}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
                      Coins
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="mt-6 space-y-2"
              >
                <motion.button
                  whileHover={{ scale: claiming ? 1 : 1.02 }}
                  whileTap={{ scale: claiming ? 1 : 0.97 }}
                  disabled={claiming}
                  onClick={onClaim}
                  className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-900/40 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {claiming ? 'Claiming…' : 'Claim Rewards'}
                </motion.button>
                <button
                  disabled={claiming}
                  onClick={onLater}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Later
                </button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
