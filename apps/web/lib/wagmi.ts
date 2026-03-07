"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { type Config } from "wagmi";
import { avalancheFuji, avalanche } from "wagmi/chains";

export const wagmiConfig: Config = getDefaultConfig({
  appName: "Wager Wars",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [avalancheFuji, avalanche],
  ssr: true,
});
