import { keccak256, toHex } from "viem";
import {
  Action,
  MatchState,
  MatchStatus,
  PlayerSlot,
  PlayerState,
  RoundCommit,
  RoundModifier,
  RoundPhase,
  RoundResult,
  WinReason,
} from "./types.js";
import {
  STARTING_HP,
  STARTING_ENERGY,
  MAX_ROUNDS,
  PASSIVE_ENERGY_REGEN,
  MODIFIER_COUNT,
  NEUTRAL_ROUNDS_IN_RANGE,
} from "./constants.js";
import { resolveRound } from "./damage.js";
import { canAfford } from "./actions.js";
import { calculateEnergyDelta, applyEnergyDelta } from "./energy.js";
import { verifyCommit } from "./hash.js";

// ============================================================
// Match Creation
// ============================================================

function createPlayer(address: string): PlayerState {
  return {
    address,
    hp: STARTING_HP,
    energy: STARTING_ENERGY,
    deposited: false,
  };
}

/** Create a new match state with Player 1 */
export function createMatchState(
  matchId: string,
  wagerAmount: number,
  player1Address: string,
): MatchState {
  return {
    matchId,
    status: MatchStatus.WaitingForOpponent,
    wagerAmount,
    players: [
      createPlayer(player1Address),
      createPlayer(""),
    ],
    currentRound: 1,
    roundPhase: RoundPhase.Commit,
    maxRounds: MAX_ROUNDS,
    roundModifiers: [], // generated when both players join
    roundResults: [],
    commits: [null, null],
    winner: null,
    winReason: null,
    createdAt: Date.now(),
    onChainMatchId: null,
  };
}

/** Player 2 joins the match */
export function joinMatch(state: MatchState, player2Address: string): MatchState {
  if (state.status !== MatchStatus.WaitingForOpponent) {
    throw new Error(`Cannot join match in status ${state.status}`);
  }
  if (state.players[0].address === player2Address) {
    throw new Error("Cannot join your own match");
  }

  return {
    ...state,
    status: MatchStatus.WaitingForDeposits,
    players: [
      state.players[0],
      createPlayer(player2Address),
    ],
  };
}

/** Revert Player 2's join — match goes back to WaitingForOpponent */
export function unjoinMatch(state: MatchState): MatchState {
  if (state.status !== MatchStatus.WaitingForDeposits) {
    throw new Error(`Cannot unjoin match in status ${state.status}`);
  }
  return {
    ...state,
    status: MatchStatus.WaitingForOpponent,
    players: [state.players[0], createPlayer("")],
  };
}

/** Mark a player's deposit as confirmed */
export function confirmDeposit(state: MatchState, player: PlayerSlot): MatchState {
  const players: [PlayerState, PlayerState] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ];
  players[player] = { ...players[player], deposited: true };

  const bothDeposited = players[0].deposited && players[1].deposited;

  return {
    ...state,
    players,
    status: bothDeposited ? MatchStatus.InProgress : state.status,
    // Generate modifiers when match starts
    roundModifiers: bothDeposited
      ? generateRoundModifiers(state.matchId)
      : state.roundModifiers,
  };
}

// ============================================================
// Round Modifiers
// ============================================================

/**
 * Generate round modifiers for a match deterministically from the matchId.
 *
 * Round 1: always None.
 * Rounds 2-7: 4 random modifiers + 2 None, shuffled.
 *
 * Uses matchId as seed for deterministic shuffling (Fisher-Yates).
 */
