import Wheel from '../components/Wheel'
import { useAccount } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { LUCKY_WHEEL_ABI } from '../constants/abis'

const WHEEL_ADDRESS = import.meta.env.VITE_WHEEL_TREASURY as `0x${string}`

export default function LuckyWheel() {
  const { isConnected } = useAccount()
  const { authenticated } = usePrivy()
  const isReady = isConnected || authenticated

  return (
    <div
      className="relative w-full -mt-4 md:-mt-6 flex flex-col overflow-hidden"
      style={{ height: 'calc(100vh - 60px)' }}
    >
      {/* Ambient stage background */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* Deep gradient base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% 30%, rgba(76,29,149,0.35) 0%, rgba(30,27,75,0.25) 35%, rgba(10,8,20,0.95) 75%, #050308 100%)',
          }}
        />
        {/* Stage spotlight from above */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 55% 40% at 50% 38%, rgba(167,139,250,0.22) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)',
            mixBlendMode: 'screen',
          }}
        />
        {/* Floor reflection band */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3"
          style={{
            background:
              'linear-gradient(to top, rgba(91,33,182,0.18) 0%, rgba(139,92,246,0.05) 40%, transparent 100%)',
          }}
        />
        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        <Wheel
          treasuryAddress={WHEEL_ADDRESS}
          treasuryABI={LUCKY_WHEEL_ABI}
          disabled={!isReady}
        />
      </div>
    </div>
  )
}
