import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GiKoala } from 'react-icons/gi'
import { Lock, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  LEVEL_TIERS,
  MAX_LEVEL,
  getLevelTier,
  kpRequiredForLevel,
  levelFromKp,
  levelProgress,
} from '../utils/gamification'

interface LevelsProps {
  /**
   * KP to render the widget against. When omitted the widget reads the
   * authenticated user's KP from `AuthContext` — used for the "own profile"
   * sidebar. Pass an explicit value when viewing a foreign profile so the
   * tier/progress reflect the *viewed* user, not the visitor.
   */
  kp?: number
}

/**
 * Status-only level ladder. Level rewards (BNB + coins) were retired in v2;
 * levels now exist purely as a flex. Each of the 10 tiers has a unique
 * accent color, an in-theme glyph, a koala-flavoured title, and a
 * progressively richer treatment so reaching the top feels earned.
 */
export default function Levels({ kp: kpProp }: LevelsProps = {}) {
  const { profile } = useAuth()
  const kp = kpProp ?? profile?.kp ?? 0
  // We compute the level from KP directly rather than trusting `profile.level`
  // — keeps the UI in sync with the curve even before the trigger has fired
  // on a fresh signup.
  const level = levelFromKp(kp)
  const tier = getLevelTier(level)
  const progress = levelProgress(kp)
  const nextTier = level < MAX_LEVEL ? LEVEL_TIERS[level] : null // index = level (1..10) so this is the next one

  const [ladderOpen, setLadderOpen] = useState(false)

  // Memo the tier rows so layout calcs don't redo on every keystroke.
  const rows = useMemo(
    () =>
      LEVEL_TIERS.map(t => ({
        tier: t,
        kpRequired: kpRequiredForLevel(t.level),
        achieved: level >= t.level,
        isCurrent: level === t.level,
      })),
    [level],
  )

  return (
    <div className="w-full">
      {/* Hero card — current status with progress ring.
          Doubles as the trigger that opens the status-ladder popup. */}
      <button
        type="button"
        onClick={() => setLadderOpen(true)}
        aria-label="Open status ladder"
        className="relative overflow-hidden rounded-2xl border p-5 w-full text-left transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent cursor-pointer"
        style={{
          borderColor: `${tier.accent}55`,
          background: `linear-gradient(135deg, ${tier.accent}22 0%, rgba(15,15,25,0.8) 65%)`,
        }}
      >
        {/* Soft glow */}
        <div
          className="absolute inset-0 pointer-events-none mix-blend-screen opacity-50"
          style={{
            background: `radial-gradient(120% 80% at 100% 0%, ${tier.accentSoft}30, transparent 60%)`,
          }}
        />

        <div className="relative">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${tier.accent}, ${tier.accentSoft})`,
                  boxShadow: `0 0 24px ${tier.accent}55`,
                }}
              >
                <span>{tier.glyph}</span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-semibold mb-0.5">
                  {tier.title}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-white leading-none">
                    Lv {tier.level}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">/ {MAX_LEVEL}</span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                {kp.toLocaleString()}
                <GiKoala className="text-base" style={{ color: tier.accent }} />
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Koala Points</div>
            </div>
          </div>

          {/* Progress to next tier */}
          {nextTier ? (
            <>
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="text-gray-400">
                  Next: <span className="text-gray-200 font-semibold">{nextTier.title}</span>
                </span>
                <span className="font-mono" style={{ color: tier.accent }}>
                  {progress.current.toLocaleString()} / {progress.target.toLocaleString()} KP
                </span>
              </div>
              <div className="relative h-2.5 bg-gray-900/80 rounded-full overflow-hidden border border-gray-800">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(progress.ratio * 100, 1.5)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${tier.accent}, ${nextTier.accent})`,
                    boxShadow: `0 0 12px ${tier.accent}aa`,
                  }}
                />
              </div>
            </>
          ) : (
            <div className="text-center text-[11px] py-1 rounded-lg" style={{ color: tier.accent }}>
              👑 Max tier reached — you're a Koala King.
            </div>
          )}
        </div>
      </button>

      <LadderModal
        open={ladderOpen}
        onClose={() => setLadderOpen(false)}
        rows={rows}
      />
    </div>
  )
}

