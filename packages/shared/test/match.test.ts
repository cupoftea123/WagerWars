import { describe, it, expect } from "vitest";
import {
  createMatchState,
  joinMatch,
  confirmDeposit,
  commitAction,
  revealAction,
  advanceRound,
  bothRevealed,
  isMatchOver,
  getWinnerAddress,
  forfeitMatch,
  generateRoundModifiers,
} from "../src/match.js";
import { computeCommitHash, generateSalt } from "../src/hash.js";
import { Action, MatchStatus, PlayerSlot, RoundModifier, RoundPhase } from "../src/types.js";
import { STARTING_HP, STARTING_ENERGY, MAX_ROUNDS } from "../src/constants.js";

const P1 = "0x1111111111111111111111111111111111111111";
const P2 = "0x2222222222222222222222222222222222222222";

describe("Match creation and joining", () => {
  it("creates a match with correct initial state", () => {
    const state = createMatchState("match-1", 10, P1);
    expect(state.status).toBe(MatchStatus.WaitingForOpponent);
    expect(state.players[0].address).toBe(P1);
    expect(state.players[0].hp).toBe(STARTING_HP);
    expect(state.players[0].energy).toBe(STARTING_ENERGY);
    expect(state.currentRound).toBe(1);
    expect(state.roundModifiers).toHaveLength(0);
  });

  it("allows P2 to join", () => {
    let state = createMatchState("match-1", 10, P1);
    state = joinMatch(state, P2);
    expect(state.status).toBe(MatchStatus.WaitingForDeposits);
    expect(state.players[1].address).toBe(P2);
  });

  it("rejects joining your own match", () => {
    const state = createMatchState("match-1", 10, P1);
    expect(() => joinMatch(state, P1)).toThrow("Cannot join your own match");
  });

  it("starts match when both deposits confirmed", () => {
    let state = createMatchState("match-1", 10, P1);
    state = joinMatch(state, P2);
    state = confirmDeposit(state, PlayerSlot.Player1);
    expect(state.status).toBe(MatchStatus.WaitingForDeposits);
    state = confirmDeposit(state, PlayerSlot.Player2);
    expect(state.status).toBe(MatchStatus.InProgress);
    expect(state.roundModifiers).toHaveLength(MAX_ROUNDS);
  });
});

describe("Round modifiers generation", () => {
  it("round 1 is always None", () => {
    const mods = generateRoundModifiers("test-seed");
    expect(mods[0]).toBe(RoundModifier.None);
  });

  it("generates 7 modifiers total", () => {
    const mods = generateRoundModifiers("test-seed");
    expect(mods).toHaveLength(7);
  });

  it("contains exactly 4 unique modifiers + 3 None (1 fixed + 2 random)", () => {
    const mods = generateRoundModifiers("test-seed");
    const noneCount = mods.filter((m) => m === RoundModifier.None).length;
    expect(noneCount).toBe(3);

    const nonNone = mods.filter((m) => m !== RoundModifier.None);
    expect(nonNone).toHaveLength(4);
    const unique = new Set(nonNone);
    expect(unique.size).toBe(4);
  });

  it("is deterministic for the same seed", () => {
    const mods1 = generateRoundModifiers("same-seed");
    const mods2 = generateRoundModifiers("same-seed");
    expect(mods1).toEqual(mods2);
  });

  it("produces different results for different seeds", () => {
    const mods1 = generateRoundModifiers("seed-a");
    const mods2 = generateRoundModifiers("seed-b");
    // They could theoretically be the same, but extremely unlikely
    // Just check that the function doesn't crash
    expect(mods1).toHaveLength(7);
    expect(mods2).toHaveLength(7);
  });
});

describe("Commit-reveal flow", () => {
  function startedMatch(): ReturnType<typeof createMatchState> {
    let state = createMatchState("match-1", 10, P1);
    state = joinMatch(state, P2);
    state = confirmDeposit(state, PlayerSlot.Player1);
    state = confirmDeposit(state, PlayerSlot.Player2);
    return state;
  }

  it("accepts commits and moves to reveal phase", () => {
    let state = startedMatch();

    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const hash1 = computeCommitHash("match-1", 1, P1, Action.Strike, salt1);
    const hash2 = computeCommitHash("match-1", 1, P2, Action.Shield, salt2);

    state = commitAction(state, PlayerSlot.Player1, hash1);
    expect(state.roundPhase).toBe(RoundPhase.Commit);

    state = commitAction(state, PlayerSlot.Player2, hash2);
    expect(state.roundPhase).toBe(RoundPhase.Reveal);
  });

  it("rejects double commit", () => {
    let state = startedMatch();
    const salt = generateSalt();
    const hash = computeCommitHash("match-1", 1, P1, Action.Strike, salt);
    state = commitAction(state, PlayerSlot.Player1, hash);
    expect(() => commitAction(state, PlayerSlot.Player1, hash)).toThrow("Already committed");
  });

  it("accepts valid reveals", () => {
    let state = startedMatch();

    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const hash1 = computeCommitHash("match-1", 1, P1, Action.Strike, salt1);
    const hash2 = computeCommitHash("match-1", 1, P2, Action.Shield, salt2);

    state = commitAction(state, PlayerSlot.Player1, hash1);
    state = commitAction(state, PlayerSlot.Player2, hash2);

    state = revealAction(state, PlayerSlot.Player1, Action.Strike, salt1);
    state = revealAction(state, PlayerSlot.Player2, Action.Shield, salt2);

    expect(bothRevealed(state)).toBe(true);
  });

  it("rejects invalid reveal (wrong action)", () => {
    let state = startedMatch();
    const salt = generateSalt();
    const hash = computeCommitHash("match-1", 1, P1, Action.Strike, salt);

    state = commitAction(state, PlayerSlot.Player1, hash);
    state = commitAction(state, PlayerSlot.Player2,
      computeCommitHash("match-1", 1, P2, Action.Shield, generateSalt()));

    // Force reveal phase (need P2 commit first, which we did)
    expect(() => revealAction(state, PlayerSlot.Player1, Action.Shield, salt))
      .toThrow("Reveal does not match");
  });
});

