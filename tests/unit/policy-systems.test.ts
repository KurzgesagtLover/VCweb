import { describe, expect, it } from "vitest";
import {
  calculatePolicyEffectiveness,
  calculatePoliticalState,
  calculatePromotedPolicySupport,
  calculatePromotionState,
} from "@/src/domain/policy/model";

describe("policy systems", () => {
  it("raises awareness with useful promotion and penalizes saturation-level overspend", () => {
    const moderate = calculatePromotionState({
      currentAwareness: 25,
      cumulativeSpend: 40,
      policyBudget: 100,
    });
    const excessive = calculatePromotionState({
      currentAwareness: 92,
      cumulativeSpend: 260,
      policyBudget: 100,
    });

    expect(moderate.awareness).toBeGreaterThan(25);
    expect(moderate.overpromotionPenalty).toBeLessThan(0.05);
    expect(excessive.overpromotionPenalty).toBeGreaterThan(0.2);

    const normalEffect = calculatePolicyEffectiveness({
      stability: 60,
      governmentApproval: 55,
      policySupport: 58,
      stateCapacity: 65,
      awareness: moderate.awareness,
      overpromotionPenalty: moderate.overpromotionPenalty,
      economicSystem: "FREE_MARKET",
    });
    const overpromotedEffect = calculatePolicyEffectiveness({
      stability: 60,
      governmentApproval: 55,
      policySupport: 58,
      stateCapacity: 65,
      awareness: excessive.awareness,
      overpromotionPenalty: excessive.overpromotionPenalty,
      economicSystem: "FREE_MARKET",
    });
    expect(overpromotedEffect).toBeLessThan(normalEffect);
  });

  it("amplifies the judged direction of policy support when promotion raises awareness", () => {
    const successful = calculatePromotedPolicySupport({
      currentSupport: 55,
      awareness: 75,
      verdict: "SUCCESS",
    });
    const failed = calculatePromotedPolicySupport({
      currentSupport: 45,
      awareness: 75,
      verdict: "FAILURE",
    });

    expect(successful).toBeGreaterThan(55);
    expect(failed).toBeLessThan(45);
  });

  it("keeps positive growth neutral while persistent inflation and unemployment lower stability", () => {
    const healthy = calculatePoliticalState({
      currentStability: 70,
      currentPolicySupport: 55,
      governmentApproval: 55,
      stateCapacity: 65,
      unrest: 20,
      realGdpGrowth: 0.04,
      inflationRate: 0.02,
      previousInflationRate: 0.02,
      unemploymentRate: 0.04,
      previousUnemploymentRate: 0.04,
      incomeGini: 0.31,
      activePolicyImpulse: 0,
    });
    const stressed = calculatePoliticalState({
      currentStability: 70,
      currentPolicySupport: 55,
      governmentApproval: 55,
      stateCapacity: 65,
      unrest: 20,
      realGdpGrowth: 0.04,
      inflationRate: 0.12,
      previousInflationRate: 0.11,
      unemploymentRate: 0.14,
      previousUnemploymentRate: 0.13,
      incomeGini: 0.52,
      activePolicyImpulse: 0,
    });

    expect(stressed.stability).toBeLessThan(healthy.stability);
    expect(stressed.povertyRate).toBeGreaterThan(healthy.povertyRate);
  });

  it("mean-reverts policy support toward 50 without a policy impulse", () => {
    const high = calculatePoliticalState({
      currentStability: 60,
      currentPolicySupport: 80,
      governmentApproval: 50,
      stateCapacity: 50,
      unrest: 30,
      realGdpGrowth: 0.02,
      inflationRate: 0.02,
      previousInflationRate: 0.02,
      unemploymentRate: 0.05,
      previousUnemploymentRate: 0.05,
      incomeGini: 0.35,
      activePolicyImpulse: 0,
    });
    expect(high.policySupport).toBeLessThan(80);
    expect(high.policySupport).toBeGreaterThan(50);
  });

  it("feeds policy support above or below 50 into government approval", () => {
    const base = {
      currentStability: 60,
      governmentApproval: 50,
      stateCapacity: 50,
      unrest: 30,
      realGdpGrowth: 0.02,
      inflationRate: 0.02,
      previousInflationRate: 0.02,
      unemploymentRate: 0.05,
      previousUnemploymentRate: 0.05,
      incomeGini: 0.35,
      activePolicyImpulse: 0,
    };
    const supported = calculatePoliticalState({
      ...base,
      currentPolicySupport: 80,
    });
    const opposed = calculatePoliticalState({
      ...base,
      currentPolicySupport: 20,
    });

    expect(supported.governmentApproval).toBeGreaterThan(base.governmentApproval);
    expect(opposed.governmentApproval).toBeLessThan(base.governmentApproval);
  });
});
