import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  chainId: parseInt(process.env.CHAIN_ID || "43113", 10),
  rpcUrl: process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
  wagerWarsAddress: process.env.WAGER_WARS_ADDRESS as `0x${string}` | undefined,
  usdcAddress: (process.env.USDC_ADDRESS || "0x5425890298aed601595a70AB815c96711a31Bc65") as `0x${string}`,
  settlementPrivateKey: process.env.SETTLEMENT_PRIVATE_KEY as `0x${string}` | undefined,
  commitTimeoutMs: 30_000,   // 30 seconds to commit
  revealTimeoutMs: 15_000,   // 15 seconds to reveal
} as const;
