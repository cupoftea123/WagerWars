import { Action, PlayerSlot } from "@wager-wars/shared";
import { verifyCommit } from "@wager-wars/shared";

interface Commit {
  commitHash: string;
}

interface Reveal {
  action: Action;
  salt: string;
}

/**
 * Per-round commit-reveal orchestration.
 * Tracks commits and reveals for both players.
 */
export class CommitReveal {
  private commits = new Map<PlayerSlot, Commit>();
  private reveals = new Map<PlayerSlot, Reveal>();

  commit(player: PlayerSlot, commitHash: string): void {
    if (this.commits.has(player)) {
      throw new Error("Player already committed this round");
    }
    this.commits.set(player, { commitHash });
  }

  hasCommitted(player: PlayerSlot): boolean {
    return this.commits.has(player);
  }

  allCommitted(): boolean {
    return this.commits.has(PlayerSlot.Player1) && this.commits.has(PlayerSlot.Player2);
  }

  reveal(
    player: PlayerSlot,
    action: Action,
    salt: string,
    matchId: string,
    round: number,
    playerAddress: string,
  ): boolean {
    const commit = this.commits.get(player);
    if (!commit) throw new Error("No commit found for player");
    if (this.reveals.has(player)) throw new Error("Player already revealed");

    if (!verifyCommit(commit.commitHash, matchId, round, playerAddress, action, salt)) {
      return false;
    }

    this.reveals.set(player, { action, salt });
    return true;
  }

  /** Force-reveal for a timed-out player (bypasses hash verification) */
  forceReveal(player: PlayerSlot, action: Action, salt: string): void {
    this.reveals.set(player, { action, salt });
  }

  hasRevealed(player: PlayerSlot): boolean {
    return this.reveals.has(player);
  }

  allRevealed(): boolean {
    return this.reveals.has(PlayerSlot.Player1) && this.reveals.has(PlayerSlot.Player2);
  }

  getActions(): [Action, Action] {
    const r1 = this.reveals.get(PlayerSlot.Player1);
    const r2 = this.reveals.get(PlayerSlot.Player2);
    if (!r1 || !r2) throw new Error("Not all players have revealed");
    return [r1.action, r2.action];
  }

  getReveal(player: PlayerSlot): Reveal | undefined {
    return this.reveals.get(player);
  }

  reset(): void {
    this.commits.clear();
    this.reveals.clear();
  }
}
