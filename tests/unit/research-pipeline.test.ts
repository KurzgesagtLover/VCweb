import { describe, expect, it } from "vitest";
import {
  clampTickSeconds,
  MAX_GAME_DAYS_PER_TICK,
  realtimeStep,
  tickDue,
} from "../../src/domain/realtime/clock";
import {
  advanceEducation,
  enrollmentTarget,
  fieldFactor,
  researchCapacity,
} from "../../src/domain/research/capacity";
import {
  diffusionBonus,
  estimatedDays,
  researchStep,
  type ResearchState,
  type ResearchTech,
} from "../../src/domain/research/progress";

const DAY = 86_400_000;

const tech = (id: string, overrides: Partial<ResearchTech> = {}): ResearchTech => ({
  id,
  code: id.toUpperCase(),
  name: id,
  field: "산업",
  cost: 100,
  requiredFacilities: [],
  prerequisiteIds: [],
  exclusiveGroup: null,
  ...overrides,
});

describe("realtime clock", () => {
  it("advances by the game time since the last tick and caps catch-up", () => {
    const start = new Date("2087-04-01T00:00:00Z");
    expect(realtimeStep({ lastGameAt: null, gameNow: start })?.gameDays).toBe(0);
    const step = realtimeStep({
      lastGameAt: start,
      gameNow: new Date(start.getTime() + 2.5 * DAY),
    });
    expect(step?.gameDays).toBeCloseTo(2.5, 6);
    const capped = realtimeStep({
      lastGameAt: start,
      gameNow: new Date(start.getTime() + 90 * DAY),
    });
    expect(capped?.gameDays).toBe(MAX_GAME_DAYS_PER_TICK);
    expect(capped?.capped).toBe(true);
    expect(
      realtimeStep({ lastGameAt: start, gameNow: new Date(start.getTime() - DAY) })?.gameDays,
    ).toBe(0);
  });

  it("respects the tick period", () => {
    const now = new Date("2026-10-13T00:00:00Z");
    expect(tickDue(null, now, 60)).toBe(true);
    expect(tickDue(new Date(now.getTime() - 30_000), now, 60)).toBe(false);
    expect(tickDue(new Date(now.getTime() - 60_000), now, 60)).toBe(true);
    expect(clampTickSeconds(1)).toBe(10);
    expect(clampTickSeconds(99999)).toBe(3600);
  });
});

describe("education and research capacity", () => {
  const base = {
    universityAge: 2_400_000,
    workingAge: 16_800_000,
    previous: null,
    gdpPerCapita: 44_000,
    academicStage: 3,
    literacyStage: 3,
    universityLevels: 0,
    educationTier: "NORMAL" as const,
    years: 0.25,
  };

  it("raises university entry with income, institutions and education budget", () => {
    expect(enrollmentTarget(base)).toBeGreaterThan(
      enrollmentTarget({ ...base, gdpPerCapita: 4_000 }),
    );
    expect(enrollmentTarget({ ...base, educationTier: "GAP" })).toBeLessThan(
      enrollmentTarget(base),
    );
    expect(enrollmentTarget({ ...base, academicStage: 5 })).toBeGreaterThan(enrollmentTarget(base));
  });

  it("accumulates graduates and retires older workers", () => {
    const first = advanceEducation(base);
    expect(first.initialized).toBe(true);
    const next = advanceEducation({
      ...base,
      previous: { tertiaryWorkers: first.tertiaryWorkers, enrollmentRate: 0.1 },
      years: 1,
    });
    expect(next.enrollmentRate).toBeGreaterThan(0.1);
    expect(next.enrollmentRate).toBeLessThan(first.enrollmentTarget);
    const expected = first.tertiaryWorkers * (1 - 1 / 40) + next.graduatesPerYear;
    expect(next.tertiaryWorkers).toBeCloseTo(expected, 0);
  });

  it("gives the reference country about 150 points a year", () => {
    const capacity = researchCapacity({
      tertiaryWorkers: 5_000_000,
      academicStage: 3,
      gdpMillions: 1_200_000,
      researchInvestmentRate: 0.025,
      educationTier: "NORMAL",
      corporateRdMillions: 0,
      instituteLevels: 0,
      researchFacilityStage: 3,
    });
    expect(capacity.pointsPerYear).toBeGreaterThan(120);
    expect(capacity.pointsPerYear).toBeLessThan(200);
    const starved = researchCapacity({
      tertiaryWorkers: 5_000_000,
      academicStage: 3,
      gdpMillions: 1_200_000,
      researchInvestmentRate: 0.025,
      educationTier: "PARALYSIS",
      corporateRdMillions: 0,
      instituteLevels: 0,
      researchFacilityStage: 3,
    });
    expect(starved.pointsPerYear).toBeLessThan(capacity.pointsPerYear);
  });

  it("scales fields by related industry and specialist facilities", () => {
    expect(fieldFactor("정보", { DIG: 0.24 }, {})).toBeGreaterThan(1);
    expect(fieldFactor("정보", { DIG: 0.03 }, {})).toBeLessThan(1);
    expect(fieldFactor("생명", {}, { biological_research_facility: 2 })).toBeCloseTo(1.2, 4);
    expect(fieldFactor("생명", {}, { biological_research_facility: 9 })).toBeCloseTo(1.3, 4);
  });
});

