import Decimal from "decimal.js";
import {
  DEFAULT_DEVELOPMENT_STAGE,
  DEVELOPMENT_PROGRESS_BOUNDARY,
  SOCIAL_INSTITUTIONS,
} from "@/src/domain/development/tracks";
import type { EconomicSystem } from "@/src/domain/policy/model";
import { addDrifts, formatMonthlyDrift, scaleDrift, type MonthlyDrift } from "./drift";
import { clampPoliticalPower } from "./political-power";

/**
 * 법·제도와 정치력 수지.
 *
 * 정치력으로 추진한 모든 것은 매년 유지비를 낸다.
 * - 고정형(FIXED): 그 단계를 유지하는 동안 매년 같은 유지비를 낸다. 징병법·수출 정책·경제법.
 * - 적응형(ADAPTIVE): 사회·문화 제도. 바꾼 해에 최대 유지비를 내고 사회가 적응하면서 줄어든다.
 *
 * 정치력이 0 아래로 내려가면 먼저 적응 중인 사회·문화 변경이 이전 단계 쪽으로 밀리고(진행 수치 감소)
 * 그만큼 유지비도 줄어든다. 잔고가 재개 기준 이상으로 회복되면 다시 앞으로 나아간다.
 * 밀어낼 변경이 없는데도 적자일 때만 안정도·정통성이 매월 떨어진다.
 *
 * 정치 수준 지표(안정도·부패 등)에 대한 효과는 모두 월간 증감이다. 한 번에 깎지 않는다.
 * 성장률·실업·물가 같은 흐름 지표는 그 단계가 유지되는 동안 걸리는 구조 보정이다.
 */

export const POLITICAL_POWER_RESUME_THRESHOLD = 50;
export const GAME_DAYS_PER_YEAR = 365;

export const SOCIAL_CHANGE_COST = 60;
export const SOCIAL_UPKEEP_MAX = 30;
export const SOCIAL_HALF_LIFE_YEARS = 3;
export const REGIME_RESISTANCE_FACTOR = 1.5;
export const CULTURAL_EROSION_PER_YEAR = 50;
export const CULTURAL_RECOVERY_PER_YEAR = 50;
export const CULTURAL_EROSION_LIMIT = DEVELOPMENT_PROGRESS_BOUNDARY;
/** 남은 적응형 유지비가 연 1 미만이면 적응이 끝난 것으로 본다. */
export const ADAPTED_UPKEEP_FLOOR = 1;

const INCOME_BASE = 50;
const INCOME_MIN = 5;
const INCOME_MAX = 200;
const NET_PER_GAME_DAY_LIMIT = 10;

export type LawUpkeepMode = "FIXED" | "ADAPTIVE";
export type LawCategory = "SOCIETY" | "MILITARY" | "ECONOMY";
export type LawStorage = "TRACK" | "LAW";

export type LawStructuralEffect = {
  /** 잠재성장률 보정. 비율이며 0.003은 +0.3%p다. */
  potentialGrowth?: string;
  /** 균형 실업률 이동. 매년 쌓이지 않고 실업률이 수렴하는 지점을 옮긴다. */
  naturalUnemployment?: string;
  /** 물가 형성 압력. 물가 관성 때문에 장기 효과는 약 1.7배가 된다. */
  inflationPressure?: string;
  /** 정치 수준 지표의 월간 증감 */
  drift?: MonthlyDrift;
};

export type LawStage = {
  label: string;
  description: string;
  /** 이 단계로 들어갈 때 드는 정치력(고정형) */
  enterCost: number;
  /** 이 단계를 유지하는 연간 정치력(고정형) */
  upkeep: number;
  effects: LawStructuralEffect;
  requiresWar?: boolean;
  /** 군사 시스템에서 쓸 동원 가능 인구 비율. 지금은 표시만 한다. */
  manpowerShare?: string;
  economicSystem?: EconomicSystem;
};

export type LawDefinition = {
  key: string;
  label: string;
  category: LawCategory;
  storage: LawStorage;
  upkeepMode: LawUpkeepMode;
  defaultStage: number;
  cooldownTurns: number;
  stages: LawStage[];
};

export const LAW_CATEGORY_LABELS: Record<LawCategory, string> = {
  SOCIETY: "사회·문화",
  MILITARY: "국방",
  ECONOMY: "경제·무역",
};

