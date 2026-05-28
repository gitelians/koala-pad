import { supabase } from './supabase'

// ════════════════════════════════════════════════════════════════════════════
// Helper: invoke an edge function with a structured error
// ════════════════════════════════════════════════════════════════════════════

async function invoke<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // supabase-js wraps non-2xx responses as FunctionsHttpError with the raw
    // Response object on `.context`. The default `error.message` is the
    // unhelpful "Edge Function returned a non-2xx status code" — read the
    // response body so we surface the actual server error string.
    let serverMsg = ''
    try {
      const ctx = (error as any)?.context
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.clone().json()
        serverMsg = body?.error || body?.message || ''
      } else if (ctx && typeof ctx.text === 'function') {
        serverMsg = (await ctx.clone().text()) || ''
      } else if (ctx?.error) {
        serverMsg = ctx.error
      }
    } catch {
      /* fall through to default message */
    }
    throw new Error(serverMsg || error.message || 'Edge function error')
  }
  return data as T
}

// ════════════════════════════════════════════════════════════════════════════
// USER (read-only client; profile updates go through edge functions or RLS)
// ════════════════════════════════════════════════════════════════════════════

export const getProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export const getProfileByWallet = async (walletAddress: string) => {
  // RLS on users is restrictive (users can only SELECT their own row), so
  // foreign-profile lookups go through a SECURITY DEFINER RPC that returns
  // only safe public columns.
  const { data, error } = await supabase
    .rpc('get_public_profile', { p_wallet: walletAddress.toLowerCase() })
  if (error) throw error
  return Array.isArray(data) ? data[0] || null : data
}

export const updateUsername = async (userId: string, username: string) => {
  // Allowed via RLS users_update_self_safe_columns; trigger blocks economy cols.
  const { error } = await supabase
    .from('users')
    .update({ username })
    .eq('id', userId)
  if (error) throw error
}

