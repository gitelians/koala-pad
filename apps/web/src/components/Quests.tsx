import { useEffect, useRef, useState } from 'react'
import { GiKoala, GiTwoCoins } from 'react-icons/gi'
import { FiLock, FiCheckCircle, FiLoader } from 'react-icons/fi'
import { useQuests } from '../context/QuestContext'
import { useAuth } from '../context/AuthContext'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../data/quests'

interface QuestsProps {
  onStatsChange?: (completed: number, total: number, claimable: number) => void
}

export default function Quests({ onStatsChange }: QuestsProps = {}) {
  const {
    quests,
    completedQuests,
    claimedQuests,
    progress,
    claimQuest,
    claimingQuestId,
    verifyFollowX,
    verifyingQuestId,
  } = useQuests()
  const { profile } = useAuth()
  const xLinked = !!profile?.x_username
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showFadeBottom, setShowFadeBottom] = useState(true)
  const [showFadeTop, setShowFadeTop] = useState(false)

  const scrollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      setShowFadeBottom(scrollHeight - scrollTop - clientHeight > 5)
      setShowFadeTop(scrollTop > 5)
      scrollRef.current.classList.add('is-scrolling')
      if (scrollingTimer.current) clearTimeout(scrollingTimer.current)
      scrollingTimer.current = setTimeout(() => {
        scrollRef.current?.classList.remove('is-scrolling')
      }, 800)
    }
  }

  const claimableCount = completedQuests.filter(id => !claimedQuests.includes(id)).length

  // Notify parent of stats changes
  useEffect(() => {
    if (!onStatsChange) return
    onStatsChange(completedQuests.length, quests.length, claimableCount)
  }, [completedQuests, claimedQuests, quests.length, onStatsChange, claimableCount])

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Progress</span>
          {quests.length > 0 && (
            <span className="text-[11px] font-mono font-semibold text-gray-300 bg-gray-800 px-2 py-0.5 rounded-full">
              {completedQuests.length}/{quests.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {claimableCount > 0 ? (
            <>
              <span className="text-[11px] font-semibold text-blue-300">
                {claimableCount} ready to claim
              </span>
              <span className="w-4 h-4 flex items-center justify-center bg-blue-600 text-white text-[9px] font-black rounded-full shadow shadow-blue-900/40 animate-pulse">
                {claimableCount}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-gray-500">Nothing to claim</span>
          )}
        </div>
      </div>
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`h-[500px] md:h-[700px] overflow-y-auto scrollbar-hide ${
            showFadeTop && showFadeBottom
              ? 'mask-fade-both'
              : showFadeTop
              ? 'mask-fade-top'
              : showFadeBottom
              ? 'mask-fade-bottom'
              : 'mask-none'
          }`}
        >
          {CATEGORY_ORDER.map((category) => {
            const categoryQuests = quests.filter(q => q.category === category)
            if (categoryQuests.length === 0) return null
            return (
              <div key={category} className="mb-5">
                <div className="flex items-center top-0 z-10 pb-2 mb-2 border-b border-gray-800/80 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  {CATEGORY_LABELS[category] ?? category}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categoryQuests.map((quest) => {
                    const isCompleted = completedQuests.includes(quest.id)
                    const isClaimed = claimedQuests.includes(quest.id)
                    const canClaim = isCompleted && !isClaimed
                    const current = progress[quest.category] ?? 0
                    const clamped = Math.min(current, quest.target)
                    const percent = Math.round((clamped / quest.target) * 100)
                    const isClaiming = claimingQuestId === quest.id
                    return (
                      <div
                        key={quest.id}
                        className={`flex flex-col gap-2 p-3 border rounded-lg bg-gray-900/50 transition-colors ${
                          isClaimed
                            ? 'border-emerald-800/40'
                            : canClaim
                            ? 'border-blue-500/40'
                            : 'border-gray-800 hover:border-gray-700'
                        }`}
                      >
                        {/* Header: title + status */}
                        <div className="flex items-start justify-between gap-2 min-h-[36px]">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-gray-100 text-xs truncate">{quest.title}</h4>
                            <p className="text-[11px] text-gray-400 leading-tight line-clamp-2">{quest.description}</p>
                          </div>
                          {isClaimed ? (
                            <FiCheckCircle className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                          ) : !canClaim ? (
                            <FiLock className="text-gray-600 shrink-0 mt-0.5" size={12} />
                          ) : null}
                        </div>

                        {/* Rewards */}
                        <div className="flex gap-2.5 text-[11px] font-mono font-medium">
                          <span className="flex items-center gap-1 text-purple-400">
                            <GiKoala />
                            +{quest.kpReward}
                          </span>
                          {quest.coinsReward && quest.coinsReward > 0 && (
                            <span className="flex items-center gap-1 text-amber-400">
                              <GiTwoCoins size={12} />
                              +{quest.coinsReward}
                            </span>
                          )}
                        </div>

                        {/* Progress */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isClaimed
                                  ? 'bg-emerald-500'
                                  : percent >= 100
                                  ? 'bg-blue-500'
                                  : 'bg-blue-500/60'
                              }`}
                              style={{ width: `${isClaimed ? 100 : percent}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 whitespace-nowrap font-mono">
                            {isClaimed ? quest.target : Math.floor(clamped)}/{quest.target}
                          </span>
                        </div>

                        {/* Action */}
                        {canClaim ? (
                          <button
                            onClick={() => claimQuest(quest)}
                            disabled={isClaiming}
                            className="w-full py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 active:scale-95 transition-all shadow-sm shadow-blue-900/30 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isClaiming ? 'Claiming…' : 'Claim'}
                          </button>
                        ) : isClaimed ? (
                          <div className="w-full py-1.5 text-center text-[11px] font-semibold text-emerald-500/70 uppercase tracking-wider">
                            Claimed
                          </div>
                        ) : quest.id === 'follow-x' ? (
                          // X Explorer: one Verify button opens @KoalaPad89742's
                          // profile and runs a hidden dwell timer (spinner only)
                          // before marking the quest complete. Disabled until
                          // the user has linked their X account.
                          <button
                            onClick={() => verifyFollowX()}
                            disabled={!xLinked || verifyingQuestId === 'follow-x'}
                            title={xLinked ? 'Open @KoalaPad89742 and verify' : 'Connect your X account first'}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {verifyingQuestId === 'follow-x' ? (
                              <FiLoader size={13} className="animate-spin" />
                            ) : (
                              'Verify'
                            )}
                          </button>
                        ) : (
                          <div className="w-full py-1.5 text-center text-[10px] text-gray-600 font-mono">
                            {Math.round(percent)}%
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
