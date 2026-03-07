"use client";

import { Action, getActionCost, canAfford, type RoundModifier, RoundModifier as RM } from "@wager-wars/shared";
import { ActionIcon, ACTION_COLORS } from "./ActionIcons";

interface ActionSelectorProps {
  energy: number;
  modifier: RoundModifier | null;
  onSelect: (action: Action) => void;
  disabled: boolean;
  selectedAction: Action | null;
}

const ACTION_META: Record<Action, { name: string; description: string }> = {
  [Action.Strike]: { name: "Strike", description: "5 damage" },
  [Action.Shield]: { name: "Shield", description: "Blocks Strike" },
  [Action.Break]: { name: "Break", description: "3 dmg, penetrates" },
  [Action.Recover]: { name: "Recover", description: "+4 energy" },
};

export function ActionSelector({ energy, modifier, onSelect, disabled, selectedAction }: ActionSelectorProps) {
  const mod = modifier ?? RM.None;

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.values(Action).map((action) => {
        const meta = ACTION_META[action];
        const colors = ACTION_COLORS[action];
        const cost = getActionCost(action, mod);
        const affordable = canAfford(energy, action, mod);
        const isSelected = selectedAction === action;
        const isDisabled = disabled || !affordable || selectedAction !== null;
        const isOtherSelected = selectedAction !== null && !isSelected;

        return (
          <button
            key={action}
            onClick={() => onSelect(action)}
            disabled={isDisabled}
            className={`
              relative overflow-hidden rounded-xl border p-4 transition-all duration-200
              ${isSelected
                ? `bg-gradient-to-br ${colors.selectedBg} ${colors.selectedBorder} border-2 animate-selected-pulse`
                : isOtherSelected
                  ? "bg-white/[0.02] border-white/[0.05] opacity-30 cursor-not-allowed"
                  : isDisabled
                    ? "bg-white/[0.02] border-white/[0.05] opacity-40 cursor-not-allowed"
                    : `bg-gradient-to-br ${colors.bg} ${colors.border} ${colors.borderHover} hover:-translate-y-1 hover:shadow-lg cursor-pointer`
              }
            `}
            style={isSelected ? { "--action-color": colors.glow } as React.CSSProperties : undefined}
          >
            {/* Background glow on hover */}
            {!isDisabled && !isSelected && (
              <div
                className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at center, ${colors.glow}, transparent 70%)`,
                  opacity: 0.15,
                }}
              />
            )}

            <div className="relative z-10 flex flex-col items-center text-center gap-2">
              <ActionIcon action={action} size={40} />
              <div>
                <div className={`text-sm font-bold ${isDisabled && !isSelected ? "text-gray-500" : colors.text}`}>
                  {meta.name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{meta.description}</div>
              </div>
              <div className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                affordable
                  ? "bg-white/[0.06] text-gray-300"
                  : "bg-red-500/10 text-red-400"
              }`}>
                {affordable ? `${cost} Energy` : "No energy"}
              </div>
            </div>

            {isSelected && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
