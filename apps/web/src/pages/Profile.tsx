import { useAccount, useBalance, useReadContracts } from 'wagmi'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { formatEther, parseEther } from 'viem'
import { usePrivy } from '@privy-io/react-auth'
import { SiBinance } from 'react-icons/si'
import { GiKoala } from "react-icons/gi"
import { Clock, BadgeDollarSign, UserPlus, UserMinus } from 'lucide-react'
import { GiTwoCoins } from "react-icons/gi"
import { IoCopyOutline } from "react-icons/io5"
import { FiEdit2, FiCheck, FiX } from "react-icons/fi"
import { FaXTwitter } from "react-icons/fa6"
import { useAuth } from '../context/AuthContext'
import {
  updateUsername,
  uploadAvatar,
  getTokensByCreator,
  getUserAirdrops,
  getPendingClaimableAirdrops,
  getProfileByWallet,
  getProfileCounts,
  isFollowing as apiIsFollowing,
  followUser,
  unfollowUser,
} from '../lib/supabaseApi'
import { getBnbPrice } from '../lib/bnbPrice'
import { POOL_ABI } from '../constants/abis'
import Quests from '../components/Quests'
import Levels from '../components/Levels'
import BalancesTab from '../components/BalancesTab'
import WatchlistTab from '../components/WatchlistTab'
import CreatorRewardsChart from '../components/CreatorRewardsChart'
import CreatorRewardsClaimList from '../components/CreatorRewardsClaimList'
import Leaderboard from '../components/Leaderboard'
import FollowListModal from '../components/FollowListModal'
import Toast, { ToastState, showToastFor } from '../components/Toast'

const TOTAL_SUPPLY = parseEther('21000000')

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

