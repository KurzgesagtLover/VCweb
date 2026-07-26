import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { createAdministrativeDivisionAction } from "@/src/actions/territory";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { countries } from "@/src/db/schema";
import { getCountryTerritory } from "@/src/db/queries/territory";
import { getPrimaryCampaignMap } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";
import { AdministrativeDivisionEditor } from "@/src/ui/world-map";

export const metadata = { title: "행정구역 편집" };

export default async function AdminTerritoryPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const primaryMap = await getPrimaryCampaignMap(context.campaign.id);
  if (!primaryMap) return null;
  const countryRows = await db.query.countries.findMany({
    where: eq(countries.campaignId, context.campaign.id),
    orderBy: [asc(countries.name)],
  });
  const query = await searchParams;
  const selectedCountry =
    countryRows.find((country) => country.id === query.country) ?? countryRows.at(0) ?? null;
  const territory = selectedCountry
    ? await getCountryTerritory(
        context.campaign.id,
        primaryMap.id,
        selectedCountry.id,
        primaryMap.revision,
      )
    : null;
  const center: [number, number] = [
    Number(territory?.summary.centerLongitude ?? 0),
    Number(territory?.summary.centerLatitude ?? 0),
  ];

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / REGIONS"
        title="행정구역 편집"
        description=""
        aside={<span className="status-pill">R{primaryMap.administrativeDivisionRevision}</span>}
      />
      <nav className="country-picker" aria-label="편집 국가 선택">
        {countryRows.map((country) => (
          <Link
            href={`/admin/territory?country=${country.id}`}
            className={selectedCountry?.id === country.id ? "button active" : "button secondary"}
            key={country.id}
          >
            <span style={{ background: country.color }} />
            {country.name}
          </Link>
        ))}
      </nav>
      {selectedCountry && territory ? (
        <>
          <section className="panel settings-panel">
            <div className="panel-head">
              <h2>{selectedCountry.name} 광역행정구역</h2>
              <span className="status-pill">{territory.divisions.length}개</span>
            </div>
            <form action={createAdministrativeDivisionAction} className="inline-setting-form">
              <input type="hidden" name="countryId" value={selectedCountry.id} />
              <div className="form-grid">
                <label>
                  구역 종류
                  <input name="typeName" defaultValue="주" required minLength={1} maxLength={40} />
                </label>
                <label>
                  이름
                  <input name="name" required minLength={1} maxLength={80} />
                </label>
              </div>
              <button type="submit">구역 추가</button>
            </form>
          </section>
          {territory.divisions.length ? (
            <AdministrativeDivisionEditor
              campaignId={context.campaign.id}
              mapId={primaryMap.id}
              mapRevision={primaryMap.revision}
              hexResolution={primaryMap.hexResolution}
              adaptiveResolution={primaryMap.adaptiveResolution}
              country={{
                id: selectedCountry.id,
                name: selectedCountry.name,
                code: selectedCountry.code,
                color: selectedCountry.color,
                isAi: selectedCountry.isAi,
              }}
              center={center}
              divisionRevision={primaryMap.administrativeDivisionRevision}
              divisions={territory.divisions.map(({ id, name, typeName }) => ({
                id,
                name,
                typeName,
              }))}
            />
          ) : (
            <div className="empty-state">행정구역 이름을 먼저 추가하세요.</div>
          )}
        </>
      ) : (
        <div className="empty-state">편집할 국가가 없습니다.</div>
      )}
    </div>
  );
}
