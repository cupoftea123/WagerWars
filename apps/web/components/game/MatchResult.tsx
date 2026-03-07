"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import type { RematchStatus, SettlementInfo } from "@/hooks/useMatch";
import { Confetti, GlitchText } from "./Particles";

interface MatchResultProps {
  winner: string | null;
  winReason: string | null;
  wagerAmount: number | null;
  settlement: SettlementInfo | null;
  rematchStatus: RematchStatus;
  rematchMatchId: string | null;
  onRequestRematch: () => void;
}

const REASON_LABELS: Record<string, string> = {
  ko: "KO!",
  hp_lead: "HP Lead",
  energy_tiebreak: "Energy Tiebreak",
  draw: "Draw",
  forfeit: "Opponent Forfeited",
  timeout: "Timeout",
};

export function MatchResult({
  winner,
  winReason,
  wagerAmount,
  settlement,
  rematchStatus,
  rematchMatchId,
  onRequestRematch,
}: MatchResultProps) {
  const { address } = useAccount();
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(false);

  const isWinner = winner && address && winner.toLowerCase() === address.toLowerCase();
  const isDraw = winReason === "draw";

  useEffect(() => {
    if (isWinner) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isWinner]);

  const payoutAmount = wagerAmount
    ? isDraw
      ? wagerAmount
      : isWinner
        ? Math.round(wagerAmount * 2 * 0.97 * 100) / 100
        : 0
    : null;

  return (
    <div className="flex flex-col items-center justify-center py-12 relative">
      {showConfetti && <Confetti />}

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
          <GlitchText className="text-7xl font-black text-red-400 animate-defeat" >
            <span style={{ textShadow: "0 0 40px rgba(239,68,68,0.4)" }}>DEFEAT</span>
          </GlitchText>
        )}
      </div>

      {/* Win reason */}
      <div className="text-lg text-gray-400 mb-8 animate-fade-in-up" style={{ animationDelay: "0.3s", opacity: 0 }}>
        {REASON_LABELS[winReason || ""] || winReason}
      </div>

      {/* Payout card — winner */}
      {isWinner && payoutAmount !== null && (
        <div className="animate-fade-in-up w-full max-w-sm mb-6" style={{ animationDelay: "0.5s", opacity: 0 }}>
          <div className="rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/30 to-green-800/10 p-6 text-center">
            {settlement ? (
              <>
                <p className="text-green-400 text-2xl font-black mb-1">
                  +${payoutAmount.toFixed(2)} USDC
                </p>
                <p className="text-green-500/70 text-sm mb-3">Sent to your wallet</p>
                <a
                  href={`https://testnet.snowtrace.io/tx/${settlement.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-400 text-sm hover:text-blue-300 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 1H2C1.45 1 1 1.45 1 2v10c0 .55.45 1 1 1h10c.55 0 1-.45 1-1V9M8 1h5v5M13 1L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  View on Snowtrace
                </a>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-green-400 text-sm">
                  Settling... ${payoutAmount.toFixed(2)} USDC incoming
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payout card — draw */}
      {isDraw && payoutAmount !== null && (
        <div className="animate-fade-in-up w-full max-w-sm mb-6" style={{ animationDelay: "0.5s", opacity: 0 }}>
          <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-900/30 to-yellow-800/10 p-6 text-center">
            {settlement ? (
              <>
                <p className="text-yellow-400 text-2xl font-black mb-1">
                  ${payoutAmount.toFixed(2)} USDC
                </p>
                <p className="text-yellow-500/70 text-sm mb-3">Refunded to your wallet</p>
                <a
                  href={`https://testnet.snowtrace.io/tx/${settlement.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-400 text-sm hover:text-blue-300 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 1H2C1.45 1 1 1.45 1 2v10c0 .55.45 1 1 1h10c.55 0 1-.45 1-1V9M8 1h5v5M13 1L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  View on Snowtrace
                </a>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-yellow-400 text-sm">
                  Settling... ${payoutAmount.toFixed(2)} USDC refund incoming
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rematch declined */}
      {rematchStatus === "declined" && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4 mb-6 text-center">
          <p className="text-red-400 font-bold text-sm">Rematch declined</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 animate-fade-in-up" style={{ animationDelay: "0.7s", opacity: 0 }}>
        {rematchMatchId ? (
          <button
            onClick={() => router.push(`/play/${rematchMatchId}`)}
            className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-green-900/30"
          >
            Go to Rematch
          </button>
        ) : rematchStatus === "requested" ? (
          <button
            disabled
            className="bg-gray-700/50 border border-white/10 text-gray-400 font-bold py-3 px-8 rounded-xl cursor-not-allowed flex items-center gap-2"
          >
            <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Waiting for opponent...
          </button>
        ) : rematchStatus === "declined" ? null : (
          <button
            onClick={onRequestRematch}
            className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-green-900/30 hover:-translate-y-0.5"
          >
            Play Again
          </button>
        )}

        <Link
          href="/play"
          className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 hover:border-white/20 text-white font-bold py-3 px-8 rounded-xl transition-all"
        >
          Back to Lobby
        </Link>
      </div>
    </div>
  );
}