describe("realtime research progress", () => {
  const techs = new Map<string, ResearchTech>([
    ["a", tech("a")],
    ["b", tech("b", { prerequisiteIds: ["a"] })],
    ["c", tech("c", { requiredFacilities: ["fusion_research_facility"] })],
    ["d", tech("d", { cost: 10 })],
  ]);

  it("spends capacity by allocation and blocks missing prerequisites or facilities", () => {
    const states = new Map<string, ResearchState>();
    const step = researchStep({
      pointsPerYear: 365,
      gameDays: 10,
      allocations: [
        { techId: "a", percent: 50 },
        { techId: "b", percent: 25 },
        { techId: "c", percent: 25 },
      ],
      techs,
      states,
      knownByOthers: new Map(),
      fieldFactors: { 산업: 1 },
      facilities: new Set(),
    });
    expect(step.budget).toBe(10);
    const byId = new Map(step.updates.map((update) => [update.techId, update]));
    expect(byId.get("a")?.after).toBeCloseTo(5, 6);
    expect(byId.get("b")?.blocked).toBe("PREREQUISITE");
    expect(byId.get("c")?.blocked).toBe("FACILITY");
    expect(step.wasted).toBeCloseTo(5, 6);
  });

  it("completes technologies and speeds up known ones", () => {
    const step = researchStep({
      pointsPerYear: 365,
      gameDays: 20,
      allocations: [{ techId: "d", percent: 100 }],
      techs,
      states: new Map(),
      knownByOthers: new Map([["d", 4]]),
      fieldFactors: {},
      facilities: new Set(),
    });
    expect(step.updates[0].completed).toBe(true);
    expect(step.updates[0].after).toBe(10);
    expect(diffusionBonus(4)).toBeCloseTo(0.3, 6);
    expect(diffusionBonus(100)).toBe(0.5);
    expect(diffusionBonus(0)).toBe(0);
  });

  it("frees the share of completed technologies instead of scaling the rest down", () => {
    const step = researchStep({
      pointsPerYear: 365,
      gameDays: 10,
      allocations: [
        { techId: "a", percent: 60 },
        { techId: "d", percent: 60 },
      ],
      techs,
      states: new Map<string, ResearchState>([["a", { status: "COMPLETED", progressPoints: 100 }]]),
      knownByOthers: new Map(),
      fieldFactors: {},
      facilities: new Set(),
    });
    expect(step.updates.map((update) => update.techId)).toEqual(["d"]);
    expect(step.updates[0].after).toBeCloseTo(6, 6);
    expect(step.wasted).toBeCloseTo(4, 6);
  });

  it("scales over-allocated plans and estimates time to finish", () => {
    const step = researchStep({
      pointsPerYear: 365,
      gameDays: 1,
      allocations: [
        { techId: "a", percent: 100 },
        { techId: "d", percent: 100 },
      ],
      techs,
      states: new Map(),
      knownByOthers: new Map(),
      fieldFactors: {},
      facilities: new Set(),
    });
    expect(step.used).toBeCloseTo(1, 6);
    expect(estimatedDays({ remaining: 50, pointsPerYear: 365, percent: 50, multiplier: 1 })).toBe(
      100,
    );
    expect(
      estimatedDays({ remaining: 50, pointsPerYear: 365, percent: 0, multiplier: 1 }),
    ).toBeNull();
  });
});
