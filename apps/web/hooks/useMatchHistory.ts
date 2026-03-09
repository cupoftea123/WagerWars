"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

/** Block where the WagerWars contract was deployed on Fuji */
const DEPLOY_BLOCK = BigInt(51954160);

const CACHE_KEY = "wager-wars-history";

interface CachedHistory {
  address: string;
  lastBlock: string; // bigint serialized
  entries: MatchHistoryEntry[];
}

function loadCache(address: string): CachedHistory | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedHistory;
    if (data.address.toLowerCase() !== address.toLowerCase()) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(address: string, lastBlock: bigint, entries: MatchHistoryEntry[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      address,
      lastBlock: lastBlock.toString(),
      entries,
    }));
  } catch {
    // localStorage might be full or unavailable
  }
}

const MATCH_PAYOUT_EVENT = {
  type: "event" as const,
  name: "MatchPayout" as const,
  inputs: [
    { name: "matchId" as const, type: "bytes32" as const, indexed: true as const },
    { name: "player" as const, type: "address" as const, indexed: true as const },
    { name: "amount" as const, type: "uint256" as const, indexed: false as const },
  ],
} as const;

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

/** Process a batch of logs into MatchHistoryEntry[], fetching match data in parallel */
async function processLogs(
  payoutLogs: any[],
  settledLogs: any[],
  address: string,
  publicClient: any,
): Promise<MatchHistoryEntry[]> {
  const seenMatchIds = new Set<string>();
  const entries: MatchHistoryEntry[] = [];

  // Collect unique block numbers for batch fetching timestamps
  const blockNumbers = new Set<bigint>();

  // Prepare payout entries
  type PendingEntry = {
    matchId: `0x${string}`;
    payoutWei: bigint;
    blockNumber: bigint;
    txHash: `0x${string}`;
    isFromSettled: boolean;
  };
  const pending: PendingEntry[] = [];

  for (const log of payoutLogs) {
    const matchId = log.args.matchId;
    const payoutWei = log.args.amount;
    if (!matchId || payoutWei == null) continue;
    if (seenMatchIds.has(matchId)) continue;
    seenMatchIds.add(matchId);
    blockNumbers.add(log.blockNumber!);
    pending.push({ matchId, payoutWei, blockNumber: log.blockNumber!, txHash: log.transactionHash!, isFromSettled: false });
  }

  for (const log of settledLogs) {
    const matchId = log.args.matchId;
    if (!matchId || seenMatchIds.has(matchId)) continue;
    seenMatchIds.add(matchId);
    blockNumbers.add(log.blockNumber!);
    pending.push({ matchId, payoutWei: BigInt(0), blockNumber: log.blockNumber!, txHash: log.transactionHash!, isFromSettled: true });
  }

  if (pending.length === 0) return [];

  // Batch fetch: blocks + match data in parallel
  const uniqueBlocks = [...blockNumbers];
  const blockMap = new Map<bigint, bigint>(); // blockNumber → timestamp

  // Fetch blocks in parallel (max 10 concurrent)
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniqueBlocks.length; i += BATCH_SIZE) {
    const batch = uniqueBlocks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((bn) => publicClient.getBlock({ blockNumber: bn }).catch(() => null)),
    );
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) blockMap.set(batch[j], results[j].timestamp);
    }
  }

  // Fetch match data in parallel (max 10 concurrent)
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((p) =>
        publicClient.readContract({
          address: WAGER_WARS_ADDRESS,
          abi: WAGER_WARS_ABI,
          functionName: "getMatch",
          args: [p.matchId],
        }).catch(() => null),
      ),
    );

    for (let j = 0; j < batch.length; j++) {
      const matchData = results[j];
      const p = batch[j];
      if (!matchData) continue;

      const wager = parseFloat(formatUnits(matchData.wagerAmount, 6));
      const payout = parseFloat(formatUnits(p.payoutWei, 6));
      const isPlayer1 = matchData.player1.toLowerCase() === address.toLowerCase();
      const opponent = isPlayer1 ? matchData.player2 : matchData.player1;

      // For settled logs, check if we were a participant
      if (p.isFromSettled) {
        const p1 = matchData.player1.toLowerCase();
        const p2 = matchData.player2.toLowerCase();
        const me = address.toLowerCase();
        if (p1 !== me && p2 !== me) continue;
      }

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

      const timestamp = blockMap.get(p.blockNumber);
      entries.push({
        matchId: p.matchId,
        opponent,
        result,
        wager,
        payout,
        timestamp: timestamp ? Number(timestamp) * 1000 : Date.now(),
        txHash: p.txHash,
      });
    }
  }

  return entries;
}

function computeStats(entries: MatchHistoryEntry[]): MatchStats {
  const total = entries.length;
  const wins = entries.filter((e) => e.result === "WIN").length;
  const losses = entries.filter((e) => e.result === "LOSS").length;
  const draws = entries.filter((e) => e.result === "DRAW").length;
  const totalEarned = entries.reduce((sum, e) => sum + e.payout, 0);
  const totalWagered = entries.reduce((sum, e) => sum + e.wager, 0);
  return { total, wins, losses, draws, totalEarned, totalWagered };
}

export function useMatchHistory() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [stats, setStats] = useState<MatchStats>({ total: 0, wins: 0, losses: 0, draws: 0, totalEarned: 0, totalWagered: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchHistory = useCallback(async (forceFullRefresh = false) => {
    if (!address || !publicClient) return;
    if (fetchingRef.current) return; // prevent double-fetch
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const currentBlock = await publicClient.getBlockNumber();

      // Try to use cache for incremental fetch
      const cache = forceFullRefresh ? null : loadCache(address);
      const startBlock = cache ? BigInt(cache.lastBlock) + 1n : DEPLOY_BLOCK;

      // Show cached data immediately while fetching new
      if (cache && cache.entries.length > 0) {
        setHistory(cache.entries);
        setStats(computeStats(cache.entries));
      }

      // Skip RPC calls if no new blocks
      if (startBlock > currentBlock) {
        setLoading(false);
        fetchingRef.current = false;
        return;
      }

      // Fetch payout + settled logs in parallel
      const [payoutLogs, settledLogs] = await Promise.all([
        fetchLogsChunked(
          (from, to) => publicClient.getLogs({
            address: WAGER_WARS_ADDRESS,
            event: MATCH_PAYOUT_EVENT,
            args: { player: address },
            fromBlock: from,
            toBlock: to,
          }),
          startBlock,
          currentBlock,
        ),
        fetchLogsChunked(
          (from, to) => publicClient.getLogs({
            address: WAGER_WARS_ADDRESS,
            event: MATCH_SETTLED_EVENT,
            fromBlock: from,
            toBlock: to,
          }),
          startBlock,
          currentBlock,
        ),
      ]);

      const newEntries = await processLogs(payoutLogs, settledLogs, address, publicClient);

      // Merge with cached entries (deduplicate by matchId)
      const existingMap = new Map<string, MatchHistoryEntry>();
      if (cache) {
        for (const e of cache.entries) existingMap.set(e.matchId, e);
      }
      for (const e of newEntries) existingMap.set(e.matchId, e);

      const allEntries = [...existingMap.values()].sort((a, b) => b.timestamp - a.timestamp);
      setHistory(allEntries);
      setStats(computeStats(allEntries));
      saveCache(address, currentBlock, allEntries);
    } catch (err: any) {
      console.error("Failed to fetch match history:", err);
      setError(err?.message || "Failed to load match history");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [address, publicClient]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, stats, loading, error, refresh: () => fetchHistory(true) };
}
