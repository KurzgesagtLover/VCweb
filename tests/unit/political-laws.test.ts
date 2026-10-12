import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { SOCIAL_INSTITUTIONS } from "../../src/domain/development/tracks";
import { validateEffect } from "../../src/domain/effects/registry";
import {
  adaptiveUpkeep,
  advanceAdaptation,
  calculatePoliticalPowerIncome,
  culturalCommitmentDrift,
  deficitDrift,
  evaluateLawChange,
  fixedLawUpkeepItems,
  LAW_DEFINITIONS,
  lawStructuralEffects,
  netIncomePerGameDay,
  remainingCooldownMonths,
  requireLawDefinition,
  resolveLawStages,
  settleCulturalCommitments,
  turnLengthInYears,
  type CulturalCommitment,
  type LawChangeContext,
} from "../../src/domain/politics/laws";
import { accruePoliticalPower } from "../../src/domain/politics/political-power";

const openContext: LawChangeContext = {
  currentStage: 3,
  targetStage: 4,
  democracy: 50,
  balance: "500",
  atWar: false,
  monthsSinceLastChange: null,
  hasPendingOrder: false,
  turnOpen: true,
};

function commitment(overrides: Partial<CulturalCommitment> = {}): CulturalCommitment {
  return {
    id: "c1",
    lawKey: "pressFreedom",
    fromStage: 4,
    toStage: 3,
    upkeepMax: "30",
    halfLifeYears: "3",
    adaptation: "0",
    erosion: "0",
    currentStage: 3,
    isNew: false,
    ...overrides,
  };
}

