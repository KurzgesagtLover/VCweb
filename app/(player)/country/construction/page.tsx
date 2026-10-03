import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getCountryConstruction } from "@/src/db/queries/construction";
import { getPrimaryCampaignMap } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  countries,
  countryProfileRevisions,
  mapRasterColorAssignments,
  mapRasters,
  politicalSnapshots,
  turns,
} from "@/src/db/schema";
import { parseMapProjection } from "@/src/domain/map/projection";
import { adjudicationRealDayInterval } from "@/src/domain/turn/schedule";
import { GlobeMap } from "@/src/ui/globe-map";

export const metadata = { title: "건설" };

export default async function ConstructionPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.campaign || !context.turn) return null;
  const primaryMap = await getPrimaryCampaignMap(context.campaign.id);
  if (!primaryMap) return null;

  const [construction, raster, colorAssignments, countryRows, ownProfile, ownPolitical] =
    await Promise.all([
      getCountryConstruction(context.campaign.id, primaryMap.id, context.country.id),
      db.query.mapRasters.findFirst({
        where: and(
          eq(mapRasters.mapId, primaryMap.id),
          eq(mapRasters.campaignId, context.campaign.id),
        ),
        columns: { revision: true, projection: true },
      }),
      db.query.mapRasterColorAssignments.findMany({
        where: eq(mapRasterColorAssignments.mapId, primaryMap.id),
        columns: { colorHex: true, countryId: true },
      }),
      db.query.countries.findMany({
        where: eq(countries.campaignId, context.campaign.id),
        columns: { id: true, name: true, code: true, color: true, isAi: true },
      }),
      context.country.currentProfileRevisionId
        ? db.query.countryProfileRevisions.findFirst({
            where: eq(countryProfileRevisions.id, context.country.currentProfileRevisionId),
            columns: { flag: true },
          })
        : null,
      db
        .select({ snapshot: politicalSnapshots })
        .from(politicalSnapshots)
        .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
        .where(eq(politicalSnapshots.countryId, context.country.id))
        .orderBy(desc(turns.sequence))
        .limit(1),
    ]);
  const intervalRealDays = adjudicationRealDayInterval(
    context.campaign.gameTimePerRealDayValue ?? context.campaign.gameDaysPerRealDay,
    context.campaign.adjudicationIntervalValue ?? context.campaign.adjudicationIntervalGameDays,
    context.campaign.gameTimePerRealDayUnit ?? "DAY",
    context.campaign.adjudicationIntervalUnit ?? "DAY",
  );

  return (
    <GlobeMap
      mode="construction"
      construction={{ ...construction, turnOpen: context.turn.status === "DRAFT" }}
      mapId={primaryMap.id}
      rasterRevision={raster?.revision ?? 0}
      projection={parseMapProjection(raster?.projection)}
      colorAssignments={colorAssignments}
      countries={countryRows}
      ownCountryId={context.country.id}
      ownCountry={{
        name: context.country.name,
        code: context.country.code,
        color: context.country.color,
        entityType: context.country.entityType,
        flag: ownProfile?.flag ?? "⚑",
        stability: ownPolitical[0]?.snapshot.stability ?? null,
      }}
      relations={[]}
      mapModeData={countryRows.map((country) => ({
        countryId: country.id,
        nominalGdp: null,
        population: null,
        diplomaticBlocColor: null,
        diplomaticBlocName: null,
        economicBlocColor: null,
        economicBlocName: null,
      }))}
      gameClock={{
        gameDateStart: context.turn.gameDateStart ?? context.turn.gameDateEnd,
        gameDateEnd: context.turn.gameDateEnd,
        deadlineAt: context.turn.deadlineAt?.toISOString() ?? null,
        intervalRealDays,
      }}
      turnOpen={context.turn.status === "DRAFT"}
      inboxCount={0}
    />
  );
}
