"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { USDC_ADDRESS, ERC20_ABI } from "@/lib/contracts";

export function WalletButton({ showBalance = true }: { showBalance?: boolean }) {
  const { address, isConnected } = useAccount();

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isConnected && showBalance && !!address, refetchInterval: 10_000 },
  });

  if (!isConnected || !showBalance) {
    return <ConnectButton showBalance={false} />;
  }

  const formatted = usdcBalance !== undefined
    ? parseFloat(formatUnits(usdcBalance as bigint, 6)).toFixed(2)
    : "...";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-300 font-mono">{formatted} USDC</span>
      <ConnectButton showBalance={false} />
    </div>
  );
}
