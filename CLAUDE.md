# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond to the user in Russian.

## Project Overview

Wager Wars — competitive 1v1 onchain duel game on Avalanche. Two players wager USDC, play a 7-round strategic battle (simultaneous commit-reveal moves), winner takes the pot. Offchain gameplay with onchain settlement (2 transactions per match: deposit + settlement). Auto-push payouts — USDC is sent directly to winners on settlement, no manual claim needed.

## Monorepo Structure (pnpm workspaces)

```
wager-wars/
├── packages/
│   ├── contracts/       # Solidity smart contracts (Hardhat)
│   └── shared/          # Pure TypeScript game logic (types, damage calc, energy, hashing)
├── apps/
│   ├── server/          # Express + Socket.io backend (match orchestration)
│   └── web/             # Next.js 14 App Router frontend (React + RainbowKit + Tailwind)
├── .env                 # Root env vars (shared across all packages)
└── pnpm-workspace.yaml
```

## Build & Run Commands

```bash
pnpm install                # Install all dependencies (requires pnpm 9+)
pnpm build                  # Build all packages
pnpm test                   # Run all tests
pnpm test:shared            # Vitest unit tests for shared game logic
pnpm test:contracts         # Hardhat + Chai contract tests
pnpm clean                  # Clean all build output

# Run a single test file
pnpm --filter @wager-wars/shared test -- src/damage.test.ts

# Watch mode for shared tests
pnpm --filter @wager-wars/shared test:watch
```

### Per-package commands

```bash
# Server (apps/server)
pnpm --filter server dev          # ts-node watch mode (port 3001)
pnpm --filter server build        # Compile → dist/
pnpm --filter server start        # Run production build

# Web (apps/web)
pnpm --filter web dev             # Next.js dev server (port 3000)
pnpm --filter web build           # Production build → .next/

# Contracts (packages/contracts)
pnpm --filter contracts build     # Hardhat compile → artifacts/
pnpm --filter contracts test      # Run contract test suite
pnpm --filter contracts deploy:fuji  # Deploy to Avalanche Fuji

# Shared (packages/shared) — must rebuild after type changes
pnpm --filter shared build        # Compile → dist/
```

**Build order matters:** shared → server + contracts → web. After changing shared types, rebuild shared first or server/web builds will use stale `.d.ts` files.

TypeScript targets ESM modules (`"type": "module"`) across all packages. Shared base config in `tsconfig.base.json`.

## Architecture

### Smart Contract — `WagerWars.sol` (packages/contracts)

Single EIP-712 escrow contract handling the full match lifecycle:

- **`createMatch(matchId, wagerAmount)`** — Player 1 deposits USDC, opens match.
- **`joinMatch(matchId)`** — Player 2 deposits matching wager, match becomes Funded.
- **`settleMatch(matchId, winner, signature)`** — Verify EIP-712 server signature, auto-push USDC to winner (or both on draw).
- **`cancelMatch(matchId)`** — Creator cancels Open match immediately, USDC returned. Race-safe with `joinMatch()` — whichever tx lands first wins.
- **`cancelExpiredMatch(matchId)`** — Reclaim if opponent never joined (30 min expiry).
- **`claimStaleMatch(matchId)`** — Either player reclaims stuck matches (48h timeout).
- **`emergencySettle(matchId, winner)`** — Owner-only force settlement (24h+).
- **`withdraw()`** — Only for feeRecipient to claim accumulated protocol fees.

Match statuses: `None → Open → Funded → Settled | Cancelled`

**Payout model:** All settlement/cancel/expiry functions auto-push USDC directly to players via `safeTransfer`. No `pendingWithdrawals` accumulation for players. `MatchPayout` event emitted for every payout (indexed by matchId + player) — used by the profile page to query on-chain history.

Security: ReentrancyGuard, SafeERC20, Ownable, EIP-712 signature verification. Protocol fee: 3% (configurable, max 10%). No fee on draws.

### Server — Express + Socket.io (apps/server)

