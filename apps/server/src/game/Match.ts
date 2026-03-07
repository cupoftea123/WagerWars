import {
  Action,
  MatchState,
  MatchStatus,
  PlayerSlot,
  RoundPhase,
  RoundCommit,
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
  unjoinMatch,
  canAfford,
  computeCommitHash,
  generateSalt,
} from "@wager-wars/shared";
import { keccak256, toHex } from "viem";
import { CommitReveal } from "./CommitReveal.js";
import { BotPlayer } from "./BotPlayer.js";

/**
 * Server-side match instance.
 * Wraps the pure shared game state and adds server orchestration
 * (commit-reveal tracking, timeouts, etc.)
 */
export class Match {
  public state: MatchState;
  private commitReveal: CommitReveal;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;

  public readonly onChainMatchId: `0x${string}`;
  public readonly isDemo: boolean;
  private botPlayer: BotPlayer | null = null;

  /** Temporary storage for bot's move between commit and reveal phases */
  public pendingBotMove: { action: Action; salt: `0x${string}`; commitHash: string } | null = null;

  constructor(matchId: string, wagerAmount: number, player1Address: string, isDemo = false) {
    this.state = createMatchState(matchId, wagerAmount, player1Address);
    this.onChainMatchId = keccak256(toHex(matchId));
    this.state.onChainMatchId = this.onChainMatchId;
    this.commitReveal = new CommitReveal();
    this.isDemo = isDemo;

    if (isDemo) {
      this.botPlayer = new BotPlayer();
    }
  }

  getBotPlayer(): BotPlayer | null {
    return this.botPlayer;
  }

  get matchId(): string {
    return this.state.matchId;
  }

  get status(): MatchStatus {
    return this.state.status;
  }

  // --- Lifecycle ---

  join(player2Address: string): void {
    this.state = joinMatch(this.state, player2Address);
  }

  /** Revert Player 2's join — match goes back to WaitingForOpponent */
  unjoin(): void {
    this.state = unjoinMatch(this.state);
  }

  markDeposit(player: PlayerSlot): void {
    this.state = confirmDeposit(this.state, player);
  }

  isStarted(): boolean {
    return this.state.status === MatchStatus.InProgress;
  }

  isOver(): boolean {
    return isMatchOver(this.state);
  }

  // --- Commit-Reveal ---

  commit(player: PlayerSlot, commitHash: string): void {
    // Track in CommitReveal (server-side validation)
    this.commitReveal.commit(player, commitHash);

    // Also update shared state
    this.state = commitAction(this.state, player, commitHash);
  }

  hasCommitted(player: PlayerSlot): boolean {
    return this.commitReveal.hasCommitted(player);
  }

  allCommitted(): boolean {
    return this.commitReveal.allCommitted();
  }

  reveal(player: PlayerSlot, action: Action, salt: string): boolean {
    const playerAddress = this.state.players[player].address;

    // Verify via CommitReveal
    const valid = this.commitReveal.reveal(
      player,
      action,
      salt,
      this.state.matchId,
      this.state.currentRound,
      playerAddress,
    );
    if (!valid) return false;

    // Update shared state
    this.state = revealAction(this.state, player, action, salt);
    return true;
  }

  allRevealed(): boolean {
    return this.commitReveal.allRevealed();
  }

  // --- Round Resolution ---

  resolveRound(): void {
    if (!this.allRevealed()) {
      throw new Error("Cannot resolve: not all players revealed");
    }

    this.state = advanceRound(this.state);
    this.commitReveal.reset();
  }

  getLastRoundResult() {
    return this.state.roundResults[this.state.roundResults.length - 1] ?? null;
  }

  // --- Winner ---

  getWinnerAddress(): string | null {
    return getWinnerAddress(this.state);
  }

  // --- Forfeit ---

  forfeit(player: PlayerSlot): void {
    this.state = forfeitMatch(this.state, player);
  }

  // --- Player Lookup ---

  getPlayerSlot(address: string): PlayerSlot | null {
    if (this.state.players[0].address.toLowerCase() === address.toLowerCase()) {
      return PlayerSlot.Player1;
    }
    if (this.state.players[1].address.toLowerCase() === address.toLowerCase()) {
      return PlayerSlot.Player2;
    }
    return null;
  }

  getOpponentSlot(player: PlayerSlot): PlayerSlot {
    return player === PlayerSlot.Player1 ? PlayerSlot.Player2 : PlayerSlot.Player1;
  }

  // --- Timeout Default Actions ---

  /** Get the default action for a timed-out player: Shield if affordable, else Recover */
  getDefaultTimeoutAction(player: PlayerSlot): Action {
    const energy = this.state.players[player].energy;
    const modifier = this.state.roundModifiers[this.state.currentRound - 1];
    if (canAfford(energy, Action.Shield, modifier)) return Action.Shield;
    return Action.Recover;
  }

  /** Auto-commit for a timed-out player with Shield/Recover. Returns the action + salt used. */
  autoCommit(player: PlayerSlot): { action: Action; salt: `0x${string}`; commitHash: string } {
    const action = this.getDefaultTimeoutAction(player);
    const salt = generateSalt();
    const playerAddress = this.state.players[player].address;
    const commitHash = computeCommitHash(
      this.state.matchId,
      this.state.currentRound,
      playerAddress,
      action,
      salt as string,
    );
    this.commit(player, commitHash);
    return { action, salt, commitHash };
  }

  /** Force-reveal a timed-out player with a specific action (bypasses hash verification) */
  forceReveal(player: PlayerSlot, action: Action, salt: string): void {
    this.commitReveal.forceReveal(player, action, salt);
    // Update shared state commits
    const commits: [RoundCommit | null, RoundCommit | null] = [...this.state.commits];
    commits[player] = { ...commits[player]!, action, salt };
    this.state = { ...this.state, commits };
  }

  // --- Timers ---

  /** Start commit-phase timer. Round 1 = 30s, rounds 2-7 = 20s. Includes 3s grace period for network latency. */
  startCommitTimer(onTimeout: () => void): void {
    this.clearCommitTimer();
    const GRACE_PERIOD = 3_000;
    const duration = this.state.currentRound === 1 ? 30_000 : 20_000;
    this.commitTimer = setTimeout(onTimeout, duration + GRACE_PERIOD);
  }

  /** Start reveal-phase timer. Always 20s (includes grace period). */
  startRevealTimer(onTimeout: () => void): void {
    this.clearRevealTimer();
    this.revealTimer = setTimeout(onTimeout, 20_000);
  }

  clearCommitTimer(): void {
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = null;
  }

  clearRevealTimer(): void {
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.revealTimer = null;
  }

  clearTimers(): void {
    this.clearCommitTimer();
    this.clearRevealTimer();
  }

  /** Get the commit timeout duration in seconds for the current round (shown to client) */
  getCommitTimeout(): number {
    return this.state.currentRound === 1 ? 30 : 20;
  }
}
