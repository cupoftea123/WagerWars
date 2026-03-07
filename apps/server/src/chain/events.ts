import type { Server } from "socket.io";
import { parseAbiItem, type Log } from "viem";
import { publicClient } from "./provider.js";
import { config } from "../config.js";
import type { MatchManager } from "../game/MatchManager.js";
import { PlayerSlot } from "@wager-wars/shared";
import { emitRoundStart, getAddressToSocket } from "../socket/handlers.js";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "../socket/types.js";

type WagerServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const MATCH_CREATED_EVENT = parseAbiItem(
  "event MatchCreated(bytes32 indexed matchId, address indexed player1, uint256 wagerAmount)",
);
const MATCH_JOINED_EVENT = parseAbiItem(
  "event MatchJoined(bytes32 indexed matchId, address indexed player2)",
);

/** Polling interval for checking new events (ms) */
const POLL_INTERVAL = 5_000;

/**
 * Watch for contract events to confirm on-chain deposits.
 * Uses manual polling with eth_getLogs (compatible with all RPC providers).
 * When MatchCreated fires → confirm Player1 deposit.
 * When MatchJoined fires → confirm Player2 deposit → start game if both deposited.
 */
export function watchContractEvents(
  matchManager: MatchManager,
  io: WagerServer,
): void {
  if (!config.wagerWarsAddress) {
    console.log("[Chain] No WAGER_WARS_ADDRESS set, skipping event watching");
    return;
  }

  console.log(`[Chain] Polling events on ${config.wagerWarsAddress} every ${POLL_INTERVAL / 1000}s`);

  let lastBlock = 0n;

  async function pollEvents() {
    try {
      const currentBlock = await publicClient.getBlockNumber();

      // On first run, start from current block (don't scan history)
      if (lastBlock === 0n) {
        lastBlock = currentBlock;
        return;
      }

      // No new blocks
      if (currentBlock <= lastBlock) return;

      const fromBlock = lastBlock + 1n;

      // Fetch MatchCreated logs
      const createdLogs = await publicClient.getLogs({
        address: config.wagerWarsAddress,
        event: MATCH_CREATED_EVENT,
        fromBlock,
        toBlock: currentBlock,
      });

      for (const log of createdLogs) {
        const onChainMatchId = log.args.matchId;
        const player1 = log.args.player1;
        if (!onChainMatchId || !player1) continue;

        const match = matchManager.findMatchByOnChainId(onChainMatchId);
        if (!match) {
          console.log(`[Chain] MatchCreated for unknown onChainId: ${onChainMatchId.slice(0, 10)}...`);
          continue;
        }

        console.log(`[Chain] MatchCreated confirmed for ${match.matchId} by ${player1}`);
        match.markDeposit(PlayerSlot.Player1);
        notifyDepositConfirmed(io, match, PlayerSlot.Player1);

        // Check if both deposited (P2 might have deposited first)
        if (match.isStarted()) {
          console.log(`[Chain] Both deposited for ${match.matchId} — starting game!`);
          emitRoundStart(io, match.matchId, match, matchManager);
          notifyAbsentPlayers(io, match);
        }
      }

      // Fetch MatchJoined logs
      const joinedLogs = await publicClient.getLogs({
        address: config.wagerWarsAddress,
        event: MATCH_JOINED_EVENT,
        fromBlock,
        toBlock: currentBlock,
      });

      for (const log of joinedLogs) {
        const onChainMatchId = log.args.matchId;
        const player2 = log.args.player2;
        if (!onChainMatchId || !player2) continue;

        const match = matchManager.findMatchByOnChainId(onChainMatchId);
        if (!match) {
          console.log(`[Chain] MatchJoined for unknown onChainId: ${onChainMatchId.slice(0, 10)}...`);
          continue;
        }

        console.log(`[Chain] MatchJoined confirmed for ${match.matchId} by ${player2}`);
        match.markDeposit(PlayerSlot.Player2);
        notifyDepositConfirmed(io, match, PlayerSlot.Player2);

        if (match.isStarted()) {
          console.log(`[Chain] Both deposited for ${match.matchId} — starting game!`);
          emitRoundStart(io, match.matchId, match, matchManager);
          notifyAbsentPlayers(io, match);
        }
      }

      lastBlock = currentBlock;
    } catch (error: any) {
      console.error("[Chain] Event polling error:", error.message);
    }
  }

  // Start polling
  setInterval(pollEvents, POLL_INTERVAL);
  // Run immediately once
  pollEvents();
}

/**
 * Notify players who are NOT in the match room that their match has started.
 * This happens when a player navigates to the lobby while their match is pending.
 * Sends a direct "match_started_alert" via addressToSocket (like rematch_invite).
 */
function notifyAbsentPlayers(
  io: WagerServer,
  match: InstanceType<typeof import("../game/Match.js").Match>,
): void {
  const matchId = match.matchId;
  const room = io.sockets.adapter.rooms.get(matchId);
  const addressToSocket = getAddressToSocket();

  for (const slot of [PlayerSlot.Player1, PlayerSlot.Player2]) {
    const addr = match.state.players[slot].address;
    if (!addr) continue;

    const sock = addressToSocket.get(addr.toLowerCase());
    if (!sock?.connected) continue;

    // If player is NOT in the match room, send them a direct alert
    if (!room || !room.has(sock.id)) {
      sock.emit("match_started_alert", {
        matchId: match.matchId,
        wagerAmount: match.state.wagerAmount,
      });
      console.log(`[Chain] Sent match_started_alert to absent player ${addr.slice(0, 8)}... for match ${matchId}`);
    }
  }
}

/** Notify players in a match about a confirmed deposit */
function notifyDepositConfirmed(
  io: WagerServer,
  match: InstanceType<typeof import("../game/Match.js").Match>,
  depositedSlot: PlayerSlot,
): void {
  const matchId = match.matchId;
  const sockets = io.sockets.adapter.rooms.get(matchId);
  if (!sockets) return;

  for (const socketId of sockets) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock?.data.address) continue;

    const slot = match.getPlayerSlot(sock.data.address);
    if (slot === null) continue;

    if (slot === depositedSlot) {
      sock.emit("deposit_confirmed", { player: "you" });
    } else {
      sock.emit("deposit_confirmed", { player: "opponent" });
    }
  }
}