```
index.ts          — Entry point, Express + Socket.io setup
config.ts         — Environment config loading
chain/
  provider.ts     — Viem public + wallet clients
  events.ts       — Onchain event watcher (deposit detection + absent player alerts)
  settlement.ts   — EIP-712 signing + settlement submission
game/
  MatchManager.ts — In-memory match registry (Map<matchId, Match>)
  Match.ts        — Per-match orchestrator (rounds, state, demo flag, server-side timers)
  CommitReveal.ts — Per-round commit-reveal state tracking
  BotPlayer.ts    — Random-action bot for demo matches
socket/
  handlers.ts     — Socket.io event handlers (create, join, commit, reveal, cancel, forfeit, demo, timeout handling)
  types.ts        — Socket event type definitions
  middleware.ts   — Wallet signature authentication
```

Key design: All match state is in-memory (no database). Matches auto-cleanup on completion/timeout. Server is authoritative for game logic but all moves are cryptographically signed for onchain verification.

**Server-side timers** (`Match.ts`): `startCommitTimer()` (30s round 1, 15s rounds 2-7), `startRevealTimer()` (15s always), `clearCommitTimer()`, `clearRevealTimer()`, `getCommitTimeout()`. Timeout callbacks in `handlers.ts` (`handleCommitTimeout`, `handleRevealTimeout`) check which player hasn't acted, forfeit them, and trigger auto-settlement. The `round_start` event includes `commitTimeout` so frontend knows the duration. Timers are cleared on both commits, both reveals, match end, or player leaving.

Health check: `GET /health` returns `{ status, activeMatches, uptime }`.

**On-chain event watcher** (`chain/events.ts`): Polls every 5s for `MatchCreated` and `MatchJoined` contract events using `publicClient.getLogs()`. Confirms deposits via `match.markDeposit()`, notifies players via `deposit_confirmed` socket event, and auto-starts the game when both deposits are confirmed. After game starts, calls `notifyAbsentPlayers()` to send `match_started_alert` to players not in the match socket room (e.g., they navigated to lobby).

### Frontend — Next.js 14 (apps/web)

```
app/
  layout.tsx              — Root layout with Web3Provider + SocketProvider + global toasts
  page.tsx                — Landing page (hero, game mechanics, rules, demo CTA, grid background, inline SVG icons)
  play/
    page.tsx              — Lobby (match browser + creator + demo mode + active match banner)
    [matchId]/page.tsx    — Battle arena
  profile/
    page.tsx              — Match history + stats (from on-chain MatchPayout events)
  globals.css             — Global styles + .glass-card, .text-gradient-red utilities
components/
  game/
    BattleArena.tsx       — Main combat UI (VS layout) + deposit phase + cancel/leave buttons
    ActionSelector.tsx    — Glassmorphism action cards with SVG icons + hover/select animations
    ActionIcons.tsx       — Custom SVG icons (Strike=sword, Shield=shield, Break=fist, Recover=spiral) with gradient fills + glow filters
    BattleEffects.tsx     — useBattleEffects() hook + DamageFlash, FloatingDamageNumbers, RoundTransitionOverlay
    CircleTimer.tsx       — SVG circular countdown (gray→amber→red), uses requestAnimationFrame
    Particles.tsx         — Confetti (60 CSS particles) for victory, GlitchText for defeat
    HealthBar.tsx         — Gradient HP bar with glow, segment markers, damage flash, low HP pulse
    EnergyBar.tsx         — Glowing blue orbs with staggered appear animations
    RoundResult.tsx       — Compact battle log with ActionBadge icons + damage summary
    MatchResult.tsx       — Animated VICTORY/DEFEAT/DRAW + confetti + staggered fade-in
    DemoMatchResult.tsx   — Demo match result (no settlement, retry/play-for-real buttons)
  WalletButton.tsx        — USDC balance display + ConnectButton wrapper
  RematchToast.tsx        — Global rematch invite toast (bottom-right, 15s countdown)
  ActiveMatchToast.tsx    — Global "match started" alert toast (bottom-right, 30s countdown)
  providers/
    Web3Provider.tsx      — Wagmi + RainbowKit (Avalanche chains)
    SocketProvider.tsx    — Socket.io + wallet auth
hooks/
  useMatch.ts             — Match state + socket event listeners + isDemo tracking + commitTimeout
  useDeposit.ts           — USDC allowance check → approve (if needed) → deposit flow
  useMatchHistory.ts      — On-chain MatchPayout event queries for profile
lib/
  wagmi.ts                — Wagmi chain config
  contracts.ts            — Contract ABIs & addresses + MatchPayout event ABI
  socket.ts               — Socket client factory
```

