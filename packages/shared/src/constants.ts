import { Action } from "./types.js";

// ============================================================
// Game Balance Constants
// ============================================================

export const STARTING_HP = 20;
export const STARTING_ENERGY = 10;
export const MAX_ROUNDS = 7;
export const PASSIVE_ENERGY_REGEN = 1; // +1 energy at start of each round (from round 2)

/** Energy cost per action */
export const ACTION_COSTS: Record<Action, number> = {
  [Action.Strike]: 3,
  [Action.Shield]: 2,
  [Action.Break]: 4,
  [Action.Recover]: 0,
};

/** Base damage per action (before modifiers) */
export const ACTION_DAMAGE: Record<Action, number> = {
  [Action.Strike]: 5,
  [Action.Shield]: 0,
  [Action.Break]: 3,
  [Action.Recover]: 0,
};

/** Energy gained by Recover action */
export const RECOVER_ENERGY_GAIN = 4;

/** Strike damage multiplier when hitting Recover */
export const STRIKE_VS_RECOVER_MULTIPLIER = 2;

// ============================================================
// Modifier Constants
// ============================================================

/** Power Surge: all damage is doubled */
export const POWER_SURGE_DAMAGE_MULTIPLIER = 2;

/** Overcharge: Recover grants +6 instead of +4 */
export const OVERCHARGE_RECOVER_GAIN = 6;

/** Reflect: Shield reflects this much damage back to attacker */
export const REFLECT_DAMAGE = 3;

/** Tax: all actions cost +1 energy */
export const TAX_EXTRA_COST = 1;

// ============================================================
// Protocol Constants
// ============================================================

/** Protocol fee in basis points (300 = 3%) */
export const PROTOCOL_FEE_BPS = 300;

/** Match creation expiry: 30 minutes to find opponent */
export const MATCH_EXPIRY_SECONDS = 30 * 60;

/** Number of modifiers placed in rounds 2-7 (rest are None) */
export const MODIFIER_COUNT = 4;

/** Rounds where modifiers can appear (2-7, indices 1-6) */
export const MODIFIER_ROUND_START = 2;
export const MODIFIER_ROUND_END = 7;

/** Number of neutral rounds in rounds 2-7 */
export const NEUTRAL_ROUNDS_IN_RANGE = 2;
