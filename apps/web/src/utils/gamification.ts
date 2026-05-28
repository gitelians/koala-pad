// GAMIFICATION UTILITY FUNCTIONS
// Constants, interfaces, and wheel prize data used across the app.
// All Supabase queries are in lib/supabaseApi.ts — this file only holds
// shared data structures and pure helper functions.

export interface UserStats {
  kp: number
  coins: number
  level: number
}

// ========================================
// LEVELS (status-only, 10 tiers)
//
// The on-chain LevelRewards contract and `claimed_levels` table were
// retired — levels exist purely as a status flex now. Tier names are the
// single source of truth; both the Levels widget and the Leaderboard read
// from this module so the strings can't drift.
//
// KP curve: kpRequired(L) = (L - 1)^3 * 1000   for L = 1..10
// (matches the cubic curve enforced by sync_user_level() in SQL).
// ========================================

export const MAX_LEVEL = 10
export const KP_CURVE_COEFFICIENT = 1000

export interface LevelTier {
  level: number
  title: string
  /** Short tagline shown under the title in the Levels widget. */
  blurb: string
  /** Solid hex color used as the tier's accent. */
  accent: string
  /** Secondary hex color for gradients/glow. */
  accentSoft: string
  /** Emoji glyph chosen to match the koala-progression theme. */
  glyph: string
}

export const LEVEL_TIERS: LevelTier[] = [
  { level: 1,  title: 'Joey',              blurb: 'Just out of the pouch.',              accent: '#94a3b8', accentSoft: '#cbd5e1', glyph: '🐾' },
  { level: 2,  title: 'Sapling Scout',     blurb: 'First climb up the trunk.',           accent: '#34d399', accentSoft: '#6ee7b7', glyph: '🌱' },
  { level: 3,  title: 'Branch Climber',    blurb: 'Knows the lower canopy.',             accent: '#22d3ee', accentSoft: '#67e8f9', glyph: '🌿' },
  { level: 4,  title: 'Leaf Whisperer',    blurb: 'Picks only the best eucalyptus.',     accent: '#60a5fa', accentSoft: '#93c5fd', glyph: '🍃' },
  { level: 5,  title: 'Eucalyptus Knight', blurb: 'Defender of the grove.',              accent: '#a78bfa', accentSoft: '#c4b5fd', glyph: '🛡️' },
  { level: 6,  title: 'Canopy Captain',    blurb: 'Leads the climb up high.',            accent: '#c084fc', accentSoft: '#d8b4fe', glyph: '🧭' },
  { level: 7,  title: 'Bushland Baron',    blurb: 'Owns the trees they sit in.',         accent: '#f472b6', accentSoft: '#f9a8d4', glyph: '🏞️' },
  { level: 8,  title: 'Outback Oracle',    blurb: 'Reads the wind for alpha.',           accent: '#fb923c', accentSoft: '#fdba74', glyph: '🔮' },
  { level: 9,  title: 'Dreamtime Sage',    blurb: 'Older than the eucalyptus itself.',   accent: '#facc15', accentSoft: '#fde047', glyph: '✨' },
  { level: 10, title: 'Koala King',        blurb: 'Top of the tree. Bow accordingly.',   accent: '#f59e0b', accentSoft: '#fcd34d', glyph: '👑' },
]

/** KP required to *reach* a given level (1-indexed). Level 1 = 0. */
export const kpRequiredForLevel = (level: number): number => {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  return (clamped - 1) ** 3 * KP_CURVE_COEFFICIENT
}

/** Inverse of the curve: KP → integer level (1..MAX_LEVEL). */
export const levelFromKp = (kp: number): number => {
  const safe = Math.max(0, kp)
  const raw = Math.floor(Math.cbrt(safe / KP_CURVE_COEFFICIENT)) + 1
  return Math.max(1, Math.min(MAX_LEVEL, raw))
}

/** Convenience getter — clamps `level` into the table range. */
export const getLevelTier = (level: number | null | undefined): LevelTier => {
  const idx = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1))) - 1
  return LEVEL_TIERS[idx]
}

/** Status display string used by Leaderboard etc. — "{Title} · Lv {n}". */
export const formatLevelBadge = (level: number | null | undefined): string => {
  const tier = getLevelTier(level)
  return `${tier.title} · Lv ${tier.level}`
}

/**
 * Progress within the current level: { current, target, ratio in [0,1] }.
 * For level 10 (capped) ratio is always 1.
 */
export const levelProgress = (kp: number) => {
  const level = levelFromKp(kp)
  if (level >= MAX_LEVEL) {
    return { level, current: kp, target: kpRequiredForLevel(MAX_LEVEL), ratio: 1 }
  }
  const lower = kpRequiredForLevel(level)
  const upper = kpRequiredForLevel(level + 1)
  const span = upper - lower
  const current = Math.max(0, kp - lower)
  const ratio = span > 0 ? Math.min(1, current / span) : 0
  return { level, current, target: span, ratio }
}

