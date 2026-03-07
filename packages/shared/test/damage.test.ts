import { describe, it, expect } from "vitest";
import { resolveRound } from "../src/damage.js";
import { Action, RoundModifier } from "../src/types.js";

describe("resolveRound — base interactions (no modifier)", () => {
  const mod = RoundModifier.None;

  it("Strike vs Strike: both take 5 damage", () => {
    const r = resolveRound(Action.Strike, Action.Strike, mod);
    expect(r.player1Damage).toBe(5);
    expect(r.player2Damage).toBe(5);
  });

  it("Strike vs Shield: blocked (0 damage to Shield player)", () => {
    const r = resolveRound(Action.Strike, Action.Shield, mod);
    expect(r.player1Damage).toBe(0); // Shield player takes 0
    expect(r.player2Damage).toBe(0); // Strike is blocked
  });

  it("Strike vs Break: Strike deals 5, Break deals 3", () => {
    const r = resolveRound(Action.Strike, Action.Break, mod);
    expect(r.player1Damage).toBe(3); // p1 (Strike) takes Break's 3
    expect(r.player2Damage).toBe(5); // p2 (Break) takes Strike's 5
  });

  it("Strike vs Recover: doubled damage (10) to Recover player", () => {
    const r = resolveRound(Action.Strike, Action.Recover, mod);
    expect(r.player1Damage).toBe(0);
    expect(r.player2Damage).toBe(10); // 5 * 2 = 10
  });

  it("Shield vs Shield: nothing happens", () => {
    const r = resolveRound(Action.Shield, Action.Shield, mod);
    expect(r.player1Damage).toBe(0);
    expect(r.player2Damage).toBe(0);
  });

  it("Shield vs Break: Break penetrates, Shield player takes 3", () => {
    const r = resolveRound(Action.Shield, Action.Break, mod);
    expect(r.player1Damage).toBe(3); // Shield player takes 3
    expect(r.player2Damage).toBe(0); // Break player takes nothing
  });

  it("Shield vs Recover: nothing happens", () => {
    const r = resolveRound(Action.Shield, Action.Recover, mod);
    expect(r.player1Damage).toBe(0);
    expect(r.player2Damage).toBe(0);
  });

  it("Break vs Break: both take 3 damage", () => {
    const r = resolveRound(Action.Break, Action.Break, mod);
    expect(r.player1Damage).toBe(3);
    expect(r.player2Damage).toBe(3);
  });

  it("Break vs Recover: Break deals 3 to Recover (NOT doubled)", () => {
    const r = resolveRound(Action.Break, Action.Recover, mod);
    expect(r.player1Damage).toBe(0);
    expect(r.player2Damage).toBe(3);
  });

  it("Recover vs Recover: nothing happens", () => {
    const r = resolveRound(Action.Recover, Action.Recover, mod);
    expect(r.player1Damage).toBe(0);
    expect(r.player2Damage).toBe(0);
  });
});

describe("resolveRound — symmetry", () => {
  const mod = RoundModifier.None;

  it("Shield(p1) vs Strike(p2) is symmetric to Strike(p1) vs Shield(p2)", () => {
    const r1 = resolveRound(Action.Shield, Action.Strike, mod);
    const r2 = resolveRound(Action.Strike, Action.Shield, mod);
    // p1=Shield, p2=Strike: p1 takes 0 (blocks), p2 takes 0
    expect(r1.player1Damage).toBe(0);
    expect(r1.player2Damage).toBe(0);
    // p1=Strike, p2=Shield: p1 takes 0, p2 takes 0 (blocks)
    expect(r2.player1Damage).toBe(0);
    expect(r2.player2Damage).toBe(0);
  });

  it("Recover(p1) vs Strike(p2) — p1 takes 10 doubled damage", () => {
    const r = resolveRound(Action.Recover, Action.Strike, mod);
    expect(r.player1Damage).toBe(10);
    expect(r.player2Damage).toBe(0);
  });
});