### Shared Game Logic — `@wager-wars/shared` (packages/shared)

Pure deterministic TypeScript used by both server and client:

- **types.ts** — Enums: `Action` (Strike/Shield/Break/Recover), `RoundModifier` (None/PowerSurge/Overcharge/Reflect/Tax), `MatchStatus`, `RoundPhase`, `SettlementData`
- **constants.ts** — Balance numbers (20 HP, 10 Energy, action costs, damage values)
- **damage.ts** — Round resolution: interaction matrix + modifier effects
- **energy.ts** — Energy delta calculation (cost + bonus + passive regen)
- **actions.ts** — Action validation (affordability check)
- **hash.ts** — Commit-reveal hashing (`keccak256(matchId, round, address, action, salt)`)
- **match.ts** — Match state machine (join, unjoin, deposit, commit, reveal, advance, forfeit)

## Game Mechanics Quick Reference

### Resources
- 20 HP, 10 Energy start. +1 passive energy regen from round 2+. No energy cap.

### Actions & Interaction Matrix

| Action | Cost | Effect |
|--------|------|--------|
| Strike | 3 | 5 damage |
| Shield | 2 | Blocks Strike |
| Break | 4 | 3 damage, penetrates Shield |
| Recover | 0 (+4 energy) | Vulnerable: Strike deals 2x (10 dmg) |

Strategic triangle: Strike > Break > Shield > Strike. Recover = high risk/high reward.

### Round Modifiers (4 of 6 rounds, shuffled)
- **Power Surge** — All damage doubled (Strike vs Recover = 20 = instant kill)
- **Overcharge** — Recover grants +6 instead of +4
- **Reflect** — Shield reflects 3 damage to attacker
- **Tax** — All actions cost +1 energy

Round 1 always neutral. Remaining modifiers deducible as rounds progress. Round 7 modifier is always fully known.

### Win Conditions
1. KO (HP ≤ 0) — instant
2. HP lead after 7 rounds
3. Energy tiebreak if HP tied
4. True tie → 50/50 pot split

## Commit-Reveal Flow

```
COMMIT (30s round 1, 15s rounds 2-7) → Both send hash(action + salt + round + matchId + address)
REVEAL (15s) → Both reveal action + salt, server verifies hash matches
RESOLVE      → Apply damage matrix + modifier, broadcast results
```

Prevents cheating: neither player can change their move after seeing opponent's commitment.

## Socket Events

**Client → Server:** `authenticate`, `create_match`, `join_match`, `commit`, `reveal`, `leave_match`, `get_open_matches`, `get_match_state`, `get_active_match`, `request_rematch`, `accept_rematch`, `decline_rematch`, `cancel_match`, `forfeit_from_lobby`, `start_demo_match`

**Server → Client:** `authenticated`, `match_created` (includes `isDemo` flag), `match_joined`, `opponent_joined`, `deposit_required`, `deposit_confirmed`, `round_start` (includes `commitTimeout`: 30 or 15), `opponent_committed`, `reveal_phase`, `round_result`, `match_result`, `open_matches`, `active_match`, `match_cancelled`, `match_started_alert`, `rematch_invite`, `rematch_waiting`, `rematch_declined`, `rematch_created`, `error`

## Deposit Flow (Allowance Check → Approve → Deposit)

The `useDeposit` hook (`hooks/useDeposit.ts`) manages the on-chain deposit with automatic allowance optimization:

