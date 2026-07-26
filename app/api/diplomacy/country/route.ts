import { and, desc, eq, sql } from "drizzle-orm";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  countries,
  countryProfileRevisions,
  countryRelations,
  diplomaticOrientations,
  economicSnapshots,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
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

  const [profile, political, economic, orientation, relation, leaderRows, treatyRows] =
    await Promise.all([
      country.currentProfileRevisionId
        ? db.query.countryProfileRevisions.findFirst({
            where: eq(countryProfileRevisions.id, country.currentProfileRevisionId),
          })
        : null,
      db
        .select({ snapshot: politicalSnapshots })
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
    ]);

  const leader = leaderRows.find((row) => row.holder?.holderName) ?? null;
  return Response.json({
    country: {
      id: country.id,
      name: country.name,
      code: country.code,
      color: country.color,
      isAi: country.isAi,
      flag: profile?.flag ?? "⚑",
      capital: profile?.capital ?? null,
      motto: profile?.motto ?? null,
      governmentForm: political[0]?.snapshot.governmentForm ?? profile?.governmentForm ?? null,
      headOfState: political[0]?.snapshot.headOfState ?? leader?.holder?.holderName ?? null,
      rulingParty: political[0]?.snapshot.rulingParty ?? null,
      leaderTitle: leader?.office.title ?? null,
      leaderName: leader?.holder?.holderName ?? political[0]?.snapshot.headOfState ?? null,
      leaderPortrait: leader?.holder?.portraitPath ?? null,
      stability: political[0]?.snapshot.stability ?? null,
      approval: political[0]?.snapshot.governmentApproval ?? null,
      nominalGdp: economic[0]?.snapshot.nominalGdp ?? null,
      currencyCode: economic[0]?.snapshot.currencyCode ?? null,
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
    },
    treaties: treatyRows.map((treaty) => ({
      id: treaty.id,
      title: treaty.title,
      status: treaty.status,
    })),
  });
}
