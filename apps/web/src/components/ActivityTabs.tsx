import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useWatchContractEvent } from 'wagmi'
import { formatEther, parseAbiItem } from 'viem'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart } from 'lucide-react' // Import aggiunto
import { useAuth } from '../context/AuthContext'
import {
  getComments,
  postComment,
  toggleCommentLike,
  getUserLikedComments,
  getTradesForToken,
  upsertTrade,
} from '../lib/supabaseApi'

// --- Interfaces ---

interface Comment {
  id: string
  user_id: string
  content: string
  created_at: string
  likes_count: number
  isLiked: boolean
  parent_id: string | null
  user: {
    wallet_address: string
    username: string | null
    profile_pic: string | null
  }
  replies?: Comment[]
}

interface Trade {
  hash: string
  isBuy: boolean
  tokenAmount: string
  bnbAmount: string
  maker: string
  timestamp: number
}

interface ActivityTabsProps {
  poolAddress: `0x${string}` | undefined
  tokenSymbol: string
  bnbPrice: number
}

// --- Helper Components ---

function Avatar({ address, size = 'md' }: { address: string, size?: 'sm' | 'md' }) {
  const seed = parseInt(address.slice(2, 10), 16)
  const colors = ['bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500']
  const color = colors[seed % colors.length]
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-10 h-10 text-sm'

  return (
    <div className={`${sizeClass} ${color} rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-lg border border-gray-900/20`}>
      {address.slice(2, 4).toUpperCase()}
    </div>
  )
}

