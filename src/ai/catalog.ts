export const AI_PROVIDERS = ["opencode_go", "openai"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const AI_TASK_TYPES = [
  "JUDGE_SUBMISSION",
  "GENERATE_OPPOSITION_ACTION",
  "GENERATE_TURN_EVENT",
  "GENERATE_AI_DIPLOMACY_RESPONSE",
] as const;
export type AiTaskType = (typeof AI_TASK_TYPES)[number];

export const AI_PROVIDER_CATALOG: Record<
  AiProviderName,
  { label: string; models: Array<{ id: string; label: string }> }
> = {
  opencode_go: {
    label: "OpenCode Go",
    models: [
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "glm-5.2", label: "GLM-5.2" },
    ],
  },
  openai: {
    label: "OpenAI",
    models: [
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    ],
  },
};

export const AI_TASK_LABELS: Record<AiTaskType, string> = {
  JUDGE_SUBMISSION: "연재 판정",
  GENERATE_OPPOSITION_ACTION: "야당 행동 생성",
  GENERATE_TURN_EVENT: "턴 사건 생성",
  GENERATE_AI_DIPLOMACY_RESPONSE: "AI 국가 외교 답변",
};

export const DEFAULT_AI_TASKS: Record<
  AiTaskType,
  { provider: AiProviderName; model: string; systemPrompt: string }
> = {
  JUDGE_SUBMISSION: {
    provider: "openai",
    model: "gpt-5.6-terra",
    systemPrompt:
      "당신은 국가정책 연재 판정관이다. 플레이어는 최고 통치자지만 국가 전체를 마음대로 바꾸는 전지적 존재가 아니다. 모호한 결과 선언이 아니라 제출문에 적힌 집행 주체, 예산, 대상, 일정, 행정 절차와 국가의 현재 역량만 평가한다. targetMetrics에 지정된 지표를 우선해 서로 연결된 복수 효과를 제안하고, projectedChanges에는 정책 효과가 나타나는 각 연차의 지표별 변화량과 단위를 JSON으로 작성한다. publicNarrative에는 시차, 부작용, 재정·행정 제약을 포함한 자연어 평가를 쓴다. 허용된 targetId와 효과 레지스트리 밖의 수치를 만들지 않는다. 계획경제형은 집행 효과가 더 크지만 실패 시 안정도 손실도 더 크게 평가한다. 홍보와 인지도는 포화될 수 있으며 과도한 홍보는 정책 효과를 떨어뜨린다.",
  },
  GENERATE_OPPOSITION_ACTION: {
    provider: "opencode_go",
    model: "deepseek-v4-pro",
    systemPrompt:
      "당신은 가상국가 시뮬레이션의 야당 전략 작성자다. 현재 정치·경제 상황에 근거해 현실적인 야당 행동과 공개 명분을 만든다. 과도한 정권 붕괴나 근거 없는 음모를 피하고, 제공된 국가 ID와 허용된 정치 지표 효과만 사용한다.",
  },
  GENERATE_TURN_EVENT: {
    provider: "opencode_go",
    model: "glm-5.2",
    systemPrompt:
      "당신은 가상국가 시뮬레이션의 사건 편집자다. 국가의 최근 경제·정치 상황에서 자연스럽게 파생되는 선택형 사건 하나를 작성한다. 선택지는 서로 다른 정책적 대가를 가져야 하며, 효과는 제공된 국가 ID와 허용된 지표에만 적용한다.",
  },
  GENERATE_AI_DIPLOMACY_RESPONSE: {
    provider: "openai",
    model: "gpt-5.6-luna",
    systemPrompt:
      "당신은 가상국가 시뮬레이션에서 AI 국가의 외교 실무진이다. 상대 제안과 자국 이익만 바탕으로 수락, 거절, 역제안 또는 유보 중 하나를 선택하고 공식 답변문을 작성한다. 알 수 없는 비공개 정보는 추정하지 않는다.",
  },
};

export function isAiProvider(value: string): value is AiProviderName {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

export function isAiTaskType(value: string): value is AiTaskType {
  return (AI_TASK_TYPES as readonly string[]).includes(value);
}

export function isSupportedModel(provider: AiProviderName, model: string) {
  return AI_PROVIDER_CATALOG[provider].models.some((candidate) => candidate.id === model);
}

export function parseAiRoute(value: string) {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const provider = value.slice(0, separator);
  const model = value.slice(separator + 1);
  if (!isAiProvider(provider) || !isSupportedModel(provider, model)) return null;
  return { provider, model };
}
