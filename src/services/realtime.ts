import { desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { campaigns, realtimeClocks, turns } from "@/src/db/schema";
import { campaignGameInstant, realtimeStep, tickDue } from "@/src/domain/realtime/clock";
import { advanceCampaignResearch } from "./research";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Campaign = typeof campaigns.$inferSelect;
type Turn = typeof turns.$inferSelect;

export type RealtimeContext = {
  tx: DatabaseTransaction;
  campaign: Campaign;
  turn: Turn;
  from: Date;
  to: Date;
  gameDays: number;
  now: Date;
};

export type RealtimeProcessor = {
  key: string;
  run(context: RealtimeContext): Promise<unknown>;
};

/**
 * 실시간 계층 처리기. 판정 주기마다 순서대로 돈다.
 * 첩보·외교·군사 같은 실시간 시스템은 여기에 처리기를 더한다.
 */
export const REALTIME_PROCESSORS: RealtimeProcessor[] = [
  {
    key: "research",
    run: ({ tx, campaign, turn, gameDays, now }) =>
      advanceCampaignResearch(tx, {
        campaignId: campaign.id,
        turnSequence: turn.sequence,
        gameDays,
        now,
      }),
  },
];

/**
 * 캠페인 하나의 실시간 판정. 주기가 안 됐거나 다른 작업자가 처리 중이면 건너뛴다.
 * 일시정지 중에는 아무것도 처리하지 않고 시계만 현재 게임 시각에 맞춘다. 재개하면 그 시각부터 진행한다.
 */
export async function tickCampaignRealtime(campaign: Campaign, now: Date) {
  await db
    .insert(realtimeClocks)
    .values({ campaignId: campaign.id })
    .onConflictDoNothing({ target: realtimeClocks.campaignId });
  return db.transaction(async (tx) => {
    const [clock] = await tx
      .select()
      .from(realtimeClocks)
      .where(eq(realtimeClocks.campaignId, campaign.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!clock || !tickDue(clock.lastTickAt, now, campaign.realtimeTickSeconds)) return null;
    const turn = await tx.query.turns.findFirst({
      where: eq(turns.campaignId, campaign.id),
      orderBy: [desc(turns.sequence)],
    });
    if (!turn) return null;
    const gameNow = campaignGameInstant(campaign, turn, now);
    if (!gameNow) return null;
    const paused = campaign.realtimePaused;
    const held =
      clock.lastGameAt && clock.lastGameAt.getTime() > gameNow.getTime()
        ? clock.lastGameAt
        : gameNow;
    const step = paused
      ? { from: held, to: held, gameDays: 0, capped: false }
      : realtimeStep({ lastGameAt: clock.lastGameAt, gameNow });
    if (!step) return null;
    const results: Record<string, unknown> = {};
    if (step.gameDays > 0) {
      for (const processor of REALTIME_PROCESSORS) {
        results[processor.key] = await processor.run({
          tx,
          campaign,
          turn,
          from: step.from,
          to: step.to,
          gameDays: step.gameDays,
          now,
        });
      }
    }
    const lastResult = {
      paused,
      gameFrom: step.from.toISOString(),
      gameTo: step.to.toISOString(),
      gameDays: Math.round(step.gameDays * 10_000) / 10_000,
      capped: step.capped,
      results,
    };
    await tx
      .update(realtimeClocks)
      .set({
        lastTickAt: now,
        lastGameAt: step.to,
        tickCount: clock.tickCount + 1,
        lastResult,
        updatedAt: now,
      })
      .where(eq(realtimeClocks.id, clock.id));
    return lastResult;
  });
}

export async function runRealtimeTick(now = new Date()) {
  const activeCampaigns = await db.query.campaigns.findMany({
    where: eq(campaigns.isActive, true),
  });
  const results = [];
  for (const campaign of activeCampaigns) {
    results.push(await tickCampaignRealtime(campaign, now));
  }
  return results;
}
