"use client";

import { Action } from "@wager-wars/shared";

interface ActionIconProps {
  action: Action;
  size?: number;
  className?: string;
}

export function ActionIcon({ action, size = 48, className = "" }: ActionIconProps) {
  const icons: Record<Action, React.ReactNode> = {
    [Action.Strike]: <StrikeIcon size={size} />,
    [Action.Shield]: <ShieldIcon size={size} />,
    [Action.Break]: <BreakIcon size={size} />,
    [Action.Recover]: <RecoverIcon size={size} />,
  };
  return <span className={className}>{icons[action]}</span>;
}

function StrikeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="strike-blade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <filter id="strike-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#strike-glow)">
        {/* Blade */}
        <path d="M 46 6 L 50 10 L 24 38 L 18 34 Z" fill="url(#strike-blade)" />
        {/* Blade edge highlight */}
        <path d="M 46 6 L 48 8 L 22 36 L 18 34 Z" fill="#fde68a" opacity="0.4" />
        {/* Crossguard */}
        <rect x="14" y="34" width="16" height="4" rx="1" transform="rotate(-40 22 36)" fill="#d97706" />
        {/* Handle */}
        <path d="M 16 38 L 19 41 L 11 50 L 8 47 Z" fill="#92400e" />
        <circle cx="9" cy="49" r="2.5" fill="#b45309" />
        {/* Speed lines */}
        <line x1="52" y1="4" x2="58" y2="2" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="54" y1="12" x2="60" y2="8" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <line x1="50" y1="18" x2="58" y2="16" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
      </g>
    </svg>
  );
}

function ShieldIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="shield-body" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="shield-rim" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <filter id="shield-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#shield-glow)">
        {/* Shield body */}
        <path d="M 32 6 L 52 14 L 50 36 C 48 48 40 54 32 58 C 24 54 16 48 14 36 L 12 14 Z" fill="url(#shield-body)" />
        {/* Rim */}
        <path d="M 32 6 L 52 14 L 50 36 C 48 48 40 54 32 58 C 24 54 16 48 14 36 L 12 14 Z" stroke="url(#shield-rim)" strokeWidth="2.5" fill="none" />
        {/* Inner chevron */}
        <path d="M 32 18 L 42 24 L 32 44 L 22 24 Z" fill="#1e40af" opacity="0.5" />
        {/* Star emblem */}
        <path d="M 32 24 L 34 30 L 40 30 L 35 34 L 37 40 L 32 36 L 27 40 L 29 34 L 24 30 L 30 30 Z" fill="#bfdbfe" opacity="0.7" />
        {/* Highlight */}
        <path d="M 32 6 L 20 12 L 16 30 C 18 20 24 12 32 10 Z" fill="white" opacity="0.15" />
      </g>
    </svg>
  );
}

function BreakIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="break-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <filter id="break-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#break-glow)">
        {/* Fist */}
        <path d="M 22 20 C 22 16 26 14 30 14 L 42 14 C 46 14 48 18 48 22 L 48 30 C 48 34 46 36 42 36 L 28 36 L 22 42 L 22 36 C 20 34 18 30 18 26 Z" fill="url(#break-grad)" />
        {/* Knuckle lines */}
        <line x1="30" y1="16" x2="30" y2="34" stroke="#7c3aed" strokeWidth="1" opacity="0.5" />
        <line x1="36" y1="16" x2="36" y2="34" stroke="#7c3aed" strokeWidth="1" opacity="0.5" />
        <line x1="42" y1="16" x2="42" y2="34" stroke="#7c3aed" strokeWidth="1" opacity="0.5" />
        {/* Impact lines */}
        <line x1="10" y1="16" x2="16" y2="20" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        <line x1="8" y1="28" x2="16" y2="28" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <line x1="10" y1="40" x2="16" y2="36" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        {/* Shatter fragments */}
        <polygon points="12,22 14,20 16,23 13,24" fill="#d8b4fe" opacity="0.6" />
        <polygon points="10,32 13,30 14,33 11,34" fill="#d8b4fe" opacity="0.4" />
        {/* Impact star */}
        <circle cx="14" cy="28" r="3" fill="#f5f3ff" opacity="0.3" />
      </g>
    </svg>
  );
}

function RecoverIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="recover-grad" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <filter id="recover-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#recover-glow)">
        {/* Outer spiral */}
        <path
          d="M 32 12 C 44 12 52 20 52 32 C 52 44 44 52 32 52 C 22 52 14 46 13 36"
          stroke="url(#recover-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
        {/* Inner spiral */}
        <path
          d="M 32 20 C 40 20 44 26 44 32 C 44 38 40 42 34 42"
          stroke="#4ade80"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />
        {/* Center plus */}
        <rect x="29" y="24" width="6" height="16" rx="1.5" fill="#4ade80" />
        <rect x="24" y="29" width="16" height="6" rx="1.5" fill="#4ade80" />
        {/* Energy particles */}
        <circle cx="18" cy="20" r="2" fill="#86efac" opacity="0.7" />
        <circle cx="48" cy="24" r="1.5" fill="#86efac" opacity="0.5" />
        <circle cx="44" cy="46" r="2" fill="#86efac" opacity="0.6" />
        <circle cx="16" cy="42" r="1.5" fill="#86efac" opacity="0.4" />
        {/* Arrow tip on outer spiral */}
        <polygon points="11,36 17,38 15,32" fill="#22c55e" opacity="0.7" />
      </g>
    </svg>
  );
}

export const ACTION_COLORS = {
  [Action.Strike]: {
    bg: "from-orange-600/20 to-amber-600/10",
    border: "border-orange-500/40",
    borderHover: "hover:border-orange-400/70",
    glow: "rgba(249, 115, 22, 0.4)",
    text: "text-orange-400",
    selectedBg: "from-orange-600/30 to-amber-600/20",
    selectedBorder: "border-orange-400",
  },
  [Action.Shield]: {
    bg: "from-blue-600/20 to-cyan-600/10",
    border: "border-blue-500/40",
    borderHover: "hover:border-blue-400/70",
    glow: "rgba(59, 130, 246, 0.4)",
    text: "text-blue-400",
    selectedBg: "from-blue-600/30 to-cyan-600/20",
    selectedBorder: "border-blue-400",
  },
  [Action.Break]: {
    bg: "from-purple-600/20 to-pink-600/10",
    border: "border-purple-500/40",
    borderHover: "hover:border-purple-400/70",
    glow: "rgba(168, 85, 247, 0.4)",
    text: "text-purple-400",
    selectedBg: "from-purple-600/30 to-pink-600/20",
    selectedBorder: "border-purple-400",
  },
  [Action.Recover]: {
    bg: "from-green-600/20 to-emerald-600/10",
    border: "border-green-500/40",
    borderHover: "hover:border-green-400/70",
    glow: "rgba(34, 197, 94, 0.4)",
    text: "text-green-400",
    selectedBg: "from-green-600/30 to-emerald-600/20",
    selectedBorder: "border-green-400",
  },
};
