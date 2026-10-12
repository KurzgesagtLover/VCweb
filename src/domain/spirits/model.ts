import { z } from "zod";
import { BUDGET_SECTORS, type BudgetSectorKey } from "@/src/domain/economy/budget";
import {
  addDrifts,
  formatMonthlyDrift,
  POLITICAL_LEVEL_METRICS,
  type MonthlyDrift,
} from "@/src/domain/politics/drift";

/**
 * 국가정신.
 *
 * 국가에 붙는 이름 있는 상시 효과다. 사건 선택, 관리자, 세계 메커니즘, 특수 시스템 스크립트가 붙이고 뗀다.
 * 효과는 다른 시스템과 같은 형식을 쓴다: 정치 지표는 월간 증감, 경제는 비누적 구조 보정,
 * 정치력은 연간 수입 보정, 예산은 부문별 필요 비중 배율이다.
 * 기간이 있으면 게임 날짜로 끝나는 날을 정하고, 그 날짜가 지난 턴 공개 때 사라진다.
 */

export const SPIRIT_CATEGORIES = [
  "POLITICS",
  "ECONOMY",
  "SOCIETY",
  "MILITARY",
  "DIPLOMACY",
  "WORLD",
  "SPECIAL",
] as const;
export type SpiritCategory = (typeof SPIRIT_CATEGORIES)[number];
export const SPIRIT_CATEGORY_LABELS: Record<SpiritCategory, string> = {
  POLITICS: "정치",
  ECONOMY: "경제",
  SOCIETY: "사회",
  MILITARY: "군사",
  DIPLOMACY: "외교",
  WORLD: "세계",
  SPECIAL: "특수",
};

export const SPIRIT_SOURCES = ["ADMIN", "EVENT", "JUDGMENT", "WORLD", "SCRIPT", "SYSTEM"] as const;
export type SpiritSource = (typeof SPIRIT_SOURCES)[number];
export const SPIRIT_SOURCE_LABELS: Record<SpiritSource, string> = {
  ADMIN: "관리자",
  EVENT: "사건",
  JUDGMENT: "연재 판정",
  WORLD: "세계 정세",
  SCRIPT: "특수 시스템",
  SYSTEM: "시스템",
};

const budgetKeys = BUDGET_SECTORS.map((sector) => sector.key) as [
  BudgetSectorKey,
  ...BudgetSectorKey[],
];