// ========================================
// WHEEL PRIZES
//
// IMPORTANT: every slice must correspond to a prize the backend can roll
// (see supabase/functions/wheel-spin/index.ts PRIZE_TABLE). When the backend
// rolls a value, the frontend picks a matching slice for the visual reveal.
// Duplicates are intentional so the wheel has 8 slices for visual symmetry
// while still mirroring the 6 unique backend prizes.
// ========================================

// `isNada` flags slices that award nothing — used by the matcher so a server
// 'nada' roll lands on a NADA slice rather than falling back to slice 0.
//
// Slice 0 is NADA on purpose: combined with the half-slice rotation offset
// applied in Wheel.tsx, this places NADA directly under the stopper at rest.
export const WHEEL_PRIZES = [
  { id: 0, label: 'NADA',      kp: 0,  coins: 0,    bnb: 0,     isNada: true  },
  { id: 1, label: '1 KP',      kp: 1,  coins: 0,    bnb: 0,     isNada: false },
  { id: 2, label: '100 COINS', kp: 0,  coins: 100,  bnb: 0,     isNada: false },
  { id: 3, label: '2 KP',     kp: 2, coins: 0,    bnb: 0,     isNada: false },
  { id: 4, label: '250 COINS', kp: 0,  coins: 250,  bnb: 0,     isNada: false },
  { id: 5, label: '5 KP',     kp: 5, coins: 0,    bnb: 0,     isNada: false },
  { id: 6, label: '500 COINS', kp: 0,  coins: 500,  bnb: 0,     isNada: false },
  { id: 7, label: '0.001 BNB', kp: 0,  coins: 0,    bnb: 0.001, isNada: false },
]

/**
 * Given a server-rolled prize, return all wheel slice indexes that visually
 * match it. The caller picks one at random so repeats land on different
 * slices instead of always the first match.
 */
export const findMatchingSliceIndexes = (
  prizeType: 'kp' | 'coins' | 'bnb' | 'nada',
  prizeValue: number,
): number[] => {
  return WHEEL_PRIZES.reduce<number[]>((acc, p, i) => {
    if (prizeType === 'nada' && p.isNada) acc.push(i)
    else if (prizeType === 'bnb' && Number(p.bnb) === prizeValue) acc.push(i)
    else if (prizeType === 'coins' && p.coins === prizeValue) acc.push(i)
    else if (prizeType === 'kp' && p.kp === prizeValue) acc.push(i)
    return acc
  }, [])
}

/**
 * Check if prize is BNB reward
 */
export const isBNBPrize = (prizeId: number): boolean => {
  const prize = WHEEL_PRIZES.find(p => p.id === prizeId)
  return prize ? prize.bnb > 0 : false
}

// ========================================
// FREE SPIN COOLDOWN (24 HOURS)
// ========================================

export const FREE_SPIN_COOLDOWN = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Check if user can use free spin based on last_free_spin_at timestamp
 */
export const canUseFreeSpin = (lastFreeSpinAt: string | null): boolean => {
  if (!lastFreeSpinAt) return true // Never spun before
  const timeSinceLastSpin = Date.now() - new Date(lastFreeSpinAt).getTime()
  return timeSinceLastSpin >= FREE_SPIN_COOLDOWN
}

/**
 * Get time until next free spin (in seconds)
 */
export const getTimeUntilFreeSpin = (lastFreeSpinAt: string | null): number => {
  if (!lastFreeSpinAt) return 0
  const timeSinceLastSpin = Date.now() - new Date(lastFreeSpinAt).getTime()
  const timeRemaining = FREE_SPIN_COOLDOWN - timeSinceLastSpin
  if (timeRemaining <= 0) return 0
  return Math.ceil(timeRemaining / 1000) // Convert to seconds
}

/**
 * Map a wheel prize to its type string for the database
 */
export const getPrizeType = (prizeId: number): string => {
  const prize = WHEEL_PRIZES.find(p => p.id === prizeId)
  if (!prize) return 'zero'
  if (prize.bnb > 0) return 'bnb'
  if (prize.kp > 0) return 'kp'
  if (prize.coins > 0) return 'coins'
  return 'zero'
}

/**
 * Map a wheel prize to its numeric value for the database
 */
export const getPrizeValue = (prizeId: number): number => {
  const prize = WHEEL_PRIZES.find(p => p.id === prizeId)
  if (!prize) return 0
  if (prize.bnb > 0) return prize.bnb
  if (prize.kp > 0) return prize.kp
  if (prize.coins > 0) return prize.coins
  return 0
}
