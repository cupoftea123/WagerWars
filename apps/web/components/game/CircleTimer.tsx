"use client";

import { useState, useEffect, useRef } from "react";

interface CircleTimerProps {
  duration: number;
  size?: number;
  strokeWidth?: number;
  onExpire?: () => void;
  paused?: boolean;
}

export function CircleTimer({ duration, size = 56, strokeWidth = 3, onExpire, paused = false }: CircleTimerProps) {
  const [remaining, setRemaining] = useState(duration);
  const startTimeRef = useRef(Date.now());
  const frameRef = useRef<number>();

  useEffect(() => {
    setRemaining(duration);
    startTimeRef.current = Date.now();
  }, [duration]);

  useEffect(() => {
    if (paused) return;

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0) {
        onExpire?.();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [duration, paused, onExpire]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / duration;
  const offset = circumference * (1 - progress);
  const seconds = Math.ceil(remaining);

  const isLow = remaining <= 5;
  const isCritical = remaining <= 3;

  const strokeColor = isCritical
    ? "#ef4444"
    : isLow
      ? "#f59e0b"
      : "#6b7280";

  const textColor = isCritical
    ? "text-red-400"
    : isLow
      ? "text-amber-400"
      : "text-gray-400";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className={`-rotate-90 ${isCritical ? "animate-timer-pulse" : ""}`}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke 0.3s ease" }}
        />
      </svg>
      <span className={`absolute text-sm font-mono font-bold ${textColor}`}>
        {seconds}
      </span>
    </div>
  );
}