const driftSchema = z
  .object(
    Object.fromEntries(
      POLITICAL_LEVEL_METRICS.map((metric) => [
        metric,
        z.number().finite().min(-2).max(2).optional(),
      ]),
    ) as Record<(typeof POLITICAL_LEVEL_METRICS)[number], z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

/** 국가정신 효과. 범위를 넘는 값은 받지 않는다. */
export const spiritEffectsSchema = z
  .object({
    /** 정치 지표 월간 증감 */
    drift: driftSchema.default({}),
    /** 잠재성장률 보정(비율) */
    potentialGrowth: z.number().finite().min(-0.03).max(0.03).optional(),
    /** 균형 실업률 이동(비율) */
    naturalUnemployment: z.number().finite().min(-0.05).max(0.05).optional(),
    /** 물가 압력(비율) */
    inflationPressure: z.number().finite().min(-0.05).max(0.05).optional(),
    /** 세수 효율 보정(비율) */
    revenueEfficiency: z.number().finite().min(-0.3).max(0.3).optional(),
    /** 연간 정치력 수입 보정 */
    politicalPowerIncome: z.number().finite().min(-100).max(100).optional(),
    /** 예산 부문 필요 비중 배율 보정(+0.3이면 1.3배) */
    budgetNeed: z
      .partialRecord(z.enum(budgetKeys), z.number().finite().min(-0.5).max(1))
      .default({}),
  })
  .strict();

export type SpiritEffects = z.infer<typeof spiritEffectsSchema>;

export type SpiritTemplate = {
  key: string;
  name: string;
  description: string;
  category: SpiritCategory;
  effects: SpiritEffects;
  /** 기본 지속 기간(게임 개월). null이면 뗄 때까지 유지 */
  defaultDurationMonths: number | null;
};

const template = (
  key: string,
  name: string,
  category: SpiritCategory,
  description: string,
  effects: Partial<SpiritEffects>,
  defaultDurationMonths: number | null,
): SpiritTemplate => ({
  key,
  name,
  category,
  description,
  effects: spiritEffectsSchema.parse(effects),
  defaultDurationMonths,
});

/** 기본 국가정신. 사건·관리자·스크립트가 키로 붙인다. 수치는 임시값이다. */
export const SPIRIT_TEMPLATES: readonly SpiritTemplate[] = [
  template(
    "war-economy",
    "전시 경제",
    "MILITARY",
    "경제 전체가 전쟁 수행에 맞춰 돌아갑니다. 군비 수요가 크게 늘고 민간 성장은 눌립니다.",
    {
      drift: { stability: 0.05 },
      potentialGrowth: -0.002,
      politicalPowerIncome: 10,
      budgetNeed: { budgetDefense: 0.3 },
    },
    null,
  ),
  template(
    "national-unity",
    "국민 통합",
    "POLITICS",
    "위기 앞에서 국민이 정부를 중심으로 뭉치고 있습니다.",
    { drift: { stability: 0.1, legitimacy: 0.05 }, politicalPowerIncome: 5 },
    24,
  ),
  template(
    "reform-fatigue",
    "개혁 피로",
    "POLITICS",
    "잇따른 개혁에 사회가 지쳐 새 개혁을 반기지 않습니다.",
    { drift: { governmentApproval: -0.05 }, politicalPowerIncome: -5 },
    12,
  ),
  template(
    "regime-transition",
    "정권 교체 혼란",
    "POLITICS",
    "새 정부가 자리를 잡는 동안 행정과 정책이 흔들립니다.",
    { drift: { stateCapacity: -0.1, stability: -0.05 }, politicalPowerIncome: -10 },
    6,
  ),
  template(
    "corruption-scandal",
    "부패 스캔들",
    "POLITICS",
    "고위층 부패가 드러나 정부 신뢰가 무너지고 있습니다.",
    { drift: { legitimacy: -0.15, governmentApproval: -0.1, corruption: 0.05 } },
    12,
  ),
  template(
    "economic-crisis",
    "경제 위기",
    "ECONOMY",
    "금융 불안과 실물 침체가 겹쳐 경제 전반이 위축됐습니다.",
    {
      drift: { unrest: 0.15, governmentApproval: -0.1 },
      potentialGrowth: -0.01,
      naturalUnemployment: 0.01,
    },
    18,
  ),
  template(
    "tech-boom",
    "기술 붐",
    "ECONOMY",
    "신기술 투자가 몰리며 생산성이 빠르게 오르고 있습니다.",
    { potentialGrowth: 0.004, inflationPressure: 0.002 },
    24,
  ),
  template(
    "demographic-crisis",
    "인구 위기",
    "SOCIETY",
    "급속한 고령화로 복지 수요가 늘고 노동력이 줄고 있습니다.",
    { potentialGrowth: -0.002, budgetNeed: { budgetWelfare: 0.15 } },
    null,
  ),
  template(
    "social-polarization",
    "사회 양극화",
    "SOCIETY",
    "계층·세대·지역 갈등이 깊어져 타협이 어려워졌습니다.",
    { drift: { unrest: 0.08, stability: -0.05 } },
    null,
  ),
  template(
    "international-isolation",
    "국제 고립",
    "DIPLOMACY",
    "제재와 외교 단절로 대외 활동이 막혀 있습니다.",
    {
      drift: { legitimacy: -0.05 },
      potentialGrowth: -0.003,
      budgetNeed: { budgetDiplomacy: 0.3 },
    },
    null,
  ),
];

export function spiritTemplate(key: string) {
  return SPIRIT_TEMPLATES.find((item) => item.key === key) ?? null;
}

export function requireSpiritTemplate(key: string) {
  const found = spiritTemplate(key);
  if (!found) throw new Error(`등록되지 않은 국가정신입니다: ${key}`);
  return found;
}

/** 직접 만드는 국가정신의 입력 형식 */
export const customSpiritSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "키는 영문 소문자·숫자·-만 쓸 수 있습니다."),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(1000).default(""),
  category: z.enum(SPIRIT_CATEGORIES).default("SPECIAL"),
  effects: spiritEffectsSchema,
});

export type CustomSpirit = z.infer<typeof customSpiritSchema>;

/** 사건 선택지에 붙는 국가정신 변경 */
export const spiritChangeSchema = z.object({
  action: z.enum(["GRANT", "REMOVE"]).default("GRANT"),
  templateKey: z.string().trim().min(1).max(64),
  /** null이면 템플릿 기본 기간 */
  durationMonths: z.number().int().min(1).max(240).nullable().default(null),
});

