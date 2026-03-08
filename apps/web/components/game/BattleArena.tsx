"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useMatch } from "@/hooks/useMatch";
import { useDeposit } from "@/hooks/useDeposit";
import { useSocket } from "@/components/providers/SocketProvider";
import { WAGER_WARS_ADDRESS, WAGER_WARS_ABI } from "@/lib/contracts";
import { HealthBar } from "./HealthBar";
import { EnergyBar } from "./EnergyBar";
import { ActionSelector } from "./ActionSelector";
import { RoundHistory } from "./RoundResult";
import { MatchResult } from "./MatchResult";
import { DemoMatchResult } from "./DemoMatchResult";
import { CircleTimer } from "./CircleTimer";
import {
  useBattleEffects,
  DamageFlash,
  FloatingDamageNumbers,
  RoundTransitionOverlay,
} from "./BattleEffects";
import { RoundModifier } from "@wager-wars/shared";

const MODIFIER_INFO: Record<string, { label: string; description: string; color: string; bgColor: string; glowColor: string }> = {
  NONE: { label: "Normal Round", description: "No modifier active", color: "text-gray-400", bgColor: "bg-gray-500/10 border-gray-500/20", glowColor: "rgba(107,114,128,0.1)" },
  POWER_SURGE: { label: "Power Surge", description: "All damage doubled!", color: "text-red-400", bgColor: "bg-red-500/10 border-red-500/30", glowColor: "rgba(239,68,68,0.3)" },
  OVERCHARGE: { label: "Overcharge", description: "Recover grants +6 energy", color: "text-yellow-400", bgColor: "bg-yellow-500/10 border-yellow-500/30", glowColor: "rgba(234,179,8,0.3)" },
  REFLECT: { label: "Reflect", description: "Shield reflects 3 damage", color: "text-cyan-400", bgColor: "bg-cyan-500/10 border-cyan-500/30", glowColor: "rgba(6,182,212,0.3)" },
  TAX: { label: "Tax", description: "Actions cost +1 energy", color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/30", glowColor: "rgba(249,115,22,0.3)" },
};

const REVEAL_TIMEOUT = 15;

interface BattleArenaProps {
  matchId: string;
}

export function BattleArena({ matchId }: BattleArenaProps) {
  const match = useMatch(matchId);
  const router = useRouter();
  const deposit = useDeposit();
  const { socket } = useSocket();
  const phaseRef = useRef(match.phase);
  phaseRef.current = match.phase;
  const effects = useBattleEffects();

  // Track previous HP for damage effects
  const prevYourHpRef = useRef(match.yourHp);
  const prevOpponentHpRef = useRef(match.opponentHp);
  const prevRoundRef = useRef(match.round);

  // Timer key to force reset on phase change
  const [timerKey, setTimerKey] = useState(0);

  // Detect HP changes and trigger effects
  useEffect(() => {
    const yourDamage = prevYourHpRef.current - match.yourHp;
    const oppDamage = prevOpponentHpRef.current - match.opponentHp;
    if (yourDamage > 0 || oppDamage > 0) {
      effects.triggerDamageEffects(
        Math.max(0, yourDamage),
        Math.max(0, oppDamage),
        0,
      );
    }
    prevYourHpRef.current = match.yourHp;
    prevOpponentHpRef.current = match.opponentHp;
  }, [match.yourHp, match.opponentHp]);

  // Round transition effect
  useEffect(() => {
    if (match.round > 0 && match.round !== prevRoundRef.current) {
      effects.triggerRoundTransition(match.round);
      prevRoundRef.current = match.round;
    }
  }, [match.round]);

  // Reset timer on phase change
  useEffect(() => {
    setTimerKey((k) => k + 1);
  }, [match.phase, match.round]);

  // Cancel match on-chain (player1 only)
  const [cancelStep, setCancelStep] = useState<"idle" | "cancelling" | "waiting" | "done" | "error">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { writeContract: writeCancel, data: cancelTxHash } = useWriteContract();
  const { isSuccess: cancelConfirmed, isError: cancelReverted } = useWaitForTransactionReceipt({ hash: cancelTxHash });

  useEffect(() => {
    if (cancelConfirmed && cancelStep === "waiting") {
      setCancelStep("done");
      socket?.emit("cancel_match", { matchId });
      router.push("/play");
    }
  }, [cancelConfirmed, cancelStep, socket, matchId, router]);

  useEffect(() => {
    if (cancelReverted && cancelStep === "waiting") {
      setCancelStep("error");
      setCancelError("Cancel failed — opponent may have already joined");
      setTimeout(() => { setCancelStep("idle"); setCancelError(null); }, 5000);
    }
  }, [cancelReverted, cancelStep]);

  const handleCancelAndClaim = useCallback(() => {
    if (!match.onChainMatchId) return;
    setCancelStep("cancelling");
    setCancelError(null);
    writeCancel(
      {
        address: WAGER_WARS_ADDRESS,
        abi: WAGER_WARS_ABI,
        functionName: "cancelMatch",
        args: [match.onChainMatchId as `0x${string}`],
      },
      {
        onSuccess: () => setCancelStep("waiting"),
        onError: () => {
          setCancelStep("error");
          setCancelError("Wallet rejected or tx failed");
          setTimeout(() => { setCancelStep("idle"); setCancelError(null); }, 5000);
        },
      },
    );
  }, [match.onChainMatchId, writeCancel]);

  const handleLeave = useCallback(() => {
    socket?.emit(match.playerSlot === "player1" ? "cancel_match" : "leave_match", { matchId });
    router.push("/play");
  }, [socket, matchId, match.playerSlot, router]);

  // Auto-redirect on rematch
  useEffect(() => {
    if (match.rematchMatchId) {
      router.push(`/play/${match.rematchMatchId}`);
    }
  }, [match.rematchMatchId, router]);

  // Notify server when leaving completed match
  useEffect(() => {
    return () => {
      if (phaseRef.current === "result" && socket) {
        socket.emit("leave_match", { matchId });
      }
    };
  }, [socket, matchId]);

  const handleDeposit = useCallback(() => {
    if (!match.onChainMatchId || !match.wagerAmount) return;
    const onChainId = match.onChainMatchId as `0x${string}`;
    if (match.playerSlot === "player1") {
      deposit.createMatchOnChain(onChainId, match.wagerAmount);
    } else {
      deposit.joinMatchOnChain(onChainId, match.wagerAmount);
    }
  }, [match.onChainMatchId, match.wagerAmount, match.playerSlot, deposit]);

  /* ======== CANCELLED ======== */
  if (match.phase === "cancelled") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-5xl font-black text-red-400 mb-4" style={{ textShadow: "0 0 30px rgba(239,68,68,0.3)" }}>
            CANCELLED
          </div>
          <p className="text-gray-400 mb-6">{match.error || "Match was cancelled"}</p>
          <button
            onClick={() => router.push("/play")}
            className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-bold py-3 px-8 rounded-xl transition-all"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  /* ======== RESULT ======== */
  if (match.phase === "result") {
    return (
      <div>
        <RoundHistory results={match.roundResults} playerSlot={match.playerSlot} />
        {match.isDemo ? (
          <DemoMatchResult
            winner={match.winner}
            winReason={match.winReason}
            roundResults={match.roundResults}
          />
        ) : (
          <MatchResult
            winner={match.winner}
            winReason={match.winReason}
            wagerAmount={match.wagerAmount}
            settlement={match.settlement}
            rematchStatus={match.rematchStatus}
            rematchMatchId={match.rematchMatchId}
            onRequestRematch={match.requestRematch}
          />
        )}
      </div>
    );
  }

  /* ======== WAITING / DEPOSIT ======== */
  if (match.phase === "waiting") {
    const canDeposit = match.playerSlot === "player1" || match.opponentDeposited;
    const showDepositButton = match.needsDeposit && !match.yourDeposited && match.onChainMatchId && canDeposit;
    const waitingForCreator = match.needsDeposit && !match.yourDeposited && match.onChainMatchId && !canDeposit;
    const isDepositActive = deposit.step !== "idle" && deposit.step !== "error" && deposit.step !== "done";

    const DEPOSIT_STEP_LABELS: Record<string, string> = {
      idle: "",
      approving: "Approving USDC...",
      waiting_approve: "Waiting for approve tx...",
      depositing: "Depositing on-chain...",
      waiting_deposit: "Waiting for deposit tx...",
      done: "Deposit confirmed!",
      error: "Deposit failed",
    };

    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          {/* Animated waiting indicator */}
          <div className="mb-6 flex justify-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
              <div className="absolute inset-0 rounded-full border-2 border-t-red-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-red-500/50 border-b-transparent border-l-transparent animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-red-500/60 animate-pulse" />
              </div>
            </div>
          </div>

          <h2 className="text-xl font-bold mb-2">Preparing Match</h2>

          {waitingForCreator ? (
            <div className="mt-4">
              <p className="text-gray-400 mb-2">Waiting for opponent to deposit first...</p>
              <p className="text-gray-500 text-sm">You can deposit once they confirm on-chain</p>
              <button
                onClick={handleLeave}
                className="mt-6 text-red-400 hover:text-red-300 text-sm transition-colors"
              >
                Leave Match
              </button>
            </div>
          ) : showDepositButton ? (
            <div className="mt-4">
              <div className="glass-card rounded-2xl p-6 mb-4">
                <p className="text-gray-300 mb-1">Wager Amount</p>
                <p className="text-3xl font-black text-white mb-4">${match.wagerAmount} <span className="text-lg text-gray-400">USDC</span></p>

                {deposit.step !== "idle" && (
                  <div className={`mb-4 text-sm ${deposit.step === "error" ? "text-red-400" : "text-yellow-400"} flex items-center justify-center gap-2`}>
                    {deposit.step !== "error" && deposit.step !== "done" && (
                      <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    {DEPOSIT_STEP_LABELS[deposit.step]}
                    {deposit.error && <div className="mt-1 text-xs text-red-400">{deposit.error}</div>}
                  </div>
                )}

                <button
                  onClick={handleDeposit}
                  disabled={isDepositActive || deposit.step === "done"}
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-green-900/30"
                >
                  {isDepositActive ? "Processing..." : deposit.step === "done" ? "Deposited!" : `Deposit $${match.wagerAmount} USDC`}
                </button>
              </div>
              <button
                onClick={handleLeave}
                className="text-red-400 hover:text-red-300 text-sm transition-colors"
              >
                Leave Match
              </button>
            </div>
          ) : match.yourDeposited || deposit.step === "done" ? (
            <div className="mt-4">
              <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-2 mb-4">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8L7 12L13 4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="text-green-400 text-sm font-bold">Your deposit confirmed</span>
              </div>
              <p className="text-gray-400 mb-4">Waiting for opponent to deposit...</p>
              {match.playerSlot === "player1" && (
                <div className="mt-2">
                  <button
                    onClick={handleCancelAndClaim}
                    disabled={cancelStep !== "idle"}
                    className="bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 font-bold py-2 px-6 rounded-xl transition-all text-sm"
                  >
                    {cancelStep === "cancelling"
                      ? "Confirm in wallet..."
                      : cancelStep === "waiting"
                        ? "Cancelling..."
                        : "Leave + Claim Deposit"}
                  </button>
                  {cancelError && <p className="mt-2 text-red-400 text-xs">{cancelError}</p>}
                </div>
              )}
              {match.playerSlot === "player2" && (
                <button
                  onClick={handleLeave}
                  className="mt-2 text-red-400 hover:text-red-300 text-sm transition-colors"
                >
                  Leave Match
                </button>
              )}
            </div>
          ) : (
            <p className="text-gray-400">Both players need to deposit</p>
          )}
        </div>
      </div>
    );
  }

  /* ======== BATTLE (commit / reveal / resolving) ======== */
  const modKey = match.modifier || "NONE";
  const modInfo = MODIFIER_INFO[modKey];
  const hasModifier = match.modifier && match.modifier !== RoundModifier.None;

  return (
    <div className={`relative space-y-4 ${effects.shaking ? "animate-shake" : ""}`}>
      {/* Global effects */}
      <DamageFlash type={effects.flashType} />
      <FloatingDamageNumbers numbers={effects.damageNumbers} />
      <RoundTransitionOverlay round={effects.roundTransition} />

      {/* Demo Badge */}
      {match.isDemo && (
        <div className="text-center">
          <span className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            DEMO MATCH
          </span>
        </div>
      )}

      {/* ── Round Header ── */}
      <div className="text-center">
        {/* Round dots */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {Array.from({ length: 7 }, (_, i) => {
            const roundNum = i + 1;
            const isPast = roundNum < match.round;
            const isCurrent = roundNum === match.round;
            return (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  isCurrent
                    ? "w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30"
                    : isPast
                      ? "w-3 h-3 bg-red-500/60"
                      : "w-3 h-3 bg-gray-700"
                }`}
              >
                {isCurrent && <span className="text-xs font-black text-white">{roundNum}</span>}
              </div>
            );
          })}
        </div>

        {/* Modifier badge */}
        {hasModifier && (
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${modInfo.bgColor} animate-modifier-glow`}
            style={{ "--modifier-color": modInfo.glowColor } as React.CSSProperties}
          >
            <ModifierIcon modifier={modKey} />
            <div className="text-left">
              <div className={`text-xs font-black ${modInfo.color}`}>{modInfo.label}</div>
              <div className="text-[10px] text-gray-400">{modInfo.description}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Opponent Card ── */}
      <div className="glass-card rounded-2xl p-4 relative overflow-hidden">
        {/* Subtle gradient top */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500/30 to-red-600/10 border border-red-500/20 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="6" r="3" stroke="#ef4444" strokeWidth="1.5" fill="none" />
                <path d="M3 16C3 13 6 11 9 11C12 11 15 13 15 16" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-200">Opponent</div>
              {match.opponentCommitted && match.phase === "commit" && (
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-green-400 font-medium">Move locked</span>
                </div>
              )}
            </div>
          </div>

          {/* Timer */}
          {(match.phase === "commit" || match.phase === "reveal") && (
            <CircleTimer
              key={timerKey}
              duration={match.phase === "commit" ? match.commitTimeout : REVEAL_TIMEOUT}
              size={44}
              strokeWidth={3}
            />
          )}
        </div>

        <HealthBar hp={match.opponentHp} label="HP" reversed />
        <div className="mt-2">
          <EnergyBar energy={match.opponentEnergy} label="Energy" />
        </div>
      </div>

      {/* ── Center Arena Area ── */}
      <div className="relative">
        {/* VS divider */}
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/10" />
          <div className="text-xs font-black text-gray-500 tracking-widest">VS</div>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/10" />
        </div>
      </div>

      {/* ── Action Phase ── */}
      <div className="glass-card rounded-2xl p-4 relative overflow-hidden">
        {/* Phase-dependent background accent */}
        {match.phase === "commit" && !match.selectedAction && (
          <div className="absolute inset-0 bg-gradient-to-b from-red-500/[0.03] to-transparent pointer-events-none" />
        )}

        {match.phase === "commit" && (
          <>
            <div className="text-center mb-4">
              {match.selectedAction ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-300">
                    Waiting for opponent...
                  </span>
                </div>
              ) : (
                <div className="text-sm font-bold text-gray-300">Choose your action</div>
              )}
            </div>
            <ActionSelector
              energy={match.yourEnergy}
              modifier={match.modifier}
              onSelect={match.commitAction}
              disabled={!match.isYourTurn}
              selectedAction={match.selectedAction}
            />
          </>
        )}

        {(match.phase === "reveal" || match.phase === "resolving") && (
          <div className="text-center py-6">
            <div className="flex items-center justify-center gap-3">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-ping" />
                <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-spin" style={{ borderTopColor: "transparent", borderLeftColor: "transparent" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                </div>
              </div>
              <span className="text-lg font-bold text-gray-300">Resolving round...</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Your Card ── */}
      <div className="glass-card rounded-2xl p-4 relative overflow-hidden">
        {/* Subtle gradient bottom */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

        <div className="flex items-center gap-3 mb-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="6" r="3" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
              <path d="M3 16C3 13 6 11 9 11C12 11 15 13 15 16" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-200">You</div>
            {match.selectedAction && (
              <div className="flex items-center gap-1 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-[10px] text-green-400 font-medium">{match.selectedAction}</span>
              </div>
            )}
          </div>
        </div>

        <HealthBar hp={match.yourHp} label="HP" />
        <div className="mt-2">
          <EnergyBar energy={match.yourEnergy} label="Energy" />
        </div>
      </div>

      {/* ── Round History ── */}
      <RoundHistory results={match.roundResults} playerSlot={match.playerSlot} />

      {/* ── Error ── */}
      {match.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-red-400 text-sm flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="4" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="12" r="1" fill="currentColor"/></svg>
          {match.error}
        </div>
      )}

      {/* ── Forfeit ── */}
      <div className="text-center pt-2">
        <button
          onClick={match.forfeit}
          className="text-gray-600 hover:text-red-400 text-xs transition-colors"
        >
          Forfeit Match
        </button>
      </div>
    </div>
  );
}

function ModifierIcon({ modifier }: { modifier: string }) {
  const size = 16;
  switch (modifier) {
    case "POWER_SURGE":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M9 1L3 9H8L7 15L13 7H8L9 1Z" fill="#ef4444" opacity="0.9" />
        </svg>
      );
    case "OVERCHARGE":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <rect x="4" y="3" width="8" height="10" rx="1" stroke="#eab308" strokeWidth="1.5" fill="none" />
          <rect x="6" y="1" width="4" height="2" rx="0.5" fill="#eab308" />
          <rect x="6" y="6" width="4" height="4" rx="0.5" fill="#eab308" opacity="0.6" />
        </svg>
      );
    case "REFLECT":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M4 2L12 8L4 14Z" stroke="#06b6d4" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          <path d="M8 5L12 8L8 11" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
        </svg>
      );
    case "TAX":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="6" cy="6" r="3" stroke="#f97316" strokeWidth="1.5" fill="none" />
          <circle cx="10" cy="10" r="3" stroke="#f97316" strokeWidth="1.5" fill="none" />
          <line x1="12" y1="2" x2="4" y2="14" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
