"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "@/components/providers/SocketProvider";
import {
  Action,
  type RoundModifier,
  type RoundResult,
} from "@wager-wars/shared";
import { computeCommitHash, generateSalt } from "@wager-wars/shared";
import { useAccount } from "wagmi";

export type MatchPhase = "waiting" | "commit" | "reveal" | "resolving" | "result" | "cancelled";
export type RematchStatus = "idle" | "requested" | "declined" | "creating";

export interface SettlementInfo {
  txHash: string;
  onChainMatchId: string;
}

interface MatchHookState {
  phase: MatchPhase;
  round: number;
  modifier: RoundModifier | null;
  yourHp: number;
  yourEnergy: number;
  opponentHp: number;
  opponentEnergy: number;
  opponentCommitted: boolean;
  roundResults: RoundResult[];
  winner: string | null;
  winReason: string | null;
  selectedAction: Action | null;
  error: string | null;
  rematchStatus: RematchStatus;
  rematchMatchId: string | null;
  onChainMatchId: string | null;
  wagerAmount: number | null;
  needsDeposit: boolean;
  yourDeposited: boolean;
  opponentDeposited: boolean;
  playerSlot: "player1" | "player2" | null;
  settlement: SettlementInfo | null;
  isDemo: boolean;
  commitTimeout: number;
}

