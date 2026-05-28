import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, ArrowLeftRight, Gift } from 'lucide-react'

const tabs = [
  { id: 'ico', label: 'ICO', Icon: Rocket, accent: 'yellow' },
  { id: 'trading', label: 'Trading', Icon: ArrowLeftRight, accent: 'green' },
  { id: 'airdrop', label: 'Airdrop', Icon: Gift, accent: 'purple' },
] as const

type TabId = (typeof tabs)[number]['id']

const accentMap = {
  yellow: {
    tab: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    heading: 'text-yellow-400',
    number: 'text-yellow-400 font-bold',
  },
  green: {
    tab: 'bg-green-500/20 text-green-400 border border-green-500/30',
    heading: 'text-green-400',
    number: 'text-green-400 font-bold',
  },
  purple: {
    tab: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    heading: 'text-purple-400',
    number: 'text-purple-400 font-bold',
  },
}

export default function HowItWorksTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('ico')

  return (
    <div className="bg-gray-900/50 rounded-2xl p-4 md:p-6 border border-gray-800">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg md:text-xl font-bold text-gray-100">How it works</h2>
        <p className="text-sm text-gray-500 mt-1">Your token's journey through three phases</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-5">
        {tabs.map(({ id, label, Icon, accent }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === id
                ? accentMap[accent].tab
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'ico' && <ICOContent />}
          {activeTab === 'trading' && <TradingContent />}
          {activeTab === 'airdrop' && <AirdropContent />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function ICOContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300 leading-relaxed">
        The ICO has a goal of{' '}
        <span className="text-yellow-400 font-bold">24 BNB</span>. Tokens are sold across{' '}
        <span className="text-yellow-400 font-bold">10 rounds</span> at increasing prices — early buyers get the best deal.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Success */}
        <div className="bg-gray-900 border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-400 text-lg">&#10003;</span>
            <span className="text-sm font-semibold text-green-400">Goal reached</span>
          </div>
          <ul className="space-y-1.5 text-xs text-green-300/80">
            <li>
              <span className="text-green-400 font-bold">1 BNB</span> goes to the token creator as a reward.
            </li>
            <li>
              Remaining <span className="text-green-400 font-bold">23 BNB</span> seed the liquidity pool.
            </li>
            <li>Trading begins automatically.</li>
          </ul>
        </div>

        {/* Failure */}
        <div className="bg-gray-900 border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400 text-lg">&#10007;</span>
            <span className="text-sm font-semibold text-red-400">Goal not reached</span>
          </div>
          <ul className="space-y-1.5 text-xs text-red-300/80">
            <li>
              ICO has <span className="text-red-400 font-bold">no deadline.</span> It will run until the ICO goal has been achieved.
            </li>
            <li>
              During the ICO, contributors can <span className="text-red-400 font-bold">withdraw</span> their BNB whenever they want.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function TradingContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300 leading-relaxed">
        Once the ICO succeeds, an AMM liquidity pool launches with{' '}
        <span className="text-green-400 font-bold">40% of the token supply</span> paired with{' '}
        <span className="text-green-400 font-bold">23 BNB</span> of liquidity. Anyone can trade freely on the bonding curve.
      </p>

      <div className="bg-gray-900 border border-gray-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Gift size={16} className="text-green-400" />
          <span className="text-sm font-semibold text-green-400">Next milestone: Airdrop</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          When the pool reaches <span className="text-green-400 font-bold">50 BNB</span> in liquidity,
          the airdrop unlocks for top holders. Trade, grow the pool, and earn your share!
        </p>
      </div>
    </div>
  )
}

function AirdropContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300 leading-relaxed">
        When pool liquidity hits <span className="text-purple-400 font-bold">50 BNB</span>,{' '}
        <span className="text-purple-400 font-bold">10% of the total token supply</span> is unlocked from the vault
        and distributed automatically.
      </p>

      <div className="bg-gray-900 border border-gray-700/50 rounded-lg p-4">
        <div className="text-sm font-semibold text-purple-400 mb-2">Who qualifies?</div>
        <p className="text-xs text-gray-400 leading-relaxed">
          The top <span className="text-purple-400 font-bold">20% of holders</span> — all addresses that cumulatively hold
          20% of the token supply — receive their proportional share. It's a reward for early believers and active traders.
        </p>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 bg-purple-900/20 border border-purple-800/20 rounded-lg p-3 text-center">
          <div className="text-base md:text-lg font-bold text-purple-400">50 BNB</div>
          <div className="text-xs text-gray-500">Pool threshold</div>
        </div>
        <div className="flex-1 bg-purple-900/20 border border-purple-800/20 rounded-lg p-3 text-center">
          <div className="text-base md:text-lg font-bold text-purple-400">10%</div>
          <div className="text-xs text-gray-500">Supply unlocked</div>
        </div>
        <div className="flex-1 bg-purple-900/20 border border-purple-800/20 rounded-lg p-3 text-center">
          <div className="text-base md:text-lg font-bold text-purple-400">Top 20%</div>
          <div className="text-xs text-gray-500">Holders rewarded</div>
        </div>
      </div>
    </div>
  )
}