const SOCIAL_LAWS: LawDefinition[] = SOCIAL_INSTITUTIONS.map((institution) => ({
  key: institution.key,
  label: institution.label,
  category: "SOCIETY",
  storage: "TRACK",
  upkeepMode: "ADAPTIVE",
  defaultStage: Math.min(DEFAULT_DEVELOPMENT_STAGE, institution.stages.length),
  cooldownTurns: 2,
  stages: institution.stages.map((label) => ({
    label,
    description: "",
    enterCost: SOCIAL_CHANGE_COST,
    upkeep: 0,
    effects: {},
  })),
}));

const POLICY_LAWS: LawDefinition[] = [
  {
    key: "conscriptionLaw",
    label: "징병법",
    category: "MILITARY",
    storage: "LAW",
    upkeepMode: "FIXED",
    defaultStage: 1,
    cooldownTurns: 2,
    stages: [
      {
        label: "지원병제",
        description: "직업 군인과 지원자만으로 병력을 유지합니다.",
        enterCost: 30,
        upkeep: 0,
        effects: {},
        manpowerShare: "0.01",
      },
      {
        label: "선택적 징병",
        description: "필요한 인원만 선발해 복무시킵니다.",
        enterCost: 50,
        upkeep: 5,
        effects: { potentialGrowth: "-0.0005", naturalUnemployment: "-0.002" },
        manpowerShare: "0.025",
      },
      {
        label: "보편 징병",
        description: "대상 연령 대부분이 의무 복무합니다.",
        enterCost: 80,
        upkeep: 15,
        effects: {
          potentialGrowth: "-0.0015",
          naturalUnemployment: "-0.005",
          drift: { stability: -0.05 },
        },
        manpowerShare: "0.05",
      },
      {
        label: "대규모 동원",
        description: "예비 병력까지 소집합니다. 전쟁 중에만 시행할 수 있습니다.",
        enterCost: 120,
        upkeep: 40,
        requiresWar: true,
        effects: {
          potentialGrowth: "-0.006",
          naturalUnemployment: "-0.012",
          inflationPressure: "0.002",
          drift: { stability: -0.15, governmentApproval: -0.05 },
        },
        manpowerShare: "0.1",
      },
      {
        label: "총동원",
        description: "징집 가능한 모든 인원을 전쟁에 투입합니다. 전쟁 중에만 시행할 수 있습니다.",
        enterCost: 150,
        upkeep: 80,
        requiresWar: true,
        effects: {
          potentialGrowth: "-0.015",
          naturalUnemployment: "-0.025",
          inflationPressure: "0.006",
          drift: { stability: -0.3, governmentApproval: -0.1 },
        },
        manpowerShare: "0.2",
      },
    ],
  },
  {
    key: "tradePolicy",
    label: "수출 정책",
    category: "ECONOMY",
    storage: "LAW",
    upkeepMode: "FIXED",
    defaultStage: 3,
    cooldownTurns: 2,
    stages: [
      {
        label: "폐쇄 경제",
        description: "대외 교역을 최소화하고 자급 체제를 유지합니다.",
        enterCost: 120,
        upkeep: 20,
        effects: {
          potentialGrowth: "-0.006",
          inflationPressure: "0.004",
          drift: { stability: 0.05, corruption: 0.05 },
        },
      },
      {
        label: "수출 제한",
        description: "전략 물자와 원자재 수출을 묶어 국내 공급을 우선합니다.",
        enterCost: 60,
        upkeep: 5,
        effects: {
          potentialGrowth: "-0.002",
          naturalUnemployment: "-0.002",
          inflationPressure: "0.0015",
        },
      },
      {
        label: "수출 중심",
        description: "수출 산업을 지원하면서 기존 교역 질서를 유지합니다.",
        enterCost: 50,
        upkeep: 0,
        effects: {},
      },
      {
        label: "자유 무역",
        description: "관세와 수출입 장벽을 낮춰 시장을 개방합니다.",
        enterCost: 80,
        upkeep: 10,
        effects: {
          potentialGrowth: "0.003",
          naturalUnemployment: "0.003",
          inflationPressure: "-0.0015",
          drift: { stability: -0.05 },
        },
      },
    ],
  },
  {
    key: "economyLaw",
    label: "경제법",
    category: "ECONOMY",
    storage: "LAW",
    upkeepMode: "FIXED",
    defaultStage: 3,
    cooldownTurns: 3,
    stages: [
      {
        label: "자유방임",
        description: "시장 개입과 재분배를 최소화합니다.",
        enterCost: 120,
        upkeep: 15,
        economicSystem: "FREE_MARKET",
        effects: {
          potentialGrowth: "0.004",
          naturalUnemployment: "0.006",
          drift: { stability: -0.15, governmentApproval: -0.05 },
        },
      },
      {
        label: "시장경제",
        description: "시장 경쟁을 원칙으로 하고 기본 규제만 둡니다.",
        enterCost: 60,
        upkeep: 0,
        economicSystem: "FREE_MARKET",
        effects: {
          potentialGrowth: "0.0015",
          naturalUnemployment: "0.002",
          drift: { stability: -0.05 },
        },
      },
      {
        label: "혼합경제",
        description: "시장과 공공 부문이 함께 경제를 운영합니다.",
        enterCost: 60,
        upkeep: 0,
        economicSystem: "FREE_MARKET",
        effects: {},
      },
      {
        label: "국가주도",
        description: "국가가 전략 산업과 투자를 이끕니다. 계획경제형으로 운영합니다.",
        enterCost: 80,
        upkeep: 10,
        economicSystem: "PLANNED",
        effects: {
          potentialGrowth: "0.001",
          naturalUnemployment: "-0.004",
          inflationPressure: "0.0015",
          drift: { corruption: 0.03 },
        },
      },
      {
        label: "중앙계획",
        description: "국가 계획이 생산과 분배를 결정합니다. 계획경제형으로 운영합니다.",
        enterCost: 150,
        upkeep: 25,
        economicSystem: "PLANNED",
        effects: {
          potentialGrowth: "-0.004",
          naturalUnemployment: "-0.01",
          inflationPressure: "0.004",
          drift: { stability: 0.1, corruption: 0.08, democracy: -0.05 },
        },
      },
    ],
  },
];

