import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  campaignMemberships,
  countries,
  countryAssignments,
  superEventReceipts,
  superEvents,
} from "@/src/db/schema";
import type { SuperEventView } from "@/src/domain/superevents/template";

/** 아직 확인하지 않은 송출을 오래된 순서대로 준다. 한 번에 몇 건만 밀어 넣는다. */
export async function getPendingSuperEvents({
  campaignId,
  userId,
  countryId,
}: {
  campaignId: string;
  userId: string;
  countryId: string | null;
}): Promise<SuperEventView[]> {
  const rows = await db
    .select({ event: superEvents })
    .from(superEvents)
    .leftJoin(
      superEventReceipts,
      and(
        eq(superEventReceipts.superEventId, superEvents.id),
        eq(superEventReceipts.userId, userId),
      ),
    )
    .where(
      and(
        eq(superEvents.campaignId, campaignId),
        eq(superEvents.status, "BROADCAST"),
        isNull(superEventReceipts.id),
        countryId
          ? or(eq(superEvents.audience, "ALL"), eq(superEvents.targetCountryId, countryId))
          : eq(superEvents.audience, "ALL"),
      ),
    )
    .orderBy(asc(superEvents.broadcastAt))
    .limit(3);

  return rows.map(({ event }) => ({
    id: event.id,
    codeName: event.codeName,
    sourceLabel: event.sourceLabel,
    title: event.title,
    subtitle: event.subtitle,
    body: event.body,
    footnote: event.footnote,
    stampText: event.stampText,
    imageUrl: event.imageUrl,
    imageAlt: event.imageAlt,
    audioUrl: event.audioUrl,
    audioVolume: event.audioVolume,
    audioStartSeconds: event.audioStartSeconds,
    audioIntroReduced: event.audioIntroReduced,
    dismissLabel: event.dismissLabel,
    holdSeconds: event.holdSeconds,
    broadcastAt: event.broadcastAt?.toISOString() ?? null,
  }));
}

export async function getSuperEventDesk(campaignId: string) {
  const [rows, memberCount, assignmentRows] = await Promise.all([
    db
      .select({
        event: superEvents,
        targetCountryName: countries.name,
        acknowledged: sql<number>`count(${superEventReceipts.id})::int`,
      })
      .from(superEvents)
      .leftJoin(countries, eq(superEvents.targetCountryId, countries.id))
      .leftJoin(superEventReceipts, eq(superEventReceipts.superEventId, superEvents.id))
      .where(eq(superEvents.campaignId, campaignId))
      .groupBy(superEvents.id, countries.name)
      .orderBy(desc(superEvents.createdAt))
      .limit(40),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.campaignId, campaignId),
          eq(campaignMemberships.status, "ACTIVE"),
        ),
      ),
    db
      .select({ countryId: countryAssignments.countryId, count: sql<number>`count(*)::int` })
      .from(countryAssignments)
      .where(
        and(
          eq(countryAssignments.campaignId, campaignId),
          eq(countryAssignments.isActive, true),
          isNull(countryAssignments.endTurnId),
        ),
      )
      .groupBy(countryAssignments.countryId),
  ]);

  const perCountry = new Map(assignmentRows.map((row) => [row.countryId, row.count]));
  const audienceAll = memberCount[0]?.count ?? 0;

  return rows.map(({ event, targetCountryName, acknowledged }) => ({
    ...event,
    targetCountryName,
    acknowledged,
    audienceSize:
      event.audience === "ALL"
        ? audienceAll
        : (event.targetCountryId && perCountry.get(event.targetCountryId)) || 0,
  }));
}

export async function getCampaignCountryOptions(campaignId: string) {
  return db
    .select({ id: countries.id, name: countries.name })
    .from(countries)
    .where(eq(countries.campaignId, campaignId))
    .orderBy(asc(countries.name));
}
