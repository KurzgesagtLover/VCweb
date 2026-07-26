export const turnTransitions = {
  DRAFT: ["LOCKED"],
  LOCKED: ["CALCULATING"],
  CALCULATING: ["AI_RUNNING", "FAILED"],
  AI_RUNNING: ["REVIEW", "FAILED"],
  REVIEW: ["PUBLISHED", "AI_RUNNING", "FAILED"],
  PUBLISHED: [],
  FAILED: ["CALCULATING", "AI_RUNNING", "REVIEW"],
} as const;

export type TurnState = keyof typeof turnTransitions;

export function canTransitionTurn(from: TurnState, to: TurnState) {
  return (turnTransitions[from] as readonly string[]).includes(to);
}

export function assertTurnTransition(from: TurnState, to: TurnState) {
  if (!canTransitionTurn(from, to))
    throw new Error(`${from} 상태에서 ${to} 상태로 이동할 수 없습니다.`);
}

export function turnStepKey(campaignId: string, turnId: string, step: string) {
  return `${campaignId}:${turnId}:${step}`;
}
