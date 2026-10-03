import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { logoutAction } from "@/src/actions/auth";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  countries,
  countryApplications,
  countryAssignments,
  countryProfileRevisions,
  diplomaticOrientations,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  mapRasterColorAssignments,
  mapRasters,
  parties,
  politicalSnapshots,
  turns,
} from "@/src/db/schema";
import { getPrimaryCampaignMap } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import type { CountryEntityType } from "@/src/domain/country/entity-type";
import { parseMapProjection } from "@/src/domain/map/projection";
import { electionPracticeLabel, regimeIdeologyLabel } from "@/src/domain/politics/ideology";
import { CountrySelectGlobe, type SelectableCountry } from "@/src/ui/country-select-globe";

export const metadata = { title: "국가 선택" };

export default async function ApplyPage() {
  const session = await requireSession();
  if (session.user.role === "ADMIN") redirect("/admin");
  if (session.user.role === "MODERATOR") redirect("/admin/moderation");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) {
    return (
      <main className="public-page" id="main-content" tabIndex={-1}>
        <section className="auth-card panel">
          <h1>활성 캠페인이 없습니다</h1>
          <form action={logoutAction}>
            <button className="button secondary">로그아웃</button>
          </form>
        </section>
      </main>
    );
  }

  const campaignId = context.campaign.id;
  const primaryMap = await getPrimaryCampaignMap(campaignId);
  const [application, countryRows, activeAssignments, raster, colorAssignments] = await Promise.all(
    [
      db.query.countryApplications.findFirst({
        where: and(
          eq(countryApplications.campaignId, campaignId),
          eq(countryApplications.userId, session.user.id),
        ),
        orderBy: [desc(countryApplications.createdAt)],
      }),
      db.query.countries.findMany({ where: eq(countries.campaignId, campaignId) }),
      db.query.countryAssignments.findMany({
        where: and(
          eq(countryAssignments.campaignId, campaignId),
          eq(countryAssignments.isActive, true),
          isNull(countryAssignments.endTurnId),
        ),
        columns: { countryId: true },
      }),
      primaryMap
        ? db.query.mapRasters.findFirst({
            where: eq(mapRasters.mapId, primaryMap.id),
            columns: { revision: true, projection: true },
          })
        : null,
      primaryMap
        ? db.query.mapRasterColorAssignments.findMany({
            where: eq(mapRasterColorAssignments.mapId, primaryMap.id),
            columns: { colorHex: true, countryId: true },
          })
        : [],
    ],
  );

  const countryIds = countryRows.map((country) => country.id);
  const revisionIds = countryRows
    .map((country) => country.currentProfileRevisionId)
    .filter((value): value is string => Boolean(value));

  const [profiles, snapshotRows, partyRows, leaderRows, orientationRows] = await Promise.all([
    revisionIds.length
      ? db.query.countryProfileRevisions.findMany({
          where: inArray(countryProfileRevisions.id, revisionIds),
          columns: { id: true, flag: true, capital: true, governmentForm: true, history: true },
        })
      : [],
    countryIds.length
      ? db
          .select({ snapshot: politicalSnapshots, sequence: turns.sequence })
          .from(politicalSnapshots)
          .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
          .where(inArray(politicalSnapshots.countryId, countryIds))
          .orderBy(desc(turns.sequence))
      : [],
    countryIds.length
      ? db.query.parties.findMany({
          where: inArray(parties.countryId, countryIds),
          columns: { countryId: true, name: true, color: true },
        })
      : [],
    countryIds.length
      ? db
          .select({
            countryId: governmentOfficeDefinitions.countryId,
            title: governmentOfficeDefinitions.title,
            displayOrder: governmentOfficeDefinitions.displayOrder,
            holderName: governmentOfficeHolders.holderName,
            portraitPath: governmentOfficeHolders.portraitPath,
          })
          .from(governmentOfficeDefinitions)
          .leftJoin(
            governmentOfficeHolders,
            eq(governmentOfficeHolders.officeId, governmentOfficeDefinitions.id),
          )
          .where(
            and(
              inArray(governmentOfficeDefinitions.countryId, countryIds),
              eq(governmentOfficeDefinitions.branch, "EXECUTIVE"),
              eq(governmentOfficeDefinitions.isActive, true),
            ),
          )
          .orderBy(governmentOfficeDefinitions.displayOrder)
      : [],
    countryIds.length
      ? db.query.diplomaticOrientations.findMany({
          where: inArray(diplomaticOrientations.countryId, countryIds),
          columns: { countryId: true, interests: true },
        })
      : [],
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const snapshotByCountry = new Map<string, (typeof snapshotRows)[number]["snapshot"]>();
  for (const row of snapshotRows) {
    if (!snapshotByCountry.has(row.snapshot.countryId)) {
      snapshotByCountry.set(row.snapshot.countryId, row.snapshot);
    }
  }
  const leaderByCountry = new Map<string, (typeof leaderRows)[number]>();
  for (const row of leaderRows) {
    if (row.holderName && !leaderByCountry.has(row.countryId))
      leaderByCountry.set(row.countryId, row);
  }
  // 국민정신은 아직 전용 테이블이 없어 외교 성향의 관심사를 임시 항목으로 노출한다.
  const spiritsByCountry = new Map(
    orientationRows.map((row) => [
      row.countryId,
      row.interests.slice(0, 6).map((name) => ({ name, description: null })),
    ]),
  );
  const partiesByCountry = new Map<string, Array<{ name: string; color: string }>>();
  for (const party of partyRows) {
    const bucket = partiesByCountry.get(party.countryId);
    if (bucket) bucket.push(party);
    else partiesByCountry.set(party.countryId, [party]);
  }

  const takenIds = new Set(activeAssignments.map((row) => row.countryId));
  const ownCountryId = context.assignment?.countryId ?? null;

  const selectable: SelectableCountry[] = countryRows.map((country) => {
    const profile = country.currentProfileRevisionId
      ? profileById.get(country.currentProfileRevisionId)
      : undefined;
    const snapshot = snapshotByCountry.get(country.id);
    const leader = leaderByCountry.get(country.id);
    const rulingParty = snapshot?.rulingParty ?? null;
    const partyColor =
      partiesByCountry.get(country.id)?.find((party) => party.name === rulingParty)?.color ?? null;
    const taken = takenIds.has(country.id);
    const unavailableReason = country.isAi
      ? "AI가 운영하는 국가입니다."
      : taken
        ? country.id === ownCountryId
          ? "현재 담당 중인 국가입니다."
          : "이미 다른 사용자가 담당 중입니다."
        : null;
    return {
      id: country.id,
      name: country.name,
      code: country.code,
      color: country.color,
      entityType: country.entityType as CountryEntityType,
      flag: profile?.flag ?? null,
      leaderName: leader?.holderName ?? snapshot?.headOfState ?? null,
      leaderTitle: leader?.title ?? null,
      leaderPortrait: leader?.portraitPath ?? null,
      ideology: regimeIdeologyLabel(snapshot?.democracy ?? null),
      rulingParty,
      rulingPartyColor: partyColor,
      elections: electionPracticeLabel(snapshot?.democracy ?? null),
      governmentForm: snapshot?.governmentForm ?? profile?.governmentForm ?? null,
      capital: profile?.capital ?? null,
      stability: snapshot?.stability ?? null,
      spirits: spiritsByCountry.get(country.id) ?? [],
      history: profile?.history ?? null,
      available: !country.isAi && !taken,
      unavailableReason,
    };
  });

  const mode = context.assignment ? "TRANSFER" : "ASSIGN";

  return (
    <main className="apply-page" id="main-content" tabIndex={-1}>
      {application?.status === "REJECTED" && (
        <p className="form-message" role="status">
          직전 신청이 반려되었습니다. {application.reviewNote ?? ""}
        </p>
      )}
      {primaryMap && raster?.revision ? (
        <CountrySelectGlobe
          mapId={primaryMap.id}
          rasterRevision={raster.revision}
          projection={parseMapProjection(raster.projection)}
          colorAssignments={colorAssignments}
          countries={selectable}
          currentCountryId={ownCountryId}
          mode={mode}
        />
      ) : (
        <div className="empty-state">등록된 세계 지도가 없습니다. 관리자에게 문의하세요.</div>
      )}
    </main>
  );
}