export const uploadAvatar = async (userId: string, file: File) => {
  const ext = file.name.split('.').pop() || 'png'
  const path = `${userId}/avatar.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(path)

  const url = `${publicUrl}?t=${Date.now()}`
  const { error: updateError } = await supabase
    .from('users')
    .update({ profile_pic: url })
    .eq('id', userId)
  if (updateError) throw updateError
  return url
}

// ════════════════════════════════════════════════════════════════════════════
// TOKENS
// ════════════════════════════════════════════════════════════════════════════

export const insertToken = async (token: any) => {
  const { data, error } = await supabase
    .from('tokens')
    .insert(token)
    .select()
    .single()
  if (error) throw error
  return data
}

export const getTokenByAddress = async (tokenAddress: string) => {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('token_address', tokenAddress.toLowerCase())
    .maybeSingle()
  if (error) throw error
  return data
}

export const getAllTokens = async () => {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export const getTokensByCreator = async (userId: string) => {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export const getRecentTokensWithCreators = async (limit = 20) => {
  const { data, error } = await supabase
    .from('tokens')
    .select(`token_address, name, symbol, image, created_at, creator_id, creator_address`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const creatorIds = [...new Set((data || []).map((t: any) => t.creator_id).filter(Boolean))]
  let creatorsMap: Record<string, any> = {}
  if (creatorIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, username, wallet_address, profile_pic')
      .in('id', creatorIds)
    if (users) for (const u of users) creatorsMap[u.id] = u
  }
  const seen = new Set<string>()
  return (data || [])
    .filter((t: any) => (seen.has(t.token_address) ? false : (seen.add(t.token_address), true)))
    .map((t: any) => ({
      token_address: t.token_address,
      name: t.name,
      symbol: t.symbol,
      image: t.image,
      created_at: t.created_at,
      creator: creatorsMap[t.creator_id] ? [creatorsMap[t.creator_id]] : null,
    }))
}

export const uploadTokenImage = async (tokenAddress: string, file: File) => {
  const ext = file.name.split('.').pop() || 'png'
  const path = `${tokenAddress.toLowerCase()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('token-images')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage
    .from('token-images')
    .getPublicUrl(path)
  return publicUrl
}

// ════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ════════════════════════════════════════════════════════════════════════════

export const getComments = async (tokenAddress: string) => {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      *,
      user:users!comments_user_id_fkey ( wallet_address, username, profile_pic ),
      replies:comments!parent_id (
        *, user:users!comments_user_id_fkey ( wallet_address, username, profile_pic )
      )
    `)
    .eq('token_address', tokenAddress.toLowerCase())
    .is('parent_id', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const postComment = async (tokenAddress: string, userId: string, content: string, parentId?: string) => {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      token_address: tokenAddress.toLowerCase(),
      user_id: userId,
      content,
      ...(parentId ? { parent_id: parentId } : {}),
    })
    .select(`*, user:users!comments_user_id_fkey ( wallet_address, username, profile_pic )`)
    .single()
  if (error) throw error
  return data
}

export const toggleCommentLike = async (commentId: string, userId: string) => {
  const { data: existing } = await supabase
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) {
    const { error } = await supabase.from('comment_likes').delete().eq('id', existing.id)
    if (error) throw error
    return false
  } else {
    const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId })
    if (error) throw error
    return true
  }
}

export const getUserLikedComments = async (tokenAddress: string, userId: string) => {
  const { data, error } = await supabase
    .from('comment_likes')
    .select('comment_id, comments!inner(token_address)')
    .eq('user_id', userId)
    .eq('comments.token_address', tokenAddress.toLowerCase())
  if (error) throw error
  return new Set((data || []).map((d: any) => d.comment_id))
}

// ════════════════════════════════════════════════════════════════════════════
// TRADES
// ════════════════════════════════════════════════════════════════════════════

export const upsertTrade = async (trade: any) => {
  const { error } = await supabase
    .from('trades')
    .upsert(
      { ...trade, token_address: trade.token_address.toLowerCase(), pool_address: trade.pool_address.toLowerCase() },
      { onConflict: 'tx_hash' },
    )
  if (error && !error.message.includes('duplicate')) throw error
}

export const getTradesForToken = async (tokenAddress: string, limit = 50) => {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('token_address', tokenAddress.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export const get24hVolume = async (tokenAddress: string) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('trades')
    .select('usd_value')
    .eq('token_address', tokenAddress.toLowerCase())
    .gte('created_at', oneDayAgo)
  if (error) throw error
  return (data || []).reduce((sum: number, t: any) => sum + (Number(t.usd_value) || 0), 0)
}

// ════════════════════════════════════════════════════════════════════════════
// WATCHLIST — persisted per-user so foreign profiles can show it. RLS allows
// public read; writes are scoped to auth.uid() = user_id.
// ════════════════════════════════════════════════════════════════════════════

export const getWatchlistByUser = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('watchlists')
    .select('token_address')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((d: any) => d.token_address as string)
}

export const addToWatchlist = async (userId: string, tokenAddress: string) => {
  const { error } = await supabase
    .from('watchlists')
    .upsert(
      { user_id: userId, token_address: tokenAddress.toLowerCase() },
      { onConflict: 'user_id,token_address' },
    )
  if (error) throw error
}

export const removeFromWatchlist = async (userId: string, tokenAddress: string) => {
  const { error } = await supabase
    .from('watchlists')
    .delete()
    .eq('user_id', userId)
    .eq('token_address', tokenAddress.toLowerCase())
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════════════════
// QUESTS — completion is recorded via a security-definer RPC (no rewards),
// claims go through the claim-quest edge function which awards KP/coins.
// ════════════════════════════════════════════════════════════════════════════

export const getClaimedQuests = async (userId: string) => {
  const { data, error } = await supabase
    .from('claimed_quests')
    .select('quest_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data || []).map((d: any) => d.quest_id as string)
}

export const claimQuest = async (questId: string) => {
  return invoke('claim-quest', { questId })
}

/**
 * Asks the backend to verify (via the X API) that the authed user follows
 * @KoalaPad89742. On success the backend records a quest_completions row
 * for `follow-x`, after which the regular claim flow becomes available.
 */
export const verifyXFollow = async () => {
  return invoke<{ following: boolean; alreadyVerified?: boolean; error?: string }>(
    'verify-x-follow',
    {},
  )
}

export const recordQuestCompletion = async (userId: string, questId: string) => {
  const { error } = await supabase.rpc('record_quest_completion', {
    p_user_id: userId,
    p_quest_id: questId,
  })
  if (error && !error.message.includes('duplicate')) throw error
}

export const getQuestCompletionTime = async (userId: string, questId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('quest_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('quest_id', questId)
    .maybeSingle()
  if (error) throw error
  return data?.completed_at || null
}

export const getDoubleRewardsActivationTime = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('active_boosts')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('boost_type', 'double-rewards-1h')
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.expires_at) return null
  const activatedAt = new Date(new Date(data.expires_at).getTime() - 60 * 60 * 1000)
  return activatedAt.toISOString()
}

/**
 * Pure read of progress — used to decide if a quest is claimable, BUT the
 * server enforces the actual threshold during `claimQuest`.
 */
export const getQuestProgress = async (userId: string): Promise<Record<string, number>> => {
  const [
    { count: createCount },
    { data: buys },
    { data: trades },
    { count: spinCount },
    { data: user },
  ] = await Promise.all([
    supabase.from('tokens').select('*', { count: 'exact', head: true }).eq('creator_id', userId),
    supabase.from('trades').select('token_address').eq('user_id', userId).eq('is_buy', true),
    supabase.from('trades').select('usd_value').eq('user_id', userId),
    supabase.from('wheel_spins').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('users').select('total_coins_spent, total_boosts_bought').eq('id', userId).single(),
  ])
  const buy = new Set((buys || []).map((d: any) => d.token_address)).size
  const trade = (trades || []).reduce((s: number, t: any) => s + (Number(t.usd_value) || 0), 0)
  return {
    create: createCount || 0,
    buy,
    trade,
    spin: spinCount || 0,
    coins: (user as any)?.total_coins_spent || 0,
    boost: (user as any)?.total_boosts_bought || 0,
    hold: 0, // computed locally where needed
  }
}

// Stub kept for backwards compat with components that still import it.
export const checkQuestCompletion = async (
  userId: string,
  questId: string,
): Promise<boolean> => {
  // Delegate to the claim-quest function in dry-run by checking progress.
  const progress = await getQuestProgress(userId)
  const map: Record<string, number> = {
    'create-1': 1, 'create-2': 3, 'create-3': 5, 'create-4': 10,
    'buy-1': 1, 'buy-2': 3, 'buy-3': 5, 'buy-4': 10,
    'trade-1': 10, 'trade-2': 20, 'trade-3': 50, 'trade-4': 100,
    'spin-1': 1, 'spin-2': 3, 'spin-3': 5, 'spin-4': 10,
    'coins-1': 1000, 'coins-2': 2500, 'coins-3': 5000, 'coins-4': 10000,
    'boost-1': 1, 'boost-2': 3, 'boost-3': 5, 'boost-4': 10,
  }
  if (!(questId in map)) return false
  const key = questId.split('-')[0]
  return (progress[key] ?? 0) >= map[questId]
}

// ════════════════════════════════════════════════════════════════════════════
// BOOSTS — purchase via edge function (server enforces cost / single-active)
// ════════════════════════════════════════════════════════════════════════════

export const getActiveBoosts = async (userId: string) => {
  const { data, error } = await supabase
    .from('active_boosts')
    .select('*')
    .eq('user_id', userId)
    .gte('expires_at', new Date().toISOString())
  if (error) throw error
  return data || []
}

export const purchaseBoost = async (boostType: string) => {
  return invoke('purchase-boost', { boostType })
}

export const grantOnChainFeeExemption = async () => {
  return invoke('grant-fee-exemption', {})
}

export const isBoostActive = async (userId: string, boostType: string) => {
  const { data, error } = await supabase
    .from('active_boosts')
    .select('id')
    .eq('user_id', userId)
    .eq('boost_type', boostType)
    .gte('expires_at', new Date().toISOString())
    .limit(1)
  if (error) throw error
  return (data || []).length > 0
}

export const getBoostExpiry = async (userId: string, boostType: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('active_boosts')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('boost_type', boostType)
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.expires_at || null
}

// ════════════════════════════════════════════════════════════════════════════
// WHEEL SPINS — server picks the prize and signs BNB redemption
// ════════════════════════════════════════════════════════════════════════════

export const spinWheel = async () => {
  return invoke<{
    spinId: string
    prize: { prizeType: 'kp' | 'coins' | 'bnb' | 'nada'; prizeValue: number }
  }>('wheel-spin', { action: 'spin' })
}

export const claimWheelBnbPrize = async (spinId: string) => {
  return invoke<{ signature: string; nonce: string; deadline: number; amount: string }>(
    'wheel-spin',
    { action: 'claim', spinId },
  )
}

export const getPendingSpin = async (userId: string) => {
  const { data, error } = await supabase
    .from('wheel_spins')
    .select('*')
    .eq('user_id', userId)
    .eq('is_claimed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// ════════════════════════════════════════════════════════════════════════════
// SHOP / PAYMENTS — credit AFTER tx is verified by the server
// ════════════════════════════════════════════════════════════════════════════

export const creditCoinsAfterPayment = async (txHash: string, packageId: number) => {
  return invoke('purchase-coins', { txHash, product: 'coins', packageId })
}

// ════════════════════════════════════════════════════════════════════════════
// ICO + AIRDROPS
// ════════════════════════════════════════════════════════════════════════════

export const insertIcoContribution = async (contribution: any) => {
  // Default `kind` to 'buy' for backwards compatibility with existing callers.
  // Withdraw rows are inserted by the ICOPanel withdraw handler with kind='withdraw'.
  const payload = {
    ...contribution,
    token_address: contribution.token_address.toLowerCase(),
    kind: contribution.kind || 'buy',
  }
  const { error } = await supabase
    .from('ico_contributions')
    .upsert(payload, { onConflict: 'tx_hash' })
  if (error && !error.message.includes('duplicate')) throw error
}

export const getIcoContributions = async (tokenAddress: string) => {
  const { data, error } = await supabase
    .from('ico_contributions')
    .select('*')
    .eq('token_address', tokenAddress.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export const updateTokenPhase = async (tokenAddress: string, phase: string) => {
  const { error } = await supabase
    .from('tokens')
    .update({ phase })
    .eq('token_address', tokenAddress.toLowerCase())
  if (error) throw error
}

export const updateTokenIcoProgress = async (tokenAddress: string, bnbRaised: number, round: number) => {
  const { error } = await supabase
    .from('tokens')
    .update({ ico_bnb_raised: bnbRaised, ico_current_round: round })
    .eq('token_address', tokenAddress.toLowerCase())
  if (error) throw error
}

export const insertAirdrop = async (airdrop: any) => {
  const { error } = await supabase
    .from('airdrops')
    .insert({ ...airdrop, token_address: airdrop.token_address.toLowerCase() })
  if (error) throw error
}

export const getAirdrops = async (tokenAddress: string) => {
  const { data, error } = await supabase
    .from('airdrops')
    .select('*')
    .eq('token_address', tokenAddress.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export const getUserAirdrops = async (walletAddress: string) => {
  const { data: airdrops, error } = await supabase
    .from('airdrops')
    .select('*')
    .eq('recipient_address', walletAddress.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) throw error
  const list = airdrops || []
  if (list.length === 0) return []

  const tokenAddrs = [...new Set(list.map((a: any) => a.token_address))]
  const { data: tokens } = await supabase
    .from('tokens')
    .select('token_address, name, symbol, image')
    .in('token_address', tokenAddrs)
  const tokenMap: Record<string, any> = {}
  for (const t of tokens || []) tokenMap[t.token_address] = t

  return list.map((a: any) => ({ ...a, token: tokenMap[a.token_address] || null }))
}

export const markAirdropTriggered = async (tokenAddress: string) => {
  const { error } = await supabase
    .from('tokens')
    .update({ airdrop_triggered: true, phase: 'airdrop_complete' })
    .eq('token_address', tokenAddress.toLowerCase())
  if (error) throw error
}

export const requestAirdropSignature = async (params: {
  tokenAddress: string
  vaultAddress: string
  poolAddress: string
  icoAddress: string
}) => {
  return invoke<{
    recipients: string[]
    amounts: string[]
    deadline: number
    signature: string
  }>('airdrop-list', params)
}

/**
 * Idempotently enqueues "claimable airdrop" popup notifications for every
 * top-20% holder of `tokenAddress` whose vault is eligible-but-not-triggered.
 * Safe to fire after every swap and on app mount; the unique
 * (wallet_address, token_address) constraint ensures one row per user/token.
 */
export const enqueueClaimableAirdrops = async (tokenAddress: string) => {
  return invoke<{ enqueued: number; reason?: string }>(
    'enqueue-claimable-airdrops',
    { tokenAddress: tokenAddress.toLowerCase() },
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Deprecated — direct economy writes are blocked by the database trigger.
// These stubs throw clear errors so any forgotten callsite fails loudly.
// ════════════════════════════════════════════════════════════════════════════

const blockedDirectWrite = (label: string) => {
  return () => {
    throw new Error(
      `${label} cannot be written from the client. Use the corresponding edge function.`,
    )
  }
}

export const awardCoins = blockedDirectWrite('awardCoins') as any
export const deductCoins = blockedDirectWrite('deductCoins') as any
export const awardXpAndCoins = blockedDirectWrite('awardXpAndCoins') as any
export const recordWheelSpin = blockedDirectWrite('recordWheelSpin') as any
export const markSpinClaimed = blockedDirectWrite('markSpinClaimed') as any
export const recordFreeSpinTime = blockedDirectWrite('recordFreeSpinTime') as any
export const grantFreeWheelSpin = blockedDirectWrite('grantFreeWheelSpin') as any
// Legacy level-claim stubs removed — see Levels v2 (CLAUDE.md §14).

// ════════════════════════════════════════════════════════════════════════════
// FOLLOWS — RLS allows public read; writes scoped to auth.uid() = follower_id
// ════════════════════════════════════════════════════════════════════════════

export interface FollowEntry {
  id: string
  username: string | null
  wallet_address: string
  profile_pic: string | null
  followed_at: string
}

export const getProfileCounts = async (
  userId: string,
): Promise<{ followers: number; following: number; created_tokens: number }> => {
  const { data, error } = await supabase.rpc('get_profile_counts', { p_user_id: userId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    followers: Number(row?.followers ?? 0),
    following: Number(row?.following ?? 0),
    created_tokens: Number(row?.created_tokens ?? 0),
  }
}

export const getFollowers = async (userId: string): Promise<FollowEntry[]> => {
  const { data, error } = await supabase.rpc('get_followers', { p_user_id: userId })
  if (error) throw error
  return (data || []) as FollowEntry[]
}

export const getFollowing = async (userId: string): Promise<FollowEntry[]> => {
  const { data, error } = await supabase.rpc('get_following', { p_user_id: userId })
  if (error) throw error
  return (data || []) as FollowEntry[]
}

export const isFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export const followUser = async (followerId: string, followingId: string) => {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId })
  if (error && !error.message.includes('duplicate')) throw error
}

export const unfollowUser = async (followerId: string, followingId: string) => {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════════════════
// LEADERBOARD — public KP ranking. `users_public_read` policy allows anyone
// to SELECT display-safe columns from `users`.
// ════════════════════════════════════════════════════════════════════════════

export interface LeaderboardEntry {
  id: string
  username: string | null
  wallet_address: string
  profile_pic: string | null
  kp: number
  level: number
}

export const getKpLeaderboard = async (limit = 50): Promise<LeaderboardEntry[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, wallet_address, profile_pic, kp, level')
    .order('kp', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data || []) as LeaderboardEntry[]
}

// ════════════════════════════════════════════════════════════════════════════
// CREATOR REWARDS — chart series + recording the 1 BNB share at ICO finalize
// ════════════════════════════════════════════════════════════════════════════

export interface CreatorRewardDay {
  day: string // ISO date string (YYYY-MM-DD)
  total_usd: number
  total_bnb: number
}

export const getCreatorRewardsDaily = async (
  userId: string,
  days = 30,
): Promise<CreatorRewardDay[]> => {
  const { data, error } = await supabase.rpc('get_creator_rewards_daily', {
    p_user_id: userId,
    p_days: days,
  })
  if (error) throw error
  return (data || []).map((row: any) => ({
    day: String(row.day),
    total_usd: Number(row.total_usd ?? 0),
    total_bnb: Number(row.total_bnb ?? 0),
  }))
}

export const getCreatorRewardsTotal = async (
  userId: string,
): Promise<{ total_usd: number; total_bnb: number }> => {
  const { data, error } = await supabase.rpc('get_creator_rewards_total', { p_user_id: userId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    total_usd: Number(row?.total_usd ?? 0),
    total_bnb: Number(row?.total_bnb ?? 0),
  }
}

/**
 * Called by the frontend immediately after observing the ICO finalize tx.
 * The edge function verifies on-chain that `finalized() == true` and that
 * the caller is the token creator, then idempotently inserts the 1 BNB
 * reward row with a locked-in USD value.
 */
export const recordCreatorReward = async (tokenAddress: string) => {
  return invoke<{ recorded?: boolean; alreadyRecorded?: boolean; usdValue?: number }>(
    'record-creator-reward',
    { tokenAddress: tokenAddress.toLowerCase() },
  )
}

/**
 * Called after the user successfully submits Pool.claimCreatorFees() or
 * ICO.claimCreatorFees(). The backend verifies the on-chain event and
 * inserts a `creator_rewards` row tagged `ico_completed = false` with
 * the tx_hash. Idempotent on tx_hash.
 */
export const recordCreatorFeeClaim = async (
  tokenAddress: string,
  txHash: string,
) => {
  return invoke<{
    recorded?: boolean
    alreadyRecorded?: boolean
    bnbAmount?: number
    usdValue?: number
  }>('record-creator-fee-claim', {
    tokenAddress: tokenAddress.toLowerCase(),
    txHash: txHash.toLowerCase(),
  })
}
