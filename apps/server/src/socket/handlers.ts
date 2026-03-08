import type { Server, Socket } from "socket.io";
import {
  PlayerSlot,
  MatchStatus,
  type RoundModifier,
} from "@wager-wars/shared";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types.js";
import { setupAuth, requireAuth } from "./middleware.js";
import { MatchManager } from "../game/MatchManager.js";
import { signSettlement, submitSettlement } from "../chain/settlement.js";

type WagerServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type WagerSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Socket-to-address mapping for finding sockets by player address */
const addressToSocket = new Map<string, WagerSocket>();

/** Export for event watcher to access */
export function getAddressToSocket() {
  return addressToSocket;
}

export function registerHandlers(
  io: WagerServer,
  socket: WagerSocket,
  matchManager: MatchManager,
): void {
  // Initialize socket data
  socket.data.address = null;
  socket.data.currentMatchId = null;
  socket.data.playerSlot = null;

  // Setup authentication — register socket in address lookup on successful auth
  setupAuth(socket, (address) => {
    addressToSocket.set(address, socket);
  });

  // --- Create Match ---
  socket.on("create_match", ({ wagerAmount }) => {
    const address = requireAuth(socket);
    if (!address) {
      socket.emit("error", { code: "NOT_AUTHENTICATED", message: "Please authenticate first" });
      return;
    }

    try {
      const match = matchManager.createMatch(address, wagerAmount);
      socket.data.currentMatchId = match.matchId;
      socket.data.playerSlot = PlayerSlot.Player1;
      socket.join(match.matchId);
      addressToSocket.set(address, socket);

      socket.emit("match_created", {
        matchId: match.matchId,
        onChainMatchId: match.onChainMatchId,
        wagerAmount,
      });

      // Send deposit_required — player needs to deposit USDC on-chain
      socket.emit("deposit_required", {
        onChainMatchId: match.onChainMatchId,
        wagerAmount,
        yourDeposited: false,
        opponentDeposited: false,
      });

      console.log(`[Match] ${address} created match ${match.matchId} ($${wagerAmount}) onChain: ${match.onChainMatchId.slice(0, 10)}...`);
    } catch (err: any) {
      socket.emit("error", { code: "CREATE_FAILED", message: err.message });
    }
  });

  // --- Join Match ---
  socket.on("join_match", ({ matchId }) => {
    const address = requireAuth(socket);
    if (!address) {
      socket.emit("error", { code: "NOT_AUTHENTICATED", message: "Please authenticate first" });
      return;
    }

    try {
      const match = matchManager.joinMatch(matchId, address);
      socket.data.currentMatchId = matchId;
      socket.data.playerSlot = PlayerSlot.Player2;
      socket.join(matchId);
      addressToSocket.set(address, socket);

      // Notify joiner with onChainMatchId for deposit
      socket.emit("match_joined", {
        matchId,
        opponent: match.state.players[PlayerSlot.Player1].address,
        onChainMatchId: match.onChainMatchId,
        wagerAmount: match.state.wagerAmount,
      });

      // Notify creator that opponent joined
      socket.to(matchId).emit("opponent_joined", {
        matchId,
        opponent: address,
      });

      // Send deposit_required to joiner
      socket.emit("deposit_required", {
        onChainMatchId: match.onChainMatchId,
        wagerAmount: match.state.wagerAmount,
        yourDeposited: false,
        opponentDeposited: match.state.players[PlayerSlot.Player1].deposited,
      });

      // Deposits are now confirmed via on-chain events (events.ts)
      // Game starts when both deposits are confirmed

      console.log(`[Match] ${address} joined match ${matchId}`);
    } catch (err: any) {
      socket.emit("error", { code: "JOIN_FAILED", message: err.message });
    }
  });

  // --- Commit ---
  socket.on("commit", ({ matchId, commitHash }) => {
    const address = requireAuth(socket);
    if (!address) return;

    const match = matchManager.getMatch(matchId);
    if (!match || !match.isStarted()) {
      socket.emit("error", { code: "INVALID_MATCH", message: "Match not found or not started" });
      return;
    }

    const slot = match.getPlayerSlot(address);
    if (slot === null) {
      socket.emit("error", { code: "NOT_IN_MATCH", message: "You are not in this match" });
      return;
    }

    try {
      match.commit(slot, commitHash);

      // Notify opponent that we committed
      socket.to(matchId).emit("opponent_committed");

      // Demo mode: bot auto-commits after player
      if (match.isDemo && !match.allCommitted()) {
        const bot = match.getBotPlayer()!;
        const botMove = bot.chooseAction(match.state);
        match.pendingBotMove = botMove;
        match.commit(PlayerSlot.Player2, botMove.commitHash);
      }

      // If both committed, enter reveal phase
      if (match.allCommitted()) {
        match.clearCommitTimer();
        io.to(matchId).emit("reveal_phase");

        // Demo mode: bot auto-reveals immediately
        if (match.isDemo && match.pendingBotMove) {
          const botMove = match.pendingBotMove;
          match.reveal(PlayerSlot.Player2, botMove.action, botMove.salt);
          match.pendingBotMove = null;
        }

        // Start reveal timer (skip for demo — bot already revealed)
        if (!match.isDemo) {
          match.startRevealTimer(() => {
            handleRevealTimeout(io, matchId, match, matchManager);
          });
        }
      }
    } catch (err: any) {
      socket.emit("error", { code: "COMMIT_FAILED", message: err.message });
    }
  });

  // --- Reveal ---
  socket.on("reveal", ({ matchId, action, salt }) => {
    const address = requireAuth(socket);
    if (!address) return;

    const match = matchManager.getMatch(matchId);
    if (!match) {
      socket.emit("error", { code: "INVALID_MATCH", message: "Match not found" });
      return;
    }

    const slot = match.getPlayerSlot(address);
    if (slot === null) return;

    try {
      const valid = match.reveal(slot, action, salt);
      if (!valid) {
        socket.emit("error", { code: "INVALID_REVEAL", message: "Reveal does not match commit" });
        return;
      }

      // If both revealed, resolve round
      if (match.allRevealed()) {
        match.clearRevealTimer();
        resolveAndAdvance(io, matchId, match, matchManager);
      }
    } catch (err: any) {
      socket.emit("error", { code: "REVEAL_FAILED", message: err.message });
    }
  });

  // --- Get Match State (for reconnect / page navigation) ---
  socket.on("get_match_state", ({ matchId }) => {
    const address = requireAuth(socket);
    if (!address) return;

    const match = matchManager.getMatch(matchId);
    if (!match) {
      socket.emit("error", { code: "INVALID_MATCH", message: "Match not found" });
      return;
    }

    const slot = match.getPlayerSlot(address);
    if (slot === null) {
      socket.emit("error", { code: "NOT_IN_MATCH", message: "You are not in this match" });
      return;
    }

    // Make sure socket is in the room
    socket.join(matchId);
    socket.data.currentMatchId = matchId;
    socket.data.playerSlot = slot;
    addressToSocket.set(address, socket);

    const opponent = match.getOpponentSlot(slot);
    const state = match.state;
    const modifier = state.roundModifiers[state.currentRound - 1] ?? "NONE";

    socket.emit("match_state", {
      status: state.status,
      round: state.currentRound,
      modifier,
      yourHp: state.players[slot].hp,
      yourEnergy: state.players[slot].energy,
      opponentHp: state.players[opponent].hp,
      opponentEnergy: state.players[opponent].energy,
      roundResults: state.roundResults,
      winner: match.getWinnerAddress(),
      winReason: state.winReason,
      onChainMatchId: match.onChainMatchId,
      wagerAmount: state.wagerAmount,
      playerSlot: slot === PlayerSlot.Player1 ? "player1" : "player2",
      isDemo: match.isDemo || undefined,
    });

    // If match needs deposits, also send deposit_required
    if (state.status === MatchStatus.WaitingForDeposits || state.status === MatchStatus.WaitingForOpponent) {
      socket.emit("deposit_required", {
        onChainMatchId: match.onChainMatchId,
        wagerAmount: state.wagerAmount,
        yourDeposited: state.players[slot].deposited,
        opponentDeposited: state.players[opponent]?.deposited ?? false,
      });
    }
  });

  // --- Get Active Match (for lobby rejoin) ---
  socket.on("get_active_match", () => {
    const address = requireAuth(socket);
    if (!address) return;

    const match = matchManager.getActiveMatch(address);
    if (match) {
      const slot = match.getPlayerSlot(address);

      // Re-send match_started_alert if match is InProgress and player is not in the room
      // (covers case where original alert expired or was missed due to socket reconnect)
      if (match.status === MatchStatus.InProgress) {
        const room = io.sockets.adapter.rooms.get(match.matchId);
        if (!room || !room.has(socket.id)) {
          socket.emit("match_started_alert", {
            matchId: match.matchId,
            wagerAmount: match.state.wagerAmount,
          });
        }
      }

      socket.emit("active_match", {
        matchId: match.matchId,
        onChainMatchId: match.onChainMatchId,
        wagerAmount: match.state.wagerAmount,
        status: match.status,
        playerSlot: slot === PlayerSlot.Player1 ? "player1" : "player2",
      });

      // Re-join the room in case socket reconnected
      socket.join(match.matchId);
      socket.data.currentMatchId = match.matchId;
      socket.data.playerSlot = slot;
      addressToSocket.set(address, socket);
    } else {
      socket.emit("active_match", null);
    }
  });

  // --- Request Rematch ---
  socket.on("request_rematch", ({ matchId }) => {
    const address = requireAuth(socket);
    if (!address) {
      socket.emit("error", { code: "NOT_AUTHENTICATED", message: "Please authenticate first" });
      return;
    }

    const match = matchManager.getMatch(matchId);
    if (!match || !match.isOver()) {
      socket.emit("error", { code: "INVALID_MATCH", message: "Match not found or not finished" });
      return;
    }

    const slot = match.getPlayerSlot(address);
    if (slot === null) {
      socket.emit("error", { code: "NOT_IN_MATCH", message: "You are not in this match" });
      return;
    }

    // Check if opponent already sent a pending rematch — treat as auto-accept
    const existing = matchManager.getPendingRematch(matchId);
    if (existing && existing.requesterAddress.toLowerCase() !== address.toLowerCase()) {
      // Opponent already requested — create match immediately
      createRematchMatch(io, matchManager, matchId, addressToSocket);
      return;
    }

    // Already have a pending rematch from us — ignore duplicate
    if (existing) {
      socket.emit("rematch_waiting");
      return;
    }

    const opponentSlot = match.getOpponentSlot(slot);
    const opponentAddress = match.state.players[opponentSlot].address;

    // Find opponent's socket
    const opponentSocket = addressToSocket.get(opponentAddress.toLowerCase());
    if (!opponentSocket?.connected) {
      socket.emit("rematch_declined");
      return;
    }

    // Store pending rematch with 15s timeout
    matchManager.addPendingRematch(
      matchId,
      { requesterAddress: address, opponentAddress, wagerAmount: match.state.wagerAmount },
      () => {
        // On timeout — notify requester
        const reqSocket = addressToSocket.get(address.toLowerCase());
        if (reqSocket?.connected) {
          reqSocket.emit("rematch_declined");
        }
        console.log(`[Match] Rematch invite expired for ${matchId}`);
      },
    );

    // Confirm to requester
    socket.emit("rematch_waiting");

    // Send invite to opponent (works even if they're on lobby page)
    opponentSocket.emit("rematch_invite", {
      matchId,
      fromAddress: address,
      wagerAmount: match.state.wagerAmount,
    });

    console.log(`[Match] Rematch invite sent for ${matchId}: ${address} -> ${opponentAddress}`);
  });

  // --- Accept Rematch ---
  socket.on("accept_rematch", ({ matchId }) => {
    const address = requireAuth(socket);
    if (!address) return;

    const pending = matchManager.getPendingRematch(matchId);
    if (!pending || pending.opponentAddress.toLowerCase() !== address.toLowerCase()) {
      socket.emit("error", { code: "REMATCH_FAILED", message: "No pending rematch invitation" });
      return;
    }

    createRematchMatch(io, matchManager, matchId, addressToSocket);
  });

  // --- Decline Rematch ---
  socket.on("decline_rematch", ({ matchId }) => {
    const pending = matchManager.getPendingRematch(matchId);
    if (!pending) return;

    matchManager.clearPendingRematch(matchId);

    // Notify requester
    const requesterSocket = addressToSocket.get(pending.requesterAddress.toLowerCase());
    if (requesterSocket?.connected) {
      requesterSocket.emit("rematch_declined");
    }

    console.log(`[Match] Rematch declined for ${matchId}`);
  });

  // --- Cancel Match (creator cancels, server cleanup — frontend handles on-chain cancel) ---
  socket.on("cancel_match", ({ matchId }) => {
    const address = requireAuth(socket);
    if (!address) return;

    const match = matchManager.getMatch(matchId);
    if (match) {
      const slot = match.getPlayerSlot(address);
      if (slot !== null) {
        // Notify opponent before removing match
        socket.to(matchId).emit("match_cancelled", { matchId, reason: "Opponent cancelled the match" });
        matchManager.removeMatch(matchId);
      }
    }

    socket.leave(matchId);
    if (socket.data.currentMatchId === matchId) {
      socket.data.currentMatchId = null;
      socket.data.playerSlot = null;
    }

    console.log(`[Match] ${address} cancelled match ${matchId}`);
  });

  // --- Forfeit from Lobby (player forfeits an InProgress match without being on match page) ---
  socket.on("forfeit_from_lobby", ({ matchId }) => {
    const address = requireAuth(socket);
    if (!address) return;

    const match = matchManager.getMatch(matchId);
    if (!match) return;

    const slot = match.getPlayerSlot(address);
    if (slot === null) return;

    if (match.isDemo) {
      match.clearTimers();
      const demoSlot = match.getPlayerSlot(address)!;
      const demoOpponent = match.getOpponentSlot(demoSlot);
      io.to(matchId).emit("match_result", {
        winner: match.state.players[demoOpponent]?.address || null,
        winReason: "forfeit",
        wagerAmount: 0,
      });
      matchManager.removeMatch(matchId);
      console.log(`[Demo] ${address} forfeited demo match ${matchId} from lobby`);
      return;
    }

    if (match.status === MatchStatus.InProgress) {
      match.forfeit(slot);
      const winnerAddr = match.getWinnerAddress();
      handleAutoSettlement(io, matchId, match, winnerAddr);
      setTimeout(() => matchManager.removeMatch(matchId), 120_000);
      console.log(`[Match] ${address} forfeited match ${matchId} from lobby`);
    }
  });

  // --- Get Open Matches ---
  socket.on("get_open_matches", () => {
    socket.emit("open_matches", matchManager.getOpenMatches());
  });

  // --- Start Demo Match (bot opponent, no on-chain) ---
  socket.on("start_demo_match", () => {
    const address = requireAuth(socket);
    if (!address) {
      socket.emit("error", { code: "NOT_AUTHENTICATED", message: "Please authenticate first" });
      return;
    }

    try {
      const match = matchManager.createDemoMatch(address);
      socket.data.currentMatchId = match.matchId;
      socket.data.playerSlot = PlayerSlot.Player1;
      socket.join(match.matchId);
      addressToSocket.set(address, socket);

      socket.emit("match_created", {
        matchId: match.matchId,
        onChainMatchId: match.onChainMatchId,
        wagerAmount: 0,
        isDemo: true,
      });

      // Match is already InProgress (both deposits marked) — start round 1 immediately
      emitRoundStart(io, match.matchId, match, matchManager);

      console.log(`[Demo] ${address} started demo match ${match.matchId}`);
    } catch (err: any) {
      socket.emit("error", { code: "DEMO_FAILED", message: err.message });
    }
  });

  // --- Leave Match ---
  socket.on("leave_match", ({ matchId }) => {
    const address = requireAuth(socket);
    if (!address) return;

    const match = matchManager.getMatch(matchId);
    if (!match) return;

    const slot = match.getPlayerSlot(address);
    if (slot === null) return;

    // Demo matches — emit result, then clean up (no on-chain anything)
    if (match.isDemo) {
      match.clearTimers();
      const opponentSlot = match.getOpponentSlot(slot);
      const winnerAddr = match.state.players[opponentSlot]?.address || null;
      io.to(matchId).emit("match_result", {
        winner: winnerAddr,
        winReason: "forfeit",
        wagerAmount: 0,
      });
      matchManager.removeMatch(matchId);
      socket.leave(matchId);
      socket.data.currentMatchId = null;
      socket.data.playerSlot = null;
      console.log(`[Demo] ${address} forfeited demo match ${matchId}`);
      return;
    }

    if (match.status === MatchStatus.InProgress) {
      match.clearTimers();
      match.forfeit(slot);
      const winnerAddr = match.getWinnerAddress();

      // Auto-settle forfeit on-chain
      handleAutoSettlement(io, matchId, match, winnerAddr);
    } else if (match.status === MatchStatus.WaitingForDeposits || match.status === MatchStatus.WaitingForOpponent) {
      // Deposit phase cleanup
      if (slot === PlayerSlot.Player2) {
        // Player 2 leaving → revert to WaitingForOpponent, notify Player 1
        match.unjoin();
        matchManager.removePlayerFromMatch(address);
        socket.to(matchId).emit("match_cancelled", { matchId, reason: "Opponent left the match" });
        console.log(`[Match] Player2 ${address} left deposit-phase match ${matchId} — reverted to WaitingForOpponent`);
      } else {
        // Player 1 leaving during deposit phase
        if (!match.state.players[PlayerSlot.Player1].deposited) {
          // No deposit — safe to remove entirely
          socket.to(matchId).emit("match_cancelled", { matchId, reason: "Creator cancelled the match" });
          matchManager.removeMatch(matchId);
          console.log(`[Match] Player1 ${address} left deposit-phase match ${matchId} (no deposit) — removed`);
        }
        // If Player 1 has deposited, don't remove — they need to cancel on-chain.
        // Match stays in memory; Player 1 can return via get_active_match banner.
      }
    }

    // If match is completed, clean up any pending rematch
    if (match.isOver()) {
      const pending = matchManager.getPendingRematch(matchId);
      if (pending) {
        matchManager.clearPendingRematch(matchId);
        // Notify the other player that rematch was declined
        const otherAddress = pending.requesterAddress.toLowerCase() === address.toLowerCase()
          ? pending.opponentAddress
          : pending.requesterAddress;
        const otherSocket = addressToSocket.get(otherAddress.toLowerCase());
        if (otherSocket?.connected) {
          otherSocket.emit("rematch_declined");
        }
      }
    }

    socket.leave(matchId);
    // Only clear socket data if this is still the current match
    // (during rematch, createRematchMatch already set currentMatchId to the new match)
    if (socket.data.currentMatchId === matchId) {
      socket.data.currentMatchId = null;
      socket.data.playerSlot = null;
    }
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    const address = socket.data.address;
    if (address) {
      addressToSocket.delete(address);
      const matchId = matchManager.handleDisconnect(address);
      if (matchId) {
        const match = matchManager.getMatch(matchId);
        if (match && match.isOver()) {
          const winnerAddr = match.getWinnerAddress();
          // Auto-settle disconnect forfeit on-chain
          handleAutoSettlement(io, matchId, match, winnerAddr);
        }
      }
      console.log(`[Socket] ${address} disconnected`);
    }
  });
}

