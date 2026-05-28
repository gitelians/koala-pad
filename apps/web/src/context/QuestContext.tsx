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
  getDoubleRewardsActivationTime,
  getQuestCompletionTime,
  getQuestProgress,
  isBoostActive,
  recordQuestCompletion,
  verifyXFollow,
} from '../lib/supabaseApi'
import { supabase } from '../lib/supabase'
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
      const progressWithFollow = { ...progressData, follow: followXCompletion ? 1 : 0 }
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
        // 2× Rewards boost is honoured server-side; the local flag is only
        // used for the toast copy. The edge function remains the source of
        // truth for actual KP/coin amounts.
        const doubleRewards = await isBoostActive(userId, 'double-rewards-1h')
        let eligibleForDouble = false
        if (doubleRewards) {
          const [completionTime, activationTime] = await Promise.all([
            getQuestCompletionTime(userId, quest.id),
            getDoubleRewardsActivationTime(userId),
          ])
          if (completionTime && activationTime && completionTime >= activationTime) {
            eligibleForDouble = true
          }
        }

        const multiplier = eligibleForDouble ? 2 : 1
        const kp = quest.kpReward * multiplier
        const coins = (quest.coinsReward || 0) * multiplier

        await claimQuestApi(quest.id)

        setClaimedQuests(prev => (prev.includes(quest.id) ? prev : [...prev, quest.id]))

        const rewardParts: string[] = []
        if (kp > 0) rewardParts.push(`+${kp} KP`)
        if (coins > 0) rewardParts.push(`+${coins.toLocaleString()} COINS`)
        const rewardText = rewardParts.join(' · ')
        const prefix = eligibleForDouble ? '2× Boost! Quest claimed' : 'Quest claimed'
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

  const verifyFollowX = useCallback(async () => {
    if (!userId) return { following: false, error: 'not_authed' }
    setVerifyingQuestId('follow-x')
    try {
      const res = await verifyXFollow()
      if (res.following) {
        // Optimistically promote the quest to completed; checkAll runs on the
        // 30s tick so without this the user would wait for the next poll
        // before seeing the Claim button.
        setProgress(prev => ({ ...prev, follow: 1 }))
        setCompletedQuests(prev => (prev.includes('follow-x') ? prev : [...prev, 'follow-x']))
        showToast('Follow verified — claim your reward!', 'success')
      } else if (res.error === 'x_not_linked') {
        showToast('Connect your X account first', 'error')
      } else if (res.error === 'not_following') {
        showToast('Not following yet — follow @KoalaPad89742 and try again', 'error')
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
      if (msg.includes('x_tier_insufficient')) {
        showToast(
          'Follow verification temporarily unavailable — admin is upgrading X API access',
          'error',
        )
        return { following: false, error: 'x_tier_insufficient' }
      }
      showToast('Verification failed — try again later', 'error')
      return { following: false, error: msg || 'verify_failed' }
    } finally {
      setVerifyingQuestId(null)
    }
  }, [userId, showToast])

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
