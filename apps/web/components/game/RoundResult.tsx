"use client";

import { Action, type RoundResult as RoundResultType, RoundModifier } from "@wager-wars/shared";
import { ActionIcon, ACTION_COLORS } from "./ActionIcons";

interface RoundResultProps {
  results: RoundResultType[];
  playerSlot?: "player1" | "player2" | null;
}

const MODIFIER_ICONS: Record<string, { icon: string; color: string }> = {
  NONE: { icon: "", color: "" },
  POWER_SURGE: { icon: "zap", color: "text-red-400" },
  OVERCHARGE: { icon: "battery", color: "text-green-400" },
  REFLECT: { icon: "mirror", color: "text-cyan-400" },
  TAX: { icon: "coins", color: "text-yellow-400" },
};

function ActionBadge({ action }: { action: Action }) {
  const colors = ACTION_COLORS[action];
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gradient-to-r ${colors.bg} ${colors.border} border`}>
      <ActionIcon action={action} size={16} />
      <span className={`text-xs font-bold ${colors.text}`}>
        {action.charAt(0) + action.slice(1).toLowerCase()}
      </span>
    </div>
  );
}

export function RoundHistory({ results, playerSlot }: RoundResultProps) {
  if (results.length === 0) return null;

  const isPlayer2 = playerSlot === "player2";
  const reversedResults = [...results].reverse();

  return (
    <div className="glass-card rounded-2xl p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Battle Log</h3>
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
        {reversedResults.map((r) => {
          const yourAction = isPlayer2 ? r.player2Action : r.player1Action;
          const opponentAction = isPlayer2 ? r.player1Action : r.player2Action;
          const damageDealt = isPlayer2 ? r.player1Damage : r.player2Damage;
          const damageTaken = isPlayer2 ? r.player2Damage : r.player1Damage;

          return (
            <div
              key={r.round}
              className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]"
            >
              {/* Round number */}
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-gray-400">{r.round}</span>
              </div>

              {/* Your action */}
              <ActionBadge action={yourAction} />

              {/* VS indicator with damage */}
              <div className="flex flex-col items-center flex-shrink-0 mx-1">
                <span className="text-[10px] text-gray-600 font-bold">VS</span>
              </div>

              {/* Opponent action */}
              <ActionBadge action={opponentAction} />

              {/* Damage summary */}
              <div className="ml-auto flex items-center gap-2 text-xs flex-shrink-0">
                {damageDealt > 0 && (
                  <span className="text-green-400 font-mono">-{damageDealt}</span>
                )}
                {damageTaken > 0 && (
                  <span className="text-red-400 font-mono">-{damageTaken}</span>
                )}
              </div>

              {/* Modifier badge */}
              {r.modifier !== RoundModifier.None && (
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  r.modifier === RoundModifier.PowerSurge ? "bg-red-400" :
                  r.modifier === RoundModifier.Overcharge ? "bg-green-400" :
                  r.modifier === RoundModifier.Reflect ? "bg-cyan-400" :
                  "bg-yellow-400"
                }`} title={r.modifier} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
