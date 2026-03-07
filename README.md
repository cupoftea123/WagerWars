# Wager Wars

Competitive 1v1 onchain duel game on Avalanche. Two players wager USDC, battle through 7 rounds of strategic combat, and the winner takes the pot — all settled trustlessly on-chain.

**Live on Avalanche Fuji Testnet** | [Contract on Snowtrace](https://testnet.snowtrace.io/address/0x1e5059377b119d63635e6874954FDaC261f2d4fE)

## How It Works

1. **Create or Join** a match with a USDC wager ($1, $5, $10, or $25)
2. **Battle** through up to 7 rounds using commit-reveal mechanics (no cheating possible)
3. **Winner receives** the full pot automatically via on-chain settlement

### Combat System

Each round, both players simultaneously choose one of four actions:

| Action | Energy Cost | Effect |
|--------|-------------|--------|
| **Strike** | 3 | Deal 5 damage (blocked by Shield, 2x vs Recover) |
| **Shield** | 2 | Block Strike damage (penetrated by Break) |
| **Break** | 4 | Deal 3 damage (penetrates Shield) |
| **Recover** | 0 | Gain +4 energy (vulnerable: Strike deals 2x) |

Strategic triangle: Strike beats Recover, Shield blocks Strike, Break penetrates Shield.

### Round Modifiers

4 out of 6 rounds (2-7) get a random modifier that changes the meta:

- **Power Surge** — All damage doubled
- **Overcharge** — Recover grants +6 energy instead of +4
- **Reflect** — Shield reflects 3 damage to attacker (Strike or Break)
- **Tax** — All actions cost +1 energy

Round 1 is always neutral. Modifiers are deterministically shuffled — you can deduce remaining ones as the game progresses.

### Win Conditions

1. **KO** — Reduce opponent to 0 HP (instant win)
2. **HP Lead** — Most HP after 7 rounds
3. **Energy Tiebreak** — If HP tied, higher energy wins
4. **Draw** — True tie = 50/50 pot split

## Architecture

```
wager-wars/
├── packages/
│   ├── contracts/       Solidity smart contract (Hardhat, EIP-712 settlement)
│   └── shared/          Pure TypeScript game logic (damage calc, energy, hashing)
├── apps/
│   ├── server/          Express + Socket.io (real-time match orchestration)
│   └── web/             Next.js 14 frontend (React, RainbowKit, Tailwind CSS)
└── pnpm-workspace.yaml
```

### Key Design Decisions

- **Only 2 transactions per match** — deposit + settlement. All gameplay is offchain via WebSocket.
- **Commit-reveal** — Players commit a hash of their move, then reveal. Neither can change after seeing the opponent's choice.
- **EIP-712 settlement** — Server signs match results. Contract verifies signature and auto-pushes USDC to the winner.
- **Auto-push payouts** — No manual claiming. USDC is sent directly to winners on settlement.
- **Shared game logic** — Same deterministic TypeScript code runs on both server and client.
- **In-memory state** — No database needed for transient game state. On-chain events serve as permanent history.

### Smart Contract

Single `WagerWars.sol` escrow contract handling the full lifecycle:

- `createMatch` / `joinMatch` — USDC deposits
- `settleMatch` — EIP-712 verified settlement with auto-push payout
- `cancelMatch` / `cancelExpiredMatch` — Safe cancellation with refund
- `claimStaleMatch` — 48h safety net for stuck matches

Security: ReentrancyGuard, SafeERC20, Ownable, EIP-712. Protocol fee: 3%.

### Server-Side Timers

- **Round 1**: 30 seconds to choose your action
- **Rounds 2-7**: 15 seconds per action
- **Timeout default**: Shield (or Recover if insufficient energy) — no forfeit on timeout

## Tech Stack

- **Blockchain**: Avalanche C-Chain (Fuji Testnet), Solidity, Hardhat
- **Backend**: Node.js, Express, Socket.io, viem
- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, RainbowKit, wagmi
- **Shared**: Pure TypeScript game logic (zero dependencies)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- A wallet with Fuji AVAX for gas

### Installation

```bash
git clone https://github.com/<your-username>/wager-wars.git
cd wager-wars
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Blockchain
AVALANCHE_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113

# Contracts (already deployed on Fuji)
WAGER_WARS_ADDRESS=0x1e5059377b119d63635e6874954FDaC261f2d4fE
USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65

# Server
SETTLEMENT_PRIVATE_KEY=0x...   # Must match contract's settlementSigner
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Frontend
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
NEXT_PUBLIC_WAGER_WARS_ADDRESS=0x1e5059377b119d63635e6874954FDaC261f2d4fE
NEXT_PUBLIC_USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
NEXT_PUBLIC_CHAIN_ID=43113
```

### Running Locally

```bash
# Terminal 1 — Server
pnpm --filter server dev

# Terminal 2 — Frontend
pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Getting Test USDC

The game uses test USDC on Avalanche Fuji (`0x5425890298aed601595a70AB815c96711a31Bc65`).

1. Get Fuji AVAX from the [Avalanche Faucet](https://faucet.avax.network/)
2. Use the [Aave Faucet](https://staging.aave.com/faucet/) to mint test USDC on Fuji

### Build

```bash
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm test:shared    # Game logic unit tests
pnpm test:contracts # Smart contract tests
```

### Deploy Contract

```bash
pnpm --filter contracts deploy:fuji
```

## Demo Mode

Try the game without USDC — click "Try Demo" on the landing page. You'll play against a bot with no real wagers. Full game mechanics apply.

## License

MIT
