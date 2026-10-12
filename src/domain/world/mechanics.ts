import { addDrifts, type MonthlyDrift } from "@/src/domain/politics/drift";

/**
 * 세계 공통 메커니즘.
 *
 * 캠페인 전체가 공유하는 진행도 하나와, 진행도 구간마다 모든 국가에 붙는 공통 국가정신(효과),
 * 국가가 정치력·예산을 들여 진행도를 낮추는 행동으로 이루어진다. 진행도는 아무도 손대지 않으면
 * 연간 지수 증가율과 고정 증가량만큼 오른다. 케슬러 증후군이 첫 사례이고,
 * 다른 전 지구적 위기도 같은 형식으로 정의한다.
 */

export type WorldMechanicStage = {
  key: string;
  label: string;
  description: string;
  /** 진행도가 이 값 이상이면 이 단계 */
  from: number;
  drift: MonthlyDrift;
  /** 잠재성장률 보정(비율) */
  potentialGrowth?: string;
  /** 균형 실업률 이동(비율) */
  naturalUnemployment?: string;
  /** 물가 압력(비율) */
  inflationPressure?: string;
  /** 세수 효율 보정(비율) */
  revenueEfficiency?: string;
};

export type WorldMechanicAction = {
  key: string;
  label: string;
  description: string;
  /** 모두 완료해야 하는 기술 코드. 비어 있으면 조건 없음 */
  requiredTechCodes: string[];
  /** 주문할 때 바로 빠지는 정치력 */
  politicalPowerCost: number;
  /** $1M 단위 특별 지출. 계산 단계에서 국가부채로 들어간다 */
  budgetCost: number;
  /** 턴 공개 때 줄어드는 진행도 */
  reduction: number;
  /** 같은 국가가 다시 쓰려면 지나야 하는 게임 개월 */
  cooldownMonths: number;
};

export type WorldMechanicDefinition = {
  key: string;
  label: string;
  /** 모든 국가에 붙는 국가정신 이름 */
  spiritLabel: string;
  description: string;
  initialProgress: number;
  /** 연간 지수 증가율 */
  annualGrowthRate: number;
  /** 연간 고정 증가량 */
  annualBaseGrowth: number;
  min: number;
  max: number;
  /** 이 값 이상이면 감소 행동이 듣지 않는다. null이면 없음 */
  irreversibleAbove: number | null;
  stages: WorldMechanicStage[];
  actions: WorldMechanicAction[];
  /** 수치가 아직 확정되지 않은 임시값인지 */
  provisional: boolean;
};

export const KESSLER_SYNDROME: WorldMechanicDefinition = {
  key: "kessler",
  label: "케슬러 증후군",
  spiritLabel: "궤도 잔해",
  description:
    "궤도에 떠 있는 수십만 기의 위성과 그 잔해가 서로 부딪히며 새 잔해를 만듭니다. 손대지 않으면 기하급수적으로 늘고, 궤도 서비스와 우주 진출을 막습니다.",
  initialProgress: 40,
  annualGrowthRate: 0.05,
  annualBaseGrowth: 0.5,
  min: 0,
  max: 100,
  irreversibleAbove: null,
  provisional: true,
  stages: [
    {
      key: "CLEAR",
      label: "궤도 안정",
      description: "궤도 충돌 위험이 관리 가능한 수준입니다.",
      from: 0,
      drift: {},
    },
    {
      key: "CONGESTED",
      label: "궤도 혼잡",
      description: "회피 기동이 늘어 위성 운용 비용이 오릅니다.",
      from: 20,
      drift: {},
      potentialGrowth: "-0.0005",
    },
    {
      key: "DEBRIS_ALERT",
      label: "잔해 경보",
      description: "통신·항법 위성 장애가 잦아져 경제와 행정에 부담이 됩니다.",
      from: 40,
      drift: { stability: -0.02 },
      potentialGrowth: "-0.0015",
    },
    {
      key: "SERVICE_FAILURE",
      label: "궤도 서비스 장애",
      description: "위성 통신·항법·관측이 자주 끊겨 산업과 국가 행정이 흔들립니다.",
      from: 60,
      drift: { stability: -0.05, stateCapacity: -0.03 },
      potentialGrowth: "-0.003",
    },
    {
      key: "CASCADE",
      label: "연쇄 붕괴",
      description: "충돌이 충돌을 부르는 연쇄 붕괴로 궤도 대부분을 쓸 수 없습니다.",
      from: 80,
      drift: { stability: -0.1, stateCapacity: -0.06, unrest: 0.05 },
      potentialGrowth: "-0.006",
    },
  ],
  actions: [
    {
      key: "launch-restraint",
      label: "발사 자제 선언",
      description: "신규 위성 발사를 줄이겠다고 공식 선언하고 이행합니다.",
      requiredTechCodes: [],
      politicalPowerCost: 30,
      budgetCost: 0,
      reduction: 0.5,
      cooldownMonths: 12,
    },
    {
      key: "debris-tracking",
      label: "궤도 잔해 추적망",
      description: "지상 레이더와 광학 관측망으로 잔해를 추적해 충돌을 줄입니다.",
      requiredTechCodes: ["orbital-debris-tracking"],
      politicalPowerCost: 20,
      budgetCost: 800,
      reduction: 1.5,
      cooldownMonths: 6,
    },
    {
      key: "active-removal",
      label: "능동 잔해 제거",
      description: "포획·견인 위성으로 큰 잔해를 대기권으로 끌어내립니다.",
      requiredTechCodes: ["active-debris-removal"],
      politicalPowerCost: 40,
      budgetCost: 3000,
      reduction: 4,
      cooldownMonths: 12,
    },
  ],
};

