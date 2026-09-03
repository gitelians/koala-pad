import { Link, useParams } from 'react-router-dom'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { useState, useEffect } from 'react'
import SwapPanel from '../components/SwapPanel'
import PriceChartLite from '../components/PriceChartLite'
// Advanced TradingView Charts (kept for when the library license is approved):
// import PriceChart from '../components/PriceChart'
import ActivityTabs from '../components/ActivityTabs'
import ICOPanel from '../components/ICOPanel'
import ICOProgressHero from '../components/ICOProgressHero'
import AirdropStatus from '../components/AirdropStatus'
import CreatorRewardsPanel from '../components/CreatorRewardsPanel'
import TopHolders from '../components/TopHolders'
import { useAuth } from '../context/AuthContext'
import { getTokenByAddress, get24hVolume, upsertTrade, checkQuestCompletion, isBoostActive, recordCreatorReward, enqueueClaimableAirdrops } from '../lib/supabaseApi'
import { supabase } from '../lib/supabase'
import { getBnbPrice } from '../lib/bnbPrice'
import { FaTelegramPlane } from 'react-icons/fa'
import { FaXTwitter } from "react-icons/fa6"
import { TbWorld } from 'react-icons/tb'
import { Copy, Star } from 'lucide-react';
import { TOKEN_ABI, POOL_ABI } from '../constants/abis'
import { useWatchlist } from '../hooks/useWatchlist'
import { pushRecentVisitedToken } from '../components/SearchModal'

// Read-only JSON-RPC endpoint
const RPC_URL =
  import.meta.env.VITE_BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'

