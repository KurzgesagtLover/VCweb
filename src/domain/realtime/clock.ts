import {
  adjudicationRealDayInterval,
  currentGameInstant,
  type GameTimeUnit,
} from "../turn/schedule";

/**
 * 실시간 계층 시계.
 *
 * 경제·정치는 분기 턴으로 계산하고, 연구·첩보·외교·군사 같은 나머지 시스템은 실시간으로 돈다.
 * 실시간 시스템은 판정 주기(실제 초)마다 한 번씩, 그 사이 흐른 게임 시간만큼 진행한다.
 * 게임 시간의 속도(배속)는 캠페인의 '실제 하루당 게임 시간' 설정을 그대로 쓴다.
 */

export const REALTIME_TICK_MIN_SECONDS = 10;
export const REALTIME_TICK_MAX_SECONDS = 3_600;
export const REALTIME_TICK_DEFAULT_SECONDS = 60;
/** 서버가 오래 멈췄다 재개할 때 한 번에 따라잡는 최대 게임 일수 */
export const MAX_GAME_DAYS_PER_TICK = 31;

const DAY_MS = 86_400_000;

export function clampTickSeconds(value: number) {
  if (!Number.isFinite(value)) return REALTIME_TICK_DEFAULT_SECONDS;
  return Math.min(
    REALTIME_TICK_MAX_SECONDS,
    Math.max(REALTIME_TICK_MIN_SECONDS, Math.round(value)),
  );
}

export type CampaignClock = {
  gameTimePerRealDayValue: number;
  gameTimePerRealDayUnit: GameTimeUnit;
  adjudicationIntervalValue: number;
  adjudicationIntervalUnit: GameTimeUnit;
};

/** 현재 게임 시각. 진행 중인 턴의 마감과 길이로 실제 시각을 게임 달력에 대응시킨다. */
export function campaignGameInstant(
  campaign: CampaignClock,
  turn: { gameDateStart: string; gameDateEnd: string; deadlineAt: Date | null },
  now: Date,
) {
  return currentGameInstant({
    gameDateStart: turn.gameDateStart,
    gameDateEnd: turn.gameDateEnd,
    deadlineAt: turn.deadlineAt,
    intervalRealDays: adjudicationRealDayInterval(
      campaign.gameTimePerRealDayValue,
      campaign.adjudicationIntervalValue,
      campaign.gameTimePerRealDayUnit,
      campaign.adjudicationIntervalUnit,
    ),
    now,
  });
}

/**
 * 직전 판정 이후 진행할 게임 구간.
 * 게임 시각이 뒤로 가면(설정 변경 등) 진행하지 않고, 너무 길면 상한까지만 진행한다.
 */
export function realtimeStep(input: { lastGameAt: Date | null; gameNow: Date | null }) {
  if (!input.gameNow) return null;
  if (!input.lastGameAt)
    return { from: input.gameNow, to: input.gameNow, gameDays: 0, capped: false };
  const elapsed = (input.gameNow.getTime() - input.lastGameAt.getTime()) / DAY_MS;
  if (!(elapsed > 0))
    return { from: input.lastGameAt, to: input.lastGameAt, gameDays: 0, capped: false };
  const gameDays = Math.min(MAX_GAME_DAYS_PER_TICK, elapsed);
  return {
    from: input.lastGameAt,
    to: new Date(input.lastGameAt.getTime() + gameDays * DAY_MS),
    gameDays,
    capped: gameDays < elapsed,
  };
}

export function tickDue(lastTickAt: Date | null, now: Date, tickSeconds: number) {
  if (!lastTickAt) return true;
  return now.getTime() - lastTickAt.getTime() >= clampTickSeconds(tickSeconds) * 1000;
}
