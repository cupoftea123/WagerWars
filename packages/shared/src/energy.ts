import { Action, RoundModifier } from "./types.js";
import {
  RECOVER_ENERGY_GAIN,
  OVERCHARGE_RECOVER_GAIN,
  PASSIVE_ENERGY_REGEN,
} from "./constants.js";
import { getActionCost } from "./actions.js";

/** Get the energy gained from Recover, accounting for modifier */
export function getRecoverGain(modifier: RoundModifier): number {
  if (modifier === RoundModifier.Overcharge) {
    return OVERCHARGE_RECOVER_GAIN;
  }
  return RECOVER_ENERGY_GAIN;
}

/** Calculate net energy delta for a player's action in a round.
 *  Includes: action cost, recover gain, and passive regen (if not round 1).
 */
export function calculateEnergyDelta(
  action: Action,
  modifier: RoundModifier,
  round: number,
): number {
  let delta = 0;

  // Subtract action cost
  delta -= getActionCost(action, modifier);

  // Add recover gain
  if (action === Action.Recover) {
    delta += getRecoverGain(modifier);
  }

  // Add passive regen (from round 2 onwards)
  if (round >= 2) {
    delta += PASSIVE_ENERGY_REGEN;
  }

  return delta;
}

/** Apply energy delta to current energy. Energy has no cap but cannot go below 0. */
export function applyEnergyDelta(currentEnergy: number, delta: number): number {
  return Math.max(0, currentEnergy + delta);
}