1. **Allowance Check**: `useReadContract` reads `allowance(address, WagerWars)` on mount
2. **If allowance ≥ wager** → approve is **skipped entirely**, deposit tx fires immediately (1 transaction)
3. **If allowance < wager** → standard two-step flow:
   - **Approve**: ERC20 `approve(WagerWars, amount)` → wait for **on-chain confirmation** via `useWaitForTransactionReceipt`
   - **Deposit**: Only after approve confirmed on-chain, call `createMatch(matchId, amount)` or `joinMatch(matchId)`

After successful deposit, `refetchAllowance()` updates the cached allowance value.

Critical: `writeContract`'s `onSuccess` fires when the wallet **signs** the tx, NOT when it's confirmed on-chain. If you submit the deposit tx before the approve tx is mined, gas estimation fails (the contract simulates against un-approved state) → `gas: 2000` → instant revert.

The hook stores pending deposit params in a `useRef<PendingDeposit>` and uses a `useEffect` watching `approveConfirmed` from `useWaitForTransactionReceipt` to trigger the deposit step. The shared `submitDeposit()` function is called from both paths (skip-approve and approve-confirmed).

### Deposit Ordering Constraint

The smart contract requires `createMatch` (Player1) before `joinMatch` (Player2). In the BattleArena deposit UI:
- **Player1 (creator)**: Can deposit immediately
- **Player2 (joiner)**: Must wait until Player1's deposit is confirmed on-chain (`opponentDeposited === true`)

The lobby only shows matches where the creator has already deposited (`getOpenMatches()` filters by `players[0].deposited`). This prevents joiners from seeing unfunded matches.

## Match Cancel Flow

Two ways to cancel a match and reclaim deposit:

1. **BattleArena deposit phase** — Player1 sees "Leave + Claim Deposit" button. Calls on-chain `cancelMatch(onChainMatchId)` via wagmi, then emits `cancel_match` to server, redirects to lobby. Player2 (pre-deposit) just emits `leave_match`.

2. **Lobby active match banner** — Banner buttons depend on `playerSlot` (returned by `get_active_match`):
   - **Player1**: "Join Match" + "Cancel + Claim Deposit" (on-chain cancel + server cleanup)
   - **Player2**: "Join Match" + "Leave Match" (server-only `leave_match`, no on-chain tx needed)

When Player1 cancels, server emits `match_cancelled` to opponent before removing the match. When Player2 leaves during deposit phase, server calls `match.unjoin()` (reverts to WaitingForOpponent) and notifies Player1.

