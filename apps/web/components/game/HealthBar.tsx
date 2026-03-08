"use client";

import { useRef, useEffect, useState } from "react";
import { STARTING_HP } from "@wager-wars/shared";

interface HealthBarProps {
  hp: number;
  label: string;
  reversed?: boolean;
}

export function HealthBar({ hp, label, reversed = false }: HealthBarProps) {
  const pct = Math.max(0, (hp / STARTING_HP) * 100);
  const prevHpRef = useRef(hp);
  const [damaged, setDamaged] = useState(false);

  useEffect(() => {
    if (hp < prevHpRef.current) {
      setDamaged(true);
      const timer = setTimeout(() => setDamaged(false), 400);
      prevHpRef.current = hp;
      return () => clearTimeout(timer);
    }
    prevHpRef.current = hp;
  }, [hp]);

  const isLow = pct <= 25;
  const isMid = pct <= 50 && pct > 25;

  const gradientId = `hp-${label}-${reversed ? "r" : "l"}`;
  const barColor = isLow
    ? { from: "#ef4444", to: "#dc2626" }
    : isMid
      ? { from: "#eab308", to: "#f59e0b" }
      : { from: "#22c55e", to: "#4ade80" };

  const glowColor = isLow ? "rgba(239,68,68,0.5)" : isMid ? "rgba(234,179,8,0.3)" : "rgba(34,197,94,0.3)";

  return (
    <div className={`flex items-center gap-2 ${reversed ? "flex-row-reverse" : ""}`}>
      {/* Heart icon */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path
          d="M8 14s-5.5-3.5-5.5-7.5a3 3 0 015.5-2 3 3 0 015.5 2c0 4-5.5 7.5-5.5 7.5z"
          fill={isLow ? "#ef4444" : isMid ? "#eab308" : "#ef4444"}
          opacity={isLow ? "1" : "0.7"}
        />
      </svg>

      <div className="flex-1 relative">
        {/* Background track */}
        <div className="h-5 rounded-full bg-gray-800/80 border border-white/[0.06] overflow-hidden relative">
          {/* Fill bar */}
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out relative ${
              damaged ? "animate-hp-damage" : ""
            } ${isLow ? "animate-pulse-low-hp" : ""}`}
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${barColor.from}, ${barColor.to})`,
              boxShadow: `0 0 12px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.2)`,
              marginLeft: reversed ? "auto" : undefined,
            }}
          >
            {/* Shine overlay */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)",
              }}
            />
          </div>

          {/* Segment markers */}
          {[25, 50, 75].map((seg) => (
            <div
              key={seg}
              className="absolute top-0 bottom-0 w-px bg-white/[0.08]"
              style={{ left: `${seg}%` }}
            />
          ))}
        </div>
      </div>

      <span className={`text-sm font-mono font-bold w-14 ${reversed ? "text-right" : "text-left"} ${
        isLow ? "text-red-400" : isMid ? "text-yellow-400" : "text-gray-200"
      }`}>
        {hp}/{STARTING_HP}
      </span>
    </div>
  );
}