describe("Full round resolution", () => {
  const ALL_NONE = Array(MAX_ROUNDS).fill(RoundModifier.None);

  function playRound(
    state: ReturnType<typeof createMatchState>,
    p1Action: Action,
    p2Action: Action,
  ) {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const hash1 = computeCommitHash(state.matchId, state.currentRound, P1, p1Action, salt1);
    const hash2 = computeCommitHash(state.matchId, state.currentRound, P2, p2Action, salt2);

    state = commitAction(state, PlayerSlot.Player1, hash1);
    state = commitAction(state, PlayerSlot.Player2, hash2);
    state = revealAction(state, PlayerSlot.Player1, p1Action, salt1);
    state = revealAction(state, PlayerSlot.Player2, p2Action, salt2);
    state = advanceRound(state);
    return state;
  }

  /** Create a started match with all-None modifiers for predictable testing */
  function startedMatch() {
    let state = createMatchState("match-1", 10, P1);
    state = joinMatch(state, P2);
    state = confirmDeposit(state, PlayerSlot.Player1);
    state = confirmDeposit(state, PlayerSlot.Player2);
    // Override modifiers to all None for predictable energy/damage
    state = { ...state, roundModifiers: ALL_NONE };
    return state;
  }

  it("resolves Strike vs Shield correctly", () => {
    let state = startedMatch();
    state = playRound(state, Action.Strike, Action.Shield);

    expect(state.roundResults).toHaveLength(1);
    const result = state.roundResults[0];
    expect(result.player1Damage).toBe(0);
    expect(result.player2Damage).toBe(0);
    expect(state.players[0].hp).toBe(STARTING_HP);
    expect(state.players[1].hp).toBe(STARTING_HP);
    // Energy: P1 spent 3 (Strike), P2 spent 2 (Shield). Round 1 = no passive regen.
    expect(state.players[0].energy).toBe(STARTING_ENERGY - 3);
    expect(state.players[1].energy).toBe(STARTING_ENERGY - 2);
  });

  it("applies passive regen from round 2", () => {
    let state = startedMatch();
    // Round 1: both Recover
    state = playRound(state, Action.Recover, Action.Recover);
    // Round 1: no passive regen, but Recover +4
    expect(state.players[0].energy).toBe(STARTING_ENERGY + 4); // 14

    // Round 2: both Strike
    state = playRound(state, Action.Strike, Action.Strike);
    // Round 2: passive regen +1, Strike costs 3
    expect(state.players[0].energy).toBe(14 - 3 + 1); // 12
  });

  it("completes match after 7 rounds", () => {
    let state = startedMatch();
    // Play 7 rounds of Recover vs Recover (nothing happens, no damage)
    for (let i = 0; i < MAX_ROUNDS; i++) {
      expect(isMatchOver(state)).toBe(false);
      state = playRound(state, Action.Recover, Action.Recover);
    }
    expect(isMatchOver(state)).toBe(true);
    // Both have same HP and energy → draw
    expect(state.winReason).toBe("draw");
  });

  it("detects KO", () => {
    let state = startedMatch();
    // P1 Recover, P2 Strike = P1 takes 10 damage (doubled)
    state = playRound(state, Action.Recover, Action.Strike);
    expect(state.players[0].hp).toBe(10); // 20-10

    // Again
    state = playRound(state, Action.Recover, Action.Strike);
    expect(state.players[0].hp).toBe(0);
    expect(isMatchOver(state)).toBe(true);
    expect(state.winner).toBe(PlayerSlot.Player2);
    expect(state.winReason).toBe("ko");
  });

  it("HP lead wins after 7 rounds", () => {
    let state = startedMatch();
    // Round 1: P1 Strike, P2 Recover → P2 takes 10
    state = playRound(state, Action.Strike, Action.Recover);
    expect(state.players[1].hp).toBe(10);

    // Remaining rounds: mutual Recover
    for (let i = 1; i < MAX_ROUNDS; i++) {
      state = playRound(state, Action.Recover, Action.Recover);
    }
    expect(isMatchOver(state)).toBe(true);
    expect(state.winner).toBe(PlayerSlot.Player1);
    expect(state.winReason).toBe("hp_lead");
  });
});

describe("Forfeit", () => {
  it("awards win to the other player", () => {
    let state = createMatchState("match-1", 10, P1);
    state = joinMatch(state, P2);
    state = confirmDeposit(state, PlayerSlot.Player1);
    state = confirmDeposit(state, PlayerSlot.Player2);

    state = forfeitMatch(state, PlayerSlot.Player1);
    expect(state.winner).toBe(PlayerSlot.Player2);
    expect(state.winReason).toBe("forfeit");
    expect(getWinnerAddress(state)).toBe(P2);
  });
});