export const LAW_DEFINITIONS: readonly LawDefinition[] = [...SOCIAL_LAWS, ...POLICY_LAWS];
/** country_laws 테이블에 저장하는 법. 사회·문화 제도는 발전 트랙 단계를 그대로 쓴다. */
export const POLICY_LAW_KEYS = POLICY_LAWS.map((law) => law.key);

const LAW_BY_KEY = new Map(LAW_DEFINITIONS.map((law) => [law.key, law]));

export type LawStages = Record<string, number>;

export function lawDefinition(key: string) {
  return LAW_BY_KEY.get(key) ?? null;
}

export function requireLawDefinition(key: string) {
  const definition = lawDefinition(key);
  if (!definition) throw new Error("등록되지 않은 법·제도입니다.");
  return definition;
}

export function isValidLawStage(definition: LawDefinition, stage: number) {
  return Number.isInteger(stage) && stage >= 1 && stage <= definition.stages.length;
}

export function economyLawStageForSystem(system: EconomicSystem | string | null | undefined) {
  return system === "PLANNED" ? 4 : 3;
}

export function economicSystemForEconomyLaw(stage: number): EconomicSystem {
  return requireLawDefinition("economyLaw").stages[stage - 1]?.economicSystem ?? "FREE_MARKET";
}

export function defaultLawStage(
  definition: LawDefinition,
  economicSystem?: EconomicSystem | string | null,
) {
  if (definition.key === "economyLaw") return economyLawStageForSystem(economicSystem);
  return definition.defaultStage;
}

/** 저장된 단계가 없거나 범위를 벗어나면 기본 단계를 쓴다. */
export function resolveLawStages(
  stored: Array<{ key: string; stage: number }>,
  economicSystem?: EconomicSystem | string | null,
): LawStages {
  const byKey = new Map(stored.map((row) => [row.key, row.stage]));
  return Object.fromEntries(
    LAW_DEFINITIONS.map((definition) => {
      const stage = byKey.get(definition.key);
      return [
        definition.key,
        stage !== undefined && isValidLawStage(definition, stage)
          ? stage
          : defaultLawStage(definition, economicSystem),
      ];
    }),
  );
}

export function regimeResistanceFactor(
  definition: LawDefinition,
  currentStage: number,
  targetStage: number,
  democracy: number,
) {
  if (definition.upkeepMode !== "ADAPTIVE") return 1;
  if (targetStage > currentStage && democracy < 40) return REGIME_RESISTANCE_FACTOR;
  if (targetStage < currentStage && democracy > 60) return REGIME_RESISTANCE_FACTOR;
  return 1;
}

