import {
  Action,
  type MatchState,
  type RoundModifier,
  getAvailableActions,
  computeCommitHash,
  generateSalt,
  PlayerSlot,
} from "@wager-wars/shared";

/**
 * Bot player for demo matches.
 * Picks a random affordable action each round — no strategy, purely random.
 */
export class BotPlayer {
  // Must be all-lowercase to pass viem's EIP-55 checksum validation
  public static readonly ADDRESS = "0x0000000000000000000000000000000000000b07";

  get address(): string {
    return BotPlayer.ADDRESS;
  }

  /**
   * Choose a random affordable action for the current round.
   * Returns the action, salt, and valid commitHash (same format as real players).
   */
  chooseAction(state: MatchState): { action: Action; salt: `0x${string}`; commitHash: string } {
    const modifier = state.roundModifiers[state.currentRound - 1] ?? "NONE";
    const botEnergy = state.players[PlayerSlot.Player2].energy;
    const available = getAvailableActions(botEnergy, modifier as RoundModifier);

    // Fallback to Recover if nothing is available (shouldn't happen, Recover costs 0)
    const action = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : Action.Recover;

    const salt = generateSalt();
    const commitHash = computeCommitHash(
      state.matchId,
      state.currentRound,
      BotPlayer.ADDRESS,
      action,
      salt,
    );

    return { action, salt, commitHash };
  }
}