export function useMatch(matchId: string) {
  const { socket } = useSocket();
  const { address } = useAccount();
  const [state, setState] = useState<MatchHookState>({
    phase: "waiting",
    round: 0,
    modifier: null,
    yourHp: 20,
    yourEnergy: 10,
    opponentHp: 20,
    opponentEnergy: 10,
    opponentCommitted: false,
    roundResults: [],
    winner: null,
    winReason: null,
    selectedAction: null,
    error: null,
    rematchStatus: "idle",
    rematchMatchId: null,
    onChainMatchId: null,
    wagerAmount: null,
    needsDeposit: false,
    yourDeposited: false,
    opponentDeposited: false,
    playerSlot: null,
    settlement: null,
    isDemo: false,
    commitTimeout: 30,
  });

  // Store salt for current round (needed for reveal)
  const currentSaltRef = useRef<string | null>(null);
  const currentActionRef = useRef<Action | null>(null);

  // Request current match state on mount (handles page navigation race condition)
  useEffect(() => {
    if (!socket) return;
    socket.emit("get_match_state" as any, { matchId });
  }, [socket, matchId]);

  useEffect(() => {
    if (!socket) return;

    // Named handlers so socket.off() removes only OUR listener, not all listeners
    // (socket.off("event") without handler removes ALL listeners for that event,
    //  which breaks RematchToast's global rematch_created listener)

    const handleMatchState = (data: any) => {
      if (data.status === "IN_PROGRESS") {
        setState((prev) => ({
          ...prev,
          phase: "commit",
          round: data.round,
          modifier: data.modifier,
          yourHp: data.yourHp,
          yourEnergy: data.yourEnergy,
          opponentHp: data.opponentHp,
          opponentEnergy: data.opponentEnergy,
          roundResults: data.roundResults ?? [],
          selectedAction: null,
          error: null,
          needsDeposit: false,
          onChainMatchId: data.onChainMatchId ?? null,
          wagerAmount: data.wagerAmount ?? null,
          isDemo: data.isDemo ?? false,
        }));
      } else if (data.status === "COMPLETED") {
        setState((prev) => ({
          ...prev,
          phase: "result",
          roundResults: data.roundResults ?? [],
          winner: data.winner,
          winReason: data.winReason,
        }));
      } else if (data.status === "WAITING_FOR_DEPOSITS" || data.status === "WAITING_FOR_OPPONENT") {
        setState((prev) => ({
          ...prev,
          phase: "waiting",
          needsDeposit: true,
          onChainMatchId: data.onChainMatchId ?? null,
          wagerAmount: data.wagerAmount ?? null,
          playerSlot: data.playerSlot ?? null,
        }));
      }

      // Always capture playerSlot if provided
      if (data.playerSlot) {
        setState((prev) => ({ ...prev, playerSlot: data.playerSlot }));
      }
    };

    const handleDepositRequired = (data: any) => {
      setState((prev) => ({
        ...prev,
        needsDeposit: true,
        onChainMatchId: data.onChainMatchId ?? prev.onChainMatchId,
        wagerAmount: data.wagerAmount ?? prev.wagerAmount,
        yourDeposited: data.yourDeposited ?? false,
        opponentDeposited: data.opponentDeposited ?? false,
      }));
    };

    const handleDepositConfirmed = (data: any) => {
      const who = data.player;
      setState((prev) => ({
        ...prev,
        yourDeposited: who === "you" ? true : prev.yourDeposited,
        opponentDeposited: who === "opponent" ? true : prev.opponentDeposited,
      }));
    };

    const handleRoundStart = (data: any) => {
      setState((prev) => ({
        ...prev,
        phase: "commit",
        round: data.round,
        modifier: data.modifier,
        yourHp: data.yourHp,
        yourEnergy: data.yourEnergy,
        opponentHp: data.opponentHp,
        opponentEnergy: data.opponentEnergy,
        opponentCommitted: false,
        selectedAction: null,
        error: null,
        commitTimeout: data.commitTimeout ?? 30,
      }));
      currentSaltRef.current = null;
      currentActionRef.current = null;
    };

    const handleOpponentCommitted = () => {
      setState((prev) => ({ ...prev, opponentCommitted: true }));
    };

    const handleRevealPhase = () => {
      setState((prev) => ({ ...prev, phase: "reveal" }));

      // Auto-reveal (we stored salt and action)
      if (currentActionRef.current && currentSaltRef.current) {
        socket.emit("reveal", {
          matchId,
          action: currentActionRef.current,
          salt: currentSaltRef.current,
        });
        setState((prev) => ({ ...prev, phase: "resolving" }));
      }
    };

    const handleRoundResult = (result: any) => {
      setState((prev) => ({
        ...prev,
        phase: "resolving",
        roundResults: [...prev.roundResults, result],
        yourHp: result.player1HpAfter, // Will be corrected by next round_start
        yourEnergy: result.player1EnergyAfter,
        opponentHp: result.player2HpAfter,
        opponentEnergy: result.player2EnergyAfter,
      }));

      // Brief display before next round
      setTimeout(() => {
        setState((prev) => {
          if (prev.phase === "resolving" && !prev.winner) {
            return prev; // round_start will update phase
          }
          return prev;
        });
      }, 2000);
    };

    const handleMatchResult = (data: any) => {
      setState((prev) => ({
        ...prev,
        phase: "result",
        winner: data.winner,
        winReason: data.winReason,
        wagerAmount: data.wagerAmount ?? prev.wagerAmount,
        settlement: data.settlement?.txHash
          ? { txHash: data.settlement.txHash, onChainMatchId: data.settlement.onChainMatchId }
          : prev.settlement,
      }));
    };

    const handleError = (data: any) => {
      setState((prev) => ({ ...prev, error: data.message }));
    };

    // Rematch events (requester only — acceptor uses RematchToast)
    const handleRematchWaiting = () => {
      setState((prev) => ({ ...prev, rematchStatus: "requested" as RematchStatus }));
    };

    const handleRematchDeclined = () => {
      setState((prev) => ({ ...prev, rematchStatus: "declined" as RematchStatus }));
    };

    const handleRematchCreated = (data: any) => {
      setState((prev) => ({
        ...prev,
        rematchStatus: "creating" as RematchStatus,
        rematchMatchId: data.matchId,
      }));
    };

    const handleMatchCancelled = (data: any) => {
      setState((prev) => ({
        ...prev,
        phase: "cancelled" as MatchPhase,
        error: data?.reason || "Match cancelled",
      }));
    };

    socket.on("match_state" as any, handleMatchState);
    socket.on("deposit_required" as any, handleDepositRequired);
    socket.on("deposit_confirmed", handleDepositConfirmed);
    socket.on("round_start", handleRoundStart);
    socket.on("opponent_committed", handleOpponentCommitted);
    socket.on("reveal_phase", handleRevealPhase);
    socket.on("round_result", handleRoundResult);
    socket.on("match_result", handleMatchResult);
    socket.on("error", handleError);
    socket.on("rematch_waiting" as any, handleRematchWaiting);
    socket.on("rematch_declined" as any, handleRematchDeclined);
    socket.on("rematch_created" as any, handleRematchCreated);
    socket.on("match_cancelled", handleMatchCancelled);

    return () => {
      // IMPORTANT: Pass specific handler to socket.off() — otherwise ALL listeners
      // for that event are removed, breaking other components (e.g. RematchToast)
      socket.off("match_state" as any, handleMatchState);
      socket.off("deposit_required" as any, handleDepositRequired);
      socket.off("deposit_confirmed", handleDepositConfirmed);
      socket.off("round_start", handleRoundStart);
      socket.off("opponent_committed", handleOpponentCommitted);
      socket.off("reveal_phase", handleRevealPhase);
      socket.off("round_result", handleRoundResult);
      socket.off("match_result", handleMatchResult);
      socket.off("error", handleError);
      socket.off("rematch_waiting" as any, handleRematchWaiting);
      socket.off("rematch_declined" as any, handleRematchDeclined);
      socket.off("rematch_created" as any, handleRematchCreated);
      socket.off("match_cancelled", handleMatchCancelled);
    };
  }, [socket, matchId]);

  const commitAction = useCallback(
    (action: Action) => {
      if (!socket || !address) return;

      const salt = generateSalt();
      const commitHash = computeCommitHash(matchId, state.round, address, action, salt);

      currentSaltRef.current = salt;
      currentActionRef.current = action;

      socket.emit("commit", { matchId, commitHash });
      setState((prev) => ({ ...prev, selectedAction: action }));
    },
    [socket, address, matchId, state.round],
  );

  const forfeit = useCallback(() => {
    if (!socket) return;
    socket.emit("leave_match", { matchId });
  }, [socket, matchId]);

  const requestRematch = useCallback(() => {
    if (!socket) return;
    socket.emit("request_rematch" as any, { matchId });
    setState((prev) => ({ ...prev, rematchStatus: "requested" as RematchStatus }));
  }, [socket, matchId]);

  return {
    ...state,
    commitAction,
    forfeit,
    requestRematch,
    isYourTurn: state.phase === "commit" && !state.selectedAction,
  };
}
