"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { WalletButton } from "@/components/WalletButton";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSocket } from "@/components/providers/SocketProvider";
import { useDeposit } from "@/hooks/useDeposit";
import { WAGER_WARS_ADDRESS, WAGER_WARS_ABI } from "@/lib/contracts";
import type { MatchSummary } from "@wager-wars/shared";

const WAGER_TIERS = [0.1, 1, 5, 10, 25, 50];

type LobbyState =
  | { type: "browsing" }
  | { type: "creating" }
  | { type: "need_deposit_create"; matchId: string; onChainMatchId: `0x${string}`; wagerAmount: number; opponentDeposited: boolean }
  | { type: "waiting_opponent"; matchId: string; onChainMatchId: `0x${string}`; yourDeposited: boolean; opponentDeposited: boolean }
  | { type: "need_deposit_join"; matchId: string; onChainMatchId: `0x${string}`; wagerAmount: number; opponentDeposited: boolean }
  | { type: "waiting_deposits_join"; matchId: string; yourDeposited: boolean; opponentDeposited: boolean };

const STEP_LABELS: Record<string, string> = {
  idle: "",
  approving: "Approving USDC...",
  waiting_approve: "Waiting for approve tx...",
  depositing: "Depositing on-chain...",
  waiting_deposit: "Waiting for deposit tx...",
  done: "Deposit confirmed!",
  error: "Deposit failed",
};

