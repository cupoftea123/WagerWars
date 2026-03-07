import { Action, RoundModifier } from "./types.js";
import { ACTION_COSTS, TAX_EXTRA_COST } from "./constants.js";

/** Get the energy cost of an action, accounting for modifier */
export function getActionCost(action: Action, modifier: RoundModifier): number {
  const baseCost = ACTION_COSTS[action];
  if (modifier === RoundModifier.Tax) {
    return baseCost + TAX_EXTRA_COST;
  }
  return baseCost;
}

/** Check if a player can afford an action given their energy and the round modifier */
export function canAfford(energy: number, action: Action, modifier: RoundModifier): boolean {
  return energy >= getActionCost(action, modifier);
}

/** Get all actions a player can currently afford */
export function getAvailableActions(energy: number, modifier: RoundModifier): Action[] {
  return Object.values(Action).filter((a) => canAfford(energy, a, modifier));
}

/** Validate that an action is a real Action enum value */
export function isValidAction(action: string): action is Action {
  return Object.values(Action).includes(action as Action);
}
