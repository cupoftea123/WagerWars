"use client";

import { useMemo } from "react";

const CONFETTI_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff",
];

export function Confetti({ count = 60 }: { count?: number }) {
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      size: 4 + Math.random() * 8,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * 360,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    })),
  [count]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.left}%`,
            top: "-5%",
            width: p.shape === "rect" ? p.size : p.size * 0.8,
            height: p.shape === "rect" ? p.size * 0.6 : p.size * 0.8,
            backgroundColor: p.color,
            borderRadius: p.shape === "circle" ? "50%" : "1px",
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall ${p.duration}s ${p.delay}s linear forwards`,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}

export function GlitchText({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span className="relative z-10">{children}</span>
      <span
        className="absolute inset-0 z-0"
        style={{
          color: "#ef4444",
          animation: "glitch-1 0.3s ease-in-out 3",
          animationDelay: "0.5s",
        }}
        aria-hidden
      >
        {children}
      </span>
    </div>
  );
}
