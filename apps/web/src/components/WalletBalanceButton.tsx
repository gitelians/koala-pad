import { useEffect, useRef, useState } from 'react'
import { useBalance } from 'wagmi'
import { ChevronDown, ArrowDownToLine, Check } from 'lucide-react'
import { IoCopyOutline } from 'react-icons/io5'
import { SiBinance } from 'react-icons/si'
import { getBnbPrice, getCachedBnbPrice } from '../lib/bnbPrice'

interface WalletBalanceButtonProps {
  address: `0x${string}` | undefined
}

const FAUCET_URL = 'https://www.bnbchain.org/en/testnet-faucet'

export default function WalletBalanceButton({ address }: WalletBalanceButtonProps) {
  const [open, setOpen] = useState(false)
  const [bnbPrice, setBnbPrice] = useState(getCachedBnbPrice())
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { data: bal } = useBalance({ address })

  useEffect(() => {
    getBnbPrice().then(setBnbPrice).catch(() => {})
  }, [])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const bnbAmount = bal ? Number(bal.formatted) : 0
  const usdValue = bnbAmount * bnbPrice
  const usdLabel = `$${usdValue.toFixed(2)}`
  const shortAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : ''

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // noop
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 h-10 px-3 md:px-4 bg-gray-900/50 border border-gray-800 rounded-full hover:bg-gray-800/50 hover:border-gray-700 active:scale-95 transition-all duration-200 text-sm font-semibold text-gray-100"
      >
        <span className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-2 w-2 rounded-full bg-violet-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.9)]" />
        </span>
        <span>{usdLabel}</span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className="absolute right-0 mt-2 w-72 z-50 grid transition-all duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="bg-gray-900 rounded-2xl shadow-xl border border-gray-800 p-4">
            <div className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
              Your balance
            </div>
            <div className="mt-1 text-3xl font-bold text-white">{usdLabel}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
              <SiBinance className="text-[#F3BA2F]" size={12} />
              <span>
                {bnbAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} BNB
              </span>
              <span className="text-gray-600">Available</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!address}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-full text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
            >
              <span className="font-mono">{shortAddress || '—'}</span>
              {copied ? (
                <Check size={12} className="text-violet-300" />
              ) : (
                <IoCopyOutline size={12} />
              )}
            </button>

            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-4 flex items-center gap-3 w-full p-3 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 hover:border-gray-700 rounded-xl transition-colors group"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/15 text-violet-300 group-hover:bg-violet-500/25 transition-colors">
                <ArrowDownToLine size={18} />
              </span>
              <span className="flex flex-col items-start">
                <span className="text-sm font-semibold text-gray-100">Deposit</span>
                <span className="text-[11px] text-gray-400">Get test BNB</span>
              </span>
            </a>

            <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
              Click <span className="text-gray-300 font-medium">Deposit</span> to
              get test BNB, then copy and paste your address into the field on
              the faucet page.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
