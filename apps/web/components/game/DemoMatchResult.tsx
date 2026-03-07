"use client";

import Link from "next/link";
import type { RoundResult } from "@wager-wars/shared";
import { useAccount } from "wagmi";
import { Confetti, GlitchText } from "./Particles";
import { useState, useEffect } from "react";

interface DemoMatchResultProps {
  winner: string | null;
  winReason: string | null;
  roundResults: RoundResult[];
}

const REASON_LABELS: Record<string, string> = {
  ko: "KO!",
  hp_lead: "HP Lead",
  energy_tiebreak: "Energy Tiebreak",
  draw: "Draw",
  forfeit: "Opponent Forfeited",
  timeout: "Timeout",
};

export function DemoMatchResult({ winner, winReason }: DemoMatchResultProps) {
  const { address } = useAccount();
  const [showConfetti, setShowConfetti] = useState(false);

  const isDraw = !winner || winner === "0x0000000000000000000000000000000000000000";
  const isWinner = !isDraw && address && winner.toLowerCase() === address.toLowerCase();

  useEffect(() => {
    if (isWinner) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isWinner]);

  return (
    <div className="text-center py-8 relative">
      {showConfetti && <Confetti count={40} />}

      {/* Result text */}
      <div className="mb-2">
        {isDraw ? (
          <div className="animate-draw text-7xl font-black text-yellow-400" style={{ textShadow: "0 0 40px rgba(234,179,8,0.4)" }}>
            DRAW
          </div>
        ) : isWinner ? (
          <div className="animate-victory text-7xl font-black text-green-400" style={{ textShadow: "0 0 40px rgba(34,197,94,0.4)" }}>
            VICTORY
          </div>
        ) : (
          <GlitchText className="text-7xl font-black text-red-400 animate-defeat">
            <span style={{ textShadow: "0 0 40px rgba(239,68,68,0.4)" }}>DEFEAT</span>
          </GlitchText>
        )}
      </div>

      {winReason && (
        <p className="text-lg text-gray-400 mb-6 animate-fade-in-up" style={{ animationDelay: "0.3s", opacity: 0 }}>
          {REASON_LABELS[winReason] || winReason}
        </p>
      )}

      {/* Demo badge */}
      <div className="animate-fade-in-up max-w-sm mx-auto mb-8" style={{ animationDelay: "0.5s", opacity: 0 }}>
        <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-900/20 to-yellow-800/5 p-5">
          <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-3 py-1 mb-3">
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="text-yellow-400 text-xs font-bold">DEMO MATCH</span>
          </div>
          <p className="text-gray-400 text-sm">
            Practice match — no real USDC wagered.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 justify-center animate-fade-in-up" style={{ animationDelay: "0.7s", opacity: 0 }}>
        <Link
          href="/play?demo=true"
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-green-900/30 hover:-translate-y-0.5"
        >
          Try Again
        </Link>
        <Link
          href="/play"
          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-red-900/30 hover:-translate-y-0.5"
        >
          Play for Real
        </Link>
      </div>
    </div>
  );
}
