export const BUDGET_MANUAL_RANGE = 6;

export const BUDGET_SECTORS = [
  { key: "budgetDefense", label: "국방·안보", color: "#ef6a80" },
  { key: "budgetAdministration", label: "행정·치안", color: "#8fa0ab" },
  { key: "budgetIndustry", label: "산업·인프라", color: "#f2c14b" },
  { key: "budgetEducation", label: "교육·연구", color: "#6fe3e3" },
  { key: "budgetWelfare", label: "보건·복지", color: "#7ff0b4" },
  { key: "budgetDiplomacy", label: "외교·문화", color: "#b28ce8" },
] as const;

export type BudgetSectorKey = (typeof BUDGET_SECTORS)[number]["key"];
export type BudgetAllocation = Record<BudgetSectorKey, number>;

export const BUDGET_PRESETS = {
  BALANCED: {
    label: "균형 운영",
    allocation: {
      budgetDefense: 18,
      budgetAdministration: 15,
      budgetIndustry: 22,
      budgetEducation: 17,
      budgetWelfare: 20,
      budgetDiplomacy: 8,
    },
  },
  GROWTH_FIRST: {
    label: "성장 우선",
    allocation: {
      budgetDefense: 14,
      budgetAdministration: 12,
      budgetIndustry: 34,
      budgetEducation: 18,
      budgetWelfare: 14,
      budgetDiplomacy: 8,
    },
  },
  WELFARE_STATE: {
    label: "복지국가",
    allocation: {
      budgetDefense: 10,
      budgetAdministration: 14,
      budgetIndustry: 16,
      budgetEducation: 21,
      budgetWelfare: 32,
      budgetDiplomacy: 7,
    },
  },
  STATE_DEVELOPMENT: {
    label: "국가 개발",
    allocation: {
      budgetDefense: 18,
      budgetAdministration: 18,
      budgetIndustry: 32,
      budgetEducation: 15,
      budgetWelfare: 12,
      budgetDiplomacy: 5,
    },
  },
  NATIONAL_SECURITY: {
    label: "국가 안보",
    allocation: {
      budgetDefense: 32,
      budgetAdministration: 22,
      budgetIndustry: 18,
      budgetEducation: 10,
      budgetWelfare: 11,
      budgetDiplomacy: 7,
    },
  },
  CIVIC_INVESTMENT: {
    label: "민생 투자",
    allocation: {
      budgetDefense: 10,
      budgetAdministration: 13,
      budgetIndustry: 19,
      budgetEducation: 25,
      budgetWelfare: 25,
      budgetDiplomacy: 8,
    },
  },
} as const satisfies Record<string, { label: string; allocation: BudgetAllocation }>;

export type BudgetPresetId = keyof typeof BUDGET_PRESETS;
export const BUDGET_PRESET_IDS = Object.keys(BUDGET_PRESETS) as BudgetPresetId[];

export function isBudgetPresetId(value: unknown): value is BudgetPresetId {
  return typeof value === "string" && BUDGET_PRESET_IDS.includes(value as BudgetPresetId);
}

export function getBudgetPresetContext({
  economicSystem,
  economicAxis,
  socialAxis,
}: {
  economicSystem: string;
  economicAxis: number | null;
  socialAxis: number | null;
}) {
  const economy = economicAxis ?? (economicSystem === "PLANNED" ? -35 : 35);
  const society = socialAxis ?? 0;
  const allowed = new Set<BudgetPresetId>(["BALANCED"]);

  if (economy >= -20 || economicSystem === "FREE_MARKET") allowed.add("GROWTH_FIRST");
  if (economy <= 20) allowed.add("WELFARE_STATE");
  if (economy <= 0 || society >= 25 || economicSystem === "PLANNED") {
    allowed.add("STATE_DEVELOPMENT");
  }
  if (society >= 15) allowed.add("NATIONAL_SECURITY");
  if (society <= 15) allowed.add("CIVIC_INVESTMENT");

  let recommended: BudgetPresetId = "BALANCED";
  let ideologyLabel = "중도 혼합";
  if (society >= 35) {
    recommended = "NATIONAL_SECURITY";
    ideologyLabel = "권위·안보";
  } else if (economy <= -35) {
    recommended = economicSystem === "PLANNED" ? "STATE_DEVELOPMENT" : "WELFARE_STATE";
    ideologyLabel = "국가·분배";
  } else if (economy >= 35) {
    recommended = "GROWTH_FIRST";
    ideologyLabel = "시장·성장";
  } else if (society <= -35) {
    recommended = "CIVIC_INVESTMENT";
    ideologyLabel = "자유·민생";
  } else if (economicSystem === "PLANNED") {
    recommended = "STATE_DEVELOPMENT";
    ideologyLabel = "계획·개발";
  }

  allowed.add(recommended);
  return { ideologyLabel, recommended, allowed: BUDGET_PRESET_IDS.filter((id) => allowed.has(id)) };
}

export function getBudgetSectorRange(presetId: BudgetPresetId, key: BudgetSectorKey) {
  const base = BUDGET_PRESETS[presetId].allocation[key];
  return {
    min: Math.max(0, base - BUDGET_MANUAL_RANGE),
    max: Math.min(100, base + BUDGET_MANUAL_RANGE),
  };
}

export function validateBudgetAllocation(presetId: BudgetPresetId, allocation: BudgetAllocation) {
  const total = BUDGET_SECTORS.reduce((sum, sector) => sum + allocation[sector.key], 0);
  if (total !== 100) return false;
  return BUDGET_SECTORS.every((sector) => {
    const value = allocation[sector.key];
    const range = getBudgetSectorRange(presetId, sector.key);
    return Number.isInteger(value) && value >= range.min && value <= range.max;
  });
}

export function rebalanceBudgetAllocation(
  current: BudgetAllocation,
  presetId: BudgetPresetId,
  changedKey: BudgetSectorKey,
  requestedValue: number,
): BudgetAllocation {
  const changedRange = getBudgetSectorRange(presetId, changedKey);
  const targetValue = Math.max(changedRange.min, Math.min(changedRange.max, requestedValue));
  const next = { ...current };
  const delta = targetValue - current[changedKey];
  if (!delta) return next;
  next[changedKey] = targetValue;

  let remaining = Math.abs(delta);
  const direction = delta > 0 ? -1 : 1;
  const candidates = BUDGET_SECTORS.filter((sector) => sector.key !== changedKey)
    .map((sector) => {
      const range = getBudgetSectorRange(presetId, sector.key);
      const room = direction < 0 ? next[sector.key] - range.min : range.max - next[sector.key];
      return { key: sector.key, room };
    })
    .sort((a, b) => b.room - a.room);

  for (const candidate of candidates) {
    const shift = Math.min(candidate.room, remaining);
    next[candidate.key] += shift * direction;
    remaining -= shift;
    if (!remaining) break;
  }

  if (remaining) next[changedKey] -= remaining * Math.sign(delta);
  return next;
}