/** Auto-settle match on-chain after it ends */
async function handleAutoSettlement(
  io: WagerServer,
  matchId: string,
  match: InstanceType<typeof import("../game/Match.js").Match>,
  winnerAddr: string | null,
): Promise<void> {
  // Emit match result immediately (don't wait for on-chain)
  io.to(matchId).emit("match_result", {
    winner: winnerAddr,
    winReason: match.state.winReason || "unknown",
    wagerAmount: match.state.wagerAmount,
  });

  console.log(`[Match] ${matchId} ended. Winner: ${winnerAddr || "draw"} (${match.state.winReason})`);

  // Attempt on-chain settlement
  try {
    // For draw, winner address is zero address
    const settlementWinner = winnerAddr || "0x0000000000000000000000000000000000000000";

    const signature = await signSettlement(matchId, settlementWinner);
    console.log(`[Settlement] Signed for match ${matchId}`);

    const txHash = await submitSettlement(matchId, settlementWinner, signature);
    console.log(`[Settlement] Match ${matchId} settled on-chain. Tx: ${txHash}`);

    // Notify clients about successful settlement (funds auto-pushed by contract)
    io.to(matchId).emit("match_result", {
      winner: winnerAddr,
      winReason: match.state.winReason || "unknown",
      wagerAmount: match.state.wagerAmount,
      settlement: {
        matchId,
        onChainMatchId: match.onChainMatchId,
        winner: settlementWinner,
        signature,
        txHash,
      },
    });
  } catch (err: any) {
    console.error(`[Settlement] Failed for match ${matchId}:`, err.message);
    // Game result was already sent, settlement can be retried or done manually
  }
}

