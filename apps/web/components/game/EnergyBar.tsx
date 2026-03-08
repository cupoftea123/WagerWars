"use client";

import { useRef, useEffect, useState } from "react";

interface EnergyBarProps {
  energy: number;
  label?: string;
}

export function EnergyBar({ energy }: EnergyBarProps) {
  const prevEnergyRef = useRef(energy);
  const [flash, setFlash] = useState<"gain" | "lose" | null>(null);

  useEffect(() => {
    const prev = prevEnergyRef.current;
    if (energy !== prev) {
      setFlash(energy > prev ? "gain" : "lose");
      const timer = setTimeout(() => setFlash(null), 600);
      prevEnergyRef.current = energy;
      return () => clearTimeout(timer);
    }
  }, [energy]);

  return (
    <div className="flex items-center gap-1.5">
      {/* Lightning icon */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path d="M9 1L3 9h5l-1 6 7-8H9l1-6z" fill="#eab308" opacity="0.9" />
      </svg>
      <span
        className={`text-sm font-mono font-bold transition-colors duration-300 ${
          flash === "gain"
            ? "text-green-400"
            : flash === "lose"
              ? "text-red-400"
              : "text-yellow-400"
        }`}
      >
        {energy}
      </span>
    </div>
  );
}
