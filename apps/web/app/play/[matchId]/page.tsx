"use client";

import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { BattleArena } from "@/components/game/BattleArena";

export default function MatchPage({ params }: { params: { matchId: string } }) {
  const { matchId } = params;

  return (
    <main className="flex-1 max-w-lg md:max-w-4xl mx-auto w-full px-4 py-4 md:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="group flex items-center gap-1.5">
          <span className="text-lg font-black text-white group-hover:text-gray-300 transition-colors">WAGER</span>
          <span className="text-lg font-black text-gradient-red">WARS</span>
        </Link>
        <WalletButton />
      </div>

      <BattleArena matchId={matchId} />
    </main>
  );
}