export const WORLD_MECHANICS: readonly WorldMechanicDefinition[] = [KESSLER_SYNDROME];

export function worldMechanicDefinition(key: string) {
  return WORLD_MECHANICS.find((mechanic) => mechanic.key === key) ?? null;
}

export function requireWorldMechanic(key: string) {
  const definition = worldMechanicDefinition(key);
  if (!definition) throw new Error("등록되지 않은 세계 메커니즘입니다.");
  return definition;
}

export function worldMechanicAction(definition: WorldMechanicDefinition, actionKey: string) {
  return definition.actions.find((action) => action.key === actionKey) ?? null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

export function mechanicStage(definition: WorldMechanicDefinition, progress: number) {
  let current = definition.stages[0];
  for (const stage of definition.stages) {
    if (progress >= stage.from) current = stage;
  }
  return current;
}

/**
 * 한 턴 동안의 진행도 변화.
 * 지수 증가와 고정 증가를 먼저 더하고, 감소 행동을 뺀다.
 * 비가역 구간에 들어가 있으면 감소 행동이 듣지 않는다.
 */
export function advanceWorldMechanic(
  definition: WorldMechanicDefinition,
  input: { progress: number; years: number; reductions: number },
) {
  const before = clamp(
    Number.isFinite(input.progress) ? input.progress : 0,
    definition.min,
    definition.max,
  );
  const years = Math.max(0, Number.isFinite(input.years) ? input.years : 0);
  const grown = clamp(
    before * Math.pow(1 + definition.annualGrowthRate, years) + definition.annualBaseGrowth * years,
    definition.min,
    definition.max,
  );
  const locked = definition.irreversibleAbove !== null && before >= definition.irreversibleAbove;
  const requested = Math.max(0, Number.isFinite(input.reductions) ? input.reductions : 0);
  const reduction = locked ? 0 : requested;
  const after = clamp(grown - reduction, definition.min, definition.max);
  return {
    before: round4(before),
    natural: round4(grown - before),
    reduction: round4(grown - after),
    after: round4(after),
    locked,
    stage: mechanicStage(definition, after),
  };
}

export type WorldEffects = {
  drift: MonthlyDrift;
  structural: {
    potentialGrowth: string;
    naturalUnemployment: string;
    inflationPressure: string;
    revenueEfficiency: string;
  };
  spirits: Array<{ mechanicKey: string; label: string; stageKey: string; stageLabel: string }>;
};

const sum = (values: Array<string | undefined>) =>
  String(round4(values.reduce((total, value) => total + Number(value ?? 0), 0)));

/** 현재 진행도들의 공통 국가정신 효과를 합친다. */
export function worldStageEffects(
  states: Array<{ definition: WorldMechanicDefinition; progress: number }>,
): WorldEffects {
  const stages = states.map((state) => ({
    definition: state.definition,
    stage: mechanicStage(state.definition, state.progress),
  }));
  return {
    drift: addDrifts(...stages.map(({ stage }) => stage.drift)),
    structural: {
      potentialGrowth: sum(stages.map(({ stage }) => stage.potentialGrowth)),
      naturalUnemployment: sum(stages.map(({ stage }) => stage.naturalUnemployment)),
      inflationPressure: sum(stages.map(({ stage }) => stage.inflationPressure)),
      revenueEfficiency: sum(stages.map(({ stage }) => stage.revenueEfficiency)),
    },
    spirits: stages.map(({ definition, stage }) => ({
      mechanicKey: definition.key,
      label: definition.spiritLabel,
      stageKey: stage.key,
      stageLabel: stage.label,
    })),
  };
}

export type WorldActionContext = {
  turnOpen: boolean;
  balance: number;
  completedTechCodes: ReadonlySet<string>;
  /** 이 국가가 같은 행동을 마지막으로 시행한 턴이 끝난 뒤 지난 개월. 없으면 null */
  monthsSinceLastUse: number | null;
  hasPendingOrder: boolean;
  techNames?: ReadonlyMap<string, string>;
};

const COOLDOWN_TOLERANCE_MONTHS = 0.1;

export function evaluateWorldAction(action: WorldMechanicAction, context: WorldActionContext) {
  const missing = action.requiredTechCodes.filter((code) => !context.completedTechCodes.has(code));
  const deny = (reason: string) => ({ allowed: false, reason, missingTechCodes: missing });
  if (!context.turnOpen) return deny("턴이 열려 있을 때만 시행할 수 있습니다.");
  if (missing.length) {
    const names = missing.map((code) => context.techNames?.get(code) ?? code);
    return deny(`기술이 필요합니다: ${names.join(", ")}`);
  }
  if (context.hasPendingOrder) return deny("이미 이번 턴에 시행을 기다리는 같은 행동이 있습니다.");
  if (
    context.monthsSinceLastUse !== null &&
    context.monthsSinceLastUse < action.cooldownMonths - COOLDOWN_TOLERANCE_MONTHS
  ) {
    return deny(`최근 시행 뒤 ${action.cooldownMonths}개월이 지나야 다시 할 수 있습니다.`);
  }
  if (context.balance < action.politicalPowerCost) return deny("정치력이 부족합니다.");
  return { allowed: true, reason: null, missingTechCodes: missing };
}
