import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  countries,
  countryProfileRevisions,
  countryRelations,
  diplomaticOrientations,
  diplomaticProposals,
  economicSnapshots,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  parties,
  partySnapshots,
  politicalSnapshots,
  treaties,
  turns,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) {
    return Response.json({ error: "NO_COUNTRY" }, { status: 404 });
  }
  const countryId = new URL(request.url).searchParams.get("countryId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(countryId) || countryId === context.country.id) {
    return Response.json({ error: "INVALID_COUNTRY" }, { status: 400 });
  }
  const country = await db.query.countries.findFirst({
    where: and(eq(countries.id, countryId), eq(countries.campaignId, context.campaign.id)),
  });
  if (!country) return Response.json({ error: "COUNTRY_NOT_FOUND" }, { status: 404 });

  const [
    profile,
    political,
    economic,
    orientation,
    relation,
    leaderRows,
    treatyRows,
    foreignRelationRows,
    openProposals,
  ] = await Promise.all([
    country.currentProfileRevisionId
      ? db.query.countryProfileRevisions.findFirst({
          where: eq(countryProfileRevisions.id, country.currentProfileRevisionId),
        })
      : null,
    db
      .select({ snapshot: politicalSnapshots, gameDate: turns.gameDateEnd })
      .from(politicalSnapshots)
      .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
      .where(eq(politicalSnapshots.countryId, countryId))
      .orderBy(desc(turns.sequence))
      .limit(1),
    db
      .select({ snapshot: economicSnapshots })
      .from(economicSnapshots)
      .innerJoin(turns, eq(economicSnapshots.turnId, turns.id))
      .where(eq(economicSnapshots.countryId, countryId))
      .orderBy(desc(turns.sequence))
      .limit(1),
    db.query.diplomaticOrientations.findFirst({
      where: eq(diplomaticOrientations.countryId, countryId),
    }),
    db.query.countryRelations.findFirst({
      where: and(
        eq(countryRelations.campaignId, context.campaign.id),
        eq(countryRelations.fromCountryId, context.country.id),
        eq(countryRelations.toCountryId, countryId),
      ),
    }),
    db
      .select({ office: governmentOfficeDefinitions, holder: governmentOfficeHolders })
      .from(governmentOfficeDefinitions)
      .leftJoin(
        governmentOfficeHolders,
        eq(governmentOfficeHolders.officeId, governmentOfficeDefinitions.id),
      )
      .where(
        and(
          eq(governmentOfficeDefinitions.countryId, countryId),
          eq(governmentOfficeDefinitions.branch, "EXECUTIVE"),
          eq(governmentOfficeDefinitions.isActive, true),
        ),
      )
      .orderBy(governmentOfficeDefinitions.displayOrder, governmentOfficeHolders.slotNumber),
    db.query.treaties.findMany({
      where: and(
        eq(treaties.campaignId, context.campaign.id),
        sql`${countryId} = ANY(${treaties.partyCountryIds})`,
        sql`${context.country.id} = ANY(${treaties.partyCountryIds})`,
      ),
    }),
    db
      .select({ relation: countryRelations, target: countries })
      .from(countryRelations)
      .innerJoin(countries, eq(countryRelations.toCountryId, countries.id))
      .where(
        and(
          eq(countryRelations.campaignId, context.campaign.id),
          eq(countryRelations.fromCountryId, countryId),
        ),
      )
      .orderBy(desc(sql`abs(${countryRelations.score})`))
      .limit(8),
    db.query.diplomaticProposals.findMany({
      where: and(
        eq(diplomaticProposals.campaignId, context.campaign.id),
        inArray(diplomaticProposals.status, ["SENT", "PENDING_AI", "COUNTERED", "DELAYED"]),
        sql`((${diplomaticProposals.fromCountryId} = ${context.country.id} AND ${diplomaticProposals.toCountryId} = ${countryId}) OR (${diplomaticProposals.fromCountryId} = ${countryId} AND ${diplomaticProposals.toCountryId} = ${context.country.id}))`,
      ),
      columns: { id: true, toCountryId: true },
    }),
  ]);

  const snapshot = political[0]?.snapshot ?? null;
  const partyRows = snapshot
    ? await db
        .select({ party: parties, snapshot: partySnapshots })
        .from(parties)
        .leftJoin(
          partySnapshots,
          and(eq(partySnapshots.partyId, parties.id), eq(partySnapshots.turnId, snapshot.turnId)),
        )
        .where(eq(parties.countryId, countryId))
        .orderBy(desc(partySnapshots.support))
    : [];

  const leader = leaderRows.find((row) => row.holder?.holderName) ?? null;
  return Response.json({
    country: {
      id: country.id,
      name: country.name,
      code: country.code,
      color: country.color,
      isAi: country.isAi,
      economicSystem: country.economicSystem,
      flag: profile?.flag ?? "⚑",
      capital: profile?.capital ?? null,
      largestCity: profile?.largestCity ?? null,
      motto: profile?.motto ?? null,
      nationalAnimal: profile?.nationalAnimal ?? null,
      nationalBird: profile?.nationalBird ?? null,
      nationalTree: profile?.nationalTree ?? null,
      nationalFlower: profile?.nationalFlower ?? null,
      stateReligion: profile?.stateReligion ?? null,
      officialLanguages: profile?.officialLanguages ?? [],
      majorIndustries: profile?.majorIndustries ?? [],
      governmentForm: snapshot?.governmentForm ?? profile?.governmentForm ?? null,
      headOfState: snapshot?.headOfState ?? leader?.holder?.holderName ?? null,
      headOfGovernment: snapshot?.headOfGovernment ?? null,
      rulingParty: snapshot?.rulingParty ?? null,
      oppositionParty: snapshot?.oppositionParty ?? null,
      leaderTitle: leader?.office.title ?? null,
      leaderName: leader?.holder?.holderName ?? snapshot?.headOfState ?? null,
      leaderPortrait: leader?.holder?.portraitPath ?? null,
      stability: snapshot?.stability ?? null,
      approval: snapshot?.governmentApproval ?? null,
      legitimacy: snapshot?.legitimacy ?? null,
      unrest: snapshot?.unrest ?? null,
      corruption: snapshot?.corruption ?? null,
      democracy: snapshot?.democracy ?? null,
      stateCapacity: snapshot?.stateCapacity ?? null,
      policySupport: snapshot?.policySupport ?? null,
      asOfDate: political[0]?.gameDate ? String(political[0].gameDate) : null,
      nominalGdp: economic[0]?.snapshot.nominalGdp ?? null,
      gdpScale: economic[0]?.snapshot.scale ?? null,
      currencyCode: economic[0]?.snapshot.currencyCode ?? profile?.currencyCode ?? null,
      creditRating: economic[0]?.snapshot.creditRating ?? null,
      creditScore: economic[0]?.snapshot.creditScore ?? null,
      realGdpGrowth: economic[0]?.snapshot.realGdpGrowth ?? null,
      inflationRate: economic[0]?.snapshot.inflationRate ?? null,
      unemploymentRate: economic[0]?.snapshot.unemploymentRate ?? null,
      debtToGdp: economic[0]?.snapshot.debtToGdp ?? null,
    },
    relation: {
      score: relation?.score ?? 0,
      tags: relation?.tags ?? [],
      lastInteraction: relation?.lastInteraction ?? null,
    },
    orientation: {
      publicPrinciples: orientation?.publicPrinciples ?? null,
      interests: orientation?.interests ?? [],
      goals: orientation?.goals ?? [],
      riskTolerance: orientation?.riskTolerance ?? null,
    },
    parties: partyRows.map((row) => ({
      id: row.party.id,
      name: row.party.name,
      color: row.party.color,
      support: row.snapshot ? Number(row.snapshot.support) : 0,
      seats: row.snapshot?.seats ?? 0,
      isGovernment: row.snapshot?.isGovernment ?? false,
      economicAxis: row.party.economicAxis,
      socialAxis: row.party.socialAxis,
    })),
    foreignRelations: foreignRelationRows.map((row) => ({
      id: row.target.id,
      name: row.target.name,
      code: row.target.code,
      color: row.target.color,
      score: row.relation.score,
      tags: row.relation.tags,
    })),
    treaties: treatyRows.map((treaty) => ({
      id: treaty.id,
      title: treaty.title,
      status: treaty.status,
    })),
    pending: {
      outgoing: openProposals.filter((proposal) => proposal.toCountryId === countryId).length,
      incoming: openProposals.filter((proposal) => proposal.toCountryId !== countryId).length,
    },
  });
}