function TimeAgo({ timestamp }: { timestamp: number }) {
  const [timeStr, setTimeStr] = useState('')

  useEffect(() => {
    const update = () => {
      const seconds = Math.floor((Date.now() - timestamp) / 1000)
      if (seconds < 60) setTimeStr(`${seconds}s ago`)
      else if (seconds < 3600) setTimeStr(`${Math.floor(seconds / 60)}m ago`)
      else if (seconds < 86400) setTimeStr(`${Math.floor(seconds / 3600)}h ago`)
      else setTimeStr(`${Math.floor(seconds / 86400)}d ago`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [timestamp])

  return <span>{timeStr}</span>
}

// --- Main Component ---

export default function ActivityTabs({ poolAddress, tokenSymbol, bnbPrice }: ActivityTabsProps) {
  const [activeTab, setActiveTab] = useState<'comments' | 'trades'>('comments')
  const { address } = useAccount()
  const { userId } = useAuth()

  // --- Comments Logic ---
  const [comments, setComments] = useState<Comment[]>([])
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set())
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null)

  const tokenAddress = typeof window !== 'undefined'
    ? window.location.pathname.split('/token/')[1]?.split('/')[0] || ''
    : ''

  // Load comments
  useEffect(() => {
    if (!tokenAddress) return
    getComments(tokenAddress)
      .then(data => {
        const mapComment = (c: any): Comment => ({
          id: c.id,
          user_id: c.user_id,
          content: c.content,
          created_at: c.created_at,
          likes_count: c.likes_count || 0,
          isLiked: false,
          parent_id: c.parent_id || null,
          user: c.user || { wallet_address: '0x0000', username: null, profile_pic: null },
          replies: (c.replies || []).map(mapComment),
        })
        const mapped: Comment[] = (data || []).map(mapComment)
        setComments(mapped)
      })
      .catch(err => console.error('Failed to load comments:', err))
  }, [tokenAddress])

  // Load liked comments
  useEffect(() => {
    if (!tokenAddress || !userId) return
    getUserLikedComments(tokenAddress, userId)
      .then(set => setLikedCommentIds(set))
      .catch(() => {})
  }, [tokenAddress, userId])

  const handlePostComment = async () => {
    if (!newComment.trim() || !tokenAddress || !userId) return
    try {
      const parentId = replyingTo?.id
      const data = await postComment(tokenAddress, userId, newComment.trim(), parentId)
      const mapped: Comment = {
        id: data.id,
        user_id: data.user_id,
        content: data.content,
        created_at: data.created_at,
        likes_count: 0,
        isLiked: false,
        parent_id: parentId || null,
        user: data.user || { wallet_address: address || '0x0000', username: null, profile_pic: null },
        replies: [],
      }
      if (parentId) {
        setComments(prev =>
          prev.map(c =>
            c.id === parentId
              ? { ...c, replies: [...(c.replies || []), mapped] }
              : c
          )
        )
      } else {
        setComments(prev => [mapped, ...prev])
      }
      setNewComment('')
      setReplyingTo(null)
    } catch (err) {
      console.error('Failed to post comment:', err)
    }
  }

  const handleToggleLike = async (commentId: string) => {
    if (!userId) return
    try {
      const liked = await toggleCommentLike(commentId, userId)
      setComments(prev =>
        prev.map(c => {
          if (c.id === commentId) {
            return { ...c, likes_count: liked ? c.likes_count + 1 : c.likes_count - 1, isLiked: liked }
          }
          if (c.replies) {
            return {
              ...c,
              replies: c.replies.map(r => 
                r.id === commentId 
                  ? { ...r, likes_count: liked ? r.likes_count + 1 : r.likes_count - 1, isLiked: liked }
                  : r
              )
            }
          }
          return c
        })
      )
      setLikedCommentIds(prev => {
        const next = new Set(prev)
        if (liked) next.add(commentId)
        else next.delete(commentId)
        return next
      })
    } catch (err) {
      console.error('Failed to toggle like:', err)
    }
  }

  // --- Trades Logic ---
  const [trades, setTrades] = useState<Trade[]>([])
  const [filterSize, setFilterSize] = useState(false)

  useEffect(() => {
    if (!tokenAddress) return
    getTradesForToken(tokenAddress)
      .then(data => {
        const mapped: Trade[] = (data || []).map((t: any) => ({
          hash: t.tx_hash,
          isBuy: t.is_buy,
          tokenAmount: t.token_amount,
          bnbAmount: t.bnb_amount,
          maker: t.maker_address,
          timestamp: new Date(t.created_at).getTime(),
        }))
        setTrades(mapped)
      })
      .catch(err => console.error('Failed to load trades:', err))
  }, [tokenAddress])

  const addTrade = (newTrade: Trade) => {
    setTrades(prev => {
      if (prev.some(t => t.hash === newTrade.hash)) return prev;
      return [newTrade, ...prev].slice(0, 50);
    });

    if (poolAddress && tokenAddress) {
      upsertTrade({
        token_address: tokenAddress,
        pool_address: poolAddress,
        tx_hash: newTrade.hash,
        maker_address: newTrade.maker.toLowerCase(),
        is_buy: newTrade.isBuy,
        token_amount: newTrade.tokenAmount,
        bnb_amount: newTrade.bnbAmount,
        usd_value: parseFloat(newTrade.bnbAmount) * bnbPrice,
      }).catch(err => console.error('Failed to save trade:', err))
    }
  };

  useWatchContractEvent({
    address: poolAddress,
    abi: [parseAbiItem('event Swap(address indexed user, uint256 amountIn, uint256 amountOut, bool isBuyingToken)')],
    eventName: 'Swap',
    onLogs(logs) {
        logs.forEach(log => {
            const { user, amountIn, amountOut, isBuyingToken } = log.args as any
            const bnbVal = isBuyingToken ? amountIn : amountOut
            const tokenVal = isBuyingToken ? amountOut : amountIn

            const trade: Trade = {
                hash: log.transactionHash,
                isBuy: isBuyingToken,
                tokenAmount: formatEther(tokenVal || 0n),
                bnbAmount: formatEther(bnbVal || 0n),
                maker: user || log.address,
                timestamp: Date.now()
            }
            addTrade(trade)
        })
    },
    poll: true,
    pollingInterval: 3_000,
  })

  const displayedTrades = filterSize
    ? trades.filter(t => parseFloat(t.bnbAmount) > 0.05)
    : trades

  return (
    <div className="bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden">
      {/* Tabs Header */}
      <div className="flex items-center border-b border-gray-800 px-4 md:px-6">
        <button
          onClick={() => setActiveTab('comments')}
          className={`mr-6 py-4 text-sm font-semibold relative transition-colors ${
            activeTab === 'comments' ? 'text-violet-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Comments
          {activeTab === 'comments' && (
            <motion.div layoutId="underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={`mr-6 py-4 text-sm font-semibold relative transition-colors ${
            activeTab === 'trades' ? 'text-violet-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Trades
          {activeTab === 'trades' && (
            <motion.div layoutId="underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400" />
          )}
        </button>
      </div>

      <div className="p-0 min-h-[400px]">
        <AnimatePresence mode="wait">
          {activeTab === 'comments' ? (
            <motion.div
              key="comments"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-4 md:p-6"
            >
              {/* Add Comment Input */}
              <div className="flex gap-3 md:gap-4 mb-6 md:mb-8">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-800 rounded-full flex-shrink-0 shadow-lg" />
                <div className="flex-1">
                  {replyingTo && (
                    <div className="flex items-center gap-2 mb-2 text-xs text-violet-400">
                      <span>Replying to <span className="font-bold">{replyingTo.username}</span></span>
                      <button
                        onClick={() => setReplyingTo(null)}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                      placeholder={replyingTo ? `Reply to ${replyingTo.username}...` : 'Add a comment...'}
                      className="w-full bg-gray-900 text-gray-100 rounded-xl px-4 py-3 outline-none border border-gray-800 focus:border-violet-500 transition-all pr-20 placeholder-gray-600"
                    />
                    <button
                      onClick={handlePostComment}
                      className="absolute right-2 top-2.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-lg transition-all shadow-md"
                    >
                      {replyingTo ? 'Reply' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Comment List */}
              <div className="space-y-6">
                {comments.map((comment) => {
                  const walletAddr = comment.user?.wallet_address || '0x000000'
                  const displayName = comment.user?.username || `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`
                  const profileHref = `/profile/${walletAddr}`
                  const isLiked = likedCommentIds.has(comment.id)

                  return (
                    <div key={comment.id}>
                      <div className="flex gap-3 group">
                        <Link
                          to={profileHref}
                          className="flex items-start gap-3 hover:opacity-80 transition-opacity"
                          aria-label={`View ${displayName}'s profile`}
                        >
                          <Avatar address={walletAddr} />
                        </Link>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2 mb-1">
                            <Link
                              to={profileHref}
                              className="font-bold text-sm text-gray-100 hover:text-violet-400 transition-colors"
                            >
                              {displayName}
                            </Link>
                            <span className="text-[10px] text-gray-500 font-medium">
                              <TimeAgo timestamp={new Date(comment.created_at).getTime()} />
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 leading-relaxed">{comment.content}</p>
                          <div className="flex gap-4 mt-2">
                            <button
                              onClick={() => setReplyingTo({ id: comment.id, username: displayName })}
                              className="text-[10px] text-gray-500 font-bold hover:text-violet-400 transition-colors uppercase tracking-tight"
                            >
                              Reply
                            </button>
                            {/* Like Button Updated */}
                            <button
                              onClick={() => handleToggleLike(comment.id)}
                              className={`text-xs font-semibold flex items-center gap-1.5 transition-all p-1 -m-1 rounded-lg hover:bg-white/5 ${
                                isLiked ? 'text-pink-500' : 'text-gray-500 hover:text-pink-400'
                              } ${!isLiked ? 'active:scale-95' : 'active:scale-95'}`}
                            >
                              <motion.div
                                animate={isLiked ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                                transition={{ duration: 0.3 }}
                              >
                                <Heart 
                                  size={14} 
                                  fill={isLiked ? "currentColor" : "transparent"} 
                                  strokeWidth={2.5}
                                />
                              </motion.div>
                              {comment.likes_count}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Replies */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="ml-[52px] pl-4 border-l border-gray-800 mt-3 space-y-4">
                          {comment.replies.map((reply) => {
                            const replyWallet = reply.user?.wallet_address || '0x000000'
                            const replyName = reply.user?.username || `${replyWallet.slice(0, 6)}...${replyWallet.slice(-4)}`
                            const replyHref = `/profile/${replyWallet}`
                            const replyIsLiked = likedCommentIds.has(reply.id)

                            return (
                              <div key={reply.id} className="flex gap-3 group">
                                <Link
                                  to={replyHref}
                                  className="hover:opacity-80 transition-opacity"
                                  aria-label={`View ${replyName}'s profile`}
                                >
                                  <Avatar address={replyWallet} size="sm" />
                                </Link>
                                <div className="flex-1">
                                  <div className="flex items-baseline gap-2 mb-1">
                                    <Link
                                      to={replyHref}
                                      className="font-bold text-xs text-gray-100 hover:text-violet-400 transition-colors"
                                    >
                                      {replyName}
                                    </Link>
                                    <span className="text-[10px] text-gray-500 font-medium">
                                      <TimeAgo timestamp={new Date(reply.created_at).getTime()} />
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400 leading-relaxed">{reply.content}</p>
                                  <div className="flex gap-4 mt-1.5">
                                    <button
                                      onClick={() => setReplyingTo({ id: comment.id, username: replyName })}
                                      className="text-[10px] text-gray-500 font-bold hover:text-violet-400 transition-colors uppercase tracking-tight"
                                    >
                                      Reply
                                    </button>
                                    {/* Reply Like Button Updated */}
                                    <button
                                      onClick={() => handleToggleLike(reply.id)}
                                      className={`text-[10px] font-semibold flex items-center gap-1.5 transition-all p-1 -m-1 rounded-lg hover:bg-white/5 ${
                                        replyIsLiked ? 'text-pink-500' : 'text-gray-500 hover:text-pink-400'
                                      } ${!replyIsLiked ? 'active:scale-95' : 'active:scale-95'}`}
                                    >
                                      <motion.div
                                        animate={replyIsLiked ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                                        transition={{ duration: 0.3 }}
                                      >
                                        <Heart 
                                          size={12} 
                                          fill={replyIsLiked ? "currentColor" : "transparent"} 
                                          strokeWidth={2.5}
                                        />
                                      </motion.div>
                                      {reply.likes_count}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {comments.length === 0 && (
                   <div className="text-center text-gray-600 py-10 text-sm italic">
                    Be the first to say something!
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="trades"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Filter Header */}
              <div className="flex items-center gap-3 p-4 border-b border-gray-800 bg-gray-900/40">
                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Filter by size</span>
                <button
                  onClick={() => setFilterSize(!filterSize)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${filterSize ? 'bg-violet-600' : 'bg-gray-800'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${filterSize ? 'left-6' : 'left-1'}`} />
                </button>
                <span className="text-[10px] text-gray-300 bg-gray-900 px-2 py-1 rounded border border-gray-800 font-bold">
                   {'>'} 0.05 BNB
                </span>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-5 text-[10px] text-gray-500 px-4 md:px-6 py-3 font-black uppercase tracking-widest bg-gray-900/40 border-b border-gray-800">
                <div className="col-span-1">Account</div>
                <div className="col-span-1">Type</div>
                <div className="col-span-1 text-right">Amount ({tokenSymbol})</div>
                <div className="col-span-1 text-right">Amount (BNB)</div>
                <div className="col-span-1 text-right">Time</div>
              </div>

              {/* Table Body */}
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                {displayedTrades.length > 0 ? (
                  displayedTrades.map((trade) => (
                    <a
                      key={trade.hash}
                      href={`https://testnet.bscscan.com/tx/${trade.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid grid-cols-5 px-4 md:px-6 py-3 md:py-4 text-sm hover:bg-white/5 transition-colors border-b border-gray-800 last:border-0 items-center"
                    >
                      <div className="flex items-center gap-2 col-span-1 overflow-hidden">
                        <Avatar address={trade.maker} size="sm" />
                        <span className="text-gray-400 text-xs font-mono truncate">
                          {trade.maker.slice(0, 4)}...{trade.maker.slice(-4)}
                        </span>
                      </div>
                      <div className={`col-span-1 font-black uppercase text-xs tracking-tighter ${trade.isBuy ? 'text-emerald-400' : 'text-rose-500'}`}>
                        {trade.isBuy ? 'Buy' : 'Sell'}
                      </div>
                      <div className="col-span-1 text-right font-mono text-gray-200">
                        {parseFloat(trade.tokenAmount).toFixed(2)}
                      </div>
                      <div className="col-span-1 text-right">
                        <div className="text-gray-100 font-mono text-xs font-bold">
                          {parseFloat(trade.bnbAmount).toFixed(4)}
                        </div>
                        <div className="text-gray-500 text-[10px] font-medium">
                          ${(parseFloat(trade.bnbAmount) * bnbPrice).toFixed(2)}
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-gray-500 text-[10px] font-medium">
                        <TimeAgo timestamp={trade.timestamp} />
                      </div>
                    </a>
                  ))
                ) : (
                  <div className="text-center text-gray-600 py-16 text-sm italic">
                    No trades yet. Make a swap to see it appear!
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}