export type LawChangeQuote = {
  cost: string;
  upkeepMode: LawUpkeepMode;
  /** 고정형은 새 단계의 연간 유지비, 적응형은 시행 첫해의 최대 유지비 */
  upkeep: string;
  halfLifeYears: string;
  regimeFactor: string;
};

export function quoteLawChange(
  definition: LawDefinition,
  currentStage: number,
  targetStage: number,
  democracy: number,
): LawChangeQuote {
  if (definition.upkeepMode === "ADAPTIVE") {
    const factor = regimeResistanceFactor(definition, currentStage, targetStage, democracy);
    return {
      cost: new Decimal(SOCIAL_CHANGE_COST).mul(factor).toString(),
      upkeepMode: "ADAPTIVE",
      upkeep: new Decimal(SOCIAL_UPKEEP_MAX).mul(factor).toString(),
      halfLifeYears: String(SOCIAL_HALF_LIFE_YEARS),
      regimeFactor: String(factor),
    };
  }
  const target = definition.stages[targetStage - 1];
  return {
    cost: String(target?.enterCost ?? 0),
    upkeepMode: "FIXED",
    upkeep: String(target?.upkeep ?? 0),
    halfLifeYears: String(SOCIAL_HALF_LIFE_YEARS),
    regimeFactor: "1",
  };
}

export type LawChangeContext = {
  currentStage: number;
  targetStage: number;
  democracy: number;
  balance: Decimal.Value;
  atWar: boolean;
  /** 마지막으로 시행된 변경 뒤 지난 턴 수. 바꾼 적이 없으면 null */
  turnsSinceLastChange: number | null;
  hasPendingOrder: boolean;
  turnOpen: boolean;
};

export type LawChangeEvaluation = {
  allowed: boolean;
  reason: string | null;
  quote: LawChangeQuote | null;
};

export function evaluateLawChange(
  definition: LawDefinition,
  context: LawChangeContext,
): LawChangeEvaluation {
  if (!isValidLawStage(definition, context.targetStage)) {
    return { allowed: false, reason: "존재하지 않는 단계입니다.", quote: null };
  }
  if (Math.abs(context.targetStage - context.currentStage) !== 1) {
    return { allowed: false, reason: "한 번에 한 단계씩만 바꿀 수 있습니다.", quote: null };
  }
  const quote = quoteLawChange(
    definition,
    context.currentStage,
    context.targetStage,
    context.democracy,
  );
  const deny = (reason: string) => ({ allowed: false, reason, quote });
  if (!context.turnOpen) return deny("턴이 열려 있을 때만 바꿀 수 있습니다.");
  if (context.hasPendingOrder) return deny("이미 시행을 기다리는 변경이 있습니다.");
  if (
    context.turnsSinceLastChange !== null &&
    context.turnsSinceLastChange < definition.cooldownTurns
  ) {
    return deny(`최근 변경 뒤 ${definition.cooldownTurns}턴이 지나야 다시 바꿀 수 있습니다.`);
  }
  if (definition.stages[context.targetStage - 1]?.requiresWar && !context.atWar) {
    return deny("전쟁 중에만 시행할 수 있습니다.");
  }
  if (new Decimal(context.balance).lt(quote.cost)) return deny("정치력이 부족합니다.");
  return { allowed: true, reason: null, quote };
}

/**
 * 사회·문화 제도 변경이 사회에 퍼지는 동안의 월간 증감(적응 전 최대치).
 * 실제로는 (1 - 적응도) x (1 - 후퇴분)만큼만 걸리므로 사회가 적응할수록 약해진다.
 */
export function socialChangeDrift(fromStage: number, toStage: number): MonthlyDrift {
  if (toStage > fromStage) {
    return { democracy: 0.15, legitimacy: 0.05, stability: -0.15, unrest: 0.08 };
  }
  if (toStage < fromStage) {
    return { democracy: -0.15, legitimacy: -0.1, unrest: -0.1, corruption: 0.05 };
  }
  return {};
}

export function culturalCommitmentDrift(commitment: {
  fromStage: number;
  toStage: number;
  adaptation: Decimal.Value;
  erosion: Decimal.Value;
}) {
  const remaining = Decimal.max(0, new Decimal(1).minus(commitment.adaptation));
  const retention = Decimal.max(
    0,
    new Decimal(1).minus(new Decimal(commitment.erosion).div(CULTURAL_EROSION_LIMIT)),
  );
  return scaleDrift(
    socialChangeDrift(commitment.fromStage, commitment.toStage),
    remaining.mul(retention).toNumber(),
  );
}