/** Resolve the current round after both reveals and advance (or end) the match */
function resolveAndAdvance(
  io: WagerServer,
  matchId: string,
  match: InstanceType<typeof import("../game/Match.js").Match>,
  matchManager?: MatchManager,
): void {
  match.resolveRound();
  const result = match.getLastRoundResult();
  if (result) {
    io.to(matchId).emit("round_result", result);
  }

  if (match.isOver()) {
    match.clearTimers();
    const winnerAddr = match.getWinnerAddress();

    if (match.isDemo) {
      io.to(matchId).emit("match_result", {
        winner: winnerAddr,
        winReason: match.state.winReason || "unknown",
        wagerAmount: 0,
      });
      if (matchManager) setTimeout(() => matchManager.removeMatch(matchId), 60_000);
    } else {
      handleAutoSettlement(io, matchId, match, winnerAddr);
      if (matchManager) setTimeout(() => matchManager.removeMatch(matchId), 120_000);
    }
  } else {
    emitRoundStart(io, matchId, match, matchManager);
  }
}

/** Emit round_start to both players with their respective perspectives */
export function emitRoundStart(
  io: WagerServer,
  matchId: string,
  match: InstanceType<typeof import("../game/Match.js").Match>,
  matchManager?: MatchManager,
): void {
  const state = match.state;
  const modifier = state.roundModifiers[state.currentRound - 1];
  const commitTimeout = match.getCommitTimeout();

  // We need per-player data, so fetch sockets
  const sockets = io.sockets.adapter.rooms.get(matchId);
  if (!sockets) return;

  for (const socketId of sockets) {
    const sock = io.sockets.sockets.get(socketId) as WagerSocket | undefined;
    if (!sock?.data.address) continue;

    const slot = match.getPlayerSlot(sock.data.address);
    if (slot === null) continue;

    const opponent = match.getOpponentSlot(slot);

    sock.emit("round_start", {
      round: state.currentRound,
      modifier,
      yourHp: state.players[slot].hp,
      yourEnergy: state.players[slot].energy,
      opponentHp: state.players[opponent].hp,
      opponentEnergy: state.players[opponent].energy,
      commitTimeout,
    });
  }

  // Start commit timer for all matches (demo included — player can still time out)
  match.startCommitTimer(() => {
    handleCommitTimeout(io, matchId, match, matchManager);
  });
}

