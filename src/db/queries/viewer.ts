import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/src/db";
import {
  campaignMemberships,
  campaigns,
  countries,
  countryAssignments,
  turns,
} from "@/src/db/schema";

export async function getActiveCampaign() {
  return db.query.campaigns.findFirst({ where: eq(campaigns.isActive, true) });
}

export async function getViewerContext(userId: string) {
  const campaign = await getActiveCampaign();
  if (!campaign)
    return { campaign: null, membership: null, assignment: null, country: null, turn: null };

  const [membership, assignment, turn] = await Promise.all([
    db.query.campaignMemberships.findFirst({
      where: and(
        eq(campaignMemberships.campaignId, campaign.id),
        eq(campaignMemberships.userId, userId),
        eq(campaignMemberships.status, "ACTIVE"),
      ),
    }),
    db
      .select({ assignment: countryAssignments, country: countries })
      .from(countryAssignments)
      .innerJoin(countries, eq(countryAssignments.countryId, countries.id))
      .where(
        and(
          eq(countryAssignments.campaignId, campaign.id),
          eq(countryAssignments.userId, userId),
          eq(countryAssignments.isActive, true),
          isNull(countryAssignments.endTurnId),
        ),
      )
      .limit(1),
    db.query.turns.findFirst({
      where: eq(turns.campaignId, campaign.id),
      orderBy: [desc(turns.sequence)],
    }),
  ]);

  const assignmentRow = assignment.at(0);

  return {
    campaign,
    membership: membership ?? null,
    assignment: assignmentRow?.assignment ?? null,
    country: assignmentRow?.country ?? null,
    turn: turn ?? null,
  };
}

export async function getCampaignTurns(campaignId: string) {
  return db.query.turns.findMany({
    where: eq(turns.campaignId, campaignId),
    orderBy: [asc(turns.sequence)],
  });
}