export function adaptiveUpkeep(input: {
  upkeepMax: Decimal.Value;
  adaptation: Decimal.Value;
  erosion: Decimal.Value;
}) {
  const retention = Decimal.max(
    0,
    new Decimal(1).minus(new Decimal(input.erosion).div(CULTURAL_EROSION_LIMIT)),
  );
  return Decimal.max(
    0,
    new Decimal(input.upkeepMax).mul(new Decimal(1).minus(input.adaptation)).mul(retention),
  );
}

export function advanceAdaptation(
  adaptation: Decimal.Value,
  years: number,
  halfLifeYears: Decimal.Value,
) {
  const current = Decimal.min(1, Decimal.max(0, new Decimal(adaptation)));
  if (!(years > 0) || new Decimal(halfLifeYears).lte(0)) return current;
  const remaining = new Decimal(1)
    .minus(current)
    .mul(new Decimal("0.5").pow(new Decimal(years).div(halfLifeYears)));
  return Decimal.min(1, Decimal.max(0, new Decimal(1).minus(remaining)));
}

export type PoliticalPowerState = "NORMAL" | "HOLD" | "DEFICIT";

export function politicalPowerState(balance: Decimal.Value): PoliticalPowerState {
  const value = new Decimal(balance);
  if (value.lt(0)) return "DEFICIT";
  if (value.lt(POLITICAL_POWER_RESUME_THRESHOLD)) return "HOLD";
  return "NORMAL";
}

export type CulturalCommitment = {
  id: string;
  lawKey: string;
  fromStage: number;
  toStage: number;
  upkeepMax: string;
  halfLifeYears: string;
  adaptation: string;
  erosion: string;
  /** 지금 발전 트랙에 기록된 단계 */
  currentStage: number;
  /** 이번 공개에서 처음 시행된 변경이면 true. 첫해에는 최대 유지비를 그대로 낸다. */
  isNew: boolean;
};

export type CulturalCommitmentAction =
  | "NEW"
  | "ADAPT"
  | "ERODE"
  | "RECOVER"
  | "HOLD"
  | "REVERT"
  | "SUPERSEDE"
  | "ADAPTED";

export type CulturalCommitmentOutcome = {
  id: string;
  lawKey: string;
  status: "ACTIVE" | "ADAPTED" | "REVERTED" | "SUPERSEDED";
  action: CulturalCommitmentAction;
  adaptation: string;
  erosion: string;
  /** 사회제도 진척도에 더할 값. 적자로 밀리면 이전 단계 쪽, 회복하면 새 단계 쪽으로 움직인다. */
  progressDelta: string;
  upkeep: string;
};

