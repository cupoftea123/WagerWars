import { createPublicClient, createWalletClient, http } from "viem";
import { avalancheFuji, avalanche } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";

const chain = config.chainId === 43114 ? avalanche : avalancheFuji;

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

export function getWalletClient() {
  if (!config.settlementPrivateKey) {
    throw new Error("SETTLEMENT_PRIVATE_KEY not set");
  }
  const account = privateKeyToAccount(config.settlementPrivateKey);
  return createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });
}

export function getSettlementAccount() {
  if (!config.settlementPrivateKey) {
    throw new Error("SETTLEMENT_PRIVATE_KEY not set");
  }
  return privateKeyToAccount(config.settlementPrivateKey);
}