export type SpiritChange = z.infer<typeof spiritChangeSchema>;

export function parseSpiritChanges(value: unknown): SpiritChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = spiritChangeSchema.safeParse(item);
    return parsed.success && spiritTemplate(parsed.data.templateKey) ? [parsed.data] : [];
  });
}

export function parseSpiritEffects(value: unknown): SpiritEffects {
  const parsed = spiritEffectsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : spiritEffectsSchema.parse({});
}

export type CombinedSpiritEffects = {
  drift: MonthlyDrift;
  structural: {
    potentialGrowth: string;
    naturalUnemployment: string;
    inflationPressure: string;
    revenueEfficiency: string;
  };
  politicalPowerIncome: number;
  budgetNeed: Partial<Record<BudgetSectorKey, number>>;
};

const round = (value: number, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** 여러 국가정신의 효과를 합친다. */
export function combineSpiritEffects(list: SpiritEffects[]): CombinedSpiritEffects {
  const sum = (pick: (effects: SpiritEffects) => number | undefined) =>
    String(round(list.reduce((total, effects) => total + (pick(effects) ?? 0), 0)));
  const budgetNeed: Partial<Record<BudgetSectorKey, number>> = {};
  for (const effects of list) {
    for (const [key, value] of Object.entries(effects.budgetNeed ?? {})) {
      const sector = key as BudgetSectorKey;
      budgetNeed[sector] = round((budgetNeed[sector] ?? 0) + (value ?? 0), 4);
    }
  }
  return {
    drift: addDrifts(...list.map((effects) => effects.drift ?? {})),
    structural: {
      potentialGrowth: sum((effects) => effects.potentialGrowth),
      naturalUnemployment: sum((effects) => effects.naturalUnemployment),
      inflationPressure: sum((effects) => effects.inflationPressure),
      revenueEfficiency: sum((effects) => effects.revenueEfficiency),
    },
    politicalPowerIncome: round(
      list.reduce((total, effects) => total + (effects.politicalPowerIncome ?? 0), 0),
      4,
    ),
    budgetNeed,
  };
}

/** 화면용 효과 문구 */
export function describeSpiritEffects(effects: SpiritEffects) {
  const percentPoint = (value: number | undefined, label: string) =>
    value ? [`${label} ${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%p`] : [];
  const budgetLines = Object.entries(effects.budgetNeed ?? {}).flatMap(([key, value]) => {
    if (!value) return [];
    const label = BUDGET_SECTORS.find((sector) => sector.key === key)?.label ?? key;
    return [`${label} 필요 예산 ${value > 0 ? "+" : ""}${Math.round(value * 100)}%`];
  });
  return [
    ...formatMonthlyDrift(effects.drift ?? {}),
    ...percentPoint(effects.potentialGrowth, "잠재성장률"),
    ...percentPoint(effects.naturalUnemployment, "균형 실업률"),
    ...percentPoint(effects.inflationPressure, "물가 압력"),
    ...(effects.revenueEfficiency
      ? [
          `세수 효율 ${effects.revenueEfficiency > 0 ? "+" : ""}${(
            effects.revenueEfficiency * 100
          ).toFixed(1)}%`,
        ]
      : []),
    ...(effects.politicalPowerIncome
      ? [
          `정치력 수입 연 ${effects.politicalPowerIncome > 0 ? "+" : ""}${effects.politicalPowerIncome}`,
        ]
      : []),
    ...budgetLines,
  ];
}

const DAY_MS = 86_400_000;

/** 시작일(포함)에서 게임 개월 수만큼 지난 날의 전날(마지막으로 유지되는 날). */
export function spiritEndDate(startsOn: string, durationMonths: number | null) {
  if (durationMonths === null) return null;
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return null;
  const day = start.getUTCDate();
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + Math.max(0, Math.round(durationMonths)));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return new Date(end.getTime() - DAY_MS).toISOString().slice(0, 10);
}

/** 턴 끝 날짜까지 끝나는 국가정신인지 */
export function spiritEndsWithin(endsOn: string | null, turnGameDateEnd: string) {
  return endsOn !== null && endsOn <= turnGameDateEnd;
}

/** AI 사건 생성에 넘기는 국가정신 목록 */
export function spiritTemplateCatalog() {
  return SPIRIT_TEMPLATES.map((item) => ({
    key: item.key,
    name: item.name,
    category: item.category,
    summary: describeSpiritEffects(item.effects).join(", "),
    defaultDurationMonths: item.defaultDurationMonths,
  }));
}
