export const SERIAL_CATEGORIES = ["ECONOMY", "POLITICS", "DIPLOMACY", "INTELLIGENCE"] as const;

export type SerialCategory = (typeof SERIAL_CATEGORIES)[number];

export const SERIAL_CATEGORY_LABELS: Record<SerialCategory, string> = {
  ECONOMY: "경제",
  POLITICS: "정치",
  DIPLOMACY: "외교",
  INTELLIGENCE: "정보",
};

export const POLICY_METRICS = {
  realGdpGrowth: { label: "실질 GDP 성장률", unit: "%p", source: "economic" },
  inflationRate: { label: "물가상승률", unit: "%p", source: "economic" },
  unemploymentRate: { label: "실업률", unit: "%p", source: "economic" },
  productivityIndex: { label: "생산성 지수", unit: "점", source: "economic" },
  incomeGini: { label: "소득 지니계수", unit: "p", source: "economic" },
  debtToGdp: { label: "GDP 대비 국가부채", unit: "%p", source: "economic" },
  currentAccountToGdp: { label: "GDP 대비 경상수지", unit: "%p", source: "economic" },
  stability: { label: "국가 안정도", unit: "점", source: "political" },
  governmentApproval: { label: "정권 지지도", unit: "%p", source: "political" },
  policySupport: { label: "정책 지지도", unit: "%p", source: "political" },
  legitimacy: { label: "정권 정당성", unit: "점", source: "political" },
  unrest: { label: "사회 불안", unit: "점", source: "political" },
  stateCapacity: { label: "행정 효율", unit: "점", source: "political" },
  corruption: { label: "부패 지수", unit: "점", source: "political" },
  democracy: { label: "민주성", unit: "점", source: "political" },
} as const;

export type PolicyMetric = keyof typeof POLICY_METRICS;

export const CATEGORY_TARGET_METRICS: Record<SerialCategory, PolicyMetric[]> = {
  ECONOMY: [
    "realGdpGrowth",
    "inflationRate",
    "unemploymentRate",
    "productivityIndex",
    "incomeGini",
    "debtToGdp",
    "governmentApproval",
    "stability",
  ],
  POLITICS: [
    "governmentApproval",
    "policySupport",
    "stability",
    "legitimacy",
    "unrest",
    "stateCapacity",
    "corruption",
    "democracy",
  ],
  DIPLOMACY: [
    "currentAccountToGdp",
    "governmentApproval",
    "policySupport",
    "stability",
    "legitimacy",
  ],
  INTELLIGENCE: [
    "policySupport",
    "governmentApproval",
    "stability",
    "unrest",
    "stateCapacity",
    "corruption",
  ],
};

export function isPolicyMetric(value: string): value is PolicyMetric {
  return value in POLICY_METRICS;
}

export function metricValue(
  metric: PolicyMetric,
  economic: Record<string, unknown>,
  political: Record<string, unknown>,
) {
  const source = POLICY_METRICS[metric].source === "economic" ? economic : political;
  const value = Number(source[metric]);
  return Number.isFinite(value) ? value : null;
}
