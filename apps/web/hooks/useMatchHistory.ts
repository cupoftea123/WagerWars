"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { WAGER_WARS_ADDRESS, WAGER_WARS_ABI } from "@/lib/contracts";

export interface MatchHistoryEntry {
  matchId: `0x${string}`;
  opponent: string;
  result: "WIN" | "LOSS" | "DRAW" | "CANCELLED";
  wager: number;
  payout: number;
  timestamp: number;
  txHash: `0x${string}`;
}

export interface MatchStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  totalEarned: number;
  totalWagered: number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MATCH_PAYOUT_EVENT = {
  type: "event" as const,
  name: "MatchPayout" as const,
  inputs: [
    { name: "matchId" as const, type: "bytes32" as const, indexed: true as const },
    { name: "player" as const, type: "address" as const, indexed: true as const },
    { name: "amount" as const, type: "uint256" as const, indexed: false as const },
  ],
} as const;

// MatchSettled only fires for wins (not draws). Winner is indexed but loser isn't,
// so we query ALL settlements and check getMatch to find losses.
const MATCH_SETTLED_EVENT = {
  type: "event" as const,
  name: "MatchSettled" as const,
  inputs: [
    { name: "matchId" as const, type: "bytes32" as const, indexed: true as const },
    { name: "winner" as const, type: "address" as const, indexed: true as const },
    { name: "payout" as const, type: "uint256" as const, indexed: false as const },
    { name: "fee" as const, type: "uint256" as const, indexed: false as const },
  ],
} as const;

/** Fetch logs in 2000-block chunks (Fuji RPC limits block ranges) */
async function fetchLogsChunked<T>(
  fetcher: (from: bigint, to: bigint) => Promise<T[]>,
  startBlock: bigint,
  endBlock: bigint,
): Promise<T[]> {
  const CHUNK = BigInt(2000);
  const all: T[] = [];
  for (let from = startBlock; from <= endBlock; from += CHUNK + 1n) {
    const to = from + CHUNK > endBlock ? endBlock : from + CHUNK;
    const chunk = await fetcher(from, to);
    all.push(...chunk);
  }
  return all;
}

export function useMatchHistory() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [stats, setStats] = useState<MatchStats>({ total: 0, wins: 0, losses: 0, draws: 0, totalEarned: 0, totalWagered: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!address || !publicClient) return;
    setLoading(true);
    setError(null);

    try {
      const currentBlock = await publicClient.getBlockNumber();
      const LOOKBACK = BigInt(50_000); // ~27 hours on Avalanche
      const startBlock = currentBlock > LOOKBACK ? currentBlock - LOOKBACK : BigInt(0);

      // 1. Query MatchPayout events for this player (wins, draws, cancels)
      const payoutLogs = await fetchLogsChunked(
        (from, to) => publicClient.getLogs({
          address: WAGER_WARS_ADDRESS,
          event: MATCH_PAYOUT_EVENT,
          args: { player: address },
          fromBlock: from,
          toBlock: to,
        }),
        startBlock,
        currentBlock,
      );

      // 2. Query ALL MatchSettled events to find losses (loser has no indexed event)
      const settledLogs = await fetchLogsChunked(
        (from, to) => publicClient.getLogs({
          address: WAGER_WARS_ADDRESS,
          event: MATCH_SETTLED_EVENT,
          fromBlock: from,
          toBlock: to,
        }),
        startBlock,
        currentBlock,
      );

      // Track matchIds we already have from payouts (to avoid duplicates)
      const seenMatchIds = new Set<string>();
      const entries: MatchHistoryEntry[] = [];

      // Process payout events (wins, draws, cancels)
      for (const log of payoutLogs) {
        const matchId = log.args.matchId;
        const payoutWei = log.args.amount;
        if (!matchId || payoutWei == null) continue;
        if (seenMatchIds.has(matchId)) continue;
        seenMatchIds.add(matchId);

        const payout = parseFloat(formatUnits(payoutWei, 6));

        try {
          const matchData = await publicClient.readContract({
            address: WAGER_WARS_ADDRESS,
            abi: WAGER_WARS_ABI,
            functionName: "getMatch",
            args: [matchId],
          });

          const wager = parseFloat(formatUnits(matchData.wagerAmount, 6));
          const isPlayer1 = matchData.player1.toLowerCase() === address.toLowerCase();
          const opponent = isPlayer1 ? matchData.player2 : matchData.player1;

          let result: MatchHistoryEntry["result"];
          if (matchData.status === 4) {
            result = "CANCELLED";
          } else if (matchData.winner.toLowerCase() === ZERO_ADDRESS) {
            result = "DRAW";
          } else if (matchData.winner.toLowerCase() === address.toLowerCase()) {
            result = "WIN";
          } else {
            result = "LOSS";
          }

          const block = await publicClient.getBlock({ blockNumber: log.blockNumber! });
          entries.push({
            matchId, opponent, result, wager, payout,
            timestamp: Number(block.timestamp) * 1000,
            txHash: log.transactionHash as `0x${string}`,
          });
        } catch {
          // Skip failed getMatch calls
        }
      }

      // Process settled events to find losses (where we were a participant but not the winner)
      for (const log of settledLogs) {
        const matchId = log.args.matchId;
        if (!matchId || seenMatchIds.has(matchId)) continue;

        try {
          const matchData = await publicClient.readContract({
            address: WAGER_WARS_ADDRESS,
            abi: WAGER_WARS_ABI,
            functionName: "getMatch",
            args: [matchId],
          });

          const p1 = matchData.player1.toLowerCase();
          const p2 = matchData.player2.toLowerCase();
          const me = address.toLowerCase();

          // Only include if we were a participant
          if (p1 !== me && p2 !== me) continue;
          seenMatchIds.add(matchId);

          const wager = parseFloat(formatUnits(matchData.wagerAmount, 6));
          const isPlayer1 = p1 === me;
          const opponent = isPlayer1 ? matchData.player2 : matchData.player1;

          const block = await publicClient.getBlock({ blockNumber: log.blockNumber! });
          entries.push({
            matchId, opponent, result: "LOSS", wager, payout: 0,
            timestamp: Number(block.timestamp) * 1000,
            txHash: log.transactionHash as `0x${string}`,
          });
        } catch {
          // Skip
        }
      }

      entries.sort((a, b) => b.timestamp - a.timestamp);
      setHistory(entries);

      const total = entries.length;
      const wins = entries.filter((e) => e.result === "WIN").length;
      const losses = entries.filter((e) => e.result === "LOSS").length;
      const draws = entries.filter((e) => e.result === "DRAW").length;
      const totalEarned = entries.reduce((sum, e) => sum + e.payout, 0);
      const totalWagered = entries.reduce((sum, e) => sum + e.wager, 0);

      setStats({ total, wins, losses, draws, totalEarned, totalWagered });
    } catch (err: any) {
      console.error("Failed to fetch match history:", err);
      setError(err?.message || "Failed to load match history");
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, stats, loading, error, refresh: fetchHistory };
}
