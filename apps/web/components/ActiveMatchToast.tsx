"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket } from "@/components/providers/SocketProvider";
import { useRouter } from "next/navigation";

const ALERT_DURATION = 30_000; // 30 seconds

interface MatchAlert {
  matchId: string;
  wagerAmount: number;
}

export function ActiveMatchToast() {
  const { socket } = useSocket();
  const router = useRouter();
  const [alert, setAlert] = useState<MatchAlert | null>(null);
  const [progress, setProgress] = useState(100);
  const [forfeiting, setForfeiting] = useState(false);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleMatchStarted = (data: MatchAlert) => {
      setAlert(data);
      setForfeiting(false);
      startTimeRef.current = Date.now();
      setProgress(100);
    };

    socket.on("match_started_alert" as any, handleMatchStarted);

    return () => {
      socket.off("match_started_alert" as any, handleMatchStarted);
    };
  }, [socket]);

  // Progress bar countdown
  useEffect(() => {
    if (!alert) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / ALERT_DURATION) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        // Auto-dismiss — server-side commit timeout will handle forfeit
        setAlert(null);
      }
    }, 50);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [alert]);

  const handleJoin = useCallback(() => {
    if (!alert) return;
    const matchId = alert.matchId;
    setAlert(null);
    router.push(`/play/${matchId}`);
  }, [alert, router]);

  const handleLeave = useCallback(() => {
    if (!socket || !alert) return;
    setForfeiting(true);
    socket.emit("forfeit_from_lobby" as any, { matchId: alert.matchId });
    // Stop countdown
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimeout(() => {
      setAlert(null);
      setForfeiting(false);
    }, 2000);
  }, [socket, alert]);

  if (!alert) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-80 bg-gray-800 border border-red-600/50 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-right">
      <div className="p-4">
        <p className="text-red-400 font-bold mb-1">Your match has started!</p>
        <p className="text-gray-400 text-sm mb-3">
          <span className="text-white font-bold">${alert.wagerAmount} USDC</span> wager
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleJoin}
            disabled={forfeiting}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold py-2 rounded-lg transition-colors text-sm"
          >
            Join
          </button>
          <button
            onClick={handleLeave}
            disabled={forfeiting}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-bold py-2 rounded-lg transition-colors text-sm"
          >
            {forfeiting ? "Forfeiting..." : "Leave"}
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-gray-700">
        <div
          className="h-full bg-red-500"
          style={{ width: `${progress}%`, transition: "none" }}
        />
      </div>
    </div>
  );
}
