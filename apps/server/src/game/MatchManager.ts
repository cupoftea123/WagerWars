import { MatchStatus, MatchSummary, PlayerSlot } from "@wager-wars/shared";
import { Match } from "./Match.js";
import { randomUUID } from "node:crypto";

/**
 * Manages all active matches in memory.
 * Provides match creation, joining, lookup, and cleanup.
 */
export class MatchManager {
  private matches = new Map<string, Match>();
  /** Map player address -> matchId for quick lookup */
  private playerMatches = new Map<string, string>();
  /** Map completed matchId -> pending rematch invitation */
  private pendingRematches = new Map<string, {
    requesterAddress: string;
    opponentAddress: string;
    wagerAmount: number;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  createMatch(player1Address: string, wagerAmount: number): Match {
    const existing = this.getActiveMatch(player1Address);
    if (existing) throw new Error("You already have an active match. Cancel it first or wait for it to finish.");

    const matchId = randomUUID();
    const match = new Match(matchId, wagerAmount, player1Address);
    this.matches.set(matchId, match);
    this.playerMatches.set(player1Address.toLowerCase(), matchId);
    return match;
  }

  /** Create a demo match with a bot opponent — no deposits, no on-chain settlement */
  createDemoMatch(player1Address: string): Match {
    const existing = this.getActiveMatch(player1Address);
    if (existing) throw new Error("You already have an active match. Cancel it first or wait for it to finish.");

    const matchId = randomUUID();
    const match = new Match(matchId, 0, player1Address, true);

    // Bot auto-joins
    const bot = match.getBotPlayer()!;
    match.join(bot.address);

    // Skip on-chain deposits — mark both as deposited immediately
    match.markDeposit(PlayerSlot.Player1);
    match.markDeposit(PlayerSlot.Player2);

    this.matches.set(matchId, match);
    this.playerMatches.set(player1Address.toLowerCase(), matchId);
    // Don't register bot in playerMatches — it's not a real player

    return match;
  }

  joinMatch(matchId: string, player2Address: string): Match {
    const existing = this.getActiveMatch(player2Address);
    if (existing && existing.matchId !== matchId) {
      throw new Error("You already have an active match. Cancel it first or wait for it to finish.");
    }

    const match = this.matches.get(matchId);
    if (!match) throw new Error("Match not found");
    match.join(player2Address);
    this.playerMatches.set(player2Address.toLowerCase(), matchId);
    return match;
  }

  getMatch(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  getMatchByPlayer(address: string): Match | undefined {
    const matchId = this.playerMatches.get(address.toLowerCase());
    if (!matchId) return undefined;
    return this.matches.get(matchId);
  }

  /** Find match by on-chain bytes32 matchId (keccak256 of UUID) */
  findMatchByOnChainId(onChainMatchId: string): Match | undefined {
    const needle = onChainMatchId.toLowerCase();
    for (const match of this.matches.values()) {
      if (match.onChainMatchId.toLowerCase() === needle) {
        return match;
      }
    }
    return undefined;
  }

  getOpenMatches(): MatchSummary[] {
    const result: MatchSummary[] = [];
    for (const match of this.matches.values()) {
      // Skip demo matches — they're not joinable
      if (match.isDemo) continue;
      // Only show matches where creator has deposited on-chain
      if (match.status === MatchStatus.WaitingForOpponent && match.state.players[0].deposited) {
        result.push({
          matchId: match.matchId,
          creatorAddress: match.state.players[0].address,
          wagerAmount: match.state.wagerAmount,
          createdAt: match.state.createdAt,
          status: match.status,
        });
      }
    }
    return result;
  }

  /** Remove a single player from playerMatches (e.g., Player 2 leaving during deposit phase) */
  removePlayerFromMatch(address: string): void {
    this.playerMatches.delete(address.toLowerCase());
  }

  removeMatch(matchId: string): void {
    const match = this.matches.get(matchId);
    if (match) {
      match.clearTimers();
      // Remove player mappings
      for (const player of match.state.players) {
        if (player.address) {
          this.playerMatches.delete(player.address.toLowerCase());
        }
      }
      this.matches.delete(matchId);
    }
  }

  /** Pending disconnect forfeit timers — grace period before actual forfeit */
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Handle player disconnect — start grace period before forfeit */
  handleDisconnect(address: string): string | null {
    const match = this.getMatchByPlayer(address);
    if (!match) return null;

    // Demo matches — just clean up, no settlement
    if (match.isDemo) {
      this.removeMatch(match.matchId);
      return null;
    }

    if (match.status === MatchStatus.InProgress) {
      const key = address.toLowerCase();
      // Don't double-schedule
      if (this.disconnectTimers.has(key)) return null;

      // 15s grace period — player may be refreshing or had a brief network glitch
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(key);
        // Re-check: player might have reconnected and match might have ended
        const m = this.getMatchByPlayer(address);
        if (!m || m.matchId !== match.matchId) return;
        if (m.status !== MatchStatus.InProgress) return;
        const slot = m.getPlayerSlot(address);
        if (slot !== null) {
          m.forfeit(slot);
          // Return matchId via callback stored on the match for settlement
          if (m._onDisconnectForfeit) m._onDisconnectForfeit(m.matchId);
        }
      }, 15_000);
      this.disconnectTimers.set(key, timer);
    }

    // WaitingForOpponent / WaitingForDeposits: Don't remove on disconnect —
    // player may be refreshing the page or navigating within the app.
    // Match is recovered via get_active_match on reconnect.
    // Cleanup: on-chain expiry (30 min) or manual cancel.

    return null;
  }

  /** Cancel pending disconnect forfeit (player reconnected) */
  cancelDisconnectTimer(address: string): void {
    const key = address.toLowerCase();
    const timer = this.disconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(key);
    }
  }

  /** Get a player's active (non-completed) match, if any */
  getActiveMatch(address: string): Match | undefined {
    const matchId = this.playerMatches.get(address.toLowerCase());
    if (!matchId) return undefined;
    const match = this.matches.get(matchId);
    if (!match) return undefined;
    // Only return if match is still active (not completed/cancelled)
    if (match.status === MatchStatus.Completed || match.status === MatchStatus.Cancelled) {
      return undefined;
    }
    return match;
  }

  /** Get the completed match's opponent and wager for rematch creation */
  getRematchInfo(matchId: string): { player1: string; player2: string; wagerAmount: number } | null {
    const match = this.matches.get(matchId);
    if (!match) return null;
    const p1 = match.state.players[0].address;
    const p2 = match.state.players[1].address;
    if (!p1 || !p2) return null;
    return { player1: p1, player2: p2, wagerAmount: match.state.wagerAmount };
  }

  /** Store a pending rematch invitation with auto-expire timeout */
  addPendingRematch(
    matchId: string,
    data: { requesterAddress: string; opponentAddress: string; wagerAmount: number },
    onExpire: () => void,
  ): void {
    // Clear any existing pending rematch for this match
    this.clearPendingRematch(matchId);
    this.pendingRematches.set(matchId, {
      ...data,
      timeout: setTimeout(() => {
        this.pendingRematches.delete(matchId);
        onExpire();
      }, 15_000),
    });
  }

  getPendingRematch(matchId: string) {
    return this.pendingRematches.get(matchId) ?? null;
  }

  clearPendingRematch(matchId: string): void {
    const pending = this.pendingRematches.get(matchId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRematches.delete(matchId);
    }
  }

  getActiveMatchCount(): number {
    return this.matches.size;
  }
}