describe("law catalog", () => {
  it("mirrors every social institution and keeps default stages valid", () => {
    for (const institution of SOCIAL_INSTITUTIONS) {
      const law = requireLawDefinition(institution.key);
      expect(law.upkeepMode).toBe("ADAPTIVE");
      expect(law.stages.map((stage) => stage.label)).toEqual([...institution.stages]);
    }
    for (const law of LAW_DEFINITIONS) {
      expect(law.defaultStage).toBeGreaterThanOrEqual(1);
      expect(law.defaultStage).toBeLessThanOrEqual(law.stages.length);
      for (const stage of law.stages) {
        expect(stage.upkeep).toBeGreaterThanOrEqual(0);
        expect(stage.enterCost).toBeGreaterThan(0);
      }
    }
  });

  it("only allows mobilization stages during war", () => {
    const conscription = requireLawDefinition("conscriptionLaw");
    expect(conscription.stages.map((stage) => Boolean(stage.requiresWar))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("derives the economy law from the existing economic system", () => {
    expect(resolveLawStages([], "PLANNED").economyLaw).toBe(4);
    expect(resolveLawStages([], "FREE_MARKET").economyLaw).toBe(3);
    expect(resolveLawStages([{ key: "economyLaw", stage: 1 }], "PLANNED").economyLaw).toBe(1);
    expect(resolveLawStages([{ key: "conscriptionLaw", stage: 9 }]).conscriptionLaw).toBe(1);
  });
});

describe("law change rules", () => {
  const conscription = requireLawDefinition("conscriptionLaw");
  const press = requireLawDefinition("pressFreedom");

  it("moves one stage at a time", () => {
    const result = evaluateLawChange(conscription, {
      ...openContext,
      currentStage: 1,
      targetStage: 3,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("한 단계");
  });

  it("charges the target stage entry cost for fixed laws", () => {
    const result = evaluateLawChange(conscription, {
      ...openContext,
      currentStage: 1,
      targetStage: 2,
    });
    expect(result.allowed).toBe(true);
    expect(result.quote).toMatchObject({ cost: "50", upkeep: "5", upkeepMode: "FIXED" });
  });

  it("blocks closed turns, pending orders, cooldowns, peace-time mobilization and debt", () => {
    expect(evaluateLawChange(conscription, { ...openContext, turnOpen: false }).allowed).toBe(
      false,
    );
    expect(evaluateLawChange(conscription, { ...openContext, hasPendingOrder: true }).allowed).toBe(
      false,
    );
    expect(
      evaluateLawChange(conscription, { ...openContext, monthsSinceLastChange: 3 }).reason,
    ).toContain("12개월");
    // 하루 이틀 차이로 12개월에 조금 못 미쳐도 쿨다운은 끝난 것으로 본다.
    expect(
      evaluateLawChange(conscription, { ...openContext, monthsSinceLastChange: 11.95, atWar: true })
        .allowed,
    ).toBe(true);
    expect(remainingCooldownMonths(conscription, 9)).toBe(3);
    expect(remainingCooldownMonths(conscription, null)).toBe(0);
    expect(evaluateLawChange(conscription, openContext).reason).toContain("전쟁");
    expect(evaluateLawChange(conscription, { ...openContext, atWar: true }).allowed).toBe(true);
    expect(
      evaluateLawChange(conscription, {
        ...openContext,
        currentStage: 1,
        targetStage: 2,
        balance: "-10",
      }).reason,
    ).toContain("부족");
  });

  it("makes reforms against the regime more expensive", () => {
    const neutral = evaluateLawChange(press, { ...openContext, democracy: 50 });
    const liberalizingAutocracy = evaluateLawChange(press, { ...openContext, democracy: 20 });
    const restrictingDemocracy = evaluateLawChange(press, {
      ...openContext,
      targetStage: 2,
      democracy: 80,
    });
    expect(neutral.quote).toMatchObject({ cost: "60", upkeep: "30", upkeepMode: "ADAPTIVE" });
    expect(liberalizingAutocracy.quote).toMatchObject({ cost: "90", upkeep: "45" });
    expect(restrictingDemocracy.quote).toMatchObject({ cost: "90", upkeep: "45" });
  });
});

describe("adaptive upkeep", () => {
  it("halves remaining upkeep every half-life", () => {
    const adaptation = advanceAdaptation(0, 3, 3);
    expect(adaptation.toDecimalPlaces(6).toString()).toBe("0.5");
    expect(adaptiveUpkeep({ upkeepMax: "30", adaptation, erosion: 0 }).toString()).toBe("15");
    expect(advanceAdaptation(adaptation, 3, 3).toDecimalPlaces(6).toString()).toBe("0.75");
  });

  it("charges full upkeep in the year a change takes effect", () => {
    const result = settleCulturalCommitments({
      balance: 100,
      years: 1,
      commitments: [commitment({ isNew: true })],
    });
    expect(result.outcomes[0]).toMatchObject({ status: "ACTIVE", action: "NEW", upkeep: "30" });
    expect(result.erodibleCount).toBe(0);
  });

  it("adapts over time while political power is healthy", () => {
    const result = settleCulturalCommitments({
      balance: 100,
      years: 1,
      commitments: [commitment()],
    });
    const outcome = result.outcomes[0];
    expect(outcome.action).toBe("ADAPT");
    expect(Number(outcome.upkeep)).toBeCloseTo(30 * 0.5 ** (1 / 3), 3);
  });

  it("finishes adaptation once remaining upkeep falls below one", () => {
    const result = settleCulturalCommitments({
      balance: 100,
      years: 1,
      commitments: [commitment({ adaptation: "0.97" })],
    });
    expect(result.outcomes[0]).toMatchObject({ status: "ADAPTED", upkeep: "0" });
  });
});

describe("political power deficit", () => {
  it("pushes cultural changes back toward the previous stage and lowers their upkeep", () => {
    const result = settleCulturalCommitments({
      balance: -20,
      years: 1,
      commitments: [commitment()],
    });
    const outcome = result.outcomes[0];
    expect(result.state).toBe("DEFICIT");
    expect(outcome.action).toBe("ERODE");
    expect(outcome.erosion).toBe("50");
    expect(outcome.progressDelta).toBe("50");
    expect(Number(outcome.upkeep)).toBeCloseTo(20, 6);
    expect(outcome.adaptation).toBe("0");
  });

  it("moves liberalizing changes the other way", () => {
    const result = settleCulturalCommitments({
      balance: -20,
      years: 1,
      commitments: [commitment({ fromStage: 2, toStage: 3 })],
    });
    expect(result.outcomes[0].progressDelta).toBe("-50");
  });

  it("reverts a change after a full stage of erosion", () => {
    const result = settleCulturalCommitments({
      balance: -20,
      years: 1,
      commitments: [commitment({ erosion: "100" })],
    });
    expect(result.outcomes[0]).toMatchObject({ status: "REVERTED", upkeep: "0" });
  });

  it("holds eroded changes until the balance clears the resume threshold", () => {
    const held = settleCulturalCommitments({
      balance: 20,
      years: 1,
      commitments: [commitment({ erosion: "50" })],
    });
    expect(held.outcomes[0]).toMatchObject({ action: "HOLD", erosion: "50", progressDelta: "0" });

    const resumed = settleCulturalCommitments({
      balance: 60,
      years: 1,
      commitments: [commitment({ erosion: "50" })],
    });
    expect(resumed.outcomes[0]).toMatchObject({ action: "RECOVER", erosion: "0" });
    expect(resumed.outcomes[0].progressDelta).toBe("-50");
  });

  it("closes commitments whose stage was changed elsewhere", () => {
    const result = settleCulturalCommitments({
      balance: 100,
      years: 1,
      commitments: [commitment({ currentStage: 4 })],
    });
    expect(result.outcomes[0]).toMatchObject({ status: "SUPERSEDED", upkeep: "0" });
    expect(result.erodibleCount).toBe(0);
  });

  it("only drains stability and legitimacy monthly while in debt", () => {
    expect(deficitDrift(10)).toEqual({});
    expect(deficitDrift(-60)).toEqual({ stability: -0.1, legitimacy: -0.06 });
    expect(deficitDrift(-250)).toEqual({ stability: -0.4, legitimacy: -0.25 });
  });

  it("lets the real-time balance fall into debt but not below -250", () => {
    const result = accruePoliticalPower({
      balance: "10",
      incomePerGameDay: "-1",
      elapsedRealSeconds: 86_400,
      clock: { gameTimePerRealDayValue: 365, gameTimePerRealDayUnit: "DAY" },
    });
    expect(result.balance.toString()).toBe("-250");
  });
});

describe("political power income", () => {
  it("rewards legitimacy, stability, approval and capacity and loses to corruption", () => {
    const typical = calculatePoliticalPowerIncome({
      legitimacy: 60,
      stability: 60,
      governmentApproval: 55,
      stateCapacity: 58,
      corruption: 35,
    });
    expect(typical.total.toDecimalPlaces(2).toNumber()).toBeCloseTo(48.12, 2);
    const strong = calculatePoliticalPowerIncome({
      legitimacy: 90,
      stability: 90,
      governmentApproval: 80,
      stateCapacity: 85,
      corruption: 10,
    });
    expect(strong.total.gt(typical.total)).toBe(true);
  });

  it("keeps income inside its bounds and reports the clamp", () => {
    const collapsed = calculatePoliticalPowerIncome({
      legitimacy: 0,
      stability: 0,
      governmentApproval: 0,
      stateCapacity: 0,
      corruption: 100,
    });
    expect(collapsed.total.toString()).toBe("5");
    expect(collapsed.components.some((component) => component.key === "bounds")).toBe(true);
  });

  it("stores the net balance change per game day", () => {
    expect(netIncomePerGameDay("36.5").toString()).toBe("0.1");
    expect(netIncomePerGameDay("-73").toString()).toBe("-0.2");
    expect(netIncomePerGameDay("100000").toString()).toBe("10");
  });
});

describe("political power effects", () => {
  const base = {
    targetType: "COUNTRY",
    targetId: "country",
    operation: "ADD",
    reason: "테스트 효과",
  };

  it("lets events and judgments grant or take political power", () => {
    expect(
      validateEffect({ ...base, metric: "politicalPower", value: 40, durationTurns: null }).valid,
    ).toBe(true);
    expect(
      validateEffect({ ...base, metric: "politicalPower", value: 140, durationTurns: null }).valid,
    ).toBe(false);
  });

  it("requires a duration for political power income changes", () => {
    expect(
      validateEffect({ ...base, metric: "politicalPowerIncome", value: 10, durationTurns: null })
        .valid,
    ).toBe(false);
    expect(
      validateEffect({ ...base, metric: "politicalPowerIncome", value: 10, durationTurns: 3 })
        .valid,
    ).toBe(true);
  });
});

describe("law effects", () => {
  it("has no structural effect at default stages", () => {
    const effects = lawStructuralEffects(resolveLawStages([], "FREE_MARKET"));
    expect(effects.potentialGrowth).toBe("0");
    expect(effects.naturalUnemployment).toBe("0");
    expect(effects.drift).toEqual({});
    expect(fixedLawUpkeepItems(resolveLawStages([], "FREE_MARKET"))).toEqual([]);
  });

  it("sums the effects and fixed upkeep of active stages", () => {
    const stages = resolveLawStages(
      [
        { key: "conscriptionLaw", stage: 5 },
        { key: "tradePolicy", stage: 4 },
      ],
      "FREE_MARKET",
    );
    const effects = lawStructuralEffects(stages);
    expect(effects.potentialGrowth).toBe("-0.012");
    expect(effects.naturalUnemployment).toBe("-0.022");
    expect(effects.drift.stability).toBeCloseTo(-0.35, 10);
    expect(fixedLawUpkeepItems(stages).map((item) => item.upkeep)).toEqual(["80", "10"]);
  });

  it("fades the social drift of a change as society adapts or the change erodes", () => {
    const fresh = culturalCommitmentDrift({ fromStage: 2, toStage: 3, adaptation: 0, erosion: 0 });
    const adapted = culturalCommitmentDrift({
      fromStage: 2,
      toStage: 3,
      adaptation: 0.5,
      erosion: 0,
    });
    const eroded = culturalCommitmentDrift({
      fromStage: 2,
      toStage: 3,
      adaptation: 0,
      erosion: 75,
    });
    expect(fresh.democracy).toBeCloseTo(0.15, 10);
    expect(adapted.democracy).toBeCloseTo(0.075, 10);
    expect(eroded.democracy).toBeCloseTo(0.075, 10);
  });

  it("measures turn length in game years", () => {
    expect(turnLengthInYears("2042-01-01", "2042-12-31")).toBeCloseTo(1, 10);
    expect(
      new Decimal(turnLengthInYears("2042-01-01", "2042-06-30")).toDecimalPlaces(2).toNumber(),
    ).toBe(0.5);
  });
});