The on-chain `cancelMatch()` only works on Open matches (Player1 deposited, Player2 hasn't). For Funded matches, the 48h `claimStaleMatch()` is the safety net.

## Active Match Protection

When a match starts while a player is on the lobby page (not in the match socket room):

1. Server's `notifyAbsentPlayers()` sends `match_started_alert` directly via `addressToSocket` map
2. `ActiveMatchToast` (global, mounted in root layout) shows a toast with 30s countdown
3. **Join** → redirects to match page
4. **Leave** → emits `forfeit_from_lobby` → opponent wins automatically → server auto-settles

This prevents the scenario where a player creates a match, deposits, navigates to lobby, opponent joins and starts playing — but the creator is stuck in lobby missing everything.

## Rematch System (Invite-Based)

Rematches use a direct invite flow instead of both-must-request:

1. Player A clicks "Play Again" → emits `request_rematch` → server sends `rematch_invite` directly to opponent's socket (works even if opponent is on lobby page)
2. Opponent sees a **RematchToast** (global component, bottom-right) with 15s countdown + progress bar
3. Accept → `accept_rematch` → server creates new match → `rematch_created` emitted to both → both redirect to new match
4. Decline/timeout → `decline_rematch` → server sends `rematch_declined` to requester → requester sees "Rematch declined"

Server tracks pending invitations with 15s auto-expire timeout in `MatchManager.pendingRematches`. The `addressToSocket` map is populated on authentication (`setupAuth` callback) so invites reach players on any page.

Edge case: if both players click "Play Again" simultaneously, the second `request_rematch` detects an existing pending invite from the opponent and auto-accepts.

## Profile Page

`/profile` displays on-chain match history by querying `MatchPayout` events filtered by player address (indexed). For each event, `getMatch(matchId)` fetches opponent, winner, wager amount, and status. Shows W/L/D stats, total earned/wagered, and a table with Snowtrace tx links.

Data source is entirely on-chain — no server API needed for history.

## Demo Mode (Bot Practice Matches)

Demo mode lets players test game mechanics without on-chain transactions or USDC wagers. Accessed via `/play?demo=true` or "Try Demo" links on the landing page.

### How it works

1. Player navigates to `/play?demo=true` → frontend emits `start_demo_match`
2. Server creates match with `wagerAmount=0`, `isDemo=true`
3. Bot auto-joins as Player2, both deposits auto-confirmed (no on-chain)
4. Match starts immediately — `round_start` emitted right away
5. Player commits → bot auto-commits (random affordable action) → reveal phase → bot auto-reveals
6. After 7 rounds (or KO) → `match_result` emitted without settlement
7. `DemoMatchResult` component shown instead of `MatchResult` (no payout info, offers "Try Again" / "Play for Real")

### Key implementation details

- **Bot address**: `0x0000000000000000000000000000000000000b07` (all lowercase — viem requires EIP-55 compliant or all-lowercase addresses)
- **`BotPlayer.chooseAction(state)`**: picks random action from `getAvailableActions(energy, modifier)` — no strategic AI
- **`Match.pendingBotMove`**: temporary storage for bot's `{action, salt, commitHash}` between commit and reveal phases
- **`MatchManager.createDemoMatch()`**: creates match, auto-joins bot, marks both deposits, returns InProgress match
- Demo matches filtered from `getOpenMatches()` (not visible in lobby)
- Bot NOT registered in `playerMatches` map (not a real player)
- On disconnect, demo matches are immediately removed (no forfeit/settlement)
- Demo matches have no timeouts, rematches, or on-chain interactions

## CSS Utilities & Design System

### Custom utilities (`globals.css`)
- **`.glass-card`** — Glassmorphism: `bg-white/[0.03] backdrop-blur border border-white/[0.08] rounded-2xl` — used throughout lobby, profile, battle arena
- **`.glass-card-hover`** — Glass card + hover states (`hover:bg-white/[0.06] hover:border-white/[0.15]`)
- **`.text-gradient-red`** — Red-to-orange gradient text via `bg-clip-text` — used for "WARS" in headers

### Battle animations (`globals.css` @keyframes)
- **Screen effects:** `shake` (screen shake on hit), `damage-flash-red` / `damage-flash-green` (full-screen overlay)
- **Floating numbers:** `float-up-fade` (damage/energy numbers rise and fade)
- **HP bar:** `pulse-low-hp` (red pulse when HP < 25%), `hp-bar-damage` (flash on damage)
- **Round transitions:** `round-enter` (scale up "ROUND N" text)
- **Match results:** `victory-entrance` (spring scale), `defeat-entrance` (slide + shake), `draw-entrance` (rotateX flip)
- **Particles:** `confetti-fall` (randomized confetti drop), `glitch-1` (clip-path glitch for defeat text)
- **Energy orbs:** `energy-orb-appear` (pop-in), `energy-orb-pulse` (ambient glow pulse)
- **Actions:** `action-card-hover` (lift on hover), `selected-action-pulse` (glow pulse on selected)
- **Modifiers:** `modifier-glow` (ambient modifier badge glow)
- **Timer:** `timer-pulse` (pulse when time is low)

### Custom animations (`tailwind.config.ts`)
- **`fade-in-up`** — Entrance animation (opacity 0→1, translateY 20px→0)
- **`pulse-glow`** — Red glow pulse on CTA buttons (infinite, 2s cycle)
- **`energy-appear`** / **`energy-pulse`** — Energy orb entrance and ambient pulse
- **`timer-pulse`** — Timer urgency pulse
- **`confetti`** — Confetti particle fall animation

## Environment Variables

```env
# Blockchain
AVALANCHE_RPC_URL=            # Avalanche RPC (Fuji: https://api.avax-test.network/ext/bc/C/rpc)
CHAIN_ID=43113                # Fuji testnet

# Contracts (set after deployment)
WAGER_WARS_ADDRESS=0x...      # Deployed WagerWars contract
USDC_ADDRESS=0x...            # USDC token address

# Server
SETTLEMENT_PRIVATE_KEY=0x...  # EIP-712 signing key (MUST match contract's settlementSigner)
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Deployer
DEPLOYER_PRIVATE_KEY=0x...    # For Hardhat deploy scripts
SNOWTRACE_API_KEY=            # Contract verification on Snowtrace

# Frontend (NEXT_PUBLIC_ prefix required)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
NEXT_PUBLIC_WAGER_WARS_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=43113
```

## Key Architecture Decisions

1. **EIP-712 settlement** — Server signs match result offchain. Anyone can submit onchain. Only 2 txs per match (deposit + settle).
2. **Auto-push payouts** — `settleMatch()` sends USDC directly to winner via `safeTransfer`. No `pendingWithdrawals` accumulation for players. `withdraw()` exists only for feeRecipient. Simpler UX — funds arrive automatically after settlement.
3. **In-memory match state** — No database needed for transient game state. Matches cleaned up on completion.
4. **Shared pure game logic** — `@wager-wars/shared` is deterministic, no side effects. Same code validates on server and predicts on client.
5. **Wallet-based auth** — No login/password. Players sign a message with their wallet, server verifies signature.
6. **Predictable randomness** — 4 modifiers shuffled across rounds 2-7. Players deduce remaining modifiers as game progresses. Final round is never random.
7. **On-chain history** — Profile page queries `MatchPayout` events (indexed) rather than maintaining a database. Fully trustless history.

## Critical Gotchas

### SETTLEMENT_PRIVATE_KEY must match contract's settlementSigner
The server signs EIP-712 settlements. The contract verifies via `ECDSA.recover()`. If keys don't match, all settlements will fail. The deploy script passes the address derived from `DEPLOYER_PRIVATE_KEY` as the settlement signer — if using a different key for settlement, call `setSettlementSigner()` after deployment.

### USDC has 6 decimals, not 18
All wager amounts use USDC (6 decimals). `1 USDC = 1_000_000`. Don't use `parseEther()` — use `parseUnits(amount, 6)`.

### onChainMatchId is bytes32, not the UUID
Server generates a UUID for internal tracking. The onchain `matchId` is `keccak256(uuid)` — a bytes32. Frontend must use the correct format when calling contract functions.

### Commit hash includes player address
`keccak256(matchId + round + playerAddress + action + salt)` — the address is part of the hash. This prevents one player's commitment from being reused by another.

### Timeout behavior — server-enforced, auto-play (NOT forfeit)
Timers run server-side via `setTimeout` in `Match.ts`. Frontend receives `commitTimeout` in `round_start` event and displays `CircleTimer` accordingly.

- **Commit timeout**: 30s for round 1, 15s for rounds 2-7. `handleCommitTimeout()` auto-commits + auto-reveals **Shield** for the timed-out player (or **Recover** if not enough energy for Shield). The round then resolves normally.
- **Reveal timeout**: 15s always. `handleRevealTimeout()` force-reveals **Shield** (or **Recover**) via `match.forceReveal()` (bypasses hash verification since original commit is unknown). Round resolves normally.
- **Default action logic** (`Match.getDefaultTimeoutAction`): Shield (cost 2, or 3 with Tax) if affordable, else Recover (cost 0, or 1 with Tax). Recover is always affordable except with Tax modifier and 0 energy (extremely rare).
- **Timer lifecycle**: Commit timer starts on `round_start`. Cleared when both commit → reveal timer starts. Cleared when both reveal. All timers cleared on match end or player leave.
- **`resolveAndAdvance()`**: Shared helper used by both timeout handlers and the normal reveal flow. Resolves round, emits `round_result`, checks for match end (settlement) or starts next round.
- **Demo matches**: No timers (bot responds instantly).
- Match expiry (30 min): Unfunded match can be cancelled by creator (immediately via `cancelMatch()` or after expiry via `cancelExpiredMatch()`).
- Stale match (48h): Either player can reclaim from funded-but-unsettled match.

### Modifier application order matters
In `damage.ts`, modifiers apply AFTER the base interaction matrix. Power Surge doubles ALL damage including Strike vs Recover's 2x (so 5 × 2 × 2 = 20). Reflect damage is applied separately after base resolution.

### wagmi writeContract onSuccess ≠ on-chain confirmation
`writeContract`'s `onSuccess` callback fires when the wallet **signs and broadcasts** the tx — NOT when it's confirmed on-chain. For two-step flows (approve → deposit), you MUST use `useWaitForTransactionReceipt` to detect on-chain confirmation before submitting the dependent tx. See `useDeposit.ts` for the correct pattern. Same pattern used in `cancelMatch` flows (BattleArena + lobby banner).

### Draw settlement uses address(0) for winner
In `settleMatch()` and `emergencySettle()`, draws pass `address(0)` as winner. Both players get full wager refund with zero protocol fee.

### socket.off() without handler removes ALL listeners — CRITICAL
In socket.io, `socket.off("eventName")` without passing the specific handler function removes **all** listeners for that event, including listeners registered by other components.

```typescript
// WRONG — removes ALL rematch_created listeners (including RematchToast's)
socket.off("rematch_created" as any);

// CORRECT — only removes THIS component's listener
const handleRematchCreated = (data: any) => { ... };
socket.on("rematch_created" as any, handleRematchCreated);
// cleanup:
socket.off("rematch_created" as any, handleRematchCreated);
```

This is especially dangerous because `SocketProvider` lives in the root layout — the same socket instance is shared across all pages. When `useMatch` unmounts (user leaves match page), its cleanup must NOT destroy `RematchToast`'s or `ActiveMatchToast`'s global listeners.

**Rule: Always define named handler functions and pass them to both `socket.on()` and `socket.off()` in useEffect cleanup.**

### leave_match cleanup during rematch navigation
When the user navigates from old match → new rematch match, BattleArena's unmount fires `leave_match` for the old matchId. The server's `leave_match` handler must NOT clear `socket.data.currentMatchId` if it already points to the new match (set by `createRematchMatch`). Guard with:
```typescript
if (socket.data.currentMatchId === matchId) { // only if still the OLD match
  socket.data.currentMatchId = null;
}
```

### handleDisconnect should not forfeit WaitingForDeposits
Page navigation (especially during rematch redirects) can cause brief socket disconnects. `handleDisconnect` should only forfeit `InProgress` matches, not `WaitingForDeposits` — otherwise a rematch match gets destroyed before players even deposit. The 30-min on-chain expiry handles actual abandoned matches.

### Rematch preserves original player order
`createRematchMatch` uses `getRematchInfo()` which returns `player1`/`player2` from the OLD match (by slot index, not by who requested). Player1 in rematch = Player1 in original match. This means the same player always deposits first (createMatch on-chain).

### addressToSocket maps are lowercase-keyed
All addresses in `addressToSocket` and `playerMatches` are stored lowercase (set via `setupAuth` which calls `.toLowerCase()`). Match.getPlayerSlot() compares case-insensitively. Always use `.toLowerCase()` when looking up addresses.

### Bot address must be all-lowercase for viem
The bot uses address `0x0000000000000000000000000000000000000b07`. Mixed-case like `0x...0B07` fails viem's EIP-55 checksum validation in `encodePacked` (used by `computeCommitHash`). Viem accepts two formats: properly checksummed OR all-lowercase. Since the bot address has no valid checksum form, it must be all-lowercase.

### cancelMatch race condition is safe
On-chain `cancelMatch()` requires status == Open. `joinMatch()` changes status to Funded. Whichever transaction lands first wins — if `joinMatch` lands first, `cancelMatch` reverts with `InvalidMatchStatus`. If `cancelMatch` lands first, `joinMatch` reverts. No double-spend possible.
