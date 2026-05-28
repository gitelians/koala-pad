export interface Quest {
  id: string
  title: string
  description: string
  kpReward: number
  coinsReward?: number
  category: string
  target: number
}

export const CATEGORY_LABELS: Record<string, string> = {
  create: 'Create Tokens',
  buy: 'Buy Tokens',
  hold: 'Hold Tokens',
  trade: 'Trading Volume',
  spin: 'Lucky Wheel',
  coins: 'Spend COINS',
  social: 'Social',
  boost: 'Boosts',
}

export const CATEGORY_ORDER = ['create', 'buy', 'hold', 'trade', 'spin', 'coins', 'social', 'boost']

export const QUESTS: Quest[] = [
  // Create Tokens
  { id: 'create-1', title: 'Token Creator', description: 'Create your first token', kpReward: 10, category: 'create', target: 1 },
  { id: 'create-2', title: 'Token Creator', description: 'Create 3 tokens', kpReward: 20, category: 'create', target: 3 },
  { id: 'create-3', title: 'Token Creator', description: 'Create 5 tokens', kpReward: 50, coinsReward: 100, category: 'create', target: 5 },
  { id: 'create-4', title: 'Token Creator', description: 'Create 10 tokens', kpReward: 100, coinsReward: 200, category: 'create', target: 10 },
  // Buy Tokens
  { id: 'buy-1', title: 'First Trade', description: 'Buy any amount of any token', kpReward: 15, category: 'buy', target: 1 },
  { id: 'buy-2', title: 'Collection Starter', description: 'Buy 3 different tokens', kpReward: 30, category: 'buy', target: 3 },
  { id: 'buy-3', title: 'Diversified', description: 'Buy 5 different tokens', kpReward: 60, coinsReward: 150, category: 'buy', target: 5 },
  { id: 'buy-4', title: 'Portfolio Pro', description: 'Buy 10 different tokens', kpReward: 120, coinsReward: 300, category: 'buy', target: 10 },
  // Holding Tokens
  { id: 'hold-1', title: 'Diamond Hands', description: 'Hold 1 token in your wallet', kpReward: 10, category: 'hold', target: 1 },
  { id: 'hold-2', title: 'Steady Stasher', description: 'Hold 3 different tokens in your wallet', kpReward: 50, category: 'hold', target: 3 },
  { id: 'hold-3', title: 'Vault Keeper', description: 'Hold 5 different tokens in your wallet', kpReward: 100, coinsReward: 200, category: 'hold', target: 5 },
  { id: 'hold-4', title: 'HODL Legend', description: 'Hold 10 different tokens in your wallet', kpReward: 200, coinsReward: 500, category: 'hold', target: 10 },
  // Trading Volume
  { id: 'trade-1', title: 'Little Fish', description: 'Trade a total of $10', kpReward: 15, coinsReward: 150, category: 'trade', target: 10 },
  { id: 'trade-2', title: 'Tuna', description: 'Trade a total of $20', kpReward: 25, coinsReward: 250, category: 'trade', target: 20 },
  { id: 'trade-3', title: 'Shark', description: 'Trade a total of $50', kpReward: 50, coinsReward: 500, category: 'trade', target: 50 },
  { id: 'trade-4', title: 'Whale', description: 'Trade a total of $100', kpReward: 100, coinsReward: 1000, category: 'trade', target: 100 },
  // Lucky Wheel
  { id: 'spin-1', title: 'Lucky Spin', description: 'Spin the lucky wheel 1 time', kpReward: 10, category: 'spin', target: 1 },
  { id: 'spin-2', title: 'Triple Luck', description: 'Spin the lucky wheel 3 times', kpReward: 20, category: 'spin', target: 3 },
  { id: 'spin-3', title: 'Fateful Five', description: 'Spin the lucky wheel 5 times', kpReward: 40, category: 'spin', target: 5 },
  { id: 'spin-4', title: 'Wheel Master', description: 'Spin the lucky wheel 10 times', kpReward: 80, coinsReward: 100, category: 'spin', target: 10 },
  // Spend COINS
  { id: 'coins-1', title: 'Big Spender', description: 'Spend 1,000 COINS', kpReward: 50, category: 'coins', target: 1000 },
  { id: 'coins-2', title: 'Wealth Spreader', description: 'Spend 2,500 COINS', kpReward: 120, category: 'coins', target: 2500 },
  { id: 'coins-3', title: 'Coin Crusher', description: 'Spend 5,000 COINS', kpReward: 250, category: 'coins', target: 5000 },
  { id: 'coins-4', title: 'Treasure Titan', description: 'Spend 10,000 COINS', kpReward: 500, category: 'coins', target: 10000 },
  // Social
  { id: 'follow-x', title: 'X Explorer', description: 'Follow our official account on X', kpReward: 20, coinsReward: 500, category: 'social', target: 1 },
  // Boosts
  { id: 'boost-1', title: 'Power Up', description: 'Buy your first boost', kpReward: 20, category: 'boost', target: 1 },
  { id: 'boost-2', title: 'Triple Threat', description: 'Buy 3 boosts', kpReward: 75, coinsReward: 100, category: 'boost', target: 3 },
  { id: 'boost-3', title: 'Turbo Charged', description: 'Buy 5 boosts', kpReward: 150, coinsReward: 250, category: 'boost', target: 5 },
  { id: 'boost-4', title: 'Max Overdrive', description: 'Buy 10 boosts', kpReward: 300, coinsReward: 500, category: 'boost', target: 10 },
]
