export const TOKEN_ABI = [
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const;

export const POOL_ABI = [
  { inputs: [], name: 'reserveToken', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'reserveBNB', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'initialized', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'minTokenOut', type: 'uint256' }], name: 'swapExactBNBForTokens', outputs: [{ type: 'uint256' }], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'tokenIn', type: 'uint256' }, { name: 'minBNBOut', type: 'uint256' }], name: 'swapExactTokensForBNB', outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'getPrice', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'totalSupply', type: 'uint256' }], name: 'getMarketCap', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  // Creator-fee program (Pool side):
  { inputs: [], name: 'creator', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'creatorFeesAccrued', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'claimCreatorFees', outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'creator', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'CreatorFeesClaimed', type: 'event' },
] as const;

export const FACTORY_ABI = [
  {
    inputs: [{ name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }],
    name: 'createToken',
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'pool', type: 'address' },
      { name: 'ico', type: 'address' },
      { name: 'vault', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  { inputs: [{ name: '', type: 'uint256' }], name: 'tokens', outputs: [{ name: 'token', type: 'address' }, { name: 'pool', type: 'address' }, { name: 'ico', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'creator', type: 'address' }, { name: 'createdAt', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getTokenCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  // Event we listen to in CreateToken.tsx to recover the deployed addresses.
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'token', type: 'address' },
      { indexed: true, name: 'pool', type: 'address' },
      { indexed: false, name: 'ico', type: 'address' },
      { indexed: false, name: 'vault', type: 'address' },
      { indexed: false, name: 'creator', type: 'address' },
      { indexed: false, name: 'name', type: 'string' },
      { indexed: false, name: 'symbol', type: 'string' },
    ],
    name: 'TokenCreated',
    type: 'event',
  },
] as const;

export const ICO_ABI = [
  { inputs: [], name: 'buy', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [{ name: 'grossBnb', type: 'uint256' }], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'claimTokens', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  {
    inputs: [],
    name: 'getICOInfo',
    outputs: [
      { name: '_currentRound', type: 'uint256' },
      { name: '_tokensSoldInCurrentRound', type: 'uint256' },
      { name: '_totalBNBRaised', type: 'uint256' },
      { name: '_finalized', type: 'bool' },
      { name: '_currentPrice', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  { inputs: [{ name: 'round', type: 'uint256' }], name: 'getRoundPrice', outputs: [{ type: 'uint256' }], stateMutability: 'pure', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'contributions', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'tokensPurchased', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'tokensClaimed', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'currentRound', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalBNBRaised', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'finalized', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'tokensSoldInCurrentRound', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ICO_GOAL', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'TOKENS_PER_ROUND', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'TOTAL_ROUNDS', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  // Creator-fee program (ICO side):
  { inputs: [], name: 'creator', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'creatorFeesAccrued', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'claimCreatorFees', outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'buyer', type: 'address' }, { indexed: false, name: 'round', type: 'uint256' }, { indexed: false, name: 'tokens', type: 'uint256' }, { indexed: false, name: 'bnb', type: 'uint256' }], name: 'TokensPurchased', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'buyer', type: 'address' }, { indexed: false, name: 'grossBnb', type: 'uint256' }, { indexed: false, name: 'netBnb', type: 'uint256' }, { indexed: false, name: 'tokensReturned', type: 'uint256' }], name: 'TokensWithdrawn', type: 'event' },
  { anonymous: false, inputs: [{ indexed: false, name: 'totalRaised', type: 'uint256' }], name: 'ICOFinalized', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'user', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'TokensClaimed', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'creator', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'CreatorFeesClaimed', type: 'event' },
] as const;

export const VAULT_ABI = [
  {
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'triggerAirdrop',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  { inputs: [], name: 'airdropTriggered', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'isEligible', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'THRESHOLD', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { anonymous: false, inputs: [{ indexed: false, name: 'totalTokens', type: 'uint256' }, { indexed: false, name: 'recipientCount', type: 'uint256' }, { indexed: false, name: 'listHash', type: 'bytes32' }], name: 'AirdropDistributed', type: 'event' },
] as const;

export const LUCKY_WHEEL_ABI = [
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'claimPrize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  { inputs: [], name: 'balance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;
