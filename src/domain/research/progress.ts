/**
 * 기술 파이프라인 3~6단계 중 실시간 연구 진행.
 *
 * - 연구 역량(연간 포인트)을 배분 비율대로 기술에 나눠 쓴다. 배분하지 않은 몫은 쓰이지 않는다.
 * - 분야 배율(산업 비중·전문 시설)과 기술 전파 보너스가 곱해진다.
 * - 기술 전파: 다른 나라가 이미 완성했고 기밀로 묶지 않은 기술은 그 수에 따라 최대 50%까지 빨라진다.
 * - 대형 시설이 필요한 기술은 시설이 없으면 진행하지 않는다.
 */

export const MAX_DIFFUSION_BONUS = 0.5;

export function diffusionBonus(knownByOthers: number) {
  if (!(knownByOthers > 0)) return 0;
  return Math.min(MAX_DIFFUSION_BONUS, 0.15 * Math.sqrt(knownByOthers));
}

export type ResearchTech = {
  id: string;
  code: string;
  name: string;
  field: string;
  cost: number;
  requiredFacilities: string[];
  prerequisiteIds: string[];
  exclusiveGroup: string | null;
};

export type ResearchState = {
  status: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";
  progressPoints: number;
};

export type ResearchStepInput = {
  pointsPerYear: number;
  gameDays: number;
  allocations: Array<{ techId: string; percent: number }>;
  techs: Map<string, ResearchTech>;
  states: Map<string, ResearchState>;
  /** 다른 나라 가운데 이 기술을 완성했고 기밀이 아닌 나라 수 */
  knownByOthers: Map<string, number>;
  fieldFactors: Record<string, number>;
  /** 이 나라가 가진 시설 종류 */
  facilities: ReadonlySet<string>;
};

export type ResearchBlockReason =
  | "COMPLETED"
  | "PREREQUISITE"
  | "EXCLUSIVE"
  | "FACILITY"
  | "UNKNOWN";

export function researchBlockReason(
  tech: ResearchTech,
  states: Map<string, ResearchState>,
  techs: Map<string, ResearchTech>,
  facilities: ReadonlySet<string>,
): ResearchBlockReason | null {
  if (states.get(tech.id)?.status === "COMPLETED") return "COMPLETED";
  if (tech.prerequisiteIds.some((id) => states.get(id)?.status !== "COMPLETED")) {
    return "PREREQUISITE";
  }
  if (tech.exclusiveGroup) {
    for (const [id, state] of states) {
      if (id === tech.id || state.status !== "COMPLETED") continue;
      if (techs.get(id)?.exclusiveGroup === tech.exclusiveGroup) return "EXCLUSIVE";
    }
  }
  if (tech.requiredFacilities.some((facility) => !facilities.has(facility))) return "FACILITY";
  return null;
}

export const BLOCK_REASON_LABELS: Record<ResearchBlockReason, string> = {
  COMPLETED: "이미 완성",
  PREREQUISITE: "선행 기술 필요",
  EXCLUSIVE: "상호배타 기술 완성됨",
  FACILITY: "필요 시설 없음",
  UNKNOWN: "알 수 없는 기술",
};

export function researchStep(input: ResearchStepInput) {
  const budget = Math.max(0, input.pointsPerYear) * (Math.max(0, input.gameDays) / 365);
  const updates: Array<{
    techId: string;
    before: number;
    after: number;
    gained: number;
    completed: boolean;
    blocked: ResearchBlockReason | null;
  }> = [];
  let used = 0;
  // 완성한 기술의 배분은 비어 있는 몫으로 보고, 합계 조정에서도 뺀다.
  const active = input.allocations.filter(
    (item) => input.states.get(item.techId)?.status !== "COMPLETED",
  );
  const totalPercent = active.reduce((sum, item) => sum + Math.max(0, item.percent), 0);
  const scale = totalPercent > 100 ? 100 / totalPercent : 1;
  for (const allocation of active) {
    const percent = Math.max(0, allocation.percent) * scale;
    if (!percent) continue;
    const tech = input.techs.get(allocation.techId);
    if (!tech) {
      updates.push({
        techId: allocation.techId,
        before: 0,
        after: 0,
        gained: 0,
        completed: false,
        blocked: "UNKNOWN",
      });
      continue;
    }
    const state = input.states.get(tech.id) ?? { status: "AVAILABLE" as const, progressPoints: 0 };
    const blocked = researchBlockReason(tech, input.states, input.techs, input.facilities);
    if (blocked) {
      updates.push({
        techId: tech.id,
        before: state.progressPoints,
        after: state.progressPoints,
        gained: 0,
        completed: false,
        blocked,
      });
      continue;
    }
    const share = budget * (percent / 100);
    const multiplier =
      (input.fieldFactors[tech.field] ?? 1) *
      (1 + diffusionBonus(input.knownByOthers.get(tech.id) ?? 0));
    const gained = share * multiplier;
    const after = Math.min(tech.cost, state.progressPoints + gained);
    used += share;
    updates.push({
      techId: tech.id,
      before: state.progressPoints,
      after: Math.round(after * 10_000) / 10_000,
      gained: Math.round(gained * 10_000) / 10_000,
      completed: after >= tech.cost,
      blocked: null,
    });
  }
  return {
    budget: Math.round(budget * 10_000) / 10_000,
    used: Math.round(used * 10_000) / 10_000,
    wasted: Math.round(Math.max(0, budget - used) * 10_000) / 10_000,
    updates,
  };
}

/** 남은 포인트를 지금 배분으로 채우는 데 걸리는 게임 일수 */
export function estimatedDays(input: {
  remaining: number;
  pointsPerYear: number;
  percent: number;
  multiplier: number;
}) {
  const perDay =
    (Math.max(0, input.pointsPerYear) / 365) *
    (Math.max(0, input.percent) / 100) *
    input.multiplier;
  if (!(perDay > 0)) return null;
  return Math.ceil(Math.max(0, input.remaining) / perDay);
}
