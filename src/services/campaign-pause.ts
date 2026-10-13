import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { campaigns, countries, countryPoliticalResources, turns } from "@/src/db/schema";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 캠페인 일시정지와 재개. 호출하는 쪽이 캠페인 행을 잠근 트랜잭션 안에서 부른다.
 *
 * 멈추면 멈춘 시각만 기록한다. 게임 시각, 정치력 정산, 실시간 계층, 턴 자동 진행이 모두 그 시각을 본다.
 * 재개하면 진행 중인 턴의 마감과 정치력 정산 시각을 멈춘 시간만큼 뒤로 미룬다.
 * 그래서 게임 시간은 멈춘 자리에서 이어지고, 판정 대기 시간도 멈춘 만큼 늘어난다.
 */
export async function setCampaignPaused(
  tx: DatabaseTransaction,
  campaign: { id: string; pausedAt: Date | null },
  paused: boolean,
  now: Date,
) {
  if (paused) {
    if (campaign.pausedAt) return { changed: false as const };
    await tx
      .update(campaigns)
      .set({ pausedAt: now, updatedAt: now })
      .where(eq(campaigns.id, campaign.id));
    return { changed: true as const, pausedAt: now };
  }

  const pausedAt = campaign.pausedAt;
  if (!pausedAt) return { changed: false as const };
  const shiftMs = Math.max(0, now.getTime() - pausedAt.getTime());
  const shift = sql`(${shiftMs}::double precision * interval '1 millisecond')`;

  await tx
    .update(turns)
    .set({ deadlineAt: sql`${turns.deadlineAt} + ${shift}`, updatedAt: now })
    .where(
      and(
        eq(turns.campaignId, campaign.id),
        ne(turns.status, "PUBLISHED"),
        isNotNull(turns.deadlineAt),
      ),
    );
  // 멈춘 동안 정산된 국가는 멈춘 시각까지 정산을 마친 상태이므로 재개 시각부터 다시 센다.
  await tx
    .update(countryPoliticalResources)
    .set({
      lastAccruedAt: sql`CASE WHEN ${countryPoliticalResources.lastAccruedAt} >= ${pausedAt.toISOString()}::timestamptz THEN ${now.toISOString()}::timestamptz ELSE ${countryPoliticalResources.lastAccruedAt} + ${shift} END`,
    })
    .where(
      inArray(
        countryPoliticalResources.countryId,
        tx
          .select({ id: countries.id })
          .from(countries)
          .where(eq(countries.campaignId, campaign.id)),
      ),
    );
  await tx
    .update(campaigns)
    .set({ pausedAt: null, updatedAt: now })
    .where(eq(campaigns.id, campaign.id));
  return { changed: true as const, pausedAt, resumedAt: now, shiftMs };
}