export function settleCulturalCommitments(input: {
  balance: Decimal.Value;
  years: number;
  commitments: CulturalCommitment[];
}) {
  const state = politicalPowerState(input.balance);
  const years = Number.isFinite(input.years) ? Math.max(0, input.years) : 0;
  let erodibleCount = 0;
  const outcomes = input.commitments.map((commitment): CulturalCommitmentOutcome => {
    const base = { id: commitment.id, lawKey: commitment.lawKey };
    if (commitment.currentStage !== commitment.toStage) {
      return {
        ...base,
        status: "SUPERSEDED",
        action: "SUPERSEDE",
        adaptation: commitment.adaptation,
        erosion: commitment.erosion,
        progressDelta: "0",
        upkeep: "0",
      };
    }
    if (!commitment.isNew) erodibleCount += 1;
    const towardPrevious = Math.sign(commitment.fromStage - commitment.toStage);
    let adaptation = new Decimal(commitment.adaptation);
    let erosion = new Decimal(commitment.erosion);
    let erosionChange = new Decimal(0);
    let action: CulturalCommitmentAction;

    if (commitment.isNew) {
      action = "NEW";
    } else if (state === "DEFICIT") {
      const next = Decimal.min(
        CULTURAL_EROSION_LIMIT,
        erosion.plus(new Decimal(CULTURAL_EROSION_PER_YEAR).mul(years)),
      );
      erosionChange = next.minus(erosion);
      erosion = next;
      action = "ERODE";
    } else if (erosion.gt(0)) {
      if (state === "NORMAL") {
        const next = Decimal.max(
          0,
          erosion.minus(new Decimal(CULTURAL_RECOVERY_PER_YEAR).mul(years)),
        );
        erosionChange = next.minus(erosion);
        erosion = next;
        adaptation = advanceAdaptation(adaptation, years, commitment.halfLifeYears);
        action = "RECOVER";
      } else {
        action = "HOLD";
      }
    } else {
      adaptation = advanceAdaptation(adaptation, years, commitment.halfLifeYears);
      action = "ADAPT";
    }

    const progressDelta = erosionChange.mul(towardPrevious).toDecimalPlaces(4).toString();
    const adaptationValue = adaptation.toDecimalPlaces(8).toString();
    const erosionValue = erosion.toDecimalPlaces(4).toString();
    if (erosion.gte(CULTURAL_EROSION_LIMIT)) {
      return {
        ...base,
        status: "REVERTED",
        action: "REVERT",
        adaptation: adaptationValue,
        erosion: erosionValue,
        progressDelta,
        upkeep: "0",
      };
    }
    const upkeep = adaptiveUpkeep({ upkeepMax: commitment.upkeepMax, adaptation, erosion });
    if (!commitment.isNew && erosion.isZero() && upkeep.lt(ADAPTED_UPKEEP_FLOOR)) {
      return {
        ...base,
        status: "ADAPTED",
        action: "ADAPTED",
        adaptation: adaptationValue,
        erosion: "0",
        progressDelta,
        upkeep: "0",
      };
    }
    return {
      ...base,
      status: "ACTIVE",
      action,
      adaptation: adaptationValue,
      erosion: erosionValue,
      progressDelta,
      upkeep: upkeep.toDecimalPlaces(4).toString(),
    };
  });
  return { state, outcomes, erodibleCount };
}

/** 밀어낼 사회·문화 변경이 없는데도 적자일 때만 붙는 월간 손실 */
export function deficitDrift(balance: Decimal.Value): MonthlyDrift {
  const debt = Decimal.max(0, new Decimal(balance).neg());
  if (debt.isZero()) return {};
  return {
    stability: -Math.min(0.4, debt.div(600).toNumber()),
    legitimacy: -Math.min(0.25, debt.div(1000).toNumber()),
  };
}

export type IncomeComponent = { key: string; label: string; value: string };

export function calculatePoliticalPowerIncome(input: {
  legitimacy: number;
  stability: number;
  governmentApproval: number;
  stateCapacity: number;
  corruption: number;
  modifiers?: Decimal.Value;
}) {
  const bounded = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const legitimacyMultiplier = new Decimal(0.6).plus(
    new Decimal(bounded(input.legitimacy)).mul("0.007"),
  );
  const stabilityMultiplier = new Decimal(0.6).plus(
    new Decimal(bounded(input.stability)).mul("0.007"),
  );
  const base = new Decimal(INCOME_BASE);
  const scaled = base.mul(legitimacyMultiplier).mul(stabilityMultiplier);
  const approval = new Decimal(bounded(input.governmentApproval) - 50).mul("0.3");
  const capacity = new Decimal(bounded(input.stateCapacity) - 50).mul("0.2");
  const corruption = new Decimal(bounded(input.corruption)).mul("-0.2");
  const modifiers = new Decimal(input.modifiers ?? 0);
  const raw = scaled.plus(approval).plus(capacity).plus(corruption).plus(modifiers);
  const total = Decimal.min(INCOME_MAX, Decimal.max(INCOME_MIN, raw));
  const components: IncomeComponent[] = [
    { key: "base", label: "기본 통치력", value: base.toString() },
    { key: "legitimacyStability", label: "정통성·안정도", value: scaled.minus(base).toString() },
    { key: "approval", label: "정권 지지", value: approval.toString() },
    { key: "capacity", label: "행정 역량", value: capacity.toString() },
    { key: "corruption", label: "부패 손실", value: corruption.toString() },
  ];
  if (!modifiers.isZero()) {
    components.push({ key: "modifiers", label: "사건·판정 보정", value: modifiers.toString() });
  }
  if (!total.eq(raw)) {
    components.push({ key: "bounds", label: "하한·상한", value: total.minus(raw).toString() });
  }
  return {
    total,
    components,
    legitimacyMultiplier: legitimacyMultiplier.toString(),
    stabilityMultiplier: stabilityMultiplier.toString(),
  };
}

export type UpkeepItem = {
  key: string;
  lawKey: string;
  label: string;
  detail: string;
  mode: LawUpkeepMode;
  upkeep: string;
};

