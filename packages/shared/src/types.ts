// ============================================================
// Core Game Types for Wager Wars
// ============================================================

/** Available player actions each round */
export enum Action {
  Strike = "STRIKE",
  Shield = "SHIELD",
  Break = "BREAK",
  Recover = "RECOVER",
}

/** Round modifiers that alter game mechanics */
export enum RoundModifier {
  None = "NONE",
  PowerSurge = "POWER_SURGE",
  Overcharge = "OVERCHARGE",
  Reflect = "REFLECT",
  Tax = "TAX",
}

/** Match lifecycle status */
export enum MatchStatus {
  WaitingForOpponent = "WAITING_FOR_OPPONENT",
  WaitingForDeposits = "WAITING_FOR_DEPOSITS",
  InProgress = "IN_PROGRESS",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
}

/** Player slot identifier */
export enum PlayerSlot {
  Player1 = 0,
  Player2 = 1,
}

/** Commit-reveal phase within a round */
export enum RoundPhase {
  Commit = "COMMIT",
  Reveal = "REVEAL",
  Resolved = "RESOLVED",
}

// ============================================================
// State Interfaces
// ============================================================

export interface PlayerState {
  address: string;
  hp: number;
  energy: number;
  deposited: boolean;
}

export interface RoundCommit {
  commitHash: string;
  action: Action | null;   // null until revealed
  salt: string | null;     // null until revealed
}

export interface RoundResult {
  round: number;
  modifier: RoundModifier;
  player1Action: Action;
  player2Action: Action;
  player1Damage: number;
  player2Damage: number;
  player1EnergyDelta: number;  // net energy change (cost + regen)
  player2EnergyDelta: number;
  player1HpAfter: number;
  player2HpAfter: number;
  player1EnergyAfter: number;
  player2EnergyAfter: number;
}

export interface MatchState {
  matchId: string;
  status: MatchStatus;
  wagerAmount: number;             // USDC amount (human-readable, e.g. 10.0)
  players: [PlayerState, PlayerState];
  currentRound: number;            // 1-7
  roundPhase: RoundPhase;
  maxRounds: number;               // 7
  roundModifiers: RoundModifier[]; // length 7, index 0 = round 1
  roundResults: RoundResult[];
  commits: [RoundCommit | null, RoundCommit | null]; // current round commits
  winner: PlayerSlot | null;       // null if draw or in progress
  winReason: WinReason | null;
  createdAt: number;
  onChainMatchId: string | null;   // bytes32 on-chain
}

export type WinReason = "ko" | "hp_lead" | "energy_tiebreak" | "draw" | "forfeit" | "timeout";

// ============================================================
// Resolution Types
// ============================================================

export interface RoundResolution {
  player1Damage: number;
  player2Damage: number;
  player1EnergyCost: number;
  player2EnergyCost: number;
  player1BonusEnergy: number;   // from Recover
  player2BonusEnergy: number;
  reflectDamage1: number;       // reflect damage dealt TO player 1
  reflectDamage2: number;       // reflect damage dealt TO player 2
}

// ============================================================
// Server-Client Communication Types
// ============================================================

export interface MatchSummary {
  matchId: string;
  creatorAddress: string;
  wagerAmount: number;
  createdAt: number;
  status: MatchStatus;
}

export interface SettlementData {
  matchId: string;
  onChainMatchId: string;
  winner: string;              // address, or "0x0" for draw
  signature: string;           // EIP-712 sig from server
  txHash?: string;             // settlement tx hash (set after on-chain confirmation)
}
