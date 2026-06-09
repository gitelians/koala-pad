# Koala Pad — Complete Technical Documentation

> A decentralized token launchpad and gaming ecosystem on BNB Smart Chain Testnet.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Variables](#4-environment-variables)
5. [Authentication](#5-authentication)
6. [Smart Contracts](#6-smart-contracts)
   - 6.1 [Token](#61-token)
   - 6.2 [LaunchpadFactory](#62-launchpadfactory)
   - 6.3 [Pool (AMM)](#63-pool-amm)
   - 6.4 [ICO](#64-ico)
   - 6.5 [AirdropVault](#65-airdropvault)
   - 6.6 [LuckyWheel](#66-luckywheel)
   - 6.7 [ProtocolTreasury](#67-protocoltreasury)
   - 6.8 [Shared Libraries](#68-shared-libraries)
7. [Token Creation & Launch — Deep Dive](#7-token-creation--launch--deep-dive)
   - 7.1 [Phase 0 — Pre-Creation (Frontend Form)](#71-phase-0--pre-creation-frontend-form)
   - 7.2 [Phase 1 — Factory Deployment (On-Chain)](#72-phase-1--factory-deployment-on-chain)
   - 7.3 [Phase 2 — Token Initialization](#73-phase-2--token-initialization)
   - 7.4 [Phase 3 — ICO (Pre-Sale)](#74-phase-3--ico-pre-sale)
   - 7.5 [Phase 4 — Finalization & Pool Seeding](#75-phase-4--finalization--pool-seeding)
   - 7.6 [Phase 5 — Trading (AMM)](#76-phase-5--trading-amm)
   - 7.7 [Phase 6 — Airdrop](#77-phase-6--airdrop)
8. [Database Schema](#8-database-schema)
9. [Edge Functions (Backend API)](#9-edge-functions-backend-api)
10. [Frontend Pages](#10-frontend-pages)
11. [Frontend Components](#11-frontend-components)
12. [State Management](#12-state-management)
13. [Quest System](#13-quest-system)
14. [Levels (Status Ladder)](#14-levels-status-ladder)
15. [Creator Rewards Program](#15-creator-rewards-program)
16. [Daily Reward — Lucky Wheel](#16-daily-reward--lucky-wheel)
17. [Shop & Economy](#17-shop--economy)
18. [Security Architecture](#18-security-architecture)
19. [Testing](#19-testing)

---

## 1. Introduction

KoalaPad is a revolutionary token launchpad built on the BNB Chain, that allows users to create and launch tokens in a completely new way.

This new launch system is able to solve what other launchpads are missing: abundant **creator rewards**, **incentive for traders and holders**, and a **realistic market valuation** at launch (not fictitious).   

Here's how it works. At launch, tokens follow a process divided into two distinct phase: 

1. the **ICO** phase,
2. the **Trading** phase.

All tokens that complete the ICO will be automatically deployed into a liquidity pool to start live trading. A constant-product AMM (x*y=k) is embedded for every token, so that no routing to external DEXes is needed.

For each token, if the pool reaches 50 BNB during trading it will be released an **Airdrop** to all eligible users.

**Network:** BNB Smart Chain Testnet (chain ID 97)

**Key design choices:**
- Privy handles authentication — social login (Google, Twitter, etc.), email/OTP, and external wallets (MetaMask, WalletConnect) are all supported from day one.
- Supabase is the backend database and serverless runtime (Edge Functions in Deno).
- All game outcomes and economic awards that touch real BNB go through backend-signed ECDSA claims before touching the chain — this keeps the expensive logic off-chain while maintaining trustlessness.

---

## 2. Tech Stack

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite |
| Routing | React Router DOM v6 |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| 3D graphics | Three.js + @react-three/fiber + @react-three/drei |
| Charts | lightweight-charts, react-ts-tradingview-widgets |
| Icons | Lucide React, React Icons |
| Web3 hooks | Wagmi v2 |
| Low-level Ethereum | Viem |
| Wallet auth | @privy-io/react-auth + @privy-io/wagmi |
| Data fetching | @tanstack/react-query |
| Backend client | @supabase/supabase-js |
| Global state | Zustand |

### Backend

| Layer | Technology |
|---|---|
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (custom JWT) |
| API | Supabase Edge Functions (Deno runtime) |
| JWT verification | jose |
| ECDSA signing | ethers v6 |
| File storage | Supabase Storage |

### Smart Contracts

| Layer | Technology |
|---|---|
| Language | Solidity 0.8.26 |
| Framework | Hardhat |
| Base libraries | OpenZeppelin Contracts (ERC20, Ownable, ReentrancyGuard) |
| Testing | Chai + Mocha via Hardhat |
| TypeScript bindings | TypeChain |

---

## 3. Project Structure

```
koala-pad/
│
├── apps/
│   └── web/                          # React frontend application
│       ├── src/
│       │   ├── main.tsx              # App entry point (providers setup)
│       │   ├── pages/               # Full-page route components
│       │   │   ├── Home.tsx
│       │   │   ├── CreateToken.tsx
│       │   │   ├── Token.tsx
│       │   │   ├── Profile.tsx
│       │   │   ├── Shop.tsx
│       │   │   ├── LuckyWheel.tsx
│       │   │   └── AllGames.tsx
│       │   ├── components/          # Reusable UI components
│       │   │   ├── tradingview/     # Chart wrapper
│       │   │   ├── Header.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── SwapPanel.tsx
│       │   │   ├── ICOPanel.tsx
│       │   │   ├── Quests.tsx
│       │   │   ├── Levels.tsx
│       │   │   ├── Wheel.tsx
│       │   │   ├── AllTokens.tsx
│       │   │   ├── ActivityTabs.tsx
│       │   │   ├── CreatorRewardsChart.tsx
│       │   │   ├── FollowListModal.tsx
│       │   │   └── Toast.tsx
│       │   ├── context/             # React contexts
│       │   │   ├── AuthContext.tsx
│       │   │   └── QuestContext.tsx
│       │   ├── hooks/               # Custom React hooks
│       │   │   └── useWatchlist.ts
│       │   ├── lib/                 # Backend client wrappers
│       │   │   ├── supabase.ts
│       │   │   └── supabaseApi.ts
│       │   ├── constants/
│       │   │   └── abis.ts          # All contract ABIs
│       │   ├── data/
│       │   │   └── quests.ts        # Static quest definitions
│       │   ├── utils/
│       │   │   └── gamification.ts  # KP/level math
│       │   └── wagmi/
│       │       └── config.ts        # Chain + connector config
│       ├── .env                     # Frontend environment variables
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       └── tsconfig.json
│
├── contracts/                        # Hardhat smart contract project
│   ├── src/
│   │   ├── Token.sol
│   │   ├── LaunchpadFactory.sol
│   │   ├── Pool.sol
│   │   ├── ICO.sol
│   │   ├── AirdropVault.sol
│   │   ├── LuckyWheel.sol
│   │   ├── ProtocolTreasury.sol
│   │   └── libs/
│   │       ├── Math.sol
│   │       └── SignedClaims.sol
│   ├── test/
│   ├── scripts/
│   │   ├── deploy.ts
│   │   └── createToken.ts
│   ├── deployments/                 # Saved deployment addresses
│   ├── artifacts/                   # Compiled contract artifacts
│   └── hardhat.config.ts
│
└── supabase/                         # Supabase Edge Functions
    └── functions/
        ├── _shared/                 # Shared helpers
        │   ├── auth.ts
        │   ├── cors.ts
        │   └── signer.ts
        ├── privy-auth/
        ├── claim-quest/
        ├── wheel-spin/
        ├── purchase-boost/
        ├── purchase-coins/
        ├── record-creator-reward/
        ├── record-creator-fee-claim/
        └── grant-fee-exemption/
```

---

## 4. Environment Variables

### Frontend (`apps/web/.env`)

```bash
# Privy — Authentication provider
VITE_PRIVY_APP_ID=<your-privy-app-id>

# WalletConnect — External wallet support
VITE_WALLETCONNECT_PROJECT_ID=<your-walletconnect-project-id>

# Supabase — Database & Edge Functions
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_KEY=<supabase-anon-public-key>

# Smart Contracts
VITE_FACTORY_ADDRESS=<deployed-launchpad-factory-address>

# RPC
VITE_BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
```

> **Note:** `VITE_SUPABASE_KEY` is the public anon key — safe to expose. Never put the service role key here.

### Contracts (`contracts/.env`)

```bash
# RPC + deployer
BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
DEPLOYER_PRIVATE_KEY=<deployer-private-key>   # wallet paying gas for deployment
BSCSCAN_API_KEY=<bscscan-api-key>             # for contract verification

# Role addresses (public keys only — private keys stay off-chain)
PROTOCOL_OWNER=<owner-address>                # multisig that owns Treasury/games
CLAIM_SIGNER_ADDRESS=<signer-address>         # public key for LuckyWheel
FEE_EXEMPTION_GRANTER=<granter-address>       # hot wallet that can call grantFeeExemption
AIRDROP_SIGNER_ADDRESS=<airdrop-signer-address> # public key for AirdropVault
```

> **Local testing:** all four role addresses may be the same address as the deployer.  In production, `PROTOCOL_OWNER` should be a multisig (cold wallet) and the signer addresses should be separate hot wallets.

### Supabase Edge Functions (`supabase/.env` / Supabase secrets)

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEYS=<service-role-key>
SUPA_JWT_SECRET=<jwt-secret-matching-supabase-settings>
PRIVY_APP_ID=<privy-app-id>
PRIVY_JWKS_URL=https://auth.privy.io/oauth/.well-known/jwks.json
CLAIM_SIGNER_PRIVATE_KEY=<backend-hot-wallet-private-key>
CHAIN_ID=97
LUCKY_WHEEL_ADDRESS=<lucky-wheel-contract-address>
PROTOCOL_TREASURY_ADDRESS=<protocol-treasury-address>
ALLOWED_ORIGINS=https://your-app.com,https://www.your-app.com   # comma-separated allow-list

# Trade indexer (index-trades function — see §7.6.1 / §9)
BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545     # chain reads for eth_getLogs
INDEXER_SECRET=<random-shared-secret>                          # must equal the Vault 'indexer_secret' used by the cron
```

> **`INDEXER_SECRET` lives in two stores that must hold the same value:** the Edge Function secret (read by the function via `Deno.env`) and a Vault secret named `indexer_secret` (read by the `pg_cron` job). Rotating it means updating both.

> **CLAIM_SIGNER_PRIVATE_KEY** is a hot wallet that signs game prizes. Its matching public key must be registered in `ProtocolTreasury` as `airdropSigner`, and passed as the `signer` argument to the `LuckyWheel` constructor.

---

## 5. Authentication

Authentication in Koala Pad is a two-layer system: **Privy** handles the user-facing login experience, and **Supabase** handles all database-level authorization.

### 5.1 How It Works

```
User
  │
  ▼
Privy Login UI
  │  (social / email / external wallet)
  ▼
Privy issues its own JWT
  │
  ▼
Frontend calls supabase/functions/privy-auth
  │  (sends Privy JWT + optional wallet proof)
  ▼
Edge Function verifies Privy JWT against Privy JWKS
  │
  ├─ New user?  → INSERT into users table
  └─ Existing?  → UPDATE last_seen
  │
  ▼
Edge Function mints a Supabase JWT
  │  (subject = user UUID, exp = 1 hour)
  ▼
Frontend stores Supabase JWT in AuthContext
  │
  ▼
All Supabase requests use this JWT for RLS enforcement
  │
  ▼
Every 50 minutes: silent token refresh (repeat from privy-auth)
```

### 5.2 Login Methods

Privy supports three categories:

| Method | Wallet Creation | Wallet Type |
|---|---|---|
| Email / OTP | Automatic | Embedded (Privy-managed) |
| Social (Google, Twitter, Discord) | Automatic | Embedded (Privy-managed) |
| Wallet | User's own | External |

For embedded wallets, Privy's linked_accounts list is the trusted proof of wallet ownership — no additional signing needed.

For external wallets, the user must sign a challenge message containing their `privyDid` and a timestamp. The `privy-auth` edge function recovers the signer address from this signature and verifies it matches the asserted wallet address.

### 5.3 The `AuthContext`

`src/context/AuthContext.tsx` is the single source of truth for auth state on the frontend.

**Exposed values:**

```typescript
interface AuthContextType {
  userId: string | null;           // Supabase user UUID
  walletAddress: string | null;    // Linked wallet address (0x...)
  profile: UserProfile | null;     // Full user record from DB
  session: { id: string } | null;  // Minimal session info
  isLoading: boolean;              // Initial auth check in progress
  isAuthenticating: boolean;       // Privy→Supabase bridge in progress
  refreshProfile: () => Promise<void>; // Re-fetch user data from DB
}
```

**Key internal functions:**

- `buildAuthPayload(privyToken)` — builds the request body for `privy-auth`. Embedded Privy wallets (`walletClientType === 'privy'`) skip signing and trust Privy's REST verification. External wallets only sign a SIWE-style message **when wagmi reports an active connector** (`useAccount().isConnected`); the signature is produced via wagmi's `useSignMessage` (not Privy's, which only supports embedded wallets). Signing is best-effort — failures fall back to Privy REST verification on the backend.
- `bridgeToSupabase()` — calls `POST /functions/v1/privy-auth` with the payload from `buildAuthPayload()` and stores the returned Supabase JWT.
- The bridge only fires after Privy reports a wallet in `linkedAccounts` — otherwise the backend would receive a null `walletAddress` and refuse to provision the user (see §5.5).
- Token refresh is set up with `setInterval(refresh, TOKEN_REFRESH_INTERVAL)` where `TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000` ms. Refresh re-issues the Supabase JWT against the existing Privy session **without** re-prompting for a wallet signature.

### 5.5 Wallet Verification on the Backend

The `privy-auth` edge function refuses to create a user row without a verified wallet. `public.users.wallet_address` is `NOT NULL` (every downstream feature keys off it), so on first bridge it requires either:

1. The asserted wallet appears in Privy's `linked_accounts` (resolved via the Privy REST API using `PRIVY_APP_ID` + `PRIVY_APP_SECRET`), **or**
2. A valid SIWE-style signature whose recovered signer matches the asserted wallet and whose message contains the user's `privyDid`.

If neither path verifies the wallet, the function returns `400 wallet_not_verified` and no row is inserted. Subsequent refreshes for an already-provisioned user can omit the wallet entirely.

### 5.4 Supabase Client Token Injection

`src/lib/supabase.ts` creates the Supabase client and exports a helper to inject the current JWT:

```typescript
// Every API call goes through this
export const getAuthedClient = (token: string) =>
  createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
```

This means every database query automatically respects RLS policies scoped to the authenticated user.

---

## 6. Smart Contracts

All contracts live in `contracts/src/`. They are written in Solidity 0.8.26 and use OpenZeppelin as their security foundation.

### 6.1 Token

**File:** `contracts/src/Token.sol`

A standard ERC-20 with a fixed, immutable 21 million token supply — a deliberate nod to Bitcoin's scarcity model. Deployed as an **EIP-1167 minimal proxy** (clone) of a shared implementation contract.

```solidity
contract Token is ERC20, ERC20Burnable {
    uint256 public constant MAX_SUPPLY = 21_000_000 * 1e18;
    bool public initialized;          // init guard; also locks the implementation
    string private _tokenName;
    string private _tokenSymbol;

    constructor() ERC20("", "") {
        initialized = true;           // lock implementation — only clones can be used
    }

    // Called exactly once by the factory after the clone is created.
    // Collapses the old two-phase (constructor + initialize) into a single call.
    function initialize(
        string memory name_,
        string memory symbol_,
        address pool,
        address ico,
        address vault
    ) external {
        require(!initialized, "Already initialized");
        initialized = true;
        _tokenName = name_;
        _tokenSymbol = symbol_;
        // Mint the 50/40/10 distribution directly to the three receivers.
        _mint(ico,   MAX_SUPPLY * 50 / 100);
        _mint(pool,  MAX_SUPPLY * 40 / 100);
        _mint(vault, MAX_SUPPLY * 10 / 100);
        emit TokenInitialized(pool, ico, vault, MAX_SUPPLY * 40 / 100);
    }

    // OZ ERC20's _name/_symbol are set only in the constructor, which clones
    // never run. Override the view getters to read our own storage instead.
    function name()   public view override returns (string memory) { return _tokenName; }
    function symbol() public view override returns (string memory) { return _tokenSymbol; }
}
```

**Key properties:**
- No minting after `initialize()` — hard cap enforced by `MAX_SUPPLY`.
- `ERC20Burnable` is included, allowing token holders to burn their balance.
- No `Ownable` needed — `initialize()` is open to the first caller but protected by the `initialized` flag; the factory is always first since it deploys and calls in the same transaction.
- `name()` and `symbol()` read from `_tokenName`/`_tokenSymbol` (our storage) rather than OZ's private `_name`/`_symbol` fields, which are only settable via the ERC20 constructor — inaccessible to clones.

---

### 6.2 LaunchpadFactory

**File:** `contracts/src/LaunchpadFactory.sol`

The factory is the single entry point for creating tokens. One call atomically clones four child contracts and wires them together. Children are deployed as **EIP-1167 minimal proxies** (55-byte clones) pointing at four shared implementation contracts, making `createToken()` roughly **6× cheaper** than the old `new` path and keeping the factory's own bytecode well under the EIP-170 24 KB limit.

```solidity
contract LaunchpadFactory is Ownable, ReentrancyGuard {
    address public immutable protocolTreasury;
    address public immutable wheelTreasury;

    // Implementation contracts (deployed once, cloned per token).
    address public immutable tokenImpl;
    address public immutable poolImpl;
    address public immutable icoImpl;
    address public immutable vaultImpl;

    uint256 public constant MAX_NAME_LENGTH   = 64;
    uint256 public constant MAX_SYMBOL_LENGTH = 16;

    struct TokenInfo {
        address token; address pool; address ico; address vault;
        address creator; uint256 createdAt;
    }
    TokenInfo[] public tokens;
    mapping(address => uint256[]) public tokenIndexesByCreator;

    event TokenCreated(
        address indexed token, address indexed pool,
        address ico, address vault,
        address creator, string name, string symbol
    );

    constructor(
        address _protocolTreasury,
        address _wheelTreasury,
        address _tokenImpl,
        address _poolImpl,
        address _icoImpl,
        address _vaultImpl
    ) Ownable(msg.sender) { ... }

    function createToken(string memory name, string memory symbol)
        external nonReentrant
        returns (address token, address pool, address ico, address vault)
    {
        // Input validation
        require(bytes(name).length > 0 && bytes(name).length <= MAX_NAME_LENGTH,   "Bad name length");
        require(bytes(symbol).length > 0 && bytes(symbol).length <= MAX_SYMBOL_LENGTH, "Bad symbol length");

        // 1. Deploy 55-byte EIP-1167 clones (cheap — no constructor call on child)
        token = Clones.clone(tokenImpl);
        pool  = Clones.clone(poolImpl);
        ico   = Clones.clone(icoImpl);
        vault = Clones.clone(vaultImpl);

        // 2. Wire the clones (each init() is callable exactly once)
        Pool(payable(pool)).init(token, protocolTreasury, msg.sender);
        ICO(payable(ico)).init(token, pool, msg.sender, protocolTreasury);
        AirdropVault(vault).init(token, pool, ico, protocolTreasury);

        // 3. Bind ICO to Pool (only ICO can seed initial liquidity)
        Pool(payable(pool)).setICO(ico);

        // 4. Mint + distribute 50/40/10 in one shot
        Token(token).initialize(name, symbol, pool, ico, vault);

        // 5. Record and emit
        tokenIndexesByCreator[msg.sender].push(tokens.length);
        tokens.push(TokenInfo(token, pool, ico, vault, msg.sender, block.timestamp));
        emit TokenCreated(token, pool, ico, vault, msg.sender, name, symbol);
    }

    // Pagination helpers: getTokens(offset, limit), getTokensByCreator(creator, offset, limit)
}
```

**Key properties:**
- `protocolTreasury`, `wheelTreasury`, and the four `*Impl` addresses are all **immutable** — set once at deployment.
- Four implementation contracts must be deployed before the factory (see `scripts/deploy.ts`). Each impl locks itself in its own constructor (`_setupDone = true`) so it can never be initialised directly — only via clones.
- `Pool.init()` stores `factory = msg.sender`, which is how `Pool.setICO()` later authorises the factory — no argument needed.
- Token name is capped at 64 characters, symbol at 16 — prevents storage bloat.
- All four addresses are emitted in `TokenCreated` and stored on-chain in `tokens[]`, giving the frontend both event-based and on-chain pagination for discovery.
- **Deployed sizes (post-refactor):** LaunchpadFactory = 4,256 bytes; Token impl = 3,175 bytes; Pool impl = 4,720 bytes; ICO impl = 5,986 bytes; AirdropVault impl = 3,766 bytes. All well under the 24,576-byte EIP-170 cap.

---

### 6.3 Pool (AMM)

**File:** `contracts/src/Pool.sol`

A minimal constant-product automated market maker. Every token deployed through the factory gets its own dedicated pool — no shared routing.

```solidity
contract Pool is ReentrancyGuard {
    // Fee schedule (bps; 10_000 = 100%).
    uint256 public constant PROTOCOL_FEE_BPS = 85;   // 0.85% → treasury
    uint256 public constant CREATOR_FEE_BPS  = 35;   // 0.35% → accrued for creator
    uint256 public constant TOTAL_FEE_BPS    = 120;  // 1.20% total
    uint256 public constant FEE_DENOMINATOR  = 10_000;

    // No `immutable` — these live in per-clone storage, set by init().
    address public token;
    address public protocolTreasury;
    address public factory;           // stored so setICO() can authorise the factory
    address public creator;           // recipient of creator-fee share
    address public ico;               // set by factory.setICO() after cloning
    uint256 public reserveBNB;
    uint256 public reserveToken;
    bool public initialized;          // true once addInitialLiquidity() has run

    /// Accumulated 0.35% creator-fee BNB, claimable by `creator` at any time.
    uint256 public creatorFeesAccrued;

    bool private _setupDone;          // clone-init guard; set in constructor of impl

    constructor() { _setupDone = true; } // lock implementation

    // Called exactly once by the factory right after Clones.clone().
    function init(address _token, address _protocolTreasury, address _creator) external { ... }

    event Swap(address indexed user, bool isBuy, uint256 bnbAmount, uint256 tokenAmount);
    event CreatorFeesAccrued(uint256 amount);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    function swapExactBNBForTokens(uint256 minTokenOut) external payable nonReentrant {
        bool exempt = IProtocolTreasury(protocolTreasury).isFeeExempt(msg.sender);
        uint256 bnbIn = msg.value;
        uint256 protocolFee = exempt ? 0 : (bnbIn * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        uint256 creatorFee  = exempt ? 0 : (bnbIn * CREATOR_FEE_BPS)  / FEE_DENOMINATOR;
        uint256 bnbInAfterFee = bnbIn - protocolFee - creatorFee;

        uint256 tokenOut = (reserveToken * bnbInAfterFee) / (reserveBNB + bnbInAfterFee);
        require(tokenOut >= minTokenOut, "Slippage exceeded");

        reserveBNB += bnbInAfterFee;
        reserveToken -= tokenOut;

        if (creatorFee > 0) {
            creatorFeesAccrued += creatorFee;          // accrue, claimed later
            emit CreatorFeesAccrued(creatorFee);
        }
        if (protocolFee > 0) protocolTreasury.call{value: protocolFee}("");

        IERC20(token).transfer(msg.sender, tokenOut);
        emit Swap(msg.sender, true, bnbIn, tokenOut);
    }

    function swapExactTokensForBNB(uint256 tokenIn, uint256 minBNBOut) external nonReentrant {
        // Symmetric: protocol + creator fees come out of the BNB output side.
    }

    /// @notice Withdraw all accrued creator fees. Only the creator may call.
    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        require(msg.sender == creator, "Only creator");
        amount = creatorFeesAccrued;
        require(amount > 0, "Nothing to claim");
        creatorFeesAccrued = 0;
        payable(creator).call{value: amount}("");
        emit CreatorFeesClaimed(creator, amount);
    }
}
```

**The constant product formula:**

```
k = reserveBNB × reserveToken

After swap:
  (reserveBNB + bnbIn) × (reserveToken - tokenOut) = k

Solving for tokenOut:
  tokenOut = reserveToken × bnbIn / (reserveBNB + bnbIn)
```

**Fee flow:**
- Fees are taken from the input amount before applying the formula.
- **0.85%** of every swap is forwarded to `protocolTreasury` immediately.
- **0.35%** is accrued in `creatorFeesAccrued` and pulled out by the token creator via `claimCreatorFees()`. This is the on-chain accounting half of the [Creator Rewards Program](#15-creator-rewards-program).
- Users with an active `free-fees-1h` boost bypass BOTH legs (checked via `isFeeExempt()`).

---

### 6.4 ICO

**File:** `contracts/src/ICO.sol`

The ICO runs as **10 sequential rounds**. Each round has a fixed tranche of 1,050,000 tokens at an increasing price. There is **no deadline** — the sale stays open indefinitely until all 10 rounds sell out, at which point the ICO auto-finalises. Buyers may also withdraw their contribution at any time before finalisation, with the credited tokens returning proportionally to the pre-sale allocation.

Both `buy()` and `withdraw()` carry the **same 1.2% total fee** as swaps — 0.85% to the protocol treasury, 0.35% accrued for the creator (matching `Pool`).

```solidity
contract ICO is ReentrancyGuard {
    uint256 public constant TOTAL_ROUNDS       = 10;
    uint256 public constant TOKENS_PER_ROUND   = 1_050_000 * 1e18;  // 50% of 21M / 10

    uint256 public constant ICO_GOAL           = 24 ether;
    uint256 public constant CREATOR_SHARE      = 1 ether;
    uint256 public constant POOL_SHARE         = 23 ether;

    // Fee schedule — identical to Pool.sol.
    uint256 public constant PROTOCOL_FEE_BPS  = 85;   // 0.85% → treasury
    uint256 public constant CREATOR_FEE_BPS   = 35;   // 0.35% → accrued
    uint256 public constant FEE_DENOMINATOR   = 10_000;

    uint256 public currentRound;             // 1-indexed, advances/rewinds with flow
    uint256 public tokensSoldInCurrentRound;
    uint256 public totalBNBRaised;
    bool    public finalized;
    uint256 public creatorFeesAccrued;       // pulled out via claimCreatorFees()

    mapping(address => uint256) public contributions;
    mapping(address => uint256) public tokensPurchased;
    mapping(address => bool)    public tokensClaimed;

    function buy() external payable nonReentrant {
        uint256 protocolFee = exempt ? 0 : (msg.value * PROTOCOL_FEE_BPS) / FEE_DENOMINATOR;
        uint256 creatorFee  = exempt ? 0 : (msg.value * CREATOR_FEE_BPS)  / FEE_DENOMINATOR;
        // protocolFee → treasury (push); creatorFee → creatorFeesAccrued (accrue).
        uint256 netBNB = msg.value - protocolFee - creatorFee;
        // Iterate rounds at pre-computed prices; refund rounding dust.
        ...
        if (currentRound > TOTAL_ROUNDS) {
            emit ICOCompleted(totalBNBRaised);
            _finalize();           // auto-finalize when round 10 sells out
        }
    }

    /// Withdraw a buyer's contribution at any time before finalisation.
    /// Gross BNB removed from contributions; user receives 98.8% (0.85% to
    /// treasury, 0.35% to creatorFeesAccrued).
    function withdraw(uint256 grossBnb) external nonReentrant { ... }

    /// Creator pulls accumulated fees (works before AND after finalize).
    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        require(msg.sender == creator, "Only creator");
        amount = creatorFeesAccrued;
        creatorFeesAccrued = 0;
        payable(creator).call{value: amount}("");
        emit CreatorFeesClaimed(creator, amount);
    }

    function _finalize() internal {
        finalized = true;
        // Pool seed deliberately excludes creatorFeesAccrued so those funds
        // stay claimable after finalize.
        uint256 bal = address(this).balance - creatorFeesAccrued;
        // Fixed 1 BNB → creator (gas-capped). If creator's fallback reverts,
        // their share flows into the pool instead of bricking the close.
        (bool ok,) = payable(creator).call{value: CREATOR_SHARE, gas: 30_000}("");
        uint256 poolBNB = ok ? bal - CREATOR_SHARE : bal;

        // Late-buyer protection: opening price > round-10 price.
        require(
            (poolBNB * 1e18 / pool.balanceOf(pool)) > getRoundPrice(TOTAL_ROUNDS),
            "Pool open price must exceed last round"
        );

        pool.addInitialLiquidity{value: poolBNB}(pool.token.balanceOf(pool));
    }

    function claimTokens() external nonReentrant { ... }  // after finalized
}
```

There is no `markCancelled()` / `claimRefund()` / `cancelled` state anymore — withdraws replace the refund flow and the absence of a deadline means there's nothing to "expire".

**Round pricing (square-root curve):**

Price per 1e18 tokens follows `A + B × √round` where:
- `A = 1,511,700,000,000` wei
- `B = 344,620,000,000` wei

Values are pre-computed as a lookup table to avoid on-chain sqrt and save gas:

| Round | Price (wei / 1e18 token) | Price (approx BNB / token) |
|---|---|---|
| 1  | 1,856,320,000,000 | ≈ 1.856 × 10⁻⁶ BNB |
| 2  | 1,998,970,000,000 | ≈ 1.999 × 10⁻⁶ BNB |
| 3  | 2,108,560,000,000 | ≈ 2.109 × 10⁻⁶ BNB |
| 5  | 2,282,300,000,000 | ≈ 2.282 × 10⁻⁶ BNB |
| 10 | 2,601,200,000,000 | ≈ 2.601 × 10⁻⁶ BNB |

Total BNB raised if all 10 rounds sell out ≈ **24 BNB** (`ICO_GOAL`).

The pool opens at a price ~5.3% above round 10, so late ICO buyers are never immediately underwater.

**Token distribution during ICO:**

- Tokens are credited to `tokensPurchased[buyer]` immediately but **not transferred** until `claimTokens()` after finalization.
- The 1.2% total fee (0.85% protocol pushed to treasury + 0.35% accrued for the creator) is taken on entry and is **not refundable** by buying. (Withdrawing pays the same 1.2% on the withdrawn amount.)
- Any excess BNB (rounding when a round fills mid-transaction) is refunded in the same `buy()` call.

**Withdrawals during ICO:**

- Anyone holding a contribution can call `withdraw(grossBnb)` at any time before finalisation.
- The caller specifies the gross BNB to remove from their `contributions` balance. They receive that minus 1.2% (mirrors buy). The 0.85% protocol cut goes to the treasury, the 0.35% creator cut is accrued for the creator to claim.
- The caller's `tokensPurchased` is reduced by the same fraction (`grossBnb / contributions[user]`), and those tokens are returned to the ICO allocation — `tokensSoldInCurrentRound` rewinds, stepping `currentRound` backwards if the returned amount overflows the current round.
- `totalBNBRaised` decreases by the gross withdrawn amount. The ICOProgressHero chart flows downward correspondingly.

**Finalization:**

The only path to finalisation is the auto-finalize when round 10 sells out — `_finalize()` runs inside the buy() that fills it, paying 1 BNB to the creator and seeding the pool with the rest.

---

### 6.5 AirdropVault

**File:** `contracts/src/AirdropVault.sol`

Holds the 10% airdrop allocation and distributes it once the token has proven minimum market liquidity.

```solidity
contract AirdropVault is ReentrancyGuard {
    uint256 public constant THRESHOLD = 50 ether; // Pool must have ≥ 50 BNB

    function triggerAirdrop(
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Expired");
        require(!airdropTriggered, "Already done");
        require(IPool(pool).reserveBNB() >= THRESHOLD, "Pool too thin");

        // Verify ECDSA signature from backend airdrop signer
        bytes32 digest = keccak256(abi.encode(
            block.chainid, address(this), recipients, amounts, deadline
        ));
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == IProtocolTreasury(treasury).airdropSigner(), "Bad sig");

        airdropTriggered = true;
        for (uint256 i = 0; i < recipients.length; i++) {
            IERC20(token).transfer(recipients[i], amounts[i]);
        }
    }
}
```

**Key design decisions:**
- The recipient list is computed off-chain by the backend (based on ICO participation, trading volume, early holders, etc.) and signed with the backend's airdrop signing key.
- This means the contract doesn't need to iterate or compute — it just verifies the signature and distributes.
- Maximum 200 recipients to cap gas usage.

---

### 6.6 LuckyWheel

**File:** `contracts/src/LuckyWheel.sol`

Handles on-chain BNB prize redemption for lucky wheel wins. Inherits `SignedClaimsBase`.

```solidity
contract LuckyWheel is Ownable, ReentrancyGuard, SignedClaimsBase {
    function claimPrize(
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        bytes32 digest = keccak256(abi.encode(
            block.chainid, address(this), msg.sender, amount, nonce, deadline
        ));
        _consumeClaim(digest, msg.sender, nonce, deadline, signature);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // Owner can withdraw unused prize funds
    function withdraw(uint256 amount) external onlyOwner { ... }

    receive() external payable {} // Accept BNB deposits from treasury
}
```

This contract never stores game state — all of that lives in the backend. It only cares: "is this a valid, unexpired, unused signature from our signer?"

---

### 6.7 ProtocolTreasury

**File:** `contracts/src/ProtocolTreasury.sol`

The hub for protocol-level roles and fee collection. Uses OpenZeppelin's `Ownable2Step` (two-step ownership transfer to prevent accidents).

```solidity
contract ProtocolTreasury is Ownable2Step, ReentrancyGuard {
    address public feeExemptionGranter; // Hot wallet controlled by backend
    address public airdropSigner;       // Backend's signing key public address

    mapping(address => uint256) public feeExemptUntil; // timestamp

    modifier onlyGranter() {
        require(msg.sender == feeExemptionGranter, "Not granter");
        _;
    }

    function grantFeeExemption(address user, uint256 expiresAt) external onlyGranter {
        require(expiresAt <= block.timestamp + 7 days, "Max 7 days");
        feeExemptUntil[user] = expiresAt;
    }

    function isFeeExempt(address user) external view returns (bool) {
        return feeExemptUntil[user] >= block.timestamp;
    }

    // Owner functions
    function setFeeExemptionGranter(address granter) external onlyOwner { ... }
    function setAirdropSigner(address signer) external onlyOwner { ... }
    function withdraw(uint256 amount) external onlyOwner { ... }

    receive() external payable {} // Collects swap fees and ICO protocol fees
}
```

**Role separation:**

| Role | Key | Permissions |
|---|---|---|
| Owner | Multisig (cold) | Rotate granter/signer, withdraw treasury, update fees |
| Granter | Hot wallet (backend) | Only `grantFeeExemption()` — cannot withdraw |
| Signer | Backend key | Signs game prizes off-chain — no on-chain permissions |

This setup means a compromised backend hot wallet can grant fee exemptions (minor loss) but cannot drain the treasury.

---

### 6.8 Shared Libraries

#### `libs/Math.sol`

Utility math for the AMM — safe multiplication and division that avoids overflow on large `uint256` values.

#### `libs/SignedClaims.sol`

Base contract mixed into the signed-claim contracts (currently `LuckyWheel`).

```solidity
abstract contract SignedClaimsBase {
    address public immutable signer;
    mapping(address => mapping(uint256 => bool)) private _usedNonces;

    function _consumeClaim(
        bytes32 digest,
        address user,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) internal {
        require(block.timestamp <= deadline, "Claim expired");
        require(!_usedNonces[user][nonce], "Nonce already used");
        address recovered = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(digest),
            signature
        );
        require(recovered == signer, "Invalid signature");
        _usedNonces[user][nonce] = true;
    }
}
```

Three conditions must all pass:
1. `block.timestamp <= deadline` — claim hasn't expired.
2. `_usedNonces[user][nonce] == false` — nonce hasn't been spent.
3. `recovered == signer` — ECDSA signature came from the known backend key.

---

## 7. Token Creation & Launch — Deep Dive

This is the core flow of Koala Pad. Here's what actually happens, end-to-end, from the moment a user hits "Create Token" to having a fully trading token on the AMM.

Every token is created with a fixed supply of 21M.

**TOTAL SUPPLY = 21.000.000**

After creation, the token factory smart contract distributes the supply into 3 "vaults" as reported below:

- **ICO     : 10,500,000 (50%)**  → split across 10 rounds of 1,050,000
- **POOL    :  8,400,000 (40%)**  → for liquidity pool seeding
- **AIRDROP :  2,100,000 (10%)**  → locked in a vault until the airdrop is triggered

### 7.1 Phase 0 — Pre-Creation (Frontend Form)

**Page:** `src/pages/CreateToken.tsx`

The user fills out a form with:

| Field | Required | Notes |
|---|---|---|
| Token name | Yes | Stored on-chain and in DB |
| Token symbol | Yes | On-chain ticker (e.g. "KOALA") |
| Description | No | Off-chain only (Supabase) |
| Image | No | Uploaded to Supabase Storage, URL stored in DB |
| Website | No | Off-chain |
| Twitter / X | No | Off-chain |
| Telegram | No | Off-chain |

A live preview panel renders on the right side showing how the token card will look.

**Client-side validation:**
- Name and symbol must be non-empty.
- Image file size is validated before upload.
- Symbol is automatically uppercased.

At this point, nothing has touched the blockchain. The user is just configuring what they want.

---

### 7.2 Phase 1 — Factory Deployment (On-Chain)

When the user clicks "Create Token", the frontend:

1. **Checks wallet connection** — if not connected, Privy modal opens.
2. **Sends the transaction:**

```typescript
// Simplified from CreateToken.tsx
const tx = await writeContract({
  address: FACTORY_ADDRESS,
  abi: launchpadFactoryAbi,
  functionName: 'createToken',
  args: [name, symbol],
});
const receipt = await waitForTransactionReceipt({ hash: tx });
```

3. **Waits for receipt** — `waitForTransactionReceipt` polls the RPC until the tx is mined.

5. **Decodes the `TokenCreated` event** from the receipt logs:

```typescript
const event = receipt.logs
  .map(log => decodeEventLog({ abi: launchpadFactoryAbi, ...log }))
  .find(e => e.eventName === 'TokenCreated');

const { tokenAddress, poolAddress, icoAddress, vaultAddress } = event.args;
```

**What happens on-chain during `createToken()`:**

```
Factory.createToken() called
  │
  ├─ Clones.clone(tokenImpl)   → deploys 55-byte EIP-1167 proxy for Token
  ├─ Clones.clone(poolImpl)    → deploys 55-byte EIP-1167 proxy for Pool
  ├─ Clones.clone(icoImpl)     → deploys 55-byte EIP-1167 proxy for ICO
  ├─ Clones.clone(vaultImpl)   → deploys 55-byte EIP-1167 proxy for AirdropVault
  │   (no constructor runs on any clone — all state is zero-initialised)
  │
  ├─ Pool.init(token, treasury, creator)
  │   └─ stores token/treasury/creator/factory in pool's own storage
  │
  ├─ ICO.init(token, pool, creator, treasury)
  │   └─ stores fields + sets currentRound = 1
  │
  ├─ AirdropVault.init(token, pool, ico, treasury)
  │   └─ stores fields + marks pool/ico/self/zero as excluded airdrop addresses
  │
  ├─ Pool.setICO(ico)
  │   └─ binds ICO to pool — only ICO can seed initial liquidity (one-time, factory-only)
  │
  ├─ Token.initialize(name, symbol, pool, ico, vault)
  │   ├─ sets _tokenName / _tokenSymbol (ERC20 view overrides)
  │   ├─ 10,500,000 tokens (50%) → ICO    (minted directly)
  │   ├─ 8,400,000 tokens  (40%) → Pool   (minted directly)
  │   └─ 2,100,000 tokens  (10%) → AirdropVault (minted directly)
  │
  └─ emit TokenCreated(token, pool, ico, vault, creator, name, symbol)
```

All four contracts are created **atomically in a single transaction** (~1M gas). If any step fails, everything reverts — no orphaned contracts. Each clone is ~55 bytes of runtime rather than a full contract deployment, making this roughly **6× cheaper** than the old `new Token(...)`-based path.

---

### 7.3 Phase 2 — Token Initialization

`Token.initialize(name, symbol, pool, ico, vault)` is the final step inside the same `createToken()` transaction. It records the token's name and symbol (overriding ERC20's constructor-only private fields), then mints the full 21 M supply and distributes it in a single call — no intermediate "factory holds all tokens" step. After it returns:

- **10,500,000 tokens** sit in the `ICO` contract, ready to be purchased.
- **8,400,000 tokens** sit in the `Pool` contract, locked until ICO finalization seeds liquidity.
- **2,100,000 tokens** sit in the `AirdropVault`, locked until the pool reaches the 50 BNB liquidity threshold.

The token is now live on-chain, but trading is not yet possible — the pool has tokens but no BNB, so the AMM has no reserves to quote from.

**After the transaction confirms, the frontend:**

6. **Uploads the token image** to Supabase Storage:

```typescript
const { data } = await supabase.storage
  .from('token-images')
  .upload(`${tokenAddress}.jpg`, imageFile);
const imageUrl = supabase.storage.from('token-images').getPublicUrl(data.path).data.publicUrl;
```

7. **Inserts the token record** into the `tokens` table:

```typescript
await supabase.from('tokens').insert({
  token_address: tokenAddress,
  pool_address: poolAddress,
  ico_address: icoAddress,
  vault_address: vaultAddress,
  creator_id: userId,
  creator_address: walletAddress,
  name,
  symbol,
  description,
  image: imageUrl,
  website,
  x: twitter,
  telegram,
  phase: 'ico', // starts in ICO phase
});
```

8. **Navigates to `/token/:tokenAddress`** — the token's page, now in ICO mode.

---

### 7.4 Phase 3 — ICO

**Page:** `src/pages/Token.tsx` (renders `ICOPanel` and `ICOProgressHero` when `phase === 'ico'`)

There is no deadline — the ICO stays open until every round is sold out. The `ICOPanel` exposes a Buy / Withdraw toggle so contributors can step out at any time. Both flows charge the 1.2% total fee (0.85% protocol + 0.35% accrued for the creator).

#### Price Rounds

The 10,500,000 tokens available in the ICO are split into **10 equal tranches** of 1,050,000 tokens each.

```
Round 1:  1,050,000 tokens @ ≈ 1.856 × 10⁻⁶ BNB/token  (cheapest)
Round 2:  1,050,000 tokens @ ≈ 1.999 × 10⁻⁶ BNB/token
...
Round 10: 1,050,000 tokens @ ≈ 2.601 × 10⁻⁶ BNB/token  (most expensive)
```

Pricing follows a **square-root curve** (`A + B × √round`), so early rounds are significantly cheaper but the gap narrows at higher rounds. If all 10 rounds sell out, approximately 24 BNB is raised.

`Price(round) = A + B × √round`

where, 

`A = Price(Round 10) - B*10 = 1.5117e-6 BNB`
`B = [2 x (Price(Round 10) - AVG Price)] / 10 - 1 = 3.4462e-7 BNB`

#### Buying in the ICO

When a user sends BNB to `ICO.buy()`:

```
User sends X BNB
  │
  ├─ 0.85% protocol fee → ProtocolTreasury (push, non-refundable)
  ├─ 0.35% creator fee  → creatorFeesAccrued (accrued, claimed by creator)
  ├─ netBNB = msg.value − protocolFee − creatorFee
  │
  ├─ Iterate through current and subsequent rounds:
  │   ├─ Fill current round at its pre-computed price
  │   ├─ Advance to next round if filled
  │   └─ Continue until netBNB exhausted or round 10 sold out
  │
  ├─ Any unused netBNB (rounding dust) refunded in same transaction
  │
  ├─ tokensPurchased[msg.sender] += totalTokensBought
  ├─ contributions[msg.sender]   += bnbSpent (net of fee + refund)
  ├─ totalBNBRaised              += bnbSpent
  │
  └─ If round > 10 → _finalize() automatically
```

Tokens are **credited** in the contract's internal accounting, not transferred. The user's wallet doesn't receive tokens until they call `claimTokens()` after finalization. The 1.2% total fee is taken on entry and is not returned on withdraw.

The ICO goal is **24 BNB**: if reached, **1 BNB** goes to the **token creator**, and the remaining **23 BNB** are automatically deployed to a **liquidity pool** to start live trading based on an AMM.

Follows a breakdown of the amount of BNB raised for each round:

| Round | BNB Raised |
|---|---|
| 1 | 1.9491 |
| 2 | 2.0989 |
| 3 | 2.2140 |
| 4 | 2.3110 |
| 5 | 2.3964 |
| 6 | 2.4736 |
| 7 | 2.5446 |
| 8 | 2.6107 |
| 9 | 2.6728 |
| 10 | 2.7313 |
| **Total** | **24.0024** |

#### ICO Progress Visualization

`ICOProgressHero` reads:
- `ICO.currentRound()` — which round is currently selling (1–10).
- `ICO.totalBNBRaised()` — total net BNB raised so far.
- Number of unique contributions (from `ico_contributions` Supabase table, including `kind='withdraw'` rows).

The trendline is event-indexed: each row in `ico_contributions` is one point. Buys raise the cumulative value; withdraws lower it. There is no countdown — only the cumulative-raised series.

#### ICO State on Frontend

The frontend polls the ICO contract on each page load (via `useReadContract` Wagmi hooks) and stores the phase in Supabase so non-wallet visitors can see status. Supabase `tokens.phase` transitions from `'ico'` → `'trading'` when `finalized` is detected.

---

### 7.5 Phase 4 — Finalization & Pool Seeding

Finalization happens in exactly one way: **auto-finalize** — the final purchase fills round 10, and `_finalize()` is called internally in the same transaction. There is no manual finalize path and no cancellation path (the deadline was removed; withdraws cover the unhappy case).

**What `_finalize()` does:**

```
_finalize() {
  │
  ├─ finalized = true  ← state first (CEI pattern)
  │
  ├─ bal = address(this).balance − creatorFeesAccrued
  │   └─ creatorFeesAccrued (≈ 0.084 BNB at full sellout) stays in contract
  │      so the creator can still pull it via claimCreatorFees() after finalize.
  │
  ├─ Transfer exactly 1 BNB → creator (gas-limited to 30 000 to block re-entrancy)
  │   └─ If creator's fallback reverts, their 1 BNB stays in contract for the pool
  │
  ├─ Assert late-buyer protection invariant:
  │   opening price (poolBNB / pool token balance) > round-10 price
  │   → reverts if pool would open below the last ICO price
  │
  └─ Pool.addInitialLiquidity(8,400,000 tokens) { value: bal − 1 }
      ├─ Pool sets reserveBNB   ≈ 22.92 BNB (24 raised − 0.084 creator-fee reserve − 1 creator share)
      ├─ Pool sets reserveToken = 8,400,000 tokens
      └─ Pool.initialized = true → trading enabled
}
```

After `_finalize()`:
- **Creator receives a fixed 1 BNB** regardless of total raised (not a percentage). Their accumulated 0.35% creator-fee balance is **separate** and pulled via `ICO.claimCreatorFees()`.
- **The AMM pool is live** with 8,400,000 tokens and ≈22.92 BNB at full sellout.
- The pool opening price is guaranteed to be strictly above the round-10 ICO price, protecting late buyers from going underwater the moment trading starts.
- ICO participants can now call `claimTokens()` to receive their purchased tokens.

**Frontend update on finalization:**

The frontend detects finalization (the next `getICOInfo()` poll returns `finalized = true`) and:
- Calls `POST /functions/v1/record-creator-reward` with the token address. The edge function re-verifies `finalized` on-chain, then idempotently inserts a `creator_rewards` row tagged `ico_completed = true` (locking in the BNB→USD rate) AND flips `tokens.phase` to `'trading'` via service-role write.
- Because the auto-finalize is typically triggered by the *last buyer* (not the creator), and only the creator may call the edge function, the Token page also re-attempts the call on subsequent visits when `userId === tokenMeta.creator_id && phase === 'trading'`. Idempotency makes this safe to retry.
- Switches the token page from `ICOPanel` → `SwapPanel`.
- Shows a "Claim Tokens" button for ICO participants.

---

### 7.6 Phase 5 — Trading (AMM)

**Component:** `src/components/SwapPanel.tsx`

**Trading** starts with **≈22.92 BNB / 8,400,000** Token deposited in the liquidity pool (24 BNB raised minus the 0.084 BNB held back for creator-fee claims and the 1 BNB creator share). The opening trading price is roughly **+4.9%** above the round-10 ICO price (≈ 2.728e-6 BNB/token vs. 2.601e-6), giving last-round buyers an immediate entry cushion.

Once the pool is initialized, anyone can buy or sell the token directly through the AMM.

#### Buying Tokens

```
1. User enters BNB amount in SwapPanel
2. Frontend reads reserveBNB and reserveToken from Pool contract
3. Client-side preview calculation:
   tokenOut = reserveToken * bnbIn / (reserveBNB + bnbIn)
   (minus 1.2% fee if not exempt)
4. User clicks "Buy"
5. Frontend calls Pool.swapExactBNBForTokens(minTokenOut) { value: bnbIn }
6. On success: Pool transfers tokens to user, updates reserves
7. Frontend inserts trade record into `trades` Supabase table
8. Quest progress updates (buy quests, volume quests)
```

#### Selling Tokens

Selling requires an `approve()` call first (ERC-20 standard):

```
1. User enters token amount in SwapPanel
2. Frontend calculates BNB output (same formula, inverted)
3. User clicks "Sell"
4. Frontend calls Token.approve(poolAddress, tokenAmount)
5. Waits for approval tx receipt
6. Frontend calls Pool.swapExactTokensForBNB(tokenIn, minBNBOut)
7. On success: Pool pulls tokens from user, sends BNB to user
8. Frontend inserts trade record + updates quest progress
```

#### Price Impact & Slippage

- **Price impact** is shown in real-time as the user types (larger trades move the price more in a smaller pool).
- **Min output** (`minTokenOut` / `minBNBOut`) is computed as `output * (1 - slippageTolerance)`. Default slippage is typically 1-2%.
- If the actual output is less than `minTokenOut`, the transaction reverts on-chain.

#### Price Chart

`PriceChartLite` (wrapping `lightweight-charts`) reads historical prices from the `trades` table in Supabase, plotting price over time. Each trade record stores the `price_bnb` at the time of the swap.

---

### 7.6.1 Trade Recording & Volume Pipeline

Volume (and the candlestick chart, the "Best Tokens" 24h ranking, and the per-token trade/trader counters) all derive from the `trades` table. Rows reach that table through **two complementary paths**:

**1. Client fast-path (instant UX).** When a swap confirms in the browser, `Token.tsx` writes a row via `upsertTrade()` (keyed on `tx_hash`). This is immediate so the user sees their trade right away, but it has two known imprecisions:
- For **sells**, `usd_value` is computed from the pool's spot price read *before* the swap mined, so it's slightly off (the swap itself moves the price).
- `created_at` is the browser's write time, and if the user closes the tab before confirmation the row may never be written at all.

**2. Canonical indexer (source of truth).** The `index-trades` edge function (see §9) runs every minute via `pg_cron`, reads the Pool `Swap(user, amountIn, amountOut, isBuyingToken)` events with `eth_getLogs`, and **upserts the same rows by `tx_hash`**. Because it reads the executed on-chain amounts, it writes:
- **exact `usd_value`** — derived from the real BNB leg (`amountIn` for buys, `amountOut` for sells) × BNB/USD, so sells are no longer mis-priced;
- **exact `block_time`** — from the block's timestamp;
- a resolved `user_id` (by wallet) so quest attribution survives.

Since both paths upsert on `tx_hash`, the indexer transparently corrects the client's approximate row and backfills any trade the browser missed. The block cursor in `indexer_state` only moves forward, and the upsert is idempotent, so re-runs are safe.

**24h volume calculation.** `supabaseApi.ts → get24hVolume(tokenAddress, bnbUsd)` calls the server-side RPC `get_24h_volume(p_token, p_bnb_usd)` rather than pulling rows to the client. The RPC:

```sql
sum(
  coalesce(
    usd_value,                                   -- locked-in value (preferred)
    greatest(                                    -- fallback for any null-usd row:
      bnb_amount,                                --   buy leg (BNB in)
      token_amount * price_bnb                   --   sell leg (sells store bnb_amount = 0)
    ) * p_bnb_usd
  )
)
where lower(token_address) = lower(p_token)
  and coalesce(block_time, created_at) >= now() - interval '24 hours'
```

Key points:
- Aggregated in Postgres against the covering index `idx_trades_token_blocktime (token_address, block_time)` — no client-side reduce.
- The `greatest(...)` fallback means a row missing `usd_value` still contributes (the caller passes the live BNB/USD); sells fall back to `token_amount × price_bnb` because their `bnb_amount` leg is `0`.
- The 24h window filters on `coalesce(block_time, created_at)`, so it uses true block time once the indexer has stamped the row, and never mis-buckets backfilled history.

**Time-series / candles.** `get_token_candles(p_token, p_interval, p_limit)` buckets on the same `coalesce(block_time, created_at)`, so the OHLCV chart and the `5M/1H/6H/24H`-style change deltas can all be derived from one consistent time source.

---

### 7.7 Phase 6 — Airdrop

Once the token is trading and the pool has accumulated **≥ 50 BNB** in reserves, the airdrop becomes eligible.

**The airdrop process:**

1. **Backend determines recipients** — off-chain computation based on:
   - ICO participation amounts.
   - Trading volume on the AMM.
   - Early holder status.
   - Any other criteria the creator or protocol defines.

2. **Backend signs the recipient list** — using the `CLAIM_SIGNER_PRIVATE_KEY`, the backend computes an ECDSA signature over `(chainId, vaultAddress, recipients[], amounts[], deadline)`.

3. **`triggerAirdrop()` is called** — the frontend (or creator) submits the recipient list + signature to `AirdropVault.triggerAirdrop()`.

4. **Contract verifies and distributes** — signature check passes → 2,100,000 tokens are split across all recipients in a single transaction.

**`AirdropStatus` component** on the token page shows:
- Whether the airdrop threshold has been met.
- Whether the airdrop has been triggered.
- The user's personal airdrop allocation (from `airdrops` Supabase table).

---

## 8. Database Schema

All tables use Supabase PostgreSQL with Row-Level Security (RLS) enabled.

### `users`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Supabase auth user ID |
| `privy_did` | TEXT (UNIQUE) | Privy decentralized identifier |
| `wallet_address` | TEXT | Linked on-chain wallet (`0x...`) |
| `username` | TEXT | Display name (user-editable) |
| `profile_pic` | TEXT | URL to avatar image |
| `kp` | INTEGER | Total Koala Points |
| `coins` | INTEGER | In-game currency balance |
| `level` | INTEGER | Current level (computed from KP) |
| `last_free_spin_at` | TIMESTAMPTZ | Timestamp of last lucky wheel spin |
| `created_at` | TIMESTAMPTZ | Account creation time |

**RLS rules:**
- Users can read their own row.
- Users can update only `username` and `profile_pic` (RLS `with check`).
- A `BEFORE UPDATE` trigger (`_block_economy_updates`) raises an exception if any authenticated client attempts to directly modify `kp`, `coins`, `level`, `last_free_spin_at`, `wallet_address`, or `privy_did`. Only the `service_role` JWT bypasses this trigger.
- All economy writes go through `SECURITY DEFINER` PostgreSQL functions called exclusively by edge functions.

### `tokens`

| Column | Type | Description |
|---|---|---|
| `token_address` | TEXT (PK) | Contract address of the token |
| `pool_address` | TEXT | Pool contract address |
| `ico_address` | TEXT | ICO contract address |
| `vault_address` | TEXT | AirdropVault contract address |
| `creator_id` | UUID (FK → users) | Creator's user ID |
| `creator_address` | TEXT | Creator's wallet address |
| `name` | TEXT | Token name |
| `symbol` | TEXT | Token ticker symbol |
| `description` | TEXT | Long description |
| `image` | TEXT | Image URL (Supabase Storage) |
| `website` | TEXT | Project website |
| `x` | TEXT | Twitter / X handle |
| `telegram` | TEXT | Telegram link |
| `phase` | TEXT | `'ico'`, `'trading'`, `'airdrop_complete'` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### `trades`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `tx_hash` | TEXT (UNIQUE) | On-chain transaction hash |
| `token_address` | TEXT | Token that was traded |
| `pool_address` | TEXT | Pool where swap happened |
| `maker_address` | TEXT | Wallet that made the trade |
| `user_id` | UUID (FK → users) | Supabase user ID (if logged in) |
| `is_buy` | BOOLEAN | True = bought, False = sold |
| `token_amount` | NUMERIC | Amount of tokens in/out |
| `bnb_amount` | NUMERIC | Amount of BNB in/out |
| `usd_value` | NUMERIC | USD value of the trade (exact when written by the indexer; approximate for the client fast-path — see §7.6.1) |
| `price_bnb` | NUMERIC | Token price in BNB at this trade |
| `created_at` | TIMESTAMPTZ | DB **ingest** time (when the row was written) |
| `block_time` | TIMESTAMPTZ | Exact **on-chain block** timestamp, filled by the `index-trades` indexer. Nullable for legacy/not-yet-indexed rows. All time-window queries prefer `coalesce(block_time, created_at)` |

> **Counters on `tokens`:** `total_trades` and `unique_traders` are denormalized onto the `tokens` row and kept current by an `AFTER INSERT` trigger on `trades` (`_trades_update_token_counters`). They count only genuinely new inserts, so the indexer's idempotent upserts never double-count.

### `indexer_state`

Tracks the last block processed by each backend indexer. Service-role only (RLS enabled, no policies).

| Column | Type | Description |
|---|---|---|
| `key` | TEXT (PK) | Indexer name (e.g. `'trades'`) |
| `last_block` | BIGINT | Last block scanned for Swap events |
| `updated_at` | TIMESTAMPTZ | Last cursor advance |

### `comments`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `token_address` | TEXT | Token this comment is about |
| `user_id` | UUID (FK → users) | Author |
| `content` | TEXT | Comment text |
| `parent_id` | UUID (FK → comments) | NULL for top-level, set for replies |
| `created_at` | TIMESTAMPTZ | |

### `comment_likes`

| Column | Type | Description |
|---|---|---|
| `comment_id` | UUID (FK → comments) | |
| `user_id` | UUID (FK → users) | |
| PRIMARY KEY | `(comment_id, user_id)` | One like per user per comment |

### `quest_completions`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `quest_id` | TEXT | Quest identifier (e.g. `'create-1'`) |
| `completed_at` | TIMESTAMPTZ | When the quest threshold was hit |

### `claimed_quests`

| Column | Type | Description |
|---|---|---|
| `user_id` | UUID (FK → users) | |
| `quest_id` | TEXT | |
| `claimed_at` | TIMESTAMPTZ | |
| PRIMARY KEY | `(user_id, quest_id)` | Prevents double-claim |

### `active_boosts`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `boost_type` | TEXT | `'double-rewards-1h'`, `'free-fees-1h'` |
| `expires_at` | TIMESTAMPTZ | When the boost wears off |
| `created_at` | TIMESTAMPTZ | |

### `wheel_spins`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `prize_type` | TEXT | `'kp'`, `'coins'`, `'bnb'` |
| `prize_value` | NUMERIC | Amount won |
| `is_claimed` | BOOLEAN | Whether BNB claim has been submitted |
| `claim_nonce` | NUMERIC | Nonce used in the signed BNB claim |
| `created_at` | TIMESTAMPTZ | |

### `ico_contributions`

Holds both deposits and withdrawals. `kind = 'buy'` rows raise the chart's cumulative; `kind = 'withdraw'` rows lower it.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `tx_hash` | TEXT (UNIQUE) | On-chain tx hash |
| `token_address` | TEXT | Token bought |
| `wallet_address` | TEXT | Buyer's wallet |
| `bnb_amount` | NUMERIC | Gross BNB amount (always positive). Direction is given by `kind`. |
| `tokens_received` | NUMERIC | Tokens credited (buy) or returned to ICO (withdraw). |
| `round` | INTEGER | ICO round at the time of the event |
| `kind` | TEXT | `'buy'` (default) or `'withdraw'`. CHECK-constrained. |
| `created_at` | TIMESTAMPTZ | |

### `follows`

| Column | Type | Description |
|---|---|---|
| `follower_id` | UUID (FK → users) | The user doing the following |
| `following_id` | UUID (FK → users) | The user being followed |
| `created_at` | TIMESTAMPTZ | |
| PK | `(follower_id, following_id)` | + `CHECK (follower_id <> following_id)` |

RLS: anyone can read, only the follower can insert/delete their own rows. RPCs `get_followers(uuid)`, `get_following(uuid)`, and `get_profile_counts(uuid)` return display-safe joined payloads.

### `creator_rewards`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | Creator who earned the reward |
| `token_address` | TEXT | Source token |
| `bnb_amount` | NUMERIC | BNB awarded (1.0 for the ICO finalize share, variable for fee claims) |
| `usd_value` | NUMERIC | Locked-in USD value at moment of award |
| `bnb_price_usd` | NUMERIC | BNB/USD rate captured at award time |
| `ico_completed` | BOOLEAN | `true` only on the row representing the one-time 1 BNB ICO-finalize bonus; `false` on every creator-fee claim row. |
| `tx_hash` | TEXT | On-chain hash of the `claimCreatorFees()` tx (null on ICO-finalize rows). |
| `awarded_at` | TIMESTAMPTZ | |

Two partial unique indexes enforce idempotency:
- `unique (token_address) where ico_completed = true` — at most one finalize bonus per token, ever.
- `unique (tx_hash) where tx_hash is not null` — at most one row per claim tx.

RLS: public read; writes only via service role (the `record-creator-reward` and `record-creator-fee-claim` edge functions).

Aggregation RPCs (unchanged signatures):
- `get_creator_rewards_daily(uuid, int)` — daily-bucketed series (NOT cumulative). Frontend zero-fills empty days. Sums ICO finalize rows AND fee-claim rows.
- `get_creator_rewards_total(uuid)` — sum across all rows, all time.

### `airdrops`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `token_address` | TEXT | |
| `recipient_address` | TEXT | Recipient wallet |
| `amount` | NUMERIC | Tokens allocated |
| `is_claimed` | BOOLEAN | Whether they've been transferred |
| `created_at` | TIMESTAMPTZ | |

> The `claimed_levels` table was retired in Levels v2 — levels are status-only now and there is nothing to claim. See [§14](#14-levels-status-ladder).

### `processed_payments`

Idempotency table for on-chain purchases (coins). Unique on `tx_hash`.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `tx_hash` | TEXT (UNIQUE) | On-chain transaction hash |
| `user_id` | UUID (FK → users) | Who made the purchase |
| `product` | TEXT | `'coins'` |
| `created_at` | TIMESTAMPTZ | |

Inserting a duplicate `tx_hash` raises a unique constraint violation, which the edge function catches to return an idempotent success without double-crediting.

---

## 9. Edge Functions (Backend API)

All edge functions are Deno runtime, deployed on Supabase. They share three helpers:

**`_shared/auth.ts`** — Verifies the `Authorization: Bearer <jwt>` header against the Supabase JWT secret. Extracts `user_id`. Returns 401 if missing or invalid.

**`_shared/cors.ts`** — Returns appropriate CORS headers for all OPTIONS + real requests. Reads `ALLOWED_ORIGINS` (comma-separated) from env and only adds `Access-Control-Allow-Origin` when the incoming `Origin` exactly matches the allow-list. Unrecognised origins receive no CORS header. Falls back to `localhost:5173` and `localhost:5174` when `ALLOWED_ORIGINS` is unset (dev mode).

**`_shared/signer.ts`** — Wraps ethers.js `Wallet` to sign claim digests:

```typescript
// signer.ts
const wallet = new ethers.Wallet(Deno.env.get('CLAIM_SIGNER_PRIVATE_KEY')!);

export const signClaim = async (digest: Uint8Array): Promise<string> => {
  return wallet.signMessage(digest); // eth_sign style (prefixed hash)
};
```

---

### `privy-auth`

**POST /functions/v1/privy-auth**

Request:
```json
{
  "privyToken": "<privy-jwt>",
  "walletAddress": "0x...",   // optional
  "signedMessage": "...",      // optional, for external wallets
  "signature": "0x..."         // optional, for external wallets
}
```

Response:
```json
{
  "supabaseToken": "<supabase-jwt>",
  "userId": "<uuid>"
}
```

**Internal flow:**
1. Fetch Privy JWKS from `PRIVY_JWKS_URL` (cached in memory for 1 hour using a module-level variable).
2. Verify `privyToken` using `jose.jwtVerify()`.
3. Extract `privyDid` from token claims.
4. If `walletAddress` provided:
   - Check if it appears in Privy's `linked_accounts` (trusted automatically), OR
   - Recover signer from `signedMessage` + `signature` and compare to `walletAddress`.
5. `upsert` into `users` table keyed on `privy_did`.
6. Sign a new JWT with `subject = userId`, `exp = 1h`, using `SUPA_JWT_SECRET`.
7. Return the token.

---

### `claim-quest`

**POST /functions/v1/claim-quest**

Request:
```json
{ "questId": "create-1" }
```

Auth: Required (Bearer JWT)

**Internal flow:**
1. Verify auth → get `userId`.
2. Call Supabase RPC `claim_quest(p_user_id, p_quest_id)`.
3. The RPC (PostgreSQL function) atomically:
   - Checks `quest_completions` contains this quest.
   - Checks `claimed_quests` doesn't contain this quest.
   - Inserts into `claimed_quests`.
   - Awards KP and coins (checking for active `double-rewards-1h` boost).
4. Return success.

---

### `wheel-spin`

**POST /functions/v1/wheel-spin**

Request (spin):
```json
{ "action": "spin" }
```

Request (claim BNB prize):
```json
{ "action": "claim", "spinId": "<uuid>" }
```

Auth: Required

**Internal flow (spin):**
1. Check `last_free_spin_at` — must be ≥ 24 hours ago.
2. Roll prize using weighted table:

| Prize | Weight | Probability |
|---|---|---|
| 25 KP | 50 | 50% |
| 100 Coins | 25 | 25% |
| 100 KP | 15 | 15% |
| 500 Coins | 7 | 7% |
| 0.001 BNB | 2 | 2% |
| 0.005 BNB | 1 | 1% |

3. Insert `wheel_spins` row with `prize_type` and `prize_value`.
4. If non-BNB: call RPC `credit_wheel_prize(p_spin_id)` — awards immediately to user balance.
5. Update `last_free_spin_at`.
6. Return `{ prizeType, prizeValue, spinId }`.

**Internal flow (claim BNB):**
1. Fetch spin row — must belong to this user, `prize_type = 'bnb'`, `is_claimed = false`.
2. Generate a random nonce.
3. Compute digest: `keccak256(chainId, wheelContract, userWallet, amount, nonce, deadline)`.
4. Sign digest with `CLAIM_SIGNER_PRIVATE_KEY`.
5. Mark spin as claimed in DB.
6. Return `{ signature, nonce, deadline, amount }`.

The frontend then calls `LuckyWheel.claimPrize(amount, nonce, deadline, signature)`.

---

### `purchase-boost`

**POST /functions/v1/purchase-boost**

Request:
```json
{ "boostType": "double-rewards-1h" }
```

Auth: Required

**Boost costs:**

| Boost | Cost |
|---|---|
| `double-rewards-1h` | 500 Coins |
| `free-fees-1h` | 1,000 Coins |

**Internal flow:**
1. Check user has enough coins.
2. Deduct coins from user balance.
3. Insert row into `active_boosts` with `expires_at = now() + 1 hour`.
4. If `free-fees-1h`: call `grant-fee-exemption` for on-chain effect.
5. Return success.

---

### `purchase-coins`

**POST /functions/v1/purchase-coins**

Request:
```json
{
  "txHash": "0x...",
  "packageId": "coins-500"
}
```

Auth: Required

**Internal flow:**
1. Fetch transaction receipt via RPC.
2. Verify `tx.from == user.wallet_address`.
3. Verify `tx.to == ProtocolTreasury`.
4. Verify `tx.value` matches the price of `packageId`.
5. Ensure `txHash` not already used (idempotency check).
6. Credit coins to user account.

---

### `record-creator-reward`

**POST /functions/v1/record-creator-reward**

Request:
```json
{ "tokenAddress": "0x..." }
```

Auth: Required (caller must be the token's `creator_id`).

**Internal flow:**
1. Auth → `userId`.
2. Load `tokens.{creator_id, ico_address, phase}`; reject if caller isn't the creator.
3. Early-out (HTTP 200) if a `creator_rewards` row already exists for this token with `ico_completed = true`.
4. `eth_call` `ICO.finalized()` on the recorded `ico_address`. Reject (HTTP 409) if not yet finalised.
5. Fetch BNB/USD from CoinGecko (with a 600 fallback if the call fails).
6. Insert a `creator_rewards` row with `ico_completed = true` and the locked-in USD value.
7. Conditionally flip `tokens.phase = 'trading'` (`where phase = 'ico'`).

Idempotency comes from the partial unique index `creator_rewards_ico_completed_unique`, so the frontend may safely call this on every visit by the creator while the token is in the trading phase.

---

### `record-creator-fee-claim`

**POST /functions/v1/record-creator-fee-claim**

Request:
```json
{ "tokenAddress": "0x...", "txHash": "0x..." }
```

Auth: Required (caller must be the token's `creator_id`).

Records a single `Pool.claimCreatorFees()` or `ICO.claimCreatorFees()` on-chain event into `creator_rewards` so the daily chart picks it up. The frontend invokes this immediately after the claim transaction confirms.

**Internal flow:**
1. Auth → `userId` + wallet address.
2. Load the token row; verify caller is the creator and pull `pool_address` / `ico_address`.
3. Early-out (HTTP 200) if a row already exists for this `tx_hash`.
4. Fetch the on-chain receipt via JSON-RPC. Reject if missing or reverted.
5. Find a `CreatorFeesClaimed(address indexed creator, uint256 amount)` log emitted from the token's Pool or ICO, with `creator == authedWallet`.
6. Decode the amount, lock in BNB/USD from CoinGecko.
7. Insert a `creator_rewards` row with `ico_completed = false` and the `tx_hash`.

Idempotency comes from the partial unique index `creator_rewards_tx_hash_unique`.

---

### `grant-fee-exemption`

**POST /functions/v1/grant-fee-exemption** *(internal, called by purchase-boost)*

**Internal flow:**
1. Verify caller is an authorized internal service (not public-facing).
2. Call `ProtocolTreasury.grantFeeExemption(userWallet, expiresAt)` using the backend hot wallet.
3. Return success.

---

### `index-trades`

**POST /functions/v1/index-trades** *(internal, called every minute by `pg_cron`)*

The canonical on-chain trade indexer — the source of truth for the `trades` table (see §7.6.1). `verify_jwt = false`; it authenticates with a dedicated shared secret rather than any Supabase key.

**Auth.** The caller must send `x-indexer-secret: <value>` matching the function's `INDEXER_SECRET` env var. This is deliberately decoupled from the (now-deprecated) anon/service keys: a leak of this secret only lets someone trigger an idempotent re-index, not touch the database. The internal DB writes use the runtime-injected `SUPABASE_SERVICE_ROLE_KEY`.

**Internal flow:**
1. Reject unless `x-indexer-secret` matches `INDEXER_SECRET`.
2. Load `pool_address → token_address` for all tokens; read the block cursor from `indexer_state` (key `'trades'`). On first run, seed the cursor to the chain head and exit.
3. `eth_getLogs` for the Pool `Swap` topic across all pools, from `last_block + 1` to `min(head, +2000)`.
4. For each event, compute the exact BNB leg / token leg, `price_bnb`, `usd_value` (× live BNB/USD), and `block_time` (from the block); resolve `user_id` by wallet.
5. Upsert rows into `trades` on `tx_hash` (idempotent — corrects client fast-path rows, backfills missed ones).
6. Advance `indexer_state.last_block`.

**Scheduling (pg_cron + Vault).** A `cron.schedule('index-trades', '* * * * *', …)` job issues `net.http_post` to the function. The project URL, the public publishable key (`apikey` header), and the `x-indexer-secret` are all read from **Vault** (`vault.decrypted_secrets`) at execution time, so no secret is hardcoded in any migration. The matching `INDEXER_SECRET` is stored separately as an Edge Function secret (Supabase platform secrets store) and read at runtime via `Deno.env`.

---

## 10. Frontend Pages

### `/` — Home

`src/pages/Home.tsx`

The landing page. Shows:
- Hero section with Koala Pad branding.
- "Trending" token cards — tokens sorted by recent trading volume.
- "New Listings" — most recently created tokens.
- Link to the full token list.
- Quick navigation to games.

On initial load it fetches from Supabase:
- Latest tokens (limit 20, ordered by `created_at DESC`).
- Trade volume data to compute trending scores.

---

### `/create` — Create Token

`src/pages/CreateToken.tsx`

The token creation form. Key behaviors:
- Image upload shows a live preview.
- Symbol auto-uppercases as the user types.
- "Create Token" button opens the wallet if not connected, then sends the factory transaction.
- A loading state with step labels ("Deploying contracts...", "Uploading image...", "Saving metadata...") shows during the multi-step process.
- On success: navigates to `/token/:address`.

---

### `/token/:address` — Token Detail

`src/pages/Token.tsx`

The most complex page. Adapts its UI based on `phase`:

**ICO phase (`phase === 'ico'`):**
- `ICOProgressHero` — visual progress across 10 rounds, countdown timer, BNB raised.
- `ICOPanel` — buy form, current price, estimated tokens out.
- `ActivityTabs` — comments section (no trade history yet).

**Trading phase (`phase === 'trading'`):**
- `PriceChartLite` — interactive price chart.
- `SwapPanel` — buy/sell form with price impact preview.
- `AirdropStatus` — shows airdrop threshold progress and allocation.
- `ActivityTabs` — comments + trade history.
- Token metadata: name, symbol, description, social links, holder count, market cap.

**Read from chain on load:**
- Pool reserves (`reserveBNB`, `reserveToken`) → current price.
- ICO state (`currentStep`, `totalRaisedBNB`, `deadline`, `finalized`).
- User's token balance.
- User's ICO allocation (if in ICO phase).

---

### `/profile` and `/profile/:walletAddress` — Profile

`src/pages/Profile.tsx`

Renders the signed-in user's profile (`/profile`) or any other user's public profile (`/profile/:walletAddress`). Header shows:
- Avatar + username (editable inline for own profile).
- Wallet address with copy button.
- **Follow / Following** toggle button (foreign profiles only).
- Followers / Following / Created-tokens counts. Clicking a count opens a modal list — `FollowListModal` — that links each entry to that user's profile.
- KP bar, level, coin balance, BNB balance.

Tabs (left to right): **Creator Rewards** (default), Quests (own profile only), Created Tokens, Balances, Watchlist.

- **Creator Rewards** — Two stacked widgets:
  1. `CreatorRewardsChart` renders a daily-bucketed line chart from `get_creator_rewards_daily`. Y-axis is USD (locked at award time); each x-point is one calendar day over the last 30 days. The trendline is NOT cumulative — each day shows just that day's awards. The chart's top-left shows the all-time total via `get_creator_rewards_total`. Hover reveals per-day tooltips.
  2. `CreatorRewardsClaimList` (own profile only) shows the **Available to claim** total plus a list of created tokens with per-token accrued amounts. Reads `creatorFeesAccrued` from each Pool + ICO via batched `useReadContracts`. A "Claim all" button iterates the list, calling `Pool.claimCreatorFees()` / `ICO.claimCreatorFees()` on every contract with a non-zero balance and POSTs each tx hash to `record-creator-fee-claim` so the chart picks them up.
- Other tabs unchanged.

Right sidebar (own profile only): `Levels` widget (status ladder — see [§14](#14-levels-status-ladder)).

---

### `/shop` — Shop

`src/pages/Shop.tsx`

Two sections:

**Coin Packages** — Buy in-game coins with real BNB:

| Package | Coins | Price (BNB) |
|---|---|---|
| Starter | 500 | 0.005 |
| Popular | 2,000 | 0.015 |
| Pro | 10,000 | 0.05 |

---

### `/games` — Game Hub

`src/pages/AllGames.tsx`

Grid of game cards linking to:
- Lucky Wheel (`/lucky-wheel`)
- (Future games slots)

---

### `/lucky-wheel` — Lucky Wheel

`src/pages/LuckyWheel.tsx`

The lucky wheel game page. Contains the `Wheel` component and spin/claim logic. See [Section 15](#15-gaming--lucky-wheel).

---

## 11. Frontend Components

### `Header.tsx`

Top navigation bar. Contains:
- Logo / home link.
- Token search bar (queries `tokens` table by name/symbol).
- Wallet connection button (triggers Privy modal if not connected).
- User menu (profile, quests indicator, logout).
- Notification badge for unclaimed quest rewards.

### `Sidebar.tsx`

Left sidebar navigation (collapses to bottom bar on mobile):
- Home
- Create Token
- Games
- Shop
- Profile

### `SwapPanel.tsx`

The buy/sell widget on a token's trading page.

**Props:** `tokenAddress`, `poolAddress`, `tokenSymbol`, `reserveBNB`, `reserveToken`

**State:** `mode` (buy/sell), `inputAmount`, `outputAmount`, `priceImpact`, `slippage`

**Logic:**
- Real-time output preview using the constant product formula.
- Price impact warning if > 5%.
- Slippage input (default 1%).
- Fee indicator — shows "Free (boost active)" if user has the fee exemption.
- Handles the two-step approve + swap flow for sells.

### `ICOPanel.tsx`

ICO purchase widget.

**Props:** `icoAddress`, `currentStep`, `totalRaisedBNB`, `deadline`

Shows:
- Current step price and total steps remaining.
- BNB input → estimated tokens output at current step price.
- Deadline countdown.
- Buy button.
- If ICO is finalized: "Claim Tokens" button.

### `ICOProgressHero.tsx`

Visual round ladder for the ICO. Renders **10 rounds** as a horizontal bar, with completed rounds highlighted. Overlay shows current round price and percentage of total tokens sold.

### `AirdropStatus.tsx`

Shows:
- Pool reserve progress toward the 50 BNB threshold.
- Whether the airdrop has been triggered.
- User's personal airdrop allocation amount.
- "Trigger Airdrop" button (only creator can see this, and only once threshold is met).

### `PriceChartLite.tsx`

Wraps `lightweight-charts`. Reads `trades` table from Supabase (filtered by `token_address`) and renders an OHLCV candlestick chart. Supports 1H / 6H / 1D / 1W time frame toggles.

### `ActivityTabs.tsx`

Tab container with two tabs:
- **Comments** — threaded comment section. Users can post, reply, and like comments. Fetched from `comments` table with real-time updates via Supabase Realtime subscriptions.
- **Trades** — recent swap history for this token. Fetched from `trades` table. Each row shows: time, type (buy/sell), amount, price, wallet.

### `AllTokens.tsx`

Paginated grid/list of all tokens. Supports:
- Sort by: Market Cap, Volume, New, Trending.
- Filter by: Phase (ICO / Trading).
- Search by name/symbol.
- Fetches from `tokens` joined with latest `trades` for price data.

### `Quests.tsx`

Full quest browser showing all quests grouped by category. Each quest card shows:
- Title and description.
- Progress bar (current / target).
- KP and coin rewards.
- "Claim" button (enabled when completed and not yet claimed).
- "Claimed" badge if already claimed.

Uses `QuestContext` for all state.

### `QuestCompleteModal.tsx`

A celebration modal that appears when a quest is first completed. Shows:
- Confetti animation.
- Quest name and rewards.
- "Claim Now" button.
- "Don't show again" checkbox (persisted in localStorage per quest ID).

### `Levels.tsx`

The status ladder widget. No claim mechanics — levels are purely a status flex (see [§14](#14-levels-status-ladder)).

- **Hero card** at the top — current tier title, level number, KP, glyph badge, and a progress bar to the next tier. Each tier has its own accent color and glow.
- **Status ladder** below — 10 tile rows from Joey → Koala King. Achieved tiers are bright + accented; the current tier has a "You" pill; locked tiers are desaturated with a lock icon.
- All tier metadata (titles, blurbs, accent colors, glyphs, KP requirements) lives in `utils/gamification.ts` so the same strings power the Leaderboard.

### `CreatorRewardsPanel.tsx`

Token-page panel visible only to the creator. Reads `creatorFeesAccrued` on the Pool and the ICO, sums them, shows "Available to claim" in USD + BNB, and a Claim button that runs the Pool claim then the ICO claim sequentially. After each tx confirms, posts the hash to `record-creator-fee-claim` so the daily chart updates.

### `CreatorRewardsClaimList.tsx`

The Profile-page companion to the chart. Same on-chain reads as `CreatorRewardsPanel` but batched across every token the user has created (one Pool + one ICO read per token). Shows aggregate "Available to claim" + a per-token list. "Claim all" iterates the list; per-token "Claim" buttons let the creator pull from one token at a time.

### `Wheel.tsx`

The spinning wheel animation component. Takes a `prizeIndex` prop and uses CSS transforms + `framer-motion` to animate the wheel to the correct position. Plays a sound effect on spin.

### `Toast.tsx`

Global toast notification system. Mounted at the app root. Used via a `toast()` utility function throughout the app:

```typescript
toast.success('Swap complete!');
toast.error('Transaction rejected');
toast.info('Quest completed!');
```

---

## 12. State Management

### React Context

**`AuthContext`** — App-wide auth state. Every component that needs the current user reads from here. See [Section 5.3](#53-the-authcontext).

**`QuestContext`** — Quest completion state. Polls every 30 seconds for progress updates. Exposes `claimQuest()` for the claim action. See [Section 13](#13-quest-system).

### React Query

Wagmi's `useReadContract` hooks use React Query under the hood. This gives automatic caching, background refetching, and deduplication of RPC calls. The default stale time is 4 seconds — so rapid component remounts don't hammer the RPC.

### Local State

For single-component state (input values, modal open/closed, tab selection), plain `useState` / `useReducer` is used. No global state for UI state.

---

## 13. Quest System

### Quest Definitions

Quests are statically defined in `src/data/quests.ts`. They're never stored in the database — the database only records *completions* and *claims*.

**Quest structure:**

```typescript
interface Quest {
  id: string;           // e.g. 'create-1'
  title: string;
  description: string;
  category: 'create' | 'buy' | 'hold' | 'trade' | 'spin' | 'coins' | 'boost' | 'social';
  target: number;       // threshold to complete
  kpReward: number;
  coinsReward?: number; // optional coin reward
}
```

### Quest Progress Tracking

`QuestContext` computes progress in two ways depending on category:

**Server-side (queried from Supabase):**
- `create` — count of `tokens` where `creator_id = userId`.
- `buy` — count of `trades` where `user_id = userId AND is_buy = true`.
- `trade` — sum of `usd_value` from `trades` where `user_id = userId`.
- `spin` — count of `wheel_spins` where `user_id = userId`.
- `coins` — aggregated from `active_boosts` purchase records.
- `boost` — count of `active_boosts` where `user_id = userId`.

**Client-side (computed from on-chain data):**
- `hold` — checks user's balance across all tokens via `useReadContracts()` batched calls.

**Polling interval:** 30 seconds. The context also manually refreshes after actions that would change progress (e.g. after a swap, it immediately triggers a refresh).

### Quest Claiming

```
User clicks "Claim" on completed quest
    │
    ▼
QuestContext.claimQuest(quest)
    │
    ├─ setClaimingQuestId(quest.id)  ← UI shows loading
    │
    ▼
POST /functions/v1/claim-quest { questId }
    │
    ▼
Edge function RPC: claim_quest(userId, questId)
    │
    ├─ Verifies completion
    ├─ Verifies not already claimed
    ├─ Inserts claimed_quests row
    └─ Awards KP + coins (×2 if double-rewards boost)
    │
    ▼
Context updates claimedQuests + refreshes profile (coins/KP)
    │
    ▼
Toast: "Claimed 50 KP + 100 Coins!"
```

---

## 14. Levels (Status Ladder)

Levels exist purely as a flex.

### Tiers

Ten tiers, koala-themed, defined in `apps/web/src/utils/gamification.ts` (`LEVEL_TIERS`). Each entry carries a title, blurb, accent color, soft-accent for gradients, and a glyph:

| Lv | Title | KP required |
|---|---|---|
| 1 | Joey | 0 |
| 2 | Sapling Scout | 1,000 |
| 3 | Branch Climber | 8,000 |
| 4 | Leaf Whisperer | 27,000 |
| 5 | Eucalyptus Knight | 64,000 |
| 6 | Canopy Captain | 125,000 |
| 7 | Bushland Baron | 216,000 |
| 8 | Outback Oracle | 343,000 |
| 9 | Dreamtime Sage | 512,000 |
| 10 | Koala King | 729,000 |

### KP → Level curve

Cubic: `kpRequired(L) = (L − 1)³ × 1000` for L ∈ [1, 10]. Inverted: `level(kp) = clamp(1, 10, floor((kp / 1000)^(1/3)) + 1)`. The same formula is enforced in Postgres by `sync_user_level()`:

```sql
new.level := least(10, greatest(1, floor(power(new.kp / 1000.0, 1.0/3.0))::int + 1));
```

### Display rules

- **`Levels.tsx`** (Profile sidebar) — hero card with the current tier's title, level number, glyph, and progress bar to the next tier, plus the 10-row status ladder underneath.
- **`Leaderboard.tsx`** — each row shows `{Title} · Lv {n}` (status name before the level number, via `formatLevelBadge()`). Level is derived from KP at display time so the badge tracks the curve even before the DB trigger fires.

The signed-claim infrastructure stays in place for the Lucky Wheel and AirdropVault.

---

## 15. Creator Rewards Program

Token creators earn BNB from every trade on their token via the 0.35% creator fee.

### On-chain accounting

Both `Pool` and `ICO` carry a `creatorFeesAccrued` counter. Every `swapExactBNBForTokens`, `swapExactTokensForBNB`, `buy()`, and `withdraw()`:

1. Computes `protocolFee = amount × 85 / 10_000` and `creatorFee = amount × 35 / 10_000`.
2. Pushes `protocolFee` to `ProtocolTreasury` immediately.
3. Adds `creatorFee` to `creatorFeesAccrued` (no transfer — accrued in-contract).

The creator pulls funds at any time:

```solidity
function claimCreatorFees() external nonReentrant returns (uint256 amount) {
    require(msg.sender == creator, "Only creator");
    amount = creatorFeesAccrued;
    require(amount > 0, "Nothing to claim");
    creatorFeesAccrued = 0;
    payable(creator).call{value: amount}("");
    emit CreatorFeesClaimed(creator, amount);
}
```

Identical signature on both contracts. The Pool and ICO are independent — the creator may need two separate claim transactions if both have non-zero balances. The frontend handles this transparently by chaining them.

### Off-chain accounting

The daily chart on the Profile page reads from `creator_rewards` (see [§8](#8-database-schema)). Two row types live in that table:

- **ICO finalize bonus**: `ico_completed = true`, `bnb_amount = 1.0`. Inserted by `record-creator-reward` once per token, when the ICO auto-finalises. Idempotent on `(token_address) WHERE ico_completed = true`.
- **Creator-fee claim**: `ico_completed = false`, `tx_hash` set, `bnb_amount` decoded from the `CreatorFeesClaimed` event. Inserted by `record-creator-fee-claim` once per on-chain claim transaction. Idempotent on `tx_hash`.

Both row types contribute to `get_creator_rewards_daily(uuid, int)` and `get_creator_rewards_total(uuid)`, so the chart shows ICO + fee earnings as a single trendline of daily USD.

### Frontend surfaces

- **Token page** — `CreatorRewardsPanel` (creator only) shows accrued from Pool + ICO with a Claim button.
- **Profile → Creator Rewards tab** — `CreatorRewardsChart` (daily history) + `CreatorRewardsClaimList` (current "Available to claim" with per-token rows and a "Claim all" button).

After a successful claim, the frontend POSTs the tx hash to `record-creator-fee-claim`; the daily chart picks the new row up on its next mount. Failures to record are logged but do not block the on-chain payout — the BNB has already moved to the creator's wallet.

### Fee-exempt boost interaction

Users with an active `free-fees-1h` boost (see [§17](#17-shop--economy)) pay neither leg of the fee — protocol AND creator both zero out for their trades. This is by design: a "free fees" boost should feel free.

---

## 16. Daily Reward — Lucky Wheel

The lucky wheel is a daily free spin (with cooldown) that awards KP, coins, or BNB.

### Spin Flow

```
User clicks "Spin" (cooldown elapsed)
    │
    ▼
POST /functions/v1/wheel-spin { action: 'spin' }
    │
    ├─ Check 24h cooldown
    ├─ Roll weighted random prize
    └─ Insert wheel_spins row
    │
    ▼
Frontend receives { prizeType, prizeValue, spinId }
    │
    ▼
Wheel.tsx animates to the prize segment
    │
    ├─ KP prize → credited immediately, show toast
    ├─ Coins prize → credited immediately, show toast
    └─ BNB prize → show "Claim On-Chain" button
```

### BNB Claim Flow

```
User clicks "Claim BNB Prize"
    │
    ▼
POST /functions/v1/wheel-spin { action: 'claim', spinId }
    │
    └─ Returns { signature, nonce, deadline, amount }
    │
    ▼
LuckyWheel.claimPrize(amount, nonce, deadline, signature)
    │
    └─ Contract verifies sig, pays BNB to user's wallet
```

### Wheel Animation

`Wheel.tsx` renders a 3D-perspective SVG wheel with 8 prize segments (tilted 8° on the X axis). Multiple slices can map to the same prize type to add visual variety. On spin:
1. The backend rolls the prize and returns `{ prizeType, prizeValue, spinId }`.
2. `findMatchingSliceIndexes` picks a random slice that matches the prize type; a small random offset within the slice is added for variety.
3. `framer-motion` rotates the wheel by `2160 - sliceCenterAngle + offset` degrees (6 full clockwise turns) using a cubic-bezier ease over 4.5 s.
4. A decorative bulb-chase animation runs around the rim while spinning.
5. On landing, a brief flash effect pulses outward; the result modal then appears after a short delay.
6. Winners get a confetti burst in the result modal.

---

## 17. Shop & Economy

### The Economy

The in-game economy has two currencies:

| Currency | Earns From | Spends On |
|---|---|---|
| **Coins** | Quests, Wheel spins | Boosts, future cosmetics |
| **KP** | Quests, Wheel spins | Levels up automatically (status only — no payout) |
| **BNB** | Wheel prizes, Creator-fee claims, ICO creator share | Coin packages |

Coins and KP are entirely off-chain (Supabase). BNB prizes are settled on-chain via the signed-claim pattern; creator-fee BNB is held on-chain in each token's Pool/ICO until the creator calls `claimCreatorFees()`.

### Boosts

| Boost | Cost | Duration | Effect |
|---|---|---|---|
| Double Rewards | 500 Coins | 1 hour | 2× KP and Coins from quests |
| Free Fees | 1,000 Coins | 1 hour | 0% AMM swap fee |

Boosts are tracked in `active_boosts` table. The `free-fees-1h` boost also writes to the blockchain via `ProtocolTreasury.grantFeeExemption()`.

### Coin Packages

| Package | Coins | BNB Price |
|---|---|---|
| Starter | 500 | 0.005 BNB |
| Popular | 2,000 | 0.015 BNB |
| Pro | 10,000 | 0.05 BNB |

The user sends BNB directly to the `ProtocolTreasury` contract, then submits the tx hash to `purchase-coins`. The edge function verifies the transaction on-chain before crediting.

---

## 18. Security Architecture

### Client Security

**No economy writes from the client.** RLS policies block all direct `UPDATE` or `INSERT` on economy columns (`kp`, `coins`, `level`, etc.). All economy changes go through edge functions which enforce business logic server-side.

**JWT refresh.** The Supabase JWT expires in 1 hour. The frontend refreshes it every 50 minutes to avoid expired sessions mid-session.

**Slippage protection.** All swaps pass a `minOut` parameter. The contract reverts if the actual output is below the user-specified minimum, protecting against sandwich attacks.

### Contract Security

**ReentrancyGuard on all state-changing functions.** `buy()`, `swapExactBNBForTokens()`, `claimPrize()`, `cashOut()`, etc. all use OpenZeppelin's `nonReentrant` modifier.

**Ownable2Step for ProtocolTreasury.** Two-step ownership prevents accidental transfer to wrong address.

**Nonce-based replay prevention.** `SignedClaimsBase._usedNonces` prevents any signed claim from being submitted twice on-chain.

**Deadline-based expiry.** All signed claims include a `deadline` timestamp. Claims submitted after the deadline revert, preventing stale prize accumulation.

**Role separation in ProtocolTreasury.** The granter (hot wallet) can only call `grantFeeExemption()`. It cannot withdraw funds. Only the cold-wallet owner can withdraw.

**ICO late-buyer protection.** `_finalize()` asserts that the pool opening price strictly exceeds the round-10 ICO price before seeding liquidity. This prevents a scenario where late ICO buyers are immediately underwater the moment AMM trading opens.

**Creator payment isolation.** The creator's fixed 1 BNB is transferred with a 30 000 gas cap. If the creator's contract fallback reverts (malicious or buggy), their share is silently added to the pool BNB rather than bricking the entire finalization.

**Creator-fee accrual isolation.** `creatorFeesAccrued` lives in its own state slot on both Pool and ICO. `_finalize()` subtracts it from the spendable balance before seeding the pool, so the creator's fee BNB can never be accidentally seeded into the AMM — it remains claimable via `claimCreatorFees()` indefinitely. `claimCreatorFees()` is `nonReentrant` and gated on `msg.sender == creator`.

### Database Security (Supabase)

**RLS on every table.** Migration `20260428_security_hardening.sql` enables Row-Level Security on all tables and drops any pre-existing over-permissive policies.

**Economy-column write trigger.** A `BEFORE UPDATE` trigger (`_block_economy_updates`) on the `users` table raises an exception if any caller attempts to modify economy columns (`kp`, `coins`, `level`, `last_free_spin_at`, `wallet_address`, `privy_did`) outside the sanctioned paths. The trigger bypasses the check in two cases: (1) the request's JWT role claim is `service_role` (edge functions), or (2) the trigger is firing inside a `SECURITY DEFINER` RPC, in which case `current_user` becomes `postgres` / `supabase_admin` / `supabase_auth_admin`. Both paths represent code we control. Direct `UPDATE`s by `authenticated` or `anon` always raise.

**SECURITY DEFINER functions.** All economic writes go through PostgreSQL functions with `SECURITY DEFINER` and `REVOKE ALL … FROM public`. The `authenticated` role is granted execute rights only on functions that cannot award themselves resources (e.g. `claim_quest`). Functions that credit coins or KP directly (`credit_coins_purchase`, `credit_wheel_prize`, `purchase_boost`) are reserved exclusively for the `service_role` (edge functions).

**Idempotency via `processed_payments`.** A dedicated `processed_payments` table (unique on `tx_hash`) prevents double-crediting if `purchase-coins` is called twice with the same on-chain transaction.

### Backend Security (Edge Functions)

**CORS origin allow-list.** `supabase/functions/_shared/cors.ts` reads `ALLOWED_ORIGINS` (comma-separated). The `Access-Control-Allow-Origin` header is only added when the incoming `Origin` exactly matches an entry in the list — it never falls back to a default or wildcard. Unrecognised origins receive no CORS header, causing the browser to block the request.

```typescript
// cors.ts (simplified)
if (origin && allowed.includes(origin)) {
  headers['Access-Control-Allow-Origin'] = origin
}
// No else — unlisted origins get no header at all
```

**JWKS caching.** Privy's public keys are cached for 1 hour in the edge function's module-level scope to avoid hammering Privy's JWKS endpoint.

**Signature verification for wallet linking.** External wallets must prove ownership via an ECDSA signature over a message containing the user's `privyDid`. This prevents one user from claiming another user's wallet.

**Idempotency on coin purchases.** The `purchase-coins` function checks the tx hash against existing records before crediting, preventing double-crediting if the function is called twice with the same transaction.

---

## 19. Testing

### Smart Contract Tests

```bash
cd contracts
npx hardhat test

# With gas reporting
REPORT_GAS=true npx hardhat test

# With coverage
npx hardhat coverage
```

Test files in `contracts/test/`:
- **Factory tests** — token creation, fee handling, event emission, deploy atomicity.
- **Pool tests** — constant product invariant, fee math, slippage revert, access control on `addInitialLiquidity`.
- **ICO tests** — round transitions, 0.85%/0.35% fee split, finalization split (fixed 1 BNB creator / remainder to pool), late-buyer price invariant, withdraw logic, `creatorFeesAccrued` excluded from pool seed.
- **Creator-fee tests** — accrual on Pool swaps, `claimCreatorFees()` access control (only `creator`), accrual reset to zero after claim.
- **Security tests** — reentrancy on all state-changing functions, overflow edge cases, replay attacks on signed claims.

### Edge Function Testing

Edge functions can be tested locally using the Supabase CLI:

```bash
supabase functions serve wheel-spin --env-file ./supabase/.env.local

# Hit the local function
curl -X POST http://localhost:54321/functions/v1/wheel-spin \
  -H "Authorization: Bearer <test-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"action": "spin"}'
```

### Frontend Testing

The frontend uses Vite's built-in dev server for manual integration testing against BSC Testnet. Get testnet BNB from the [BNB Testnet Faucet](https://testnet.bnbchain.org/faucet-smart) and run through the full user flows:

1. Sign up via Privy (email or social).
2. Get testnet BNB.
3. Create a token.
4. Participate in your token's ICO.
5. Wait for finalization (or manually call `finalize()`).
6. Swap tokens on the AMM.
7. Spin the lucky wheel.
8. Claim a quest reward.

---
