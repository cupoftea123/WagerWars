import { Action, RoundModifier, RoundResolution } from "./types.js";
import {
  ACTION_DAMAGE,
  STRIKE_VS_RECOVER_MULTIPLIER,
  POWER_SURGE_DAMAGE_MULTIPLIER,
  REFLECT_DAMAGE,
} from "./constants.js";
import { getActionCost } from "./actions.js";
import { getRecoverGain } from "./energy.js";

/**
 * Resolve a round: compute damage and energy changes for both players.
 *
 * Interaction matrix (from spec):
 * - Strike vs Strike: both take 5 dmg
 * - Strike vs Shield: blocked (0 dmg)
 * - Strike vs Break: Strike deals 5, Break deals 3
 * - Strike vs Recover: Strike damage DOUBLED (10) to Recover player
 * - Shield vs Break: Break penetrates, Shield player takes 3
 * - Shield vs Recover: nothing
 * - Break vs Break: both take 3
 * - Break vs Recover: Break deals 3 to Recover player
 * - Recover vs Recover: nothing
 *
 * Modifiers:
 * - PowerSurge: all damage doubled
 * - Overcharge: Recover grants +6 instead of +4
 * - Reflect: Shield reflects 3 dmg to attacker
 * - Tax: all actions cost +1 energy
 */
export function resolveRound(
  p1Action: Action,
  p2Action: Action,
  modifier: RoundModifier,
): RoundResolution {
  let p1Damage = 0; // damage dealt TO player 1
  let p2Damage = 0; // damage dealt TO player 2
  let reflectDamage1 = 0;
  let reflectDamage2 = 0;

  // --- Base damage resolution ---
  // Calculate what p1's action does to p2, and what p2's action does to p1

  // Player 1's action effect on Player 2
  applyActionEffect(p1Action, p2Action, (dmg) => { p2Damage += dmg; });

  // Player 2's action effect on Player 1
  applyActionEffect(p2Action, p1Action, (dmg) => { p1Damage += dmg; });

  // --- Apply Power Surge (all damage doubled) ---
  if (modifier === RoundModifier.PowerSurge) {
    p1Damage *= POWER_SURGE_DAMAGE_MULTIPLIER;
    p2Damage *= POWER_SURGE_DAMAGE_MULTIPLIER;
  }

  // --- Apply Reflect (Shield reflects damage to attacker) ---
  if (modifier === RoundModifier.Reflect) {
    // If player 1 uses Shield and player 2 attacks (Strike or Break)
    if (p1Action === Action.Shield && (p2Action === Action.Strike || p2Action === Action.Break)) {
      reflectDamage2 = REFLECT_DAMAGE;
    }
    // If player 2 uses Shield and player 1 attacks (Strike or Break)
    if (p2Action === Action.Shield && (p1Action === Action.Strike || p1Action === Action.Break)) {
      reflectDamage1 = REFLECT_DAMAGE;
    }
  }

  // Add reflect damage
  p1Damage += reflectDamage1;
  p2Damage += reflectDamage2;

  // --- Energy ---
  const p1EnergyCost = getActionCost(p1Action, modifier);
  const p2EnergyCost = getActionCost(p2Action, modifier);

  const p1BonusEnergy = p1Action === Action.Recover ? getRecoverGain(modifier) : 0;
  const p2BonusEnergy = p2Action === Action.Recover ? getRecoverGain(modifier) : 0;

  return {
    player1Damage: p1Damage,
    player2Damage: p2Damage,
    player1EnergyCost: p1EnergyCost,
    player2EnergyCost: p2EnergyCost,
    player1BonusEnergy: p1BonusEnergy,
    player2BonusEnergy: p2BonusEnergy,
    reflectDamage1,
    reflectDamage2,
  };
}

/**
 * Calculate the damage one player's action deals to the other,
 * given the opponent's action. Calls addDamage with the damage amount.
 */
function applyActionEffect(
  myAction: Action,
  opponentAction: Action,
  addDamageToOpponent: (dmg: number) => void,
): void {
  switch (myAction) {
    case Action.Strike: {
      if (opponentAction === Action.Shield) {
        // Blocked — no damage
        return;
      }
      let dmg = ACTION_DAMAGE[Action.Strike];
      if (opponentAction === Action.Recover) {
        dmg *= STRIKE_VS_RECOVER_MULTIPLIER;
      }
      addDamageToOpponent(dmg);
      break;
    }

    case Action.Shield: {
      // Shield deals no damage (reflect handled separately via modifier)
      break;
    }

    case Action.Break: {
      if (opponentAction === Action.Shield) {
        // Penetrates shield
        addDamageToOpponent(ACTION_DAMAGE[Action.Break]);
      } else if (opponentAction === Action.Strike) {
        // Both hit each other — Break deals its damage
        addDamageToOpponent(ACTION_DAMAGE[Action.Break]);
      } else if (opponentAction === Action.Recover) {
        // Break deals normal damage to Recover (NOT doubled)
        addDamageToOpponent(ACTION_DAMAGE[Action.Break]);
      } else if (opponentAction === Action.Break) {
        // Both Break — mutual exchange
        addDamageToOpponent(ACTION_DAMAGE[Action.Break]);
      }
      break;
    }

    case Action.Recover: {
      // Recover deals no damage
      break;
    }
  }
}
