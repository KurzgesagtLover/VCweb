import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/src/db";
import {
  countries,
  countryRelations,
  diplomaticMessages,
  diplomaticProposals,
} from "@/src/db/schema";

export function relationLabel(score: number) {
  if (score >= 60) return "동맹적";
  if (score >= 25) return "우호";
  if (score > -25) return "중립";
  if (score > -60) return "긴장";
  return "적대";
}

export async function getDiplomacyDesk(campaignId: string, countryId: string) {
  const [countryRows, relationRows, proposals] = await Promise.all([
    db.query.countries.findMany({
      where: eq(countries.campaignId, campaignId),
      orderBy: [asc(countries.name)],
    }),
    db.query.countryRelations.findMany({
      where: and(
        eq(countryRelations.campaignId, campaignId),
        eq(countryRelations.fromCountryId, countryId),
      ),
    }),
    db.query.diplomaticProposals.findMany({
      where: and(
        eq(diplomaticProposals.campaignId, campaignId),
        or(
          eq(diplomaticProposals.fromCountryId, countryId),
          eq(diplomaticProposals.toCountryId, countryId),
        ),
      ),
      orderBy: [desc(diplomaticProposals.updatedAt)],
    }),
  ]);
  const records = await Promise.all(
    proposals.map(async (proposal) => ({
      proposal,
      messages: await db.query.diplomaticMessages.findMany({
        where: eq(diplomaticMessages.proposalId, proposal.id),
        orderBy: [asc(diplomaticMessages.createdAt)],
      }),
    })),
  );
  return { countries: countryRows, relations: relationRows, records };
}

export async function getAiDiplomacyReview(campaignId: string) {
  return db
    .select({ message: diplomaticMessages, proposal: diplomaticProposals, target: countries })
    .from(diplomaticMessages)
    .innerJoin(diplomaticProposals, eq(diplomaticMessages.proposalId, diplomaticProposals.id))
    .innerJoin(countries, eq(diplomaticProposals.toCountryId, countries.id))
    .where(
      and(
        eq(diplomaticProposals.campaignId, campaignId),
        eq(diplomaticMessages.isAi, true),
        eq(diplomaticMessages.status, "DRAFT"),
      ),
    )
    .orderBy(asc(diplomaticMessages.createdAt));
}