export default function LobbyPage() {
  const { address, isConnected } = useAccount();
  const { socket, isAuthenticated, needsSignature, requestSignature } = useSocket();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deposit = useDeposit();

  const isDemo = searchParams.get("demo") === "true";
  const [demoStarted, setDemoStarted] = useState(false);

  const [openMatches, setOpenMatches] = useState<MatchSummary[]>([]);
  const [selectedWager, setSelectedWager] = useState(0.1);
  const [lobbyState, setLobbyState] = useState<LobbyState>({ type: "browsing" });

  // Active match banner state (replaces auto-redirect)
  const [activeMatch, setActiveMatch] = useState<{
    matchId: string;
    onChainMatchId: string;
    wagerAmount: number;
    status: string;
    playerSlot: "player1" | "player2";
  } | null>(null);
  const activeMatchRef = useRef(activeMatch);
  activeMatchRef.current = activeMatch;

  // Demo mode: auto-start a demo match when authenticated
  useEffect(() => {
    if (!isDemo || !socket || !isAuthenticated || demoStarted) return;
    setDemoStarted(true);

    socket.emit("start_demo_match" as any);

    const handleDemoMatchCreated = (data: any) => {
      if (data.isDemo) {
        router.push(`/play/${data.matchId}`);
      }
    };
    socket.on("match_created", handleDemoMatchCreated);

    return () => {
      socket.off("match_created", handleDemoMatchCreated);
    };
  }, [isDemo, socket, isAuthenticated, demoStarted, router]);

  // Cancel match on-chain (shared for banner + inline waiting section)
  const [cancelStep, setCancelStep] = useState<"idle" | "cancelling" | "waiting" | "done" | "error">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { writeContract: writeCancel, data: cancelTxHash } = useWriteContract();
  const { isSuccess: cancelConfirmed, isError: cancelReverted } = useWaitForTransactionReceipt({ hash: cancelTxHash });

  // Cancel tx confirmed on-chain
  useEffect(() => {
    if (cancelConfirmed && cancelStep === "waiting") {
      setCancelStep("done");
      // Clean up: emit cancel_match to server for whichever match was being cancelled
      const matchId = activeMatch?.matchId
        || (lobbyState.type === "waiting_opponent" ? lobbyState.matchId : null);
      if (matchId) socket?.emit("cancel_match", { matchId });
      setActiveMatch(null);
      setLobbyState({ type: "browsing" });
      deposit.reset();
      setCancelStep("idle");
    }
  }, [cancelConfirmed, cancelStep, activeMatch, lobbyState, socket, deposit]);

  // Cancel tx reverted on-chain (e.g., match already Funded)
  useEffect(() => {
    if (cancelReverted && cancelStep === "waiting") {
      setCancelStep("error");
      setCancelError("Cancel failed — opponent may have already joined");
      setTimeout(() => {
        setCancelStep("idle");
        setCancelError(null);
      }, 5000);
    }
  }, [cancelReverted, cancelStep]);

  const doCancelOnChain = useCallback((onChainMatchId: string) => {
    setCancelStep("cancelling");
    setCancelError(null);
    writeCancel(
      {
        address: WAGER_WARS_ADDRESS,
        abi: WAGER_WARS_ABI,
        functionName: "cancelMatch",
        args: [onChainMatchId as `0x${string}`],
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
  }, [writeCancel]);

  // Banner cancel handler
  const handleBannerCancel = useCallback(() => {
    if (!activeMatch?.onChainMatchId) return;
    doCancelOnChain(activeMatch.onChainMatchId);
  }, [activeMatch, doCancelOnChain]);

  // Check for active match on load — show banner instead of redirect
  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    socket.emit("get_active_match" as any);

    const handleActiveMatch = (data: any) => {
      if (data && data.matchId) {
        setActiveMatch(data);
      } else {
        setActiveMatch(null);
      }
    };
    socket.on("active_match" as any, handleActiveMatch);

    return () => {
      socket.off("active_match" as any, handleActiveMatch);
    };
  }, [socket, isAuthenticated]);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    socket.emit("get_open_matches");

    // Named handlers so socket.off() removes only OUR listener, not all listeners
    const handleOpenMatches = (matches: any) => {
      setOpenMatches(matches);
    };

    // Creator: match created on server, now need to deposit on-chain
    const handleMatchCreated = (data: any) => {
      setLobbyState({
        type: "need_deposit_create",
        matchId: data.matchId,
        onChainMatchId: data.onChainMatchId,
        wagerAmount: data.wagerAmount,
        opponentDeposited: false,
      });
    };

    // Joiner: match joined on server, now need to deposit on-chain
    const handleMatchJoined = (data: any) => {
      setLobbyState({
        type: "need_deposit_join",
        matchId: data.matchId,
        onChainMatchId: data.onChainMatchId,
        wagerAmount: data.wagerAmount,
        opponentDeposited: false,
      });
    };

    // Server confirms a deposit (yours or opponent's)
    const handleDepositConfirmed = (data: any) => {
      const who = data.player as "you" | "opponent";
      setLobbyState((prev) => {
        // Still in need_deposit state — only update opponent flag, don't change state type
        // (changing type would remove the deposit button)
        if (prev.type === "need_deposit_create") {
          if (who === "opponent") {
            return { ...prev, opponentDeposited: true };
          }
          // "you" confirmed server-side → transition to waiting
          return {
            type: "waiting_opponent",
            matchId: prev.matchId,
            onChainMatchId: prev.onChainMatchId,
            yourDeposited: true,
            opponentDeposited: prev.opponentDeposited,
          };
        }
        if (prev.type === "need_deposit_join") {
          if (who === "opponent") {
            return { ...prev, opponentDeposited: true };
          }
          return {
            type: "waiting_deposits_join",
            matchId: prev.matchId,
            yourDeposited: true,
            opponentDeposited: prev.opponentDeposited,
          };
        }
        // Already in waiting state — just update flags
        if (prev.type === "waiting_opponent") {
          return {
            ...prev,
            yourDeposited: who === "you" ? true : prev.yourDeposited,
            opponentDeposited: who === "opponent" ? true : prev.opponentDeposited,
          };
        }
        if (prev.type === "waiting_deposits_join") {
          return {
            ...prev,
            yourDeposited: who === "you" ? true : prev.yourDeposited,
            opponentDeposited: who === "opponent" ? true : prev.opponentDeposited,
          };
        }
        return prev;
      });
    };

    // Opponent joined (for creator) - still need deposits
    const handleOpponentJoined = () => {
      // Don't redirect — just wait for deposits
    };

    // Both deposited → game starts → redirect to match
    const handleRoundStart = () => {
      setLobbyState((prev) => {
        if ("matchId" in prev && prev.matchId) {
          router.push(`/play/${prev.matchId}`);
          return prev;
        }
        // Also redirect if we have an active match from the banner
        // (lobbyState is "browsing" but activeMatch is set)
        const am = activeMatchRef.current;
        if (am?.matchId) {
          router.push(`/play/${am.matchId}`);
        }
        return prev;
      });
    };

    // Deposit status update from server — update deposit flags without changing state type
    const handleDepositRequired = (data: any) => {
      setLobbyState((prev) => {
        if (prev.type === "need_deposit_create" || prev.type === "need_deposit_join") {
          return { ...prev, opponentDeposited: data.opponentDeposited ?? prev.opponentDeposited };
        }
        return prev;
      });
    };

    // Match cancelled by opponent or server — clear stale state
    const handleMatchCancelled = () => {
      setActiveMatch(null);
      setLobbyState({ type: "browsing" });
      deposit.reset();
    };

    socket.on("open_matches", handleOpenMatches);
    socket.on("match_created", handleMatchCreated);
    socket.on("match_joined", handleMatchJoined);
    socket.on("deposit_confirmed", handleDepositConfirmed);
    socket.on("opponent_joined", handleOpponentJoined);
    socket.on("round_start", handleRoundStart);
    socket.on("deposit_required", handleDepositRequired);
    socket.on("match_cancelled", handleMatchCancelled);

    // Poll for open matches
    const interval = setInterval(() => {
      socket.emit("get_open_matches");
    }, 3000);

    return () => {
      clearInterval(interval);
      // IMPORTANT: Pass specific handler to socket.off() — otherwise ALL listeners
      // for that event are removed, breaking other components (e.g. useMatch on match page)
      socket.off("open_matches", handleOpenMatches);
      socket.off("match_created", handleMatchCreated);
      socket.off("match_joined", handleMatchJoined);
      socket.off("deposit_confirmed", handleDepositConfirmed);
      socket.off("opponent_joined", handleOpponentJoined);
      socket.off("round_start", handleRoundStart);
      socket.off("deposit_required", handleDepositRequired);
      socket.off("match_cancelled", handleMatchCancelled);
    };
  }, [socket, isAuthenticated, router, deposit]);

  const createMatch = useCallback(() => {
    if (!socket || !isAuthenticated) return;
    setLobbyState({ type: "creating" });
    socket.emit("create_match", { wagerAmount: selectedWager });
  }, [socket, isAuthenticated, selectedWager]);

  const joinMatch = useCallback((matchId: string) => {
    if (!socket || !isAuthenticated) return;
    socket.emit("join_match", { matchId });
  }, [socket, isAuthenticated]);

  const handleDepositCreate = useCallback(() => {
    if (lobbyState.type !== "need_deposit_create") return;
    deposit.createMatchOnChain(lobbyState.onChainMatchId, lobbyState.wagerAmount);
  }, [lobbyState, deposit]);

  const handleDepositJoin = useCallback(() => {
    if (lobbyState.type !== "need_deposit_join") return;
    deposit.joinMatchOnChain(lobbyState.onChainMatchId, lobbyState.wagerAmount);
  }, [lobbyState, deposit]);

  // When deposit.step reaches "done", move to waiting state (carry over opponent status)
  useEffect(() => {
    if (deposit.step !== "done") return;
    setLobbyState((prev) => {
      if (prev.type === "need_deposit_create") {
        return {
          type: "waiting_opponent",
          matchId: prev.matchId,
          onChainMatchId: prev.onChainMatchId,
          yourDeposited: true,
          opponentDeposited: prev.opponentDeposited,
        };
      }
      if (prev.type === "need_deposit_join") {
        return {
          type: "waiting_deposits_join",
          matchId: prev.matchId,
          yourDeposited: true,
          opponentDeposited: prev.opponentDeposited,
        };
      }
      return prev;
    });
  }, [deposit.step]);

  const cancelMatch = useCallback(() => {
    if (!socket) return;

    // If player1 has deposited, need on-chain cancelMatch to reclaim USDC
    if (lobbyState.type === "waiting_opponent" && lobbyState.yourDeposited) {
      doCancelOnChain(lobbyState.onChainMatchId);
      return; // useEffect handles cleanup after tx confirms
    }

    // No deposit to reclaim — just server-side cleanup
    if ("matchId" in lobbyState && lobbyState.matchId) {
      socket.emit("cancel_match", { matchId: lobbyState.matchId });
    }
    setLobbyState({ type: "browsing" });
    deposit.reset();
  }, [socket, lobbyState, deposit, doCancelOnChain]);

  if (!isConnected) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-bold text-gray-300">
          {isDemo ? "Connect your wallet to start the demo" : "Connect your wallet to play"}
        </h2>
        <ConnectButton />
      </main>
    );
  }

  // Demo mode: show loading while creating demo match
  if (isDemo && demoStarted) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-yellow-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-yellow-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-yellow-400/60 animate-pulse" />
            </div>
          </div>
          <p className="text-lg font-bold text-yellow-400 mb-2">Starting demo match...</p>
          <p className="text-gray-500 text-sm">Setting up a practice match against a bot opponent</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5">
            <span className="text-lg font-black text-white">WAGER</span>
            <span className="text-lg font-black text-gradient-red">WARS</span>
          </Link>
          <div className="w-px h-5 bg-white/10" />
          <span className="text-gray-500 text-sm font-medium">Lobby</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/profile" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Profile</Link>
          <WalletButton />
        </div>
      </div>

      {!isAuthenticated && needsSignature && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-900/10 p-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-yellow-400 text-sm font-bold">Signature required</p>
              <p className="text-gray-500 text-xs mt-0.5">Tap the button, then confirm the signature in your wallet app.</p>
            </div>
            <button
              onClick={requestSignature}
              className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-400 font-bold text-sm py-2 px-5 rounded-xl transition-all flex-shrink-0"
            >
              Sign
            </button>
          </div>
        </div>
      )}
      {!isAuthenticated && !needsSignature && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-900/10 p-4 mb-6 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-yellow-400 text-sm">Authenticating with server... Sign the message in your wallet.</p>
        </div>
      )}

      {/* Active Match Banner */}
      {activeMatch && (
        <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-r from-yellow-900/10 to-orange-900/5 p-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
              </div>
              <div>
                <p className="text-yellow-400 font-bold text-sm">
                  Active Match &mdash; ${activeMatch.wagerAmount} USDC
                </p>
                <p className="text-gray-500 text-xs">
                  {activeMatch.status === "WAITING_FOR_OPPONENT" ? "Waiting for opponent"
                    : activeMatch.status === "WAITING_FOR_DEPOSITS" ? "Waiting for deposits"
                    : activeMatch.status === "IN_PROGRESS" ? "In progress"
                    : activeMatch.status}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => router.push(`/play/${activeMatch.matchId}`)}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold text-sm py-2 px-5 rounded-xl transition-all"
              >
                Join
              </button>
              {(activeMatch.status === "WAITING_FOR_OPPONENT" || activeMatch.status === "WAITING_FOR_DEPOSITS") && (
                activeMatch.playerSlot === "player1" ? (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={handleBannerCancel}
                      disabled={cancelStep !== "idle"}
                      className="bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 font-bold text-sm py-2 px-5 rounded-xl transition-all"
                    >
                      {cancelStep === "cancelling" ? "Confirm..." : cancelStep === "waiting" ? "Cancelling..." : "Cancel"}
                    </button>
                    {cancelError && <p className="text-red-400 text-[10px]">{cancelError}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      socket?.emit("leave_match", { matchId: activeMatch.matchId });
                      setActiveMatch(null);
                    }}
                    className="bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-bold text-sm py-2 px-5 rounded-xl transition-all"
                  >
                    Leave
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Match */}
      <div className="glass-card rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold mb-4">Create Match</h2>

        {lobbyState.type === "browsing" || lobbyState.type === "creating" ? (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {WAGER_TIERS.map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedWager(tier)}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                    selectedWager === tier
                      ? "bg-red-600/15 text-red-400 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                      : "bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12]"
                  }`}
                >
                  ${tier}
                </button>
              ))}
            </div>
            <button
              onClick={createMatch}
              disabled={lobbyState.type === "creating" || !isAuthenticated}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-900/20"
            >
              {lobbyState.type === "creating" ? "Creating..." : `Create Match — $${selectedWager} USDC`}
            </button>
          </>
        ) : lobbyState.type === "need_deposit_create" ? (
          <DepositSection
            wagerAmount={lobbyState.wagerAmount}
            depositStep={deposit.step}
            depositError={deposit.error}
            onDeposit={handleDepositCreate}
            onCancel={cancelMatch}
            label="Deposit to create match"
            opponentDeposited={lobbyState.opponentDeposited}
          />
        ) : lobbyState.type === "waiting_opponent" ? (
          <WaitingSection
            matchId={lobbyState.matchId}
            yourDeposited={lobbyState.yourDeposited}
            opponentDeposited={lobbyState.opponentDeposited}
            onCancel={cancelMatch}
            cancelStep={cancelStep}
            cancelError={cancelError}
          />
        ) : lobbyState.type === "need_deposit_join" ? (
          <DepositSection
            wagerAmount={lobbyState.wagerAmount}
            depositStep={deposit.step}
            depositError={deposit.error}
            onDeposit={handleDepositJoin}
            onCancel={cancelMatch}
            label="Deposit to join match"
            opponentDeposited={lobbyState.opponentDeposited}
          />
        ) : lobbyState.type === "waiting_deposits_join" ? (
          <div className="text-center py-4">
            <div className="animate-pulse text-xl mb-2">Waiting for opponent to deposit...</div>
            <DepositStatus yours={lobbyState.yourDeposited} opponent={lobbyState.opponentDeposited} />
            <button onClick={cancelMatch} className="mt-4 text-red-400 hover:text-red-300 text-sm">
              Leave match
            </button>
          </div>
        ) : null}
      </div>

      {/* Open Matches — only show when browsing */}
      {(lobbyState.type === "browsing" || lobbyState.type === "creating") && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Open Matches</h2>
            {openMatches.length > 0 && (
              <span className="text-xs text-gray-500 bg-white/[0.04] px-2.5 py-1 rounded-full">{openMatches.length}</span>
            )}
          </div>

          {openMatches.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="#4b5563" strokeWidth="1.5" fill="none"/>
                  <path d="M10 6v4l3 2" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-gray-500 text-sm">No open matches. Create one!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openMatches.map((match) => (
                <div
                  key={match.matchId}
                  className="flex items-center justify-between rounded-xl p-4 bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600/30 to-gray-700/30 border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="6" r="3" stroke="#9ca3af" strokeWidth="1.5" fill="none"/>
                        <path d="M3 16C3 13 6 11 9 11 12 11 15 13 15 16" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      </svg>
                    </div>
                    <div>
                      <div className="font-mono text-xs text-gray-500">
                        {match.creatorAddress.slice(0, 6)}...{match.creatorAddress.slice(-4)}
                      </div>
                      <div className="font-bold text-sm">${match.wagerAmount} USDC</div>
                    </div>
                  </div>
                  <button
                    onClick={() => joinMatch(match.matchId)}
                    disabled={!isAuthenticated || match.creatorAddress.toLowerCase() === address?.toLowerCase()}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold text-sm px-5 py-2 rounded-xl transition-all"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function DepositSection({
  wagerAmount,
  depositStep,
  depositError,
  onDeposit,
  onCancel,
  label,
  opponentDeposited,
}: {
  wagerAmount: number;
  depositStep: string;
  depositError: string | null;
  onDeposit: () => void;
  onCancel: () => void;
  label: string;
  opponentDeposited?: boolean;
}) {
  const isActive = depositStep !== "idle" && depositStep !== "error";

  return (
    <div className="text-center py-4">
      <p className="text-sm font-bold text-gray-300 mb-1">{label}</p>
      <p className="text-gray-500 text-xs mb-4">
        Approve and deposit <span className="text-white font-bold">${wagerAmount} USDC</span> to the smart contract
      </p>

      {opponentDeposited && (
        <div className="mb-3 flex items-center justify-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-xs text-green-400">Opponent has deposited</span>
        </div>
      )}

      {depositStep !== "idle" && (
        <div className={`mb-4 text-sm flex items-center justify-center gap-2 ${depositStep === "error" ? "text-red-400" : "text-yellow-400"}`}>
          {depositStep !== "error" && depositStep !== "done" && (
            <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          )}
          {STEP_LABELS[depositStep]}
          {depositError && <div className="mt-1 text-xs text-red-400">{depositError}</div>}
        </div>
      )}

      <button
        onClick={onDeposit}
        disabled={isActive}
        className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-green-900/20 mb-3"
      >
        {isActive ? "Processing..." : `Deposit $${wagerAmount} USDC`}
      </button>
      <button onClick={onCancel} className="text-red-400 hover:text-red-300 text-xs transition-colors">
        Cancel
      </button>
    </div>
  );
}

function WaitingSection({
  matchId,
  yourDeposited,
  opponentDeposited,
  onCancel,
  cancelStep,
  cancelError,
}: {
  matchId: string;
  yourDeposited: boolean;
  opponentDeposited: boolean;
  onCancel: () => void;
  cancelStep: string;
  cancelError: string | null;
}) {
  return (
    <div className="text-center py-4">
      <div className="relative w-12 h-12 mx-auto mb-4">
        <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
        <div className="absolute inset-0 rounded-full border-2 border-t-red-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-red-500/60 animate-pulse" />
        </div>
      </div>
      <p className="text-sm font-bold mb-2">Waiting for opponent...</p>
      <p className="text-gray-500 text-xs mb-3">Match {matchId.slice(0, 8)}...</p>
      <DepositStatus yours={yourDeposited} opponent={opponentDeposited} />
      {yourDeposited ? (
        <button
          onClick={onCancel}
          disabled={cancelStep !== "idle"}
          className="mt-4 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 font-bold py-2 px-6 rounded-xl transition-all text-sm"
        >
          {cancelStep === "cancelling" ? "Confirm in wallet..." : cancelStep === "waiting" ? "Cancelling..." : "Leave + Claim Deposit"}
        </button>
      ) : (
        <button onClick={onCancel} className="mt-4 text-red-400 hover:text-red-300 text-xs transition-colors">
          Cancel
        </button>
      )}
      {cancelError && <p className="mt-2 text-red-400 text-xs">{cancelError}</p>}
    </div>
  );
}

function DepositStatus({ yours, opponent }: { yours: boolean; opponent: boolean }) {
  return (
    <div className="flex justify-center gap-4 text-xs">
      <div className={`flex items-center gap-1.5 ${yours ? "text-green-400" : "text-gray-500"}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${yours ? "bg-green-400" : "bg-gray-600"}`} />
        {yours ? "Your deposit confirmed" : "Your deposit pending"}
      </div>
      <div className={`flex items-center gap-1.5 ${opponent ? "text-green-400" : "text-gray-500"}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${opponent ? "bg-green-400" : "bg-gray-600"}`} />
        {opponent ? "Opponent confirmed" : "Opponent pending"}
      </div>
    </div>
  );
}
