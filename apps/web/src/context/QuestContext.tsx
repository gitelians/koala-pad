import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { useAuth } from './AuthContext'
import { QUESTS, Quest } from '../data/quests'
import { TOKEN_ABI } from '../constants/abis'
import {
  checkQuestCompletion,
  claimQuest as claimQuestApi,
  getAllTokens,
  getClaimedQuests,
  getQuestProgress,
  recordQuestCompletion,
  verifyXFollow,
} from '../lib/supabaseApi'
import { supabase } from '../lib/supabase'

// Official KoalaPad X profile + the dwell time the user must spend before the
// X Explorer quest is marked complete (honor-system; the paid X follow-lookup
// API is intentionally avoided).
const KOALAPAD_X_URL = 'https://x.com/KoalaPad89742'
const X_FOLLOW_DWELL_MS = 30_000
import QuestCompleteModal from '../components/QuestCompleteModal'
import Toast, { ToastState, showToastFor } from '../components/Toast'

interface QuestContextValue {
  quests: Quest[]
  completedQuests: string[]
  claimedQuests: string[]
  progress: Record<string, number>
  loading: boolean
  claimQuest: (quest: Quest) => Promise<void>
  claimingQuestId: string | null
  /** Triggers a server-side X follow check for the `follow-x` quest. Returns
   *  the verification status so the caller can surface success/failure copy. */
  verifyFollowX: () => Promise<{ following: boolean; error?: string }>
  verifyingQuestId: string | null
}

const QuestContext = createContext<QuestContextValue | null>(null)

export const useQuests = () => {
  const ctx = useContext(QuestContext)
  if (!ctx) throw new Error('useQuests must be used within a QuestProvider')
  return ctx
}

const celebrationKey = (userId: string, questId: string) => `quest_celebrated:${userId}:${questId}`

const hasBeenCelebrated = (userId: string, questId: string) => {
  try {
    return localStorage.getItem(celebrationKey(userId, questId)) === '1'
  } catch {
    return false
  }
}