/** Handle commit phase timeout — auto-play Shield (or Recover if can't afford) for timed-out player(s) */
function handleCommitTimeout(
  io: WagerServer,
  matchId: string,
  match: InstanceType<typeof import("../game/Match.js").Match>,
  matchManager?: MatchManager,
): void {
  if (match.isOver() || !match.isStarted()) return;

  const p1Committed = match.hasCommitted(PlayerSlot.Player1);
  const p2Committed = match.hasCommitted(PlayerSlot.Player2);

  if (p1Committed && p2Committed) return; // Both committed, timer is stale

  // Auto-commit for timed-out players, track for auto-reveal
  const pendingReveals: { player: PlayerSlot; action: string; salt: string }[] = [];

  if (!p1Committed) {
    const { action, salt } = match.autoCommit(PlayerSlot.Player1);
    pendingReveals.push({ player: PlayerSlot.Player1, action, salt });
    console.log(`[Timer] Player1 timed out commit in match ${matchId} — auto-played ${action}`);
  }
  if (!p2Committed) {
    const { action, salt } = match.autoCommit(PlayerSlot.Player2);
    pendingReveals.push({ player: PlayerSlot.Player2, action, salt });
    console.log(`[Timer] Player2 timed out commit in match ${matchId} — auto-played ${action}`);
  }

  // Both committed now — enter reveal phase
  io.to(matchId).emit("reveal_phase");

  // Auto-reveal for timed-out players (hash matches because we generated the commit)
  for (const { player, action, salt } of pendingReveals) {
    match.reveal(player, action as any, salt);
  }

  // Check if both revealed (happens when both timed out, or single timeout + instant reveal)
  if (match.allRevealed()) {
    resolveAndAdvance(io, matchId, match, matchManager);
  } else {
    // Other player committed but hasn't revealed yet — start reveal timer
    match.startRevealTimer(() => {
      handleRevealTimeout(io, matchId, match, matchManager);
    });
  }
}