export function generateRoundModifiers(seed: string): RoundModifier[] {
  const modifiers: RoundModifier[] = [RoundModifier.None]; // Round 1 is always neutral

  // Pool for rounds 2-7: 4 modifiers + 2 neutral
  const pool: RoundModifier[] = [
    RoundModifier.PowerSurge,
    RoundModifier.Overcharge,
    RoundModifier.Reflect,
    RoundModifier.Tax,
    RoundModifier.None,
    RoundModifier.None,
  ];

  // Deterministic shuffle using keccak256 of seed
  const seedHash = keccak256(toHex(seed));
  const seedNum = BigInt(seedHash);

  // Fisher-Yates shuffle with deterministic randomness
  for (let i = pool.length - 1; i > 0; i--) {
    // Derive a pseudo-random index from seed
    const subHash = keccak256(
      toHex(seedNum + BigInt(i)),
    );
    const j = Number(BigInt(subHash) % BigInt(i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  modifiers.push(...pool);
  return modifiers;
}

// ============================================================
// Commit-Reveal
// ============================================================

/** Submit a commit hash for the current round */
export function commitAction(
  state: MatchState,
  player: PlayerSlot,
  commitHash: string,
): MatchState {
  if (state.status !== MatchStatus.InProgress) {
    throw new Error(`Cannot commit in status ${state.status}`);
  }
  if (state.roundPhase !== RoundPhase.Commit) {
    throw new Error(`Cannot commit in phase ${state.roundPhase}`);
  }
  if (state.commits[player] !== null) {
    throw new Error("Already committed this round");
  }

  const commits: [RoundCommit | null, RoundCommit | null] = [...state.commits];
  commits[player] = { commitHash, action: null, salt: null };

  // If both committed, move to reveal phase
  const bothCommitted = commits[0] !== null && commits[1] !== null;

  return {
    ...state,
    commits,
    roundPhase: bothCommitted ? RoundPhase.Reveal : state.roundPhase,
  };
}

/** Reveal action and salt for the current round. Returns updated state. */
export function revealAction(
  state: MatchState,
  player: PlayerSlot,
  action: Action,
  salt: string,
): MatchState {
  if (state.roundPhase !== RoundPhase.Reveal) {
    throw new Error(`Cannot reveal in phase ${state.roundPhase}`);
  }
  const commit = state.commits[player];
  if (!commit) {
    throw new Error("No commit found for player");
  }
  if (commit.action !== null) {
    throw new Error("Already revealed this round");
  }

  // Verify the commit hash matches
  const playerAddress = state.players[player].address;
  if (!verifyCommit(commit.commitHash, state.matchId, state.currentRound, playerAddress, action, salt)) {
    throw new Error("Reveal does not match commit hash");
  }

  // Verify player can afford the action
  const modifier = state.roundModifiers[state.currentRound - 1];
  if (!canAfford(state.players[player].energy, action, modifier)) {
    throw new Error(`Insufficient energy for ${action}`);
  }

  const commits: [RoundCommit | null, RoundCommit | null] = [...state.commits];
  commits[player] = { ...commit, action, salt };

  return { ...state, commits };
}

/** Check if both players have revealed */
export function bothRevealed(state: MatchState): boolean {
  return (
    state.commits[0]?.action !== null &&
    state.commits[0]?.action !== undefined &&
    state.commits[1]?.action !== null &&
    state.commits[1]?.action !== undefined
  );
}

// ============================================================
// Round Resolution
// ============================================================

/** Resolve the current round after both players have revealed.
 *  Returns updated match state with round result applied.
 */
export function advanceRound(state: MatchState): MatchState {
  if (!bothRevealed(state)) {
    throw new Error("Both players must reveal before advancing");
  }

  const p1Action = state.commits[0]!.action!;
  const p2Action = state.commits[1]!.action!;
  const modifier = state.roundModifiers[state.currentRound - 1];

  // Resolve damage and energy
  const resolution = resolveRound(p1Action, p2Action, modifier);

  // Apply passive regen
  const passiveRegen = state.currentRound >= 2 ? PASSIVE_ENERGY_REGEN : 0;

  // Calculate new HP and energy
  const p1HpAfter = Math.max(0, state.players[0].hp - resolution.player1Damage);
  const p2HpAfter = Math.max(0, state.players[1].hp - resolution.player2Damage);

  const p1EnergyAfter = Math.max(
    0,
    state.players[0].energy
      - resolution.player1EnergyCost
      + resolution.player1BonusEnergy
      + passiveRegen,
  );
  const p2EnergyAfter = Math.max(
    0,
    state.players[1].energy
      - resolution.player2EnergyCost
      + resolution.player2BonusEnergy
      + passiveRegen,
  );

  const p1EnergyDelta = p1EnergyAfter - state.players[0].energy;
  const p2EnergyDelta = p2EnergyAfter - state.players[1].energy;

  const roundResult: RoundResult = {
    round: state.currentRound,
    modifier,
    player1Action: p1Action,
    player2Action: p2Action,
    player1Damage: resolution.player1Damage,
    player2Damage: resolution.player2Damage,
    player1EnergyDelta: p1EnergyDelta,
    player2EnergyDelta: p2EnergyDelta,
    player1HpAfter: p1HpAfter,
    player2HpAfter: p2HpAfter,
    player1EnergyAfter: p1EnergyAfter,
    player2EnergyAfter: p2EnergyAfter,
  };

  const updatedPlayers: [PlayerState, PlayerState] = [
    { ...state.players[0], hp: p1HpAfter, energy: p1EnergyAfter },
    { ...state.players[1], hp: p2HpAfter, energy: p2EnergyAfter },
  ];

  // Check for KO or match end
  let newStatus = state.status;
  let winner: PlayerSlot | null = null;
  let winReason: WinReason | null = null;

  if (p1HpAfter <= 0 && p2HpAfter <= 0) {
    // Double KO — check who has more remaining HP (both 0, check energy)
    newStatus = MatchStatus.Completed;
    if (p1EnergyAfter > p2EnergyAfter) {
      winner = PlayerSlot.Player1;
      winReason = "energy_tiebreak";
    } else if (p2EnergyAfter > p1EnergyAfter) {
      winner = PlayerSlot.Player2;
      winReason = "energy_tiebreak";
    } else {
      winner = null;
      winReason = "draw";
    }
  } else if (p1HpAfter <= 0) {
    newStatus = MatchStatus.Completed;
    winner = PlayerSlot.Player2;
    winReason = "ko";
  } else if (p2HpAfter <= 0) {
    newStatus = MatchStatus.Completed;
    winner = PlayerSlot.Player1;
    winReason = "ko";
  } else if (state.currentRound >= MAX_ROUNDS) {
    // All rounds played — determine winner by HP, then energy
    newStatus = MatchStatus.Completed;
    if (p1HpAfter > p2HpAfter) {
      winner = PlayerSlot.Player1;
      winReason = "hp_lead";
    } else if (p2HpAfter > p1HpAfter) {
      winner = PlayerSlot.Player2;
      winReason = "hp_lead";
    } else if (p1EnergyAfter > p2EnergyAfter) {
      winner = PlayerSlot.Player1;
      winReason = "energy_tiebreak";
    } else if (p2EnergyAfter > p1EnergyAfter) {
      winner = PlayerSlot.Player2;
      winReason = "energy_tiebreak";
    } else {
      winner = null;
      winReason = "draw";
    }
  }

  const nextRound = newStatus === MatchStatus.Completed
    ? state.currentRound
    : state.currentRound + 1;

  return {
    ...state,
    status: newStatus,
    players: updatedPlayers,
    currentRound: nextRound,
    roundPhase: newStatus === MatchStatus.Completed ? RoundPhase.Resolved : RoundPhase.Commit,
    roundResults: [...state.roundResults, roundResult],
    commits: [null, null], // reset for next round
    winner,
    winReason,
  };
}

// ============================================================
// Match Queries
// ============================================================

/** Check if the match is over */
export function isMatchOver(state: MatchState): boolean {
  return state.status === MatchStatus.Completed || state.status === MatchStatus.Cancelled;
}

/** Get the winner's address, or null for draw/in-progress */
export function getWinnerAddress(state: MatchState): string | null {
  if (state.winner === null) return null;
  return state.players[state.winner].address;
}

/** Forfeit the match — the other player wins */
export function forfeitMatch(state: MatchState, forfeiter: PlayerSlot): MatchState {
  const winner = forfeiter === PlayerSlot.Player1 ? PlayerSlot.Player2 : PlayerSlot.Player1;
  return {
    ...state,
    status: MatchStatus.Completed,
    winner,
    winReason: "forfeit",
  };
}
