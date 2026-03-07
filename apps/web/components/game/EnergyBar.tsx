"use client";

import { useRef, useEffect, useState } from "react";

interface EnergyBarProps {
  energy: number;
  label: string;
}

export function EnergyBar({ energy, label }: EnergyBarProps) {
  const prevEnergyRef = useRef(energy);
  const [animatingOrbs, setAnimatingOrbs] = useState<number[]>([]);

  useEffect(() => {
    const prev = prevEnergyRef.current;
    if (energy > prev) {
      const newOrbs = Array.from({ length: energy - prev }, (_, i) => prev + i);
      setAnimatingOrbs(newOrbs);
      const timer = setTimeout(() => setAnimatingOrbs([]), 400);
      prevEnergyRef.current = energy;
      return () => clearTimeout(timer);
    }
    prevEnergyRef.current = energy;
  }, [energy]);

  const displayCount = Math.min(energy, 24);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 uppercase tracking-wider w-10 text-right">{label}</span>
      <div className="flex gap-1 flex-wrap items-center">
        {Array.from({ length: displayCount }).map((_, i) => {
          const isNew = animatingOrbs.includes(i);
          return (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full ${isNew ? "animate-energy-appear" : ""}`}
              style={{
                background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
                boxShadow: "0 0 6px rgba(59, 130, 246, 0.5), 0 0 2px rgba(59, 130, 246, 0.8), inset 0 1px 0 rgba(255,255,255,0.3)",
                animationDelay: isNew ? `${(i - Math.min(...animatingOrbs)) * 50}ms` : undefined,
              }}
            />
          );
        })}
        {energy > 24 && (
          <span className="text-xs text-blue-400 ml-1">+{energy - 24}</span>
        )}
      </div>
      <span className="text-sm font-mono font-bold text-blue-400 ml-auto">{energy}</span>
    </div>
  );
}