/** Handle reveal phase timeout — auto-reveal Shield (or Recover) for timed-out player(s) */
function handleRevealTimeout(
  io: WagerServer,
  matchId: string,
  match: InstanceType<typeof import("../game/Match.js").Match>,
  matchManager?: MatchManager,
): void {
  if (match.isOver() || !match.isStarted()) return;
  if (match.allRevealed()) return; // Both revealed, timer is stale

  const commits = match.state.commits;
  const p1Rev = commits[0]?.action !== null;
  const p2Rev = commits[1]?.action !== null;

  // Force-reveal for timed-out players (bypasses hash verification since original commit is unknown)
  if (!p1Rev) {
    const action = match.getDefaultTimeoutAction(PlayerSlot.Player1);
    match.forceReveal(PlayerSlot.Player1, action, "0x0000000000000000000000000000000000000000000000000000000000000000");
    console.log(`[Timer] Player1 timed out reveal in match ${matchId} — auto-played ${action}`);
  }
  if (!p2Rev) {
    const action = match.getDefaultTimeoutAction(PlayerSlot.Player2);
    match.forceReveal(PlayerSlot.Player2, action, "0x0000000000000000000000000000000000000000000000000000000000000000");
    console.log(`[Timer] Player2 timed out reveal in match ${matchId} — auto-played ${action}`);
  }

  resolveAndAdvance(io, matchId, match, matchManager);
}

