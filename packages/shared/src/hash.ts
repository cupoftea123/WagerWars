import { keccak256, encodePacked } from "viem";
import { Action } from "./types.js";

/**
 * Compute the commit hash for a player's move.
 * hash = keccak256(abi.encodePacked(matchId, round, playerAddress, action, salt))
 */
export function computeCommitHash(
  matchId: string,
  round: number,
  playerAddress: string,
  action: Action,
  salt: string,
): string {
  return keccak256(
    encodePacked(
      ["string", "uint8", "address", "string", "bytes32"],
      [matchId, round, playerAddress as `0x${string}`, action, salt as `0x${string}`],
    ),
  );
}

/**
 * Verify that a reveal matches the previously submitted commit hash.
 */
export function verifyCommit(
  commitHash: string,
  matchId: string,
  round: number,
  playerAddress: string,
  action: Action,
  salt: string,
): boolean {
  const computed = computeCommitHash(matchId, round, playerAddress, action, salt);
  return computed === commitHash;
}

/**
 * Generate a random 32-byte salt as hex string.
 * Uses Web Crypto API (available in both browser and Node.js 18+).
 */
export function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}