export default function Token() {
  const { address: tokenAddress } = useParams()
  const { address: userAddress, isConnected } = useAccount()
  const { userId } = useAuth()
  const { toggle: toggleWatchlist, isWatchlisted } = useWatchlist()
  const [poolAddress, setPoolAddress] = useState<`0x${string}` | undefined>(undefined)
  const [icoAddress, setIcoAddress] = useState<`0x${string}` | undefined>(undefined)
  const [vaultAddress, setVaultAddress] = useState<`0x${string}` | undefined>(undefined)
  const [bnbPrice, setBnbPrice] = useState<number>(600)
  const [holdersRefreshKey, setHoldersRefreshKey] = useState(0)
  const [lastSwapType, setLastSwapType] = useState<'buy' | 'sell' | null>(null)
  const [lastSwapAmount, setLastSwapAmount] = useState<string>('0')
  const [lastSwapUsdValue, setLastSwapUsdValue] = useState(0)
  const [volume24h, setVolume24h] = useState<number>(0)
  const [tokenMeta, setTokenMeta] = useState<any>(null)
  const [phase, setPhase] = useState<string>('ico')
  const [freeFeesActive, setFreeFeesActive] = useState(false)
  const [creator, setCreator] = useState<{ username: string | null; wallet_address: string; profile_pic: string | null } | null>(null)

  // Retroactively record the 1 BNB creator share when the creator visits
  // their own token page after finalization. The auto-finalize is usually
  // triggered by the *last buyer*, not the creator, so the buyer can't be
  // the one to call record-creator-reward. The edge function is idempotent
  // and on-chain-verified, so it's safe to call on every visit.
  useEffect(() => {
    if (!userId || !tokenAddress || phase !== 'trading') return
    if (!tokenMeta?.creator_id || tokenMeta.creator_id !== userId) return
    recordCreatorReward(tokenAddress).catch(err => {
      // Common case: already recorded → 200 alreadyRecorded. Other errors
      // we silently log.
      const msg = String(err?.message || '')
      if (!msg.toLowerCase().includes('already')) {
        console.warn('record-creator-reward failed:', msg)
      }
    })
  }, [userId, tokenAddress, phase, tokenMeta?.creator_id])

  // Self-heal: if this token's vault is already eligible-but-not-triggered,
  // ask the backend to enqueue claimable-airdrop popups for all top-20%
  // holders that haven't been notified yet. Idempotent + best-effort.
  useEffect(() => {
    if (!userId || !tokenAddress || phase !== 'trading') return
    enqueueClaimableAirdrops(tokenAddress).catch(() => {})
  }, [userId, tokenAddress, phase])

  // Check if Free Fees boost is active
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const check = () => {
      isBoostActive(userId, 'free-fees-1h').then(active => {
        if (!cancelled) setFreeFeesActive(active)
      }).catch(() => {})
    }
    check()
    const interval = setInterval(check, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [userId])

  // Load token metadata from Supabase. The pool/ico/vault addresses are
  // stored on insert at create-token time, so we use them directly instead
  // of brute-forcing the factory's tokens(uint256) function via a public RPC.
  useEffect(() => {
    if (!tokenAddress) return
    getTokenByAddress(tokenAddress).then(data => {
      if (data) {
        setTokenMeta(data)
        if (data.phase) setPhase(data.phase)
        if (data.pool_address) setPoolAddress(data.pool_address as `0x${string}`)
        if (data.ico_address) setIcoAddress(data.ico_address as `0x${string}`)
        if (data.vault_address) setVaultAddress(data.vault_address as `0x${string}`)
        // Persist visit in local "recently viewed" cache used by the search popup.
        pushRecentVisitedToken({
          token_address: data.token_address,
          name: data.name,
          symbol: data.symbol,
          image: data.image,
          pool_address: data.pool_address,
          phase: data.phase,
        })
        // Resolve creator profile (small public-safe payload) so we can render
        // the creator chip in the token header.
        if (data.creator_id) {
          supabase
            .from('users')
            .select('username, wallet_address, profile_pic')
            .eq('id', data.creator_id)
            .maybeSingle()
            .then(({ data: u }) => {
              if (u) setCreator(u as any)
              else if (data.creator_address) {
                // Fall back to wallet-only display if the joined row is hidden
                // by RLS.
                setCreator({
                  username: null,
                  wallet_address: data.creator_address,
                  profile_pic: null,
                })
              }
            })
        } else if (data.creator_address) {
          setCreator({
            username: null,
            wallet_address: data.creator_address,
            profile_pic: null,
          })
        }
      }
    }).catch(err => console.error('Failed to fetch token metadata:', err))
  }, [tokenAddress])

  // Fetch 24h volume from Supabase (server-side aggregation; bnbPrice lets the
  // RPC value any trades missing a locked-in usd_value).
  useEffect(() => {
    if (!tokenAddress || phase === 'ico') return

    const fetchVolume = () => {
      get24hVolume(tokenAddress, bnbPrice)
        .then(vol => setVolume24h(vol))
        .catch(err => console.error('Error fetching 24h volume:', err))
    }

    fetchVolume()
    const interval = setInterval(fetchVolume, 30000)
    return () => clearInterval(interval)
  }, [tokenAddress, phase, bnbPrice]);


  // BNB price — shared cached fetcher (one CoinGecko hit per minute app-wide).
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      getBnbPrice().then(p => { if (!cancelled) setBnbPrice(p) })
    }
    tick()
    const interval = setInterval(tick, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Pool/ICO/Vault addresses come from the tokens row populated at create-time.
  // No more public-RPC probing.

  // Token data
  const { data: tokenName, refetch: refetchName } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: TOKEN_ABI,
    functionName: 'name',
  })

  const { data: tokenSymbol, refetch: refetchSymbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: TOKEN_ABI,
    functionName: 'symbol',
  })

  const { data: userTokenBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
  })

  // Pool data (only relevant during trading phase)
  const { data: reserveToken, refetch: refetchReserveToken } = useReadContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'reserveToken',
    query: { enabled: phase !== 'ico' },
  })

  const { data: reserveBNB, refetch: refetchReserveBNB } = useReadContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'reserveBNB',
    query: { enabled: phase !== 'ico' },
  })

  const { data: price, refetch: refetchPrice } = useReadContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'getPrice',
    query: { enabled: phase !== 'ico' },
  })

  const { data: marketCap, refetch: refetchMarketCap } = useReadContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'getMarketCap',
    args: [parseEther('21000000')],
    query: { enabled: phase !== 'ico' },
  })

  const { writeContract, writeContractAsync, data: txHash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // Refresh all data & record quest when transaction succeeds
  useEffect(() => {
    if (isSuccess) {
      if (lastSwapType && userAddress && tokenAddress && poolAddress) {
        // Record trade in Supabase
        upsertTrade({
          token_address: tokenAddress,
          pool_address: poolAddress,
          tx_hash: txHash || '',
          maker_address: userAddress.toLowerCase(),
          user_id: userId || undefined,
          is_buy: lastSwapType === 'buy',
          token_amount: lastSwapAmount,
          bnb_amount: lastSwapType === 'buy' ? lastSwapAmount : '0',
          usd_value: lastSwapUsdValue,
          price_bnb: price ? parseFloat(formatEther(price)) : undefined,
        }).catch(err => console.error('Failed to record trade:', err))

        // A buy may have just tipped the pool over the airdrop threshold, or
        // a sell may have moved this wallet into the top-20% cohort. Either
        // way, ask the backend to (re-)compute eligibility and enqueue popup
        // notifications for any newly-eligible wallets. Best-effort.
        enqueueClaimableAirdrops(tokenAddress).catch(() => {})

        console.log(`🎮 Quest: ${lastSwapType} recorded! ($${lastSwapUsdValue.toFixed(2)})`)

        // Check quest completion asynchronously
        if (userId) {
          const tradeRelatedQuests = [
            'trade-1', 'trade-2', 'trade-3', 'trade-4',
            'buy-1', 'buy-2', 'buy-3', 'buy-4',
          ]
          setTimeout(async () => {
            let newCount = 0
            for (const questId of tradeRelatedQuests) {
              const completed = await checkQuestCompletion(userId, questId)
              if (completed) newCount++
            }
            if (newCount > 0) {
              alert(`✨ Quest(s) Unlocked!\n\nCheck the Quests section to claim your rewards!`)
            }
          }, 1000)
        }

        setLastSwapType(null)
        setLastSwapAmount('0')
        setLastSwapUsdValue(0)
      }

      // Refetch all data
      refetchName()
      refetchSymbol()
      refetchBalance()
      refetchReserveToken()
      refetchReserveBNB()
      refetchPrice()
      refetchMarketCap()
      setHoldersRefreshKey(k => k + 1)
      // Refresh denormalized trade counters (total_trades, unique_traders).
      if (tokenAddress) {
        getTokenByAddress(tokenAddress).then(data => { if (data) setTokenMeta(data) }).catch(() => {})
      }
    }
  }, [isSuccess, refetchName, refetchSymbol, refetchBalance, refetchReserveToken,
    refetchReserveBNB, refetchPrice, refetchMarketCap])

  const handleSwap = async (isBuyingToken: boolean, amount: string, slippageBps: number) => {
    if (!poolAddress || !isConnected || !userAddress) return

    setLastSwapType(isBuyingToken ? 'buy' : 'sell')
    setLastSwapAmount(amount)

    const priceInBNB = price ? parseFloat(formatEther(price)) : 0
    const usdValue = isBuyingToken
      ? parseFloat(amount) * bnbPrice
      : parseFloat(amount) * priceInBNB * bnbPrice
    setLastSwapUsdValue(usdValue)

    const slippageNum = BigInt(Math.max(1, Math.min(slippageBps, 5000)))
    const SLIPPAGE_DEN = 10_000n

    try {
      const reserveIn = isBuyingToken ? (reserveBNB ?? 0n) : (reserveToken ?? 0n)
      const reserveOut = isBuyingToken ? (reserveToken ?? 0n) : (reserveBNB ?? 0n)
      if (reserveIn === 0n || reserveOut === 0n) throw new Error('Pool has no liquidity')

      const amountIn = parseEther(amount)
      // Constant product quote, with the 1.2% total pool fee (0.85% protocol +
      // 0.35% creator). Fee-exempt wallets bypass both legs. Mirrors Pool.sol.
      const inAfterFee = freeFeesActive
        ? amountIn
        : (amountIn * 9880n) / 10_000n
      const expectedOut = (inAfterFee * reserveOut) / (reserveIn + inAfterFee)
      const minOut = (expectedOut * (SLIPPAGE_DEN - slippageNum)) / SLIPPAGE_DEN
      if (minOut <= 0n) throw new Error('Min-out is zero')

      if (isBuyingToken) {
        writeContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'swapExactBNBForTokens',
          args: [minOut],
          value: amountIn,
        })
      } else {
        // Approve, await receipt, then swap. No setTimeout race.
        const approveHash = await writeContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [poolAddress, amountIn],
        })
        // Wait for approve confirmation via the public client.
        await waitForApproval(approveHash)
        writeContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'swapExactTokensForBNB',
          args: [amountIn, minOut],
        })
      }
    } catch (error) {
      console.error('Swap failed:', error)
      setLastSwapType(null)
      setLastSwapAmount('0')
      setLastSwapUsdValue(0)
    }
  }

  // Tiny helper: poll a tx receipt instead of using setTimeout.
  const waitForApproval = async (hash: `0x${string}`) => {
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      try {
        const r = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'eth_getTransactionReceipt',
            params: [hash],
          }),
        })
        if (r.ok) {
          const j = await r.json()
          if (j?.result?.status === '0x1') return
        }
      } catch {}
      await new Promise(r => setTimeout(r, 2000))
    }
    throw new Error('Approve tx not confirmed in time')
  }

  if (!tokenAddress) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800">
        <div className="text-6xl mb-4">❌</div>
        <div className="text-xl text-gray-400">Invalid token address</div>
      </div>
    )
  }

  if (!poolAddress) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800">
        <div className='w-max mx-auto mb-4'>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" className="size-10 fill-violet-500 motion-safe:animate-spin dark:fill-on-surface-dark">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" />
            <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z" />
          </svg>
        </div>
        <div className="text-xl text-gray-100">Loading token data...</div>
        <div className="text-sm text-gray-500 mt-2">
          Token: {tokenAddress.slice(0, 10)}...
        </div>
      </div>
    )
  }

  const priceInBNB = price ? parseFloat(formatEther(price)) : 0
  const marketCapInBNB = marketCap ? parseFloat(formatEther(marketCap)) : 0
  const poolLiquidityBNB = reserveBNB ? parseFloat(formatEther(reserveBNB)) : 0

  // Calculate USD values
  const priceInUSD = priceInBNB * bnbPrice
  const marketCapInUSD = marketCapInBNB * bnbPrice

  // Get token metadata from Supabase
  const metadata = tokenMeta ? {
    description: tokenMeta.description,
    website: tokenMeta.website,
    twitter: tokenMeta.x,
    telegram: tokenMeta.telegram,
    image: tokenMeta.image,
  } : {}

  // Copy address to clipboard
  const handleCopyAddress = () => {
    if (tokenAddress) {
      navigator.clipboard.writeText(tokenAddress)
      alert('Address copied to clipboard!')
    }
  }

  // Phase badge
  const phaseBadge = phase === 'ico'
    ? { label: 'ICO', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    : phase === 'trading'
      ? { label: 'Trading', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
      : { label: 'Airdrop', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }

  return (
    // pt-4 on mobile gives consistent breathing room between the floating
    // header and the token info card; desktop keeps the original spacing.
    <div className="max-w-7xl mx-auto pt-4 md:pt-0">
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:items-start">
        {/* Left column wrapper — transparent on mobile so its children flow
            as direct items of the outer flex-col (preserving order utilities). */}
        <div className="contents md:flex md:flex-col md:basis-2/3 md:min-w-0 md:gap-6">
      {/* Header — sits inside the left column so its width matches the chart */}
      <div className="order-0 md:order-none bg-gray-900/50 rounded-2xl p-4 md:p-6 border border-gray-800">
        <div className="flex items-center justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            {/* Token Image */}
            {metadata.image ? (
              <img
                src={metadata.image}
                alt={tokenName || 'Token'}
                className="w-12 h-12 md:w-16 md:h-16 rounded-xl object-cover border border-gray-800"
              />
            ) : (
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center text-white font-bold text-xl md:text-2xl">
                {tokenSymbol?.[0] || '?'}
              </div>
            )}
            {/* Token Name & Symbol */}
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-white">{tokenName || 'Loading...'}</h1>
              <p className="text-lg text-gray-300/50 font-semibold">${tokenSymbol || '...'}</p>
            </div>
          </div>
          {/* Right side: phase badge on top, watchlist star below, optional balance */}
          <div className="flex flex-col items-end gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${phaseBadge.color}`}>
              {phaseBadge.label}
            </span>
            <button
              onClick={() => toggleWatchlist(tokenAddress)}
              title={isWatchlisted(tokenAddress) ? 'Remove from watchlist' : 'Add to watchlist'}
              className={`transition-colors ${
                isWatchlisted(tokenAddress) ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'
              }`}
            >
              <Star
                size={22}
                className={isWatchlisted(tokenAddress) ? 'fill-yellow-400' : ''}
              />
            </button>
            {phase !== 'ico' && (
              <div className="text-right">
                <div className="text-sm text-gray-500">Your Balance</div>
                <div className="text-xl md:text-2xl font-semibold text-white">
                  {userTokenBalance ? parseFloat(formatEther(userTokenBalance)).toFixed(2) : '0.00'}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Token Description */}
        <div >
          {metadata.description && (
            <p className="text-gray-400 text-base leading-relaxed mt-4">
              {metadata.description}
            </p>
          )}
        </div>
        {/* Social Links */}
        {(metadata.website || metadata.twitter || metadata.telegram) && (
          <div className="flex gap-3 mt-4">
            {metadata.website && (
              <a
                href={metadata.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-violet-400 transition-colors"
                title="Website"
              >
                <TbWorld size="1.4em" />
              </a>
            )}
            {metadata.twitter && (
              <a
                href={metadata.twitter.startsWith('http') ? metadata.twitter : `https://x.com/${metadata.twitter.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-violet-400 transition-colors"
                title="Twitter/X"
              >
                <FaXTwitter size="1.4em" />
              </a>
            )}
            {metadata.telegram && (
              <a
                href={metadata.telegram.startsWith('http') ? metadata.telegram : `https://t.me/${metadata.telegram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-violet-400 transition-colors"
                title="Telegram"
              >
                <FaTelegramPlane size="1.4em" />
              </a>
            )}
          </div>
        )}

        {/* Token Creator chip */}
        {creator && (
          <div className="mt-4">
            <Link
              to={`/profile/${creator.wallet_address}`}
              className="inline-flex items-center gap-2 bg-gray-900 border border-gray-800 hover:border-violet-500/40 rounded-full pl-1 pr-3 py-1 transition-colors group"
            >
              {creator.profile_pic ? (
                <img
                  src={creator.profile_pic}
                  alt={creator.username || 'creator'}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {(creator.username?.[0] || creator.wallet_address?.[2] || '?').toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">
                Created by
              </span>
              <span className="text-xs font-semibold text-gray-200 group-hover:text-violet-400 transition-colors">
                {creator.username || `${creator.wallet_address.slice(0, 6)}...${creator.wallet_address.slice(-4)}`}
              </span>
            </Link>
          </div>
        )}
      </div>

          {/* Chart / ICO progress hero */}
          <div className="order-1 md:order-none space-y-4 md:space-y-6">
            {phase === 'ico' ? (
              icoAddress ? (
                <ICOProgressHero icoAddress={icoAddress} bnbPrice={bnbPrice} />
              ) : null
            ) : (
              <>
                {/* Price Chart */}
                <PriceChartLite
                  mint={tokenAddress as string}
                  tokenSymbol={tokenSymbol || ''}
                  quoteSymbol="BNB"
                  totalSupply={21_000_000}
                  defaultMode="marketcap"
                  defaultCurrency="USD"
                />
                {/* Stats Tabs */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                  <div className="bg-gray-900/50 rounded-2xl p-3 border border-gray-800">
                    <div className="text-sm text-gray-500 mb-1">Price</div>
                    <div className="text-base md:text-lg font-semibold text-white break-all">
                      ${priceInUSD.toFixed(8)}
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-2xl p-3 border border-gray-800">
                    <div className="text-sm text-gray-500 mb-1">Market Cap</div>
                    <div className="text-base md:text-lg font-semibold text-white">
                      ${marketCapInUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-2xl p-3 border border-gray-800">
                    <div className="text-sm text-gray-500 mb-1">Vol 24h</div>
                    <div className="text-base md:text-lg font-semibold text-white">
                      ${volume24h.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-2xl p-3 border border-gray-800">
                    <div className="text-sm text-gray-500 mb-1">Pool Liquidity</div>
                    <div className="text-base md:text-lg font-semibold text-white">
                      {poolLiquidityBNB.toFixed(4)} BNB
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-2xl p-3 border border-gray-800">
                    <div className="text-sm text-gray-500 mb-1">Txns / Traders</div>
                    <div className="text-base md:text-lg font-semibold text-white">
                      {(tokenMeta?.total_trades ?? 0).toLocaleString()} <span className="text-gray-500 text-xs font-medium">/</span> {(tokenMeta?.unique_traders ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Activity tabs — stacked right under the chart on desktop */}
          <div className="order-3 md:order-none">
            <ActivityTabs
              poolAddress={poolAddress}
              tokenSymbol={tokenSymbol || ''}
              bnbPrice={bnbPrice}
            />
          </div>
        </div>

        {/* Right column — independent height, won't push activity tabs down */}
        <div className="order-2 md:order-none md:basis-1/3 md:shrink-0 space-y-4">
            {/* ICO Phase: Show ICO Panel */}
            {phase === 'ico' && icoAddress ? (
              <ICOPanel
                icoAddress={icoAddress}
                tokenAddress={tokenAddress}
                tokenSymbol={tokenSymbol || ''}
                onPhaseChange={(newPhase) => setPhase(newPhase)}
                freeFeesActive={freeFeesActive}
                bnbPrice={bnbPrice}
              />
            ) : (
              /* Trading Phase: Show Swap Panel */
              <SwapPanel
                tokenSymbol={tokenSymbol || ''}
                reserveToken={reserveToken || 0n}
                reserveBNB={reserveBNB || 0n}
                userTokenBalance={userTokenBalance || 0n}
                onSwap={handleSwap}
                disabled={isPending || !isConnected}
                freeFeesActive={freeFeesActive}
              />
            )}

            {/* Creator-only rewards panel — surfaces the 0.35% fee that the
                Pool + ICO have accumulated for this creator. */}
            {userId && tokenMeta?.creator_id === userId && (
              <CreatorRewardsPanel
                tokenAddress={tokenAddress}
                poolAddress={poolAddress}
                icoAddress={icoAddress}
                bnbPrice={bnbPrice}
              />
            )}

            {/* Airdrop Status (shown during trading and airdrop_complete phases) */}
            {phase !== 'ico' && vaultAddress && poolAddress && (
              <AirdropStatus
                vaultAddress={vaultAddress}
                poolAddress={poolAddress}
                tokenAddress={tokenAddress as `0x${string}`}
                tokenSymbol={tokenSymbol || ''}
                onAirdropTriggered={() => setPhase('airdrop_complete')}
              />
            )}

            {/* Copy Token Address button */}
            <div className="flex justify-end">
              <button
                onClick={handleCopyAddress}
                className="px-4 py-2 font-mono text-sm transition-colors flex items-center gap-1 group"
              >
                <span className="text-gray-500 group-hover:text-gray-300">Token address:</span>
                <span className="text-gray-400 group-hover:text-white font-semibold">
                  {tokenAddress?.slice(0, 6)}...{tokenAddress?.slice(-6)}
                </span>
                <Copy className="size-4 text-gray-500 group-hover:text-violet-400 transition-colors"/>
              </button>
            </div>

            {/* Top Holders */}
            <TopHolders
              tokenAddress={tokenAddress as `0x${string}`}
              poolAddress={poolAddress}
              icoAddress={icoAddress}
              vaultAddress={vaultAddress}
              phase={phase}
              refreshKey={holdersRefreshKey}
            />
        </div>
      </div>
    </div>
  )
}