const markCelebrated = (userId: string, questId: string) => {
  try {
    localStorage.setItem(celebrationKey(userId, questId), '1')
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function QuestProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth()
  const { address } = useAccount()

  const [completedQuests, setCompletedQuests] = useState<string[]>([])
  const [claimedQuests, setClaimedQuests] = useState<string[]>([])
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [allTokens, setAllTokens] = useState<any[]>([])

  const [celebrateQuest, setCelebrateQuest] = useState<Quest | null>(null)
  const [claimingFromModal, setClaimingFromModal] = useState(false)
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null)
  const [verifyingQuestId, setVerifyingQuestId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback(
    (message: string, type: ToastState['type']) => showToastFor(setToast, message, type),
    [],
  )

  // Fetch all tokens once for the on-chain hold quest tracking
  useEffect(() => {
    if (!userId) return
    getAllTokens().then(setAllTokens).catch(() => {})
  }, [userId])

  const balanceContracts = useMemo(() => {
    if (!address || allTokens.length === 0) return []
    return allTokens.map(t => ({
      address: t.token_address as `0x${string}`,
      abi: TOKEN_ABI,
      functionName: 'balanceOf' as const,
      args: [address],
    }))
  }, [address, allTokens])

  const { data: onChainBalances } = useReadContracts({ contracts: balanceContracts })

  const heldTokenCount = useMemo(() => {
    if (!onChainBalances) return 0
    return onChainBalances.filter(b => {
      const v = b?.result as bigint | undefined
      return typeof v === 'bigint' && v > 0n
    }).length
  }, [onChainBalances])

  // Poll quest completion / progress whenever userId changes, and on a slow
  // interval so the celebration modal can pop globally not long after the
  // user finishes a quest (e.g. spinning the wheel on /lucky-wheel).
  const checkAll = useCallback(async () => {
    if (!userId) return
    try {
      // follow-x progress doesn't roll up through getQuestProgress (which only
      // covers self-attestable counters). It's driven by a quest_completions
      // row written by the verify-x-follow edge function, so we read it
      // separately and stitch it into the progress map.
      const [claimed, progressData, followXCompletion] = await Promise.all([
        getClaimedQuests(userId),
        getQuestProgress(userId),
        supabase
          .from('quest_completions')
          .select('quest_id')
          .eq('user_id', userId)
          .eq('quest_id', 'follow-x')
          .maybeSingle()
          .then(r => !!r.data),
      ])
      setClaimedQuests(claimed)
      // 'social' is the follow-x quest's category — the key Quests.tsx reads
      // for its progress bar.
      const progressWithFollow = { ...progressData, social: followXCompletion ? 1 : 0 }
      setProgress(progressWithFollow)

      const completed: string[] = [...claimed]
      for (const quest of QUESTS) {
        if (claimed.includes(quest.id)) continue
        if (quest.category === 'hold') continue // resolved client-side from on-chain balances
        if (quest.id === 'follow-x') {
          if (followXCompletion) completed.push(quest.id)
          continue
        }
        try {
          const isCompleted = await checkQuestCompletion(userId, quest.id)
          if (isCompleted) {
            completed.push(quest.id)
            await recordQuestCompletion(userId, quest.id).catch(() => {})
          }
        } catch {
          // verifier-gated quests stay incomplete until the verifier passes
        }
      }
      setCompletedQuests(completed)
    } catch (err) {
      console.error('Failed to check quests:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setCompletedQuests([])
      setClaimedQuests([])
      setProgress({})
      setLoading(true)
      return
    }
    setLoading(true)
    checkAll()
    const interval = setInterval(checkAll, 30_000)
    return () => clearInterval(interval)
  }, [userId, checkAll])

  // Reactively update hold quests based on on-chain balances + override progress.hold
  useEffect(() => {
    setProgress(prev => {
      if (prev.hold === heldTokenCount) return prev
      return { ...prev, hold: heldTokenCount }
    })

    const holdQuests = QUESTS.filter(q => q.category === 'hold')
    setCompletedQuests(prev => {
      const set = new Set(prev)
      let changed = false
      for (const q of holdQuests) {
        const isDone = heldTokenCount >= q.target
        if (isDone && !set.has(q.id)) {
          set.add(q.id)
          changed = true
          if (userId) recordQuestCompletion(userId, q.id).catch(() => {})
        } else if (!isDone && set.has(q.id) && !claimedQuests.includes(q.id)) {
          set.delete(q.id)
          changed = true
        }
      }
      return changed ? Array.from(set) : prev
    })
  }, [heldTokenCount, userId, claimedQuests])

  // Celebrate newly-completed quests — pop the global modal once per quest, ever.
  const prevCompletedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!userId) return
    const prev = prevCompletedRef.current
    const claimedSet = new Set(claimedQuests)
    for (const id of completedQuests) {
      if (prev.has(id)) continue
      if (claimedSet.has(id)) continue
      if (hasBeenCelebrated(userId, id)) continue
      const quest = QUESTS.find(q => q.id === id)
      if (!quest) continue
      // Queue one at a time — only show if no modal currently open
      setCelebrateQuest(curr => curr ?? quest)
    }
    prevCompletedRef.current = new Set(completedQuests)
  }, [completedQuests, claimedQuests, userId])

  const claimQuest = useCallback(
    async (quest: Quest) => {
      if (!userId) return
      const fromModal = celebrateQuest?.id === quest.id
      if (fromModal) setClaimingFromModal(true)
      setClaimingQuestId(quest.id)

      try {
        // The server is the single source of truth for reward amounts AND the
        // 2× boost multiplier: claim_quest returns exactly what it credited,
        // so the toast can never disagree with the ledger. We fall back to the
        // catalog values only if the response is somehow missing them.
        const result: any = await claimQuestApi(quest.id)
        const kp = Number(result?.kp ?? quest.kpReward)
        const coins = Number(result?.coins ?? quest.coinsReward ?? 0)
        const doubled = !!result?.doubled

        setClaimedQuests(prev => (prev.includes(quest.id) ? prev : [...prev, quest.id]))

        const rewardParts: string[] = []
        if (kp > 0) rewardParts.push(`+${kp} KP`)
        if (coins > 0) rewardParts.push(`+${coins.toLocaleString()} COINS`)
        const rewardText = rewardParts.join(' · ')
        const prefix = doubled ? '2× Boost! Quest claimed' : 'Quest claimed'
        showToast(rewardText ? `${prefix} — ${rewardText}` : `${prefix}!`, 'success')

        // Once claimed, the modal should close (and never reappear for that quest)
        markCelebrated(userId, quest.id)
        setCelebrateQuest(curr => (curr && curr.id === quest.id ? null : curr))
      } catch (err) {
        console.error('Failed to claim quest:', err)
        showToast('Failed to claim quest.', 'error')
      } finally {
        if (fromModal) setClaimingFromModal(false)
        setClaimingQuestId(null)
      }
    },
    [userId, celebrateQuest, showToast],
  )

  // X Explorer verification (honor-system): open @KoalaPad89742's profile,
  // wait out a hidden dwell timer (the spinner is the only visible signal),
  // then record completion. The user must have linked their X account first.
  const verifyFollowX = useCallback(async () => {
    if (!userId || verifyingQuestId) return { following: false, error: 'busy' }
    // window.open must run inside the click gesture or popup blockers fire —
    // verifyFollowX is invoked directly from the button's onClick and this is
    // the first statement before any await, so we're still in the gesture.
    try {
      window.open(KOALAPAD_X_URL, '_blank', 'noopener,noreferrer')
    } catch {
      /* ignore — the dwell + record still proceeds */
    }
    setVerifyingQuestId('follow-x')
    try {
      // Hidden countdown — no number shown, the spinner conveys progress.
      await new Promise(resolve => setTimeout(resolve, X_FOLLOW_DWELL_MS))
      const res = await verifyXFollow()
      if (res.following) {
        // Promote to completed immediately so the Claim button appears without
        // waiting for the next checkAll poll. 'social' is the quest category,
        // which is the key Quests.tsx reads for the progress bar.
        setProgress(prev => ({ ...prev, social: 1 }))
        setCompletedQuests(prev => (prev.includes('follow-x') ? prev : [...prev, 'follow-x']))
        showToast('X Explorer complete — claim your reward!', 'success')
      } else if (res.error === 'x_not_linked') {
        showToast('Connect your X account first', 'error')
      } else {
        showToast('Verification failed — try again later', 'error')
      }
      return res
    } catch (err: any) {
      console.error('verifyFollowX failed:', err)
      const msg = String(err?.message || '')
      if (msg.includes('x_not_linked')) {
        showToast('Connect your X account first', 'error')
        return { following: false, error: 'x_not_linked' }
      }
      showToast('Verification failed — try again later', 'error')
      return { following: false, error: msg || 'verify_failed' }
    } finally {
      setVerifyingQuestId(null)
    }
  }, [userId, verifyingQuestId, showToast])

  const handleModalLater = useCallback(() => {
    if (!celebrateQuest || !userId || claimingFromModal) return
    markCelebrated(userId, celebrateQuest.id)
    setCelebrateQuest(null)
  }, [celebrateQuest, userId, claimingFromModal])

  const value = useMemo<QuestContextValue>(
    () => ({
      quests: QUESTS,
      completedQuests,
      claimedQuests,
      progress,
      loading,
      claimQuest,
      claimingQuestId,
      verifyFollowX,
      verifyingQuestId,
    }),
    [
      completedQuests,
      claimedQuests,
      progress,
      loading,
      claimQuest,
      claimingQuestId,
      verifyFollowX,
      verifyingQuestId,
    ],
  )

  return (
    <QuestContext.Provider value={value}>
      {children}
      <QuestCompleteModal
        quest={celebrateQuest}
        claiming={claimingFromModal}
        onClaim={() => { if (celebrateQuest) claimQuest(celebrateQuest) }}
        onLater={handleModalLater}
        onClose={handleModalLater}
      />
      <Toast toast={toast} />
    </QuestContext.Provider>
  )
}
