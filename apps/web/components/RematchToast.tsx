"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket } from "@/components/providers/SocketProvider";
import { useRouter } from "next/navigation";

const INVITE_DURATION = 15_000; // 15 seconds

interface RematchInvite {
  matchId: string;
  fromAddress: string;
  wagerAmount: number;
}

export function RematchToast() {
  const { socket } = useSocket();
  const router = useRouter();
  const [invite, setInvite] = useState<RematchInvite | null>(null);
  const [progress, setProgress] = useState(100);
  const [accepting, setAccepting] = useState(false);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inviteRef = useRef<RematchInvite | null>(null);
  const acceptingRef = useRef(false);

  // Keep ref in sync for use in socket callbacks
  useEffect(() => {
    inviteRef.current = invite;
  }, [invite]);

  useEffect(() => {
    if (!socket) return;

    const handleInvite = (data: RematchInvite) => {
      setInvite(data);
      setAccepting(false);
      acceptingRef.current = false;
      startTimeRef.current = Date.now();
      setProgress(100);
    };

    const handleCreated = (data: { matchId: string }) => {
      // If we're the acceptor (have active invite or already clicked Accept), navigate
      if ((inviteRef.current || acceptingRef.current) && data?.matchId) {
        acceptingRef.current = false;
        setInvite(null);
        router.push(`/play/${data.matchId}`);
      }
      // If we're the requester, useMatch/BattleArena handles the redirect
    };

    socket.on("rematch_invite" as any, handleInvite);
    socket.on("rematch_created" as any, handleCreated);

    return () => {
      socket.off("rematch_invite" as any, handleInvite);
      socket.off("rematch_created" as any, handleCreated);
    };
  }, [socket, router]);

  // Progress bar countdown
  useEffect(() => {
    if (!invite) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / INVITE_DURATION) * 100);
      setProgress(remaining);

      if (remaining <= 0 && !acceptingRef.current) {
        // Auto-decline on timeout (skip if already accepted)
        if (socket && inviteRef.current) {
          socket.emit("decline_rematch" as any, { matchId: inviteRef.current.matchId });
        }
        setInvite(null);
      }
    }, 50);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [invite, socket]);

  const handleAccept = useCallback(() => {
    if (!socket || !invite) return;
    setAccepting(true);
    acceptingRef.current = true;
    // Stop countdown timer — prevent auto-decline while waiting for server response
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    socket.emit("accept_rematch" as any, { matchId: invite.matchId });
  }, [socket, invite]);

  const handleDecline = useCallback(() => {
    if (!socket || !invite) return;
    socket.emit("decline_rematch" as any, { matchId: invite.matchId });
    setInvite(null);
  }, [socket, invite]);

  if (!invite) return null;

  const addr = invite.fromAddress;
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-gray-800 border border-gray-600 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-right">
      <div className="p-4">
        <p className="text-white font-bold mb-1">Rematch Invite</p>
        <p className="text-gray-400 text-sm mb-3">
          <span className="text-white">{shortAddr}</span> wants a rematch
          <span className="text-white font-bold"> &mdash; ${invite.wagerAmount} USDC</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold py-2 rounded-lg transition-colors text-sm"
          >
            {accepting ? "Joining..." : "Accept"}
          </button>
          <button
            onClick={handleDecline}
            disabled={accepting}
            className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors text-sm"
          >
            Decline
          </button>
        </div>
      </div>
      {/* Progress bar — shrinks from right to left */}
      <div className="h-1 bg-gray-700">
        <div
          className="h-full bg-gray-400"
          style={{ width: `${progress}%`, transition: "none" }}
        />
      </div>
    </div>
  );
}