export default function Profile() {
  const { address } = useAccount()
  const navigate = useNavigate()
  const { walletAddress: routeWallet } = useParams()
  const { ready, authenticated, user: privyUser, linkTwitter, unlinkTwitter } = usePrivy()
  const { userId, profile: ownProfile, refreshProfile, syncFromPrivy } = useAuth()

  // When viewing /profile/:walletAddress, load that user from Supabase.
  // If the URL wallet matches the signed-in user's wallet, fall through to
  // self view (so the canonical /profile and /profile/:self URLs render the
  // same edit-enabled experience).
  const isSelfRoute =
    !routeWallet ||
    (address && routeWallet.toLowerCase() === address.toLowerCase()) ||
    (ownProfile?.wallet_address && routeWallet.toLowerCase() === ownProfile.wallet_address.toLowerCase())

  const [viewedProfile, setViewedProfile] = useState<any>(null)
  const [viewedProfileLoading, setViewedProfileLoading] = useState(false)
  const [viewedNotFound, setViewedNotFound] = useState(false)

  useEffect(() => {
    if (isSelfRoute || !routeWallet) {
      setViewedProfile(null)
      setViewedNotFound(false)
      return
    }
    setViewedProfileLoading(true)
    setViewedNotFound(false)
    getProfileByWallet(routeWallet)
      .then(p => {
        if (!p) {
          setViewedProfile(null)
          setViewedNotFound(true)
        } else {
          setViewedProfile(p)
        }
      })
      .catch(() => setViewedNotFound(true))
      .finally(() => setViewedProfileLoading(false))
  }, [routeWallet, isSelfRoute])

  const profile = isSelfRoute ? ownProfile : viewedProfile
  const profileWallet = (isSelfRoute ? address : (viewedProfile?.wallet_address as string | undefined)) || ''
  const isOwnProfile = isSelfRoute

  const [createdTokens, setCreatedTokens] = useState<any[]>([])
  const [loadingTokens, setLoadingTokens] = useState(true)
  const [airdrops, setAirdrops] = useState<any[]>([])
  const [loadingAirdrops, setLoadingAirdrops] = useState(true)
  const { data: bnbBalance } = useBalance({
    address: (profileWallet || undefined) as `0x${string}` | undefined,
  })
  type TabKey = 'rewards' | 'quests' | 'tokens' | 'airdrops' | 'balances' | 'watchlist'
  const [activeTab, setActiveTab] = useState<TabKey>('rewards')
  // Reset to the rewards tab when navigating between profiles.
  useEffect(() => {
    setActiveTab('rewards')
  }, [isOwnProfile, profileWallet])

  // Follower stats + follow/unfollow state.
  const [counts, setCounts] = useState<{ followers: number; following: number; created_tokens: number }>({
    followers: 0,
    following: 0,
    created_tokens: 0,
  })
  const [isFollowingState, setIsFollowingState] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null)
  const [bnbPrice, setBnbPrice] = useState(600)
  const [editingUsername, setEditingUsername] = useState(false)
  const [draftUsername, setDraftUsername] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [, setQuestStats] = useState<{ completed: number; total: number; claimable: number }>({ completed: 0, total: 0, claimable: 0 })
  const usernameInputRef = useRef<HTMLInputElement>(null)

  const handleQuestStats = useCallback(
    (completed: number, total: number, claimable: number) =>
      setQuestStats({ completed, total, claimable }),
    [],
  )

  const showToast = (message: string, type: ToastState['type']) =>
    showToastFor(setToast, message, type)

  const stats = {
    kp: profile?.kp ?? 0,
    coins: profile?.coins ?? 0,
    level: profile?.level ?? 1,
  }

  const username =
    profile?.username ||
    (profileWallet ? `User${profileWallet.slice(2, 8)}` : 'User')
  const profilePic = profile?.profile_pic || ''

  // Fetch tokens created by this user (own profile uses session userId; foreign
  // profile uses the viewed user's id from the resolved profile row).
  const profileUserId = isOwnProfile ? userId : (viewedProfile?.id as string | undefined)
  useEffect(() => {
    if (!profileUserId) return
    setLoadingTokens(true)
    getTokensByCreator(profileUserId)
      .then(setCreatedTokens)
      .catch(console.error)
      .finally(() => setLoadingTokens(false))
  }, [profileUserId])

  // My Airdrop list combines two sources:
  //  • received  — rows in the `airdrops` table (share already distributed);
  //                render the amount.
  //  • pending   — eligible-but-not-yet-triggered, mirroring the
  //                ClaimableAirdropPopup detection; render a "Pending" pill.
  // A token can't be in both (pending is filtered to non-triggered), but we
  // dedupe by token_address with received taking priority just in case.
  useEffect(() => {
    if (!profileUserId && !profileWallet) {
      setAirdrops([])
      setLoadingAirdrops(false)
      return
    }
    setLoadingAirdrops(true)
    Promise.all([
      profileWallet ? getUserAirdrops(profileWallet) : Promise.resolve([]),
      profileUserId ? getPendingClaimableAirdrops(profileUserId) : Promise.resolve([]),
    ])
      .then(([received, pending]) => {
        const receivedTokens = new Set(received.map((a: any) => a.token_address))
        setAirdrops([
          ...received.map((a: any) => ({ ...a, kind: 'received' as const })),
          ...pending
            .filter((p: any) => !receivedTokens.has(p.token_address))
            .map((p: any) => ({ ...p, kind: 'pending' as const })),
        ])
      })
      .catch(console.error)
      .finally(() => setLoadingAirdrops(false))
  }, [profileUserId, profileWallet])

  // Profile counts (followers / following / created tokens).
  useEffect(() => {
    if (!profileUserId) return
    getProfileCounts(profileUserId)
      .then(setCounts)
      .catch(err => console.error('Failed to load profile counts:', err))
  }, [profileUserId])

  // Is the signed-in user following this profile?
  useEffect(() => {
    if (isOwnProfile || !userId || !profileUserId) {
      setIsFollowingState(false)
      return
    }
    apiIsFollowing(userId, profileUserId)
      .then(setIsFollowingState)
      .catch(err => console.error('Failed to check follow state:', err))
  }, [isOwnProfile, userId, profileUserId])

  const handleToggleFollow = async () => {
    if (!userId || !profileUserId || isOwnProfile || followBusy) return
    setFollowBusy(true)
    const next = !isFollowingState
    setIsFollowingState(next)
    setCounts(c => ({ ...c, followers: Math.max(0, c.followers + (next ? 1 : -1)) }))
    try {
      if (next) await followUser(userId, profileUserId)
      else await unfollowUser(userId, profileUserId)
    } catch (err) {
      console.error('Follow toggle failed:', err)
      // Roll back optimistic update.
      setIsFollowingState(!next)
      setCounts(c => ({ ...c, followers: Math.max(0, c.followers + (next ? -1 : 1)) }))
      showToast('Failed to update follow', 'error')
    } finally {
      setFollowBusy(false)
    }
  }

  // BNB price — shared cached fetcher.
  useEffect(() => {
    let cancelled = false
    getBnbPrice().then(p => { if (!cancelled) setBnbPrice(p) })
    return () => { cancelled = true }
  }, [])

  // Market caps for created tokens
  const mcContracts = useMemo(() =>
    createdTokens.map(t => ({
      address: (t.pool_address || undefined) as `0x${string}` | undefined,
      abi: POOL_ABI,
      functionName: 'getMarketCap' as const,
      args: [TOTAL_SUPPLY],
    })),
    [createdTokens],
  )
  const { data: createdTokenMCs } = useReadContracts({ contracts: mcContracts })

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingUsername) {
      usernameInputRef.current?.focus()
      usernameInputRef.current?.select()
    }
  }, [editingUsername])

  // ── X (Twitter) link state ────────────────────────────────────────────────
  // Hooks MUST live above the early returns below; otherwise React sees a
  // different hook count once auth state changes (e.g. after Privy's OAuth
  // popup closes) and throws "Rendered more hooks than during the previous
  // render".
  const [xBusy, setXBusy] = useState(false)
  const xUsername = profile?.x_username || null
  const privyTwitterSubject = (privyUser?.linkedAccounts?.find(
    (a: any) => a?.type === 'twitter_oauth' || a?.type === 'twitter',
  ) as any)?.subject as string | undefined

  // When Privy's linkedAccounts gains/loses a twitter entry we re-bridge so
  // users.x_username catches up to whatever Privy now reports.
  const lastTwitterSubjectRef = useRef<string | undefined>(privyTwitterSubject)
  useEffect(() => {
    if (!isOwnProfile || !userId) return
    if (lastTwitterSubjectRef.current === privyTwitterSubject) return
    lastTwitterSubjectRef.current = privyTwitterSubject
    syncFromPrivy().catch(err => console.error('X sync failed:', err))
  }, [privyTwitterSubject, isOwnProfile, userId, syncFromPrivy])

  // Redirect if not authenticated (wait for Privy to initialize first to avoid
  // redirecting during a page reload while auth is still rehydrating). Only
  // self-route requires auth — foreign /profile/:wallet pages are public.
  useEffect(() => {
    if (isOwnProfile && ready && !authenticated) {
      navigate('/')
    }
  }, [isOwnProfile, ready, authenticated, navigate])

  if (isOwnProfile && (!ready || !authenticated)) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 font-medium">
          {!ready ? 'Loading...' : 'Please connect your wallet'}
        </div>
      </div>
    )
  }

  if (!isOwnProfile && viewedProfileLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 font-medium">Loading profile...</div>
      </div>
    )
  }

  if (!isOwnProfile && (viewedNotFound || !viewedProfile)) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800">
        <div className="text-2xl text-gray-300 mb-2">Profile not found</div>
        <div className="text-sm text-gray-500">No user is registered for this wallet address.</div>
      </div>
    )
  }

  const startEditUsername = () => {
    setDraftUsername(username)
    setEditingUsername(true)
  }

  const cancelEditUsername = () => {
    setEditingUsername(false)
    setDraftUsername('')
  }

  const saveUsername = async () => {
    const next = draftUsername.trim()
    if (!next || next === username || !userId) {
      cancelEditUsername()
      return
    }
    setSavingUsername(true)
    try {
      await updateUsername(userId, next)
      await refreshProfile()
      showToast('Username updated', 'success')
      setEditingUsername(false)
    } catch (err) {
      console.error('Failed to update username:', err)
      showToast('Failed to update username', 'error')
    } finally {
      setSavingUsername(false)
    }
  }

  const handleProfilePicChange = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e: any) => {
      const file = e.target.files[0]
      if (file && userId) {
        try {
          await uploadAvatar(userId, file)
          await refreshProfile()
          showToast('Avatar updated', 'success')
        } catch (err) {
          console.error('Failed to upload avatar:', err)
          showToast('Failed to upload avatar', 'error')
        }
      }
    }
    input.click()
  }

  const handleCopyAddress = () => {
    if (profileWallet) {
      navigator.clipboard.writeText(profileWallet)
      showToast('Address copied', 'success')
    }
  }

  const handleConnectX = async () => {
    if (xBusy) return
    setXBusy(true)
    try {
      // linkTwitter triggers Privy's OAuth flow. The actual handle propagates
      // via the privyUser.linkedAccounts effect above once Privy finishes.
      await linkTwitter()
    } catch (err: any) {
      console.error('Failed to link X:', err)
      // Privy refuses to link an X identity that's already attached to a
      // different Privy user (one X account ↔ one Privy DID per app). Make
      // that message specific so the user knows the conflict is on Privy's
      // side, not in our DB.
      const msg = String(err?.message || err?.code || '').toLowerCase()
      if (msg.includes('already') || msg.includes('linked') || msg.includes('exists')) {
        showToast(
          'That X account is linked to another KoalaPad account. Unlink it there first.',
          'error',
        )
      } else {
        showToast('Failed to connect X', 'error')
      }
    } finally {
      setXBusy(false)
    }
  }

  const handleDisconnectX = async () => {
    if (xBusy || !privyTwitterSubject) return
    setXBusy(true)
    try {
      await unlinkTwitter(privyTwitterSubject)
      await syncFromPrivy()
      showToast('X account disconnected', 'success')
    } catch (err: any) {
      console.error('Failed to unlink X:', err)
      // Privy refuses to unlink the *only* remaining account on a user —
      // surface that case clearly so users know they need a backup login.
      const msg = String(err?.message || '')
      showToast(
        msg.toLowerCase().includes('only')
          ? 'You need another login method before unlinking X'
          : 'Failed to disconnect X',
        'error',
      )
    } finally {
      setXBusy(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <Toast toast={toast} />

      <div className="flex flex-col lg:flex-row gap-4 md:gap-6 lg:items-start">
        {/* Left column: header + tabs + content */}
        <div className="flex-1 min-w-0 lg:max-w-2xl lg:min-h-screen">

      {/* Profile header */}
      <div className="flex items-start gap-4 md:gap-5 mb-4 md:mb-6">
        {/* Avatar */}
        <div
          className={`relative group flex-shrink-0 ${isOwnProfile ? 'cursor-pointer' : ''}`}
          onClick={isOwnProfile ? handleProfilePicChange : undefined}
        >
          {profilePic ? (
            <img
              src={profilePic}
              alt="Profile"
              className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-2 border-gray-800"
            />
          ) : (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white text-xl md:text-2xl font-bold border-2 border-gray-800">
              {username[0]?.toUpperCase() || '?'}
            </div>
          )}
          {isOwnProfile && (
            <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">Change</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 h-7">
            {editingUsername ? (
              <>
                <input
                  ref={usernameInputRef}
                  type="text"
                  value={draftUsername}
                  onChange={(e) => setDraftUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveUsername()
                    if (e.key === 'Escape') cancelEditUsername()
                  }}
                  maxLength={32}
                  disabled={savingUsername}
                  className="bg-gray-900 border border-gray-700 rounded-full px-2 py-0.5 text-lg font-medium text-gray-100 outline-none focus:border-violet-500 min-w-0 max-w-[220px]"
                />
                <button
                  onClick={saveUsername}
                  disabled={savingUsername}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
                  aria-label="Save username"
                >
                  <FiCheck size={16} />
                </button>
                <button
                  onClick={cancelEditUsername}
                  disabled={savingUsername}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label="Cancel"
                >
                  <FiX size={16} />
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-medium text-gray-100 truncate">{username}</h2>
                {isOwnProfile && (
                  <button
                    onClick={startEditUsername}
                    className="text-gray-500 hover:text-violet-400 transition-colors"
                    aria-label="Edit username"
                  >
                    <FiEdit2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              onClick={handleCopyAddress}
              className="flex items-center gap-1.5 font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <span>{profileWallet ? `${profileWallet.slice(0, 6)}...${profileWallet.slice(-4)}` : '—'}</span>
              <IoCopyOutline size={12} />
            </button>

            {/* X pill — connected shows '@handle · ×', not-connected
                shows 'Connect X'. Foreign profiles only render the read-only
                badge when the user has linked X. */}
            {xUsername ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold pl-2.5 pr-1 py-1 rounded-full bg-gray-800/80 border border-gray-700 text-gray-200">
                <FaXTwitter size={11} />
                <a
                  href={`https://x.com/${xUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-violet-300 transition-colors mr-2"
                >
                  @{xUsername}
                </a>
                {isOwnProfile && privyTwitterSubject && (
                  <button
                    onClick={handleDisconnectX}
                    disabled={xBusy}
                    className="ml-0.5 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-full transition-colors disabled:opacity-50"
                    aria-label="Disconnect X"
                    title="Disconnect X"
                  >
                    <FiX size={12} />
                  </button>
                )}
              </div>
            ) : isOwnProfile ? (
              <button
                onClick={handleConnectX}
                disabled={xBusy}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-gray-800/80 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-600 transition-colors disabled:opacity-50"
              >
                <FaXTwitter size={11} />
                {xBusy ? 'Connecting…' : 'Connect X'}
              </button>
            ) : null}

            {!isOwnProfile && userId && profileUserId && (
              <button
                onClick={handleToggleFollow}
                disabled={followBusy}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-all disabled:opacity-50 ${
                  isFollowingState
                    ? 'bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700'
                    : 'bg-violet-600 text-white hover:bg-violet-700 shadow shadow-violet-900/40'
                }`}
              >
                {isFollowingState ? <UserMinus size={12} /> : <UserPlus size={12} />}
                {isFollowingState ? 'Following' : 'Follow'}
              </button>
            )}
          </div>

          {/* Followers / Following / Created tokens — clickable counts open
              modal lists. Mirrors pump.fun's profile header. */}
          <div className="flex items-center gap-5 mb-4 text-xs">
            <button
              onClick={() => profileUserId && setFollowModal('followers')}
              className="text-left hover:text-violet-400 transition-colors"
            >
              <div className="text-base font-semibold text-gray-100">{counts.followers.toLocaleString()}</div>
              <div className="text-gray-500">Followers</div>
            </button>
            <button
              onClick={() => profileUserId && setFollowModal('following')}
              className="text-left hover:text-violet-400 transition-colors"
            >
              <div className="text-base font-semibold text-gray-100">{counts.following.toLocaleString()}</div>
              <div className="text-gray-500">Following</div>
            </button>
            <button
              onClick={() => setActiveTab('tokens')}
              className="text-left hover:text-violet-400 transition-colors"
            >
              <div className="text-base font-semibold text-gray-100">{counts.created_tokens.toLocaleString()}</div>
              <div className="text-gray-500">Created tokens</div>
            </button>
          </div>

          {/* KP highlight banner */}
          <div className="w-full max-w-md mb-3 flex items-center justify-between px-4 py-2.5 rounded-full bg-violet-600/20 border border-violet-500/40 shadow-[0_0_16px_2px_rgba(139,92,246,0.25)]">
            <span className="text-xs font-semibold text-violet-300 tracking-wide uppercase">Koala Points (KP)</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">{stats.kp.toLocaleString()}</span>
              <GiKoala className="text-base text-violet-400" />
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center flex-wrap gap-3 md:gap-5">
            <div className="flex items-center gap-2">
              <GiTwoCoins size={18} className="text-amber-400" />
              <span className="text-sm font-semibold text-gray-100">{stats.coins.toLocaleString()}</span>
              <span className="text-xs text-gray-500">COINS</span>
            </div>
            <div className="flex items-center gap-2">
              <SiBinance className="text-sm text-[#F3BA2F]" />
              <span className="text-sm font-semibold text-gray-100">{parseFloat(bnbBalance?.formatted || '0').toFixed(4)}</span>
              <span className="text-xs text-gray-500">BNB</span>
            </div>
          </div>

        </div>
      </div>

          {/* Tab Headers */}
          <div className="flex items-center gap-4 md:gap-6 mb-4 md:mb-6 border-b border-gray-800 mt-8">
            <button
              onClick={() => setActiveTab('rewards')}
              className={`relative px-1 pb-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'rewards'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Creator Rewards
              {activeTab === 'rewards' && (
                <motion.div
                  layoutId="profile-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
                />
              )}
            </button>
            {isOwnProfile && (
            <button
              onClick={() => setActiveTab('quests')}
              className={`relative px-1 pb-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'quests'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Quests
              {activeTab === 'quests' && (
                <motion.div
                  layoutId="profile-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
                />
              )}
            </button>
            )}
            <button
              onClick={() => setActiveTab('tokens')}
              className={`relative px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === 'tokens'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Created Tokens
              {activeTab === 'tokens' && (
                <motion.div
                  layoutId="profile-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('airdrops')}
              className={`relative px-1 pb-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'airdrops'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              My Airdrop
              {activeTab === 'airdrops' && (
                <motion.div
                  layoutId="profile-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('balances')}
              className={`relative px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === 'balances'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Balances
              {activeTab === 'balances' && (
                <motion.div
                  layoutId="profile-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('watchlist')}
              className={`relative px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === 'watchlist'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Watchlist
              {activeTab === 'watchlist' && (
                <motion.div
                  layoutId="profile-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-violet-500"
                />
              )}
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'rewards' ? (
            profileUserId ? (
              <>
                <CreatorRewardsChart userId={profileUserId} days={30} />
                {isOwnProfile && (
                  <CreatorRewardsClaimList
                    tokens={createdTokens.map(t => ({
                      token_address: t.token_address,
                      name: t.name,
                      symbol: t.symbol,
                      image: t.image,
                      pool_address: t.pool_address,
                      ico_address: t.ico_address,
                    }))}
                    bnbPrice={bnbPrice}
                  />
                )}
              </>
            ) : (
              <div className="text-sm text-gray-500 py-8 text-center">Loading rewards...</div>
            )
          ) : activeTab === 'quests' && isOwnProfile ? (
            <Quests onStatsChange={handleQuestStats} />
          ) : activeTab === 'airdrops' ? (
            <div>
              {loadingAirdrops ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : airdrops.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">
                  {isOwnProfile
                    ? "You haven't received any airdrops yet."
                    : 'No airdrops received yet.'}
                </p>
              ) : (
                <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
                  {airdrops.map((a) => {
                    const amount = (() => {
                      try {
                        const raw = typeof a.amount === 'string' ? a.amount : String(a.amount)
                        const n = parseFloat(formatEther(BigInt(raw.split('.')[0] || '0')))
                        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
                        if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
                        return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
                      } catch {
                        return String(a.amount)
                      }
                    })()
                    return (
                      <Link
                        key={`${a.kind}-${a.id}`}
                        to={`/token/${a.token_address}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors"
                      >
                        {a.token?.image ? (
                          <img
                            src={a.token.image}
                            alt={a.token?.name || ''}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-800/40 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-100 truncate">
                            {a.token?.name || `${a.token_address.slice(0, 6)}...${a.token_address.slice(-4)}`}
                          </div>
                          <div className="text-xs text-violet-400 truncate">
                            ${a.token?.symbol || '—'}
                          </div>
                        </div>
                        <div className="text-right">
                          {a.kind === 'pending' ? (
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                              Pending
                            </span>
                          ) : (
                            <div className="text-sm font-bold text-emerald-400 whitespace-nowrap">
                              +{amount}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'balances' ? (
            <BalancesTab userAddress={(profileWallet || undefined) as `0x${string}` | undefined} bnbPrice={bnbPrice} />
          ) : activeTab === 'watchlist' ? (
            <WatchlistTab
              bnbPrice={bnbPrice}
              foreignUserId={isOwnProfile ? undefined : (profileUserId ?? undefined)}
            />
          ) : (
            <div>
              {loadingTokens ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : createdTokens.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">
                  You haven't created any tokens yet.
                </p>
              ) : (
                <div className="bg-gray-900 rounded-2xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
                  {createdTokens.map((token, i) => {
                    const phase = token.phase || 'ico'
                    const phaseBadge = phase === 'ico'
                      ? { label: 'ICO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
                      : phase === 'trading'
                        ? { label: 'Trading', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
                        : { label: 'Airdrop', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }

                    const mcRaw = createdTokenMCs?.[i]?.result as bigint | undefined
                    const mcUsd = mcRaw ? parseFloat(formatEther(mcRaw)) * bnbPrice : null
                    const timeAgo = getTimeAgo(new Date(token.created_at).getTime())

                    const mcDisplay =
                      phase === 'ico'
                        ? `R${Math.min(Math.max(Number(token.ico_current_round) || 1, 1), 10)}/10`
                        : mcUsd != null
                          ? formatCompactUsd(mcUsd)
                          : '—'

                    return (
                      <Link
                        key={token.token_address}
                        to={`/token/${token.token_address}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors"
                      >
                        {token.image ? (
                          <img
                            src={token.image}
                            alt={token.name}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600/40 to-purple-800/40 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-100 truncate">{token.name}</div>
                          <div className="text-xs text-gray-300/50 truncate">${token.symbol}</div>
                        </div>
                        {/* Token phase badge */}
                        <div className="hidden sm:flex items-center mr-8">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${phaseBadge.color}`}>
                            {phaseBadge.label}
                          </span>
                        </div>
                        {/* Time ago */}
                        <div className="hidden md:flex items-center gap-1 text-[11px] text-gray-500 w-20 justify-start">
                          <Clock size={11} />
                          <span>{timeAgo}</span>
                        </div>
                        {/* Round or market cap */}
                        <div className="text-right flex flex-col items-end gap-0.5 min-w-[40px]">
                          <div className="flex items-center justify-end gap-1 text-sm font-semibold text-gray-100 whitespace-nowrap">
                            {phase !== 'ico' && mcUsd != null && (
                              <BadgeDollarSign size={14} className="text-gray-400" />
                            )}
                            {mcDisplay}
                          </div>
                          <div className="text-[10px] text-gray-500 sm:hidden">{phaseBadge.label}</div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Public KP leaderboard — visible on every profile view */}
          <Leaderboard highlightUserId={userId ?? null} />
        </div>

        {/* Levels — right sidebar. Visible on own AND foreign profiles;
            when viewing someone else we feed their KP in so the tier and
            progress bar reflect THEM, not the visitor. */}
        <div className="lg:w-[450px] flex-shrink-0 lg:sticky lg:top-20 lg:self-start">
          <Levels kp={isOwnProfile ? undefined : (profile?.kp as number | undefined)} />
        </div>
      </div>

      <FollowListModal
        userId={followModal ? (profileUserId ?? null) : null}
        kind={followModal}
        onClose={() => setFollowModal(null)}
      />
    </div>
  )
}