describe("resolveRound — energy costs", () => {
  const mod = RoundModifier.None;

  it("Strike costs 3", () => {
    const r = resolveRound(Action.Strike, Action.Shield, mod);
    expect(r.player1EnergyCost).toBe(3);
  });

  it("Shield costs 2", () => {
    const r = resolveRound(Action.Shield, Action.Strike, mod);
    expect(r.player1EnergyCost).toBe(2);
  });

  it("Break costs 4", () => {
    const r = resolveRound(Action.Break, Action.Shield, mod);
    expect(r.player1EnergyCost).toBe(4);
  });

  it("Recover costs 0, grants +4", () => {
    const r = resolveRound(Action.Recover, Action.Shield, mod);
    expect(r.player1EnergyCost).toBe(0);
    expect(r.player1BonusEnergy).toBe(4);
  });
});

describe("resolveRound — Power Surge modifier", () => {
  const mod = RoundModifier.PowerSurge;

  it("Strike vs Strike: both take 10 (doubled)", () => {
    const r = resolveRound(Action.Strike, Action.Strike, mod);
    expect(r.player1Damage).toBe(10);
    expect(r.player2Damage).toBe(10);
  });

  it("Break(p1) vs Shield(p2): Shield player takes 6 (3*2)", () => {
    const r = resolveRound(Action.Break, Action.Shield, mod);
    expect(r.player1Damage).toBe(0);  // Break player takes nothing
    expect(r.player2Damage).toBe(6);  // Break penetrates, doubled by PowerSurge
  });

  it("Strike vs Recover: 20 damage (5*2 strike doubled, then *2 PowerSurge)", () => {
    const r = resolveRound(Action.Strike, Action.Recover, mod);
    // Base: 5*2=10 (doubled vs Recover), then PowerSurge: 10*2=20
    expect(r.player2Damage).toBe(20);
  });
});

describe("resolveRound — Reflect modifier", () => {
  const mod = RoundModifier.Reflect;

  it("Strike(p1) vs Shield(p2): blocked AND p1 takes 3 reflect damage", () => {
    const r = resolveRound(Action.Strike, Action.Shield, mod);
    expect(r.player1Damage).toBe(3); // reflect damage
    expect(r.player2Damage).toBe(0); // blocked
    expect(r.reflectDamage1).toBe(3);
  });

  it("Break(p1) vs Shield(p2): penetrates (3 to p2) AND p1 takes 3 reflect", () => {
    const r = resolveRound(Action.Break, Action.Shield, mod);
    expect(r.player1Damage).toBe(3); // reflect
    expect(r.player2Damage).toBe(3); // Break penetrates
  });

  it("Shield vs Shield: no reflect (no attacker)", () => {
    const r = resolveRound(Action.Shield, Action.Shield, mod);
    expect(r.player1Damage).toBe(0);
    expect(r.player2Damage).toBe(0);
  });

  it("Shield vs Recover: no reflect", () => {
    const r = resolveRound(Action.Shield, Action.Recover, mod);
    expect(r.player1Damage).toBe(0);
    expect(r.player2Damage).toBe(0);
  });
});

describe("resolveRound — Tax modifier", () => {
  const mod = RoundModifier.Tax;

  it("Strike costs 4 (3+1)", () => {
    const r = resolveRound(Action.Strike, Action.Strike, mod);
    expect(r.player1EnergyCost).toBe(4);
  });

  it("Shield costs 3 (2+1)", () => {
    const r = resolveRound(Action.Shield, Action.Shield, mod);
    expect(r.player1EnergyCost).toBe(3);
  });

  it("Break costs 5 (4+1)", () => {
    const r = resolveRound(Action.Break, Action.Break, mod);
    expect(r.player1EnergyCost).toBe(5);
  });

  it("Recover costs 1 (0+1), still grants +4", () => {
    const r = resolveRound(Action.Recover, Action.Recover, mod);
    expect(r.player1EnergyCost).toBe(1);
    expect(r.player1BonusEnergy).toBe(4);
  });
});

describe("resolveRound — Overcharge modifier", () => {
  const mod = RoundModifier.Overcharge;

  it("Recover grants +6 instead of +4", () => {
    const r = resolveRound(Action.Recover, Action.Recover, mod);
    expect(r.player1BonusEnergy).toBe(6);
    expect(r.player2BonusEnergy).toBe(6);
  });

  it("Strike damage unchanged", () => {
    const r = resolveRound(Action.Strike, Action.Strike, mod);
    expect(r.player1Damage).toBe(5);
    expect(r.player2Damage).toBe(5);
  });
});
