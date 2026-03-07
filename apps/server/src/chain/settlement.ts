import { keccak256, toHex, encodePacked } from "viem";
import { getSettlementAccount, getWalletClient, publicClient } from "./provider.js";
import { config } from "../config.js";

// EIP-712 domain for settlement signing
function getDomain() {
  return {
    name: "WagerWars",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.wagerWarsAddress!,
  } as const;
}

const SETTLEMENT_TYPES = {
  Settlement: [
    { name: "matchId", type: "bytes32" },
    { name: "winner", type: "address" },
  ],
} as const;

/**
 * Sign a settlement result with EIP-712.
 * Returns the signature that can be submitted to the contract.
 */
export async function signSettlement(
  matchId: string,
  winnerAddress: string,
): Promise<string> {
  const account = getSettlementAccount();

  // Convert matchId (UUID) to bytes32
  const matchIdBytes32 = keccak256(toHex(matchId));

  const signature = await account.signTypedData({
    domain: getDomain(),
    types: SETTLEMENT_TYPES,
    primaryType: "Settlement",
    message: {
      matchId: matchIdBytes32,
      winner: winnerAddress as `0x${string}`,
    },
  });

  return signature;
}

/**
 * Submit settlement transaction on-chain (server auto-settlement).
 * Returns the transaction hash.
 */
export async function submitSettlement(
  matchId: string,
  winnerAddress: string,
  signature: string,
): Promise<string> {
  if (!config.wagerWarsAddress) {
    throw new Error("WAGER_WARS_ADDRESS not configured");
  }

  const walletClient = getWalletClient();
  const matchIdBytes32 = keccak256(toHex(matchId));

  // WagerWars.settleMatch ABI
  const hash = await walletClient.writeContract({
    address: config.wagerWarsAddress,
    abi: [{
      name: "settleMatch",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "matchId", type: "bytes32" },
        { name: "winner", type: "address" },
        { name: "signature", type: "bytes" },
      ],
      outputs: [],
    }],
    functionName: "settleMatch",
    args: [
      matchIdBytes32,
      winnerAddress as `0x${string}`,
      signature as `0x${string}`,
    ],
  });

  console.log(`[Settlement] Submitted tx: ${hash}`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[Settlement] Confirmed in block ${receipt.blockNumber}`);

  return hash;
}

/** Convert matchId (UUID string) to bytes32 for on-chain use */
export function matchIdToBytes32(matchId: string): `0x${string}` {
  return keccak256(toHex(matchId));
}