/** Create a rematch match and notify both players */
function createRematchMatch(
  io: WagerServer,
  matchManager: MatchManager,
  oldMatchId: string,
  addrToSocket: Map<string, WagerSocket>,
): void {
  const info = matchManager.getRematchInfo(oldMatchId);
  if (!info) return;

  matchManager.clearPendingRematch(oldMatchId);

  try {
    const newMatch = matchManager.createMatch(info.player1, info.wagerAmount);
    matchManager.joinMatch(newMatch.matchId, info.player2);

    const rematchData = {
      matchId: newMatch.matchId,
      onChainMatchId: newMatch.onChainMatchId,
      wagerAmount: info.wagerAmount,
    };

    // Set up both players' sockets in the new match room and notify them
    for (const playerAddr of [info.player1, info.player2]) {
      const sock = addrToSocket.get(playerAddr.toLowerCase());
      if (!sock?.connected) continue;

      const newSlot = newMatch.getPlayerSlot(sock.data.address!);
      if (newSlot !== null) {
        sock.join(newMatch.matchId);
        sock.data.currentMatchId = newMatch.matchId;
        sock.data.playerSlot = newSlot;
      }

      sock.emit("rematch_created", rematchData);
    }

    console.log(`[Match] Rematch created: ${newMatch.matchId} from ${oldMatchId}`);
  } catch (err: any) {
    console.error(`[Match] Failed to create rematch from ${oldMatchId}:`, err.message);
  }
}