export function fixedLawUpkeepItems(stages: LawStages): UpkeepItem[] {
  return LAW_DEFINITIONS.filter((definition) => definition.upkeepMode === "FIXED").flatMap(
    (definition) => {
      const stage = definition.stages[(stages[definition.key] ?? definition.defaultStage) - 1];
      if (!stage || stage.upkeep <= 0) return [];
      return [
        {
          key: `fixed:${definition.key}`,
          lawKey: definition.key,
          label: definition.label,
          detail: stage.label,
          mode: "FIXED" as const,
          upkeep: String(stage.upkeep),
        },
      ];
    },
  );
}

export type LawEffectSource = {
  lawKey: string;
  label: string;
  stageLabel: string;
} & LawStructuralEffect;

/** 현재 단계들이 경제 계산에 거는 구조 보정과 정치 지표 월간 증감의 합 */
export function lawStructuralEffects(stages: LawStages) {
  let potentialGrowth = new Decimal(0);
  let naturalUnemployment = new Decimal(0);
  let inflationPressure = new Decimal(0);
  let drift: MonthlyDrift = {};
  const sources: LawEffectSource[] = [];
  for (const definition of LAW_DEFINITIONS) {
    const stage = definition.stages[(stages[definition.key] ?? definition.defaultStage) - 1];
    if (!stage) continue;
    const effects = stage.effects;
    if (
      !effects.potentialGrowth &&
      !effects.naturalUnemployment &&
      !effects.inflationPressure &&
      !effects.drift
    ) {
      continue;
    }
    potentialGrowth = potentialGrowth.plus(effects.potentialGrowth ?? 0);
    naturalUnemployment = naturalUnemployment.plus(effects.naturalUnemployment ?? 0);
    inflationPressure = inflationPressure.plus(effects.inflationPressure ?? 0);
    if (effects.drift) drift = addDrifts(drift, effects.drift);
    sources.push({
      lawKey: definition.key,
      label: definition.label,
      stageLabel: stage.label,
      ...effects,
    });
  }
  return {
    potentialGrowth: potentialGrowth.toString(),
    naturalUnemployment: naturalUnemployment.toString(),
    inflationPressure: inflationPressure.toString(),
    drift,
    sources,
  };
}

function percentPoint(value: string | undefined, label: string) {
  if (!value) return [];
  const points = new Decimal(value).mul(100).toDecimalPlaces(2).toNumber();
  if (!points) return [];
  return [`${label} ${points > 0 ? "+" : ""}${points}%p`];
}

/** 단계 효과를 화면에 보여 줄 문구 */
export function describeLawStageEffects(definition: LawDefinition, stageNumber: number) {
  const stage = definition.stages[stageNumber - 1];
  if (!stage) return [];
  const lines = [
    ...percentPoint(stage.effects.potentialGrowth, "잠재성장률"),
    ...percentPoint(stage.effects.naturalUnemployment, "균형 실업률"),
    ...percentPoint(stage.effects.inflationPressure, "물가 압력"),
    ...formatMonthlyDrift(stage.effects.drift ?? {}),
  ];
  if (definition.upkeepMode === "FIXED" && stage.upkeep > 0) {
    lines.push(`연 유지비 ${stage.upkeep}`);
  }
  if (stage.manpowerShare) {
    const share = new Decimal(stage.manpowerShare).mul(100).toDecimalPlaces(1).toNumber();
    lines.push(`동원 가능 인구 ${share}% (군사 시스템에서 사용)`);
  }
  if (stage.economicSystem === "PLANNED") lines.push("계획경제형 운영");
  return lines;
}

export function netIncomePerGameDay(netPerYear: Decimal.Value) {
  return Decimal.max(
    -NET_PER_GAME_DAY_LIMIT,
    Decimal.min(NET_PER_GAME_DAY_LIMIT, new Decimal(netPerYear).div(GAME_DAYS_PER_YEAR)),
  ).toDecimalPlaces(6);
}

/** 턴 구간의 게임 연수. 게임 날짜는 양 끝을 포함한다. */
export function turnLengthInYears(gameDateStart: string, gameDateEnd: string) {
  const start = Date.parse(`${gameDateStart}T00:00:00.000Z`);
  const end = Date.parse(`${gameDateEnd}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return (end - start + 86_400_000) / 86_400_000 / GAME_DAYS_PER_YEAR;
}

export { clampPoliticalPower };
