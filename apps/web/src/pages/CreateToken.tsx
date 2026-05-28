import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { decodeEventLog } from 'viem'
import { usePrivy } from '@privy-io/react-auth'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { insertToken, uploadTokenImage, checkQuestCompletion } from '../lib/supabaseApi'
import Toast, { ToastState, showToastFor } from '../components/Toast'
import { FaTelegramPlane } from 'react-icons/fa'
import { FaXTwitter } from "react-icons/fa6"
import { TbWorld } from "react-icons/tb"
import HowItWorksTabs from '../components/HowItWorksTabs'
import { FACTORY_ABI } from '../constants/abis'

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS as `0x${string}`

export default function CreateCoin() {
  const { address: userAddress, isConnected } = useAccount()
  const { authenticated } = usePrivy()
  const { userId, walletAddress: profileWallet } = useAuth()
  const navigate = useNavigate()
  // Effective wallet address: wagmi's connected account, or the wallet linked to
  // the Privy session (covers embedded wallets created on email/social login).
  const effectiveAddress = (userAddress || profileWallet || '') as string
  const isReady = isConnected || authenticated

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const savingRef = useRef(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const publicClient = usePublicClient()

  const showToast = useCallback(
    (message: string, type: ToastState['type']) => showToastFor(setToast, message, type),
    [],
  )

  const { data: hash, writeContract, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // After the createToken tx confirms we read the receipt and decode
  // the TokenCreated event - this avoids any race with concurrent
  // creators (no more reliance on tokens(uint256) by index).
  useEffect(() => {
    const saveDataForNewToken = async () => {
      if (!isSuccess || !hash || savingRef.current || !publicClient) return
      savingRef.current = true

      let tokenAddress: `0x${string}` | undefined
      let poolAddress: `0x${string}` | undefined
      let icoAddress: `0x${string}` | undefined
      let vaultAddress: `0x${string}` | undefined

      try {
        const receipt = await publicClient.getTransactionReceipt({ hash })
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) continue
          try {
            const decoded = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics })
            if (decoded.eventName === 'TokenCreated') {
              const args = decoded.args as any
              tokenAddress = args.token as `0x${string}`
              poolAddress = args.pool as `0x${string}`
              icoAddress = args.ico as `0x${string}`
              vaultAddress = args.vault as `0x${string}`
              break
            }
          } catch { /* not our event */ }
        }
      } catch (err) {
        console.error('Failed to read tx receipt:', err)
      }

      if (!tokenAddress) {
        showToast('Tx confirmed but could not parse TokenCreated event.', 'error')
        return
      }

      showToast('Saving token data...', 'success')

      try {
        let imageUrl: string | undefined
        if (imageFile) imageUrl = await uploadTokenImage(tokenAddress, imageFile)

        if (userId && effectiveAddress) {
          await insertToken({
            token_address: tokenAddress.toLowerCase(),
            pool_address: poolAddress?.toLowerCase(),
            ico_address: icoAddress?.toLowerCase(),
            vault_address: vaultAddress?.toLowerCase(),
            creator_address: effectiveAddress.toLowerCase(),
            creator_id: userId,
            name,
            symbol,
            description: description || undefined,
            image: imageUrl,
            website: website || undefined,
            x: twitter || undefined,
            telegram: telegram || undefined,
            phase: 'ico',
          })
        }

        if (userId) {
          const createQuests = ['create-1', 'create-2', 'create-3', 'create-4']
          let anyNewlyCompleted = false
          for (const questId of createQuests) {
            const completed = await checkQuestCompletion(userId, questId)
            if (completed) anyNewlyCompleted = true
          }
          if (anyNewlyCompleted) {
            showToast('Token created! Quest(s) unlocked — claim your rewards!', 'success')
          } else {
            showToast('Token created successfully!', 'success')
          }
        } else {
          showToast('Token created successfully!', 'success')
        }
        navigate(`/token/${tokenAddress}`)
      } catch (err) {
        console.error('Failed to save token data:', err)
        showToast('Token created on-chain but failed to save metadata.', 'error')
        navigate(`/token/${tokenAddress}`)
      }
    }
    saveDataForNewToken()
  }, [isSuccess, hash, publicClient, navigate, showToast]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        showToast('Image size must be less than 10MB', 'error')
        return
      }

      if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error')
        return
      }

      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isReady) {
      showToast('Please sign in first', 'error')
      return
    }

    if (!imageFile) {
      showToast('Please upload a token image', 'error')
      return
    }

    if (!name || !symbol) {
      showToast('Please fill required fields (Name and Symbol)', 'error')
      return
    }

    savingRef.current = false

    try {
      writeContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createToken',
        args: [name, symbol],
      })
    } catch (error) {
      console.error('Error creating token:', error)
      showToast('Failed to create token', 'error')
    }
  }

  return (
    <div className="w-full pb-20 relative">
      <Toast toast={toast} />

      <div className="flex flex-col lg:flex-row gap-6 md:gap-8 lg:justify-center lg:mx-auto lg:max-w-5xl lg:items-start">
        {/* Left: Create form */}
        <div className="flex-1 lg:max-w-xl lg:min-h-screen">
          <h2 className="text-base md:text-lg font-medium text-gray-100 mb-4 md:mb-6">Create Your Token</h2>

          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Token Image <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-4 md:gap-6">
                <label htmlFor="image-upload" className="cursor-pointer">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-gray-800 flex items-center justify-center overflow-hidden bg-gray-900 hover:border-violet-500 transition-colors">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Token preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-4xl text-gray-600">+</div>
                  )}
                </div>
              </label>
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {handleImageChange(e)}}
                    className="hidden"
                    id="image-upload"
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer inline-block px-4 py-2 bg-gray-900 text-gray-200 rounded-lg transition-colors font-medium border border-gray-800 hover:border-violet-500"
                  >
                    Choose Image
                  </label>
                  <p className="text-xs text-gray-500 mt-2">
                    Recommended: Square image, max 10MB
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Token Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Coin"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200 outline-none text-gray-100 placeholder-gray-600"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Token Symbol <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="MAC"
                maxLength={10}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200 outline-none text-gray-100 placeholder-gray-600"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description <span className="text-gray-500">(Optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell the community about your token..."
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200 outline-none resize-none text-gray-100 placeholder-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                {description.length}/500 characters
              </p>
            </div>

            {/* Social Links */}
            <div className="pt-4 md:pt-6 border-t border-gray-800 space-y-3 md:space-y-4">
              <h3 className="text-sm font-semibold text-gray-300">Social Links <span className="text-gray-500 font-normal">(Optional)</span></h3>

              <div className="flex items-center gap-3">
                <div className="text-gray-400 w-5 flex justify-center"><TbWorld size="1.2em" /></div>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200 outline-none text-gray-100 text-sm"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="text-gray-400 w-5 flex justify-center"><FaXTwitter size="1.2em" /></div>
                <input
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="https://x.com/username"
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200 outline-none text-gray-100 text-sm"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="text-gray-400 w-5 flex justify-center"><FaTelegramPlane size="1.2em" /></div>
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="https://t.me/group"
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-all duration-200 outline-none text-gray-100 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending || isConfirming || !isReady}
              className="w-full py-4 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(139,92,246,0.3)] active:scale-95"
            >
              {isPending ? 'Waiting for approval...' : isConfirming ? 'Creating token...' : 'Create Token'}
            </button>

            {hash && (
              <div className="text-center text-sm text-gray-500">
                Transaction: <span className="font-mono">{hash.slice(0, 10)}...{hash.slice(-8)}</span>
              </div>
            )}
          </form>
        </div>

        {/* Right: Preview + How it works (sticky) */}
        <div className="lg:w-[380px] flex-shrink-0 lg:sticky lg:top-24 lg:self-start space-y-4 h-fit z-10">
          {/* Live preview card */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="relative aspect-square">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-600/30 to-purple-800/30" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
              <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                ICO
              </span>
              <div className="absolute bottom-3 left-4">
                <div className="text-sm font-bold text-white truncate max-w-[240px] drop-shadow-lg">
                  {name || 'Your token name'}
                </div>
                <div className="text-xs text-violet-400 font-semibold drop-shadow-lg">
                  ${symbol || 'SYMBOL'}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 space-y-3">
              {description ? (
                <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">
                  {description}
                </p>
              ) : (
                <p className="text-xs text-gray-600 italic">
                  Your description will appear here...
                </p>
              )}

              {(website || twitter || telegram) && (
                <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.preventDefault()}
                      className="text-gray-400 hover:text-violet-400 transition-colors"
                      aria-label="Website"
                    >
                      <TbWorld size="1.1em" />
                    </a>
                  )}
                  {twitter && (
                    <a
                      href={twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.preventDefault()}
                      className="text-gray-400 hover:text-violet-400 transition-colors"
                      aria-label="X"
                    >
                      <FaXTwitter size="1.1em" />
                    </a>
                  )}
                  {telegram && (
                    <a
                      href={telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.preventDefault()}
                      className="text-gray-400 hover:text-violet-400 transition-colors"
                      aria-label="Telegram"
                    >
                      <FaTelegramPlane size="1.1em" />
                    </a>
                  )}
                </div>
              )}

              <div className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold pt-1">
                Live preview
              </div>
            </div>
          </div>
          <HowItWorksTabs />
        </div>
      </div>
    </div>
  )
}