interface LadderModalProps {
  open: boolean
  onClose: () => void
  rows: Array<{
    tier: typeof LEVEL_TIERS[number]
    kpRequired: number
    achieved: boolean
    isCurrent: boolean
  }>
}

function LadderModal({ open, onClose, rows }: LadderModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-gray-100">Status ladder</h3>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">
                  10 tiers · status only
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-4 space-y-2.5">
              {rows.map(({ tier: t, kpRequired, achieved, isCurrent }) => (
                <TierRow
                  key={t.level}
                  tier={t}
                  kpRequired={kpRequired}
                  achieved={achieved}
                  isCurrent={isCurrent}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface TierRowProps {
  tier: typeof LEVEL_TIERS[number]
  kpRequired: number
  achieved: boolean
  isCurrent: boolean
}

function TierRow({ tier, kpRequired, achieved, isCurrent }: TierRowProps) {
  return (
    <motion.div
      whileHover={{ scale: achieved ? 1.01 : 1 }}
      className="relative rounded-xl p-3 transition-colors border flex items-center gap-3"
      style={{
        borderColor: isCurrent
          ? tier.accent
          : achieved
            ? `${tier.accent}55`
            : 'rgb(31, 41, 55)', // gray-800
        background: isCurrent
          ? `linear-gradient(120deg, ${tier.accent}20, rgba(17,17,27,0.85))`
          : achieved
            ? `linear-gradient(120deg, ${tier.accent}12, rgba(15,15,23,0.7))`
            : 'rgba(17, 17, 27, 0.4)',
        boxShadow: isCurrent ? `0 0 18px ${tier.accent}55` : 'none',
      }}
    >
      {/* Side accent stripe */}
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r"
        style={{ background: achieved ? tier.accent : '#374151' }}
      />

      {/* Glyph badge */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{
          background: achieved
            ? `linear-gradient(135deg, ${tier.accent}, ${tier.accentSoft})`
            : 'rgba(31, 41, 55, 0.8)',
          boxShadow: achieved ? `0 0 12px ${tier.accent}55` : 'none',
          filter: achieved ? 'none' : 'grayscale(1) opacity(0.6)',
        }}
      >
        <span>{tier.glyph}</span>
      </div>

      {/* Title + KP requirement */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-sm font-semibold ${achieved ? 'text-white' : 'text-gray-500'}`}
          >
            {tier.title}
          </span>
          <span
            className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-full"
            style={{
              color: achieved ? tier.accent : '#6b7280',
              border: `1px solid ${achieved ? `${tier.accent}55` : '#374151'}`,
              background: achieved ? `${tier.accent}11` : 'transparent',
            }}
          >
            Lv {tier.level}
          </span>
          {isCurrent && (
            <span
              className="text-[9px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded-full text-white"
              style={{ background: tier.accent }}
            >
              You
            </span>
          )}
        </div>
        <div className={`text-[11px] mt-0.5 truncate ${achieved ? 'text-gray-300/70' : 'text-gray-500/70'}`}>
          {tier.blurb}
        </div>
      </div>

      {/* KP target / lock */}
      <div className="text-right shrink-0">
        {achieved ? (
          <div className="flex items-center gap-1 text-[11px]" style={{ color: tier.accent }}>
            <span className="font-bold">✓ Reached</span>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1 text-gray-500">
            <Lock size={10} />
          </div>
        )}
        <div className="text-[10px] text-gray-500 font-mono tabular-nums">
          {kpRequired.toLocaleString()} KP
        </div>
      </div>
    </motion.div>
  )
}
