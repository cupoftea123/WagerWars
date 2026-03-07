"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface DamageNumber {
  id: number;
  value: number;
  type: "damage" | "heal" | "energy";
  x: number;
  y: number;
}

interface BattleEffectsState {
  shaking: boolean;
  flashType: "red" | "green" | null;
  damageNumbers: DamageNumber[];
  roundTransition: number | null;
}

export function useBattleEffects() {
  const [state, setState] = useState<BattleEffectsState>({
    shaking: false,
    flashType: null,
    damageNumbers: [],
    roundTransition: null,
  });
  const idRef = useRef(0);

  const triggerShake = useCallback(() => {
    setState((prev) => ({ ...prev, shaking: true }));
    setTimeout(() => setState((prev) => ({ ...prev, shaking: false })), 500);
  }, []);

  const triggerFlash = useCallback((type: "red" | "green") => {
    setState((prev) => ({ ...prev, flashType: type }));
    setTimeout(() => setState((prev) => ({ ...prev, flashType: null })), 400);
  }, []);

  const addDamageNumber = useCallback((value: number, type: "damage" | "heal" | "energy", position: "top" | "bottom") => {
    const id = ++idRef.current;
    const x = 40 + Math.random() * 20;
    const y = position === "top" ? 15 + Math.random() * 10 : 70 + Math.random() * 10;
    setState((prev) => ({
      ...prev,
      damageNumbers: [...prev.damageNumbers, { id, value, type, x, y }],
    }));
    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        damageNumbers: prev.damageNumbers.filter((d) => d.id !== id),
      }));
    }, 1200);
  }, []);

  const triggerRoundTransition = useCallback((round: number) => {
    setState((prev) => ({ ...prev, roundTransition: round }));
    setTimeout(() => setState((prev) => ({ ...prev, roundTransition: null })), 1000);
  }, []);

  const triggerDamageEffects = useCallback((
    yourDamageTaken: number,
    opponentDamageTaken: number,
    yourEnergyDelta: number,
  ) => {
    if (yourDamageTaken > 0 || opponentDamageTaken > 0) {
      triggerShake();
    }
    if (yourDamageTaken > 0) {
      triggerFlash("red");
      addDamageNumber(yourDamageTaken, "damage", "bottom");
    }
    if (opponentDamageTaken > 0) {
      addDamageNumber(opponentDamageTaken, "damage", "top");
    }
    if (yourDamageTaken === 0 && opponentDamageTaken === 0) {
      triggerFlash("green");
    }
    if (yourEnergyDelta > 0) {
      addDamageNumber(yourEnergyDelta, "energy", "bottom");
    }
  }, [triggerShake, triggerFlash, addDamageNumber]);

  return {
    ...state,
    triggerShake,
    triggerFlash,
    addDamageNumber,
    triggerRoundTransition,
    triggerDamageEffects,
  };
}

export function DamageFlash({ type }: { type: "red" | "green" | null }) {
  if (!type) return null;

  const color = type === "red"
    ? "bg-red-500/30"
    : "bg-green-500/20";

  const animClass = type === "red"
    ? "animate-damage-flash-red"
    : "animate-damage-flash-green";

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-50 ${color} ${animClass}`}
    />
  );
}

export function FloatingDamageNumbers({ numbers }: { numbers: DamageNumber[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
      {numbers.map((num) => (
        <div
          key={num.id}
          className="absolute animate-float-up font-black text-2xl"
          style={{
            left: `${num.x}%`,
            top: `${num.y}%`,
            color: num.type === "damage" ? "#ef4444" : num.type === "energy" ? "#60a5fa" : "#4ade80",
            textShadow: num.type === "damage"
              ? "0 0 10px rgba(239,68,68,0.8), 0 2px 4px rgba(0,0,0,0.5)"
              : num.type === "energy"
                ? "0 0 10px rgba(96,165,250,0.8), 0 2px 4px rgba(0,0,0,0.5)"
                : "0 0 10px rgba(74,222,128,0.8), 0 2px 4px rgba(0,0,0,0.5)",
          }}
        >
          {num.type === "damage" ? `-${num.value}` : `+${num.value}`}
        </div>
      ))}
    </div>
  );
}

export function RoundTransitionOverlay({ round }: { round: number | null }) {
  if (round === null) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <div className="animate-round-enter">
        <div className="text-7xl font-black text-white/90" style={{ textShadow: "0 0 40px rgba(239,68,68,0.5), 0 4px 8px rgba(0,0,0,0.5)" }}>
          ROUND {round}
        </div>
      </div>
    </div>
  );
}
