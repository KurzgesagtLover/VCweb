import { requestAdministrativeDivisionAction } from "@/src/actions/territory";
import { requireSession } from "@/src/auth/session";
import { getCountryTerritory } from "@/src/db/queries/territory";
import { getPrimaryCampaignMap } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import { formatDecimal } from "@/src/ui/format";
import { MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";
import { CountryTerritoryMap } from "@/src/ui/world-map";

export const metadata = { title: "국토" };

const requestStatusLabel: Record<string, string> = {
  PENDING: "검토 중",
  APPROVED: "승인",
  REJECTED: "반려",
};

export default async function CountryTerritoryPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) return null;
  const primaryMap = await getPrimaryCampaignMap(context.campaign.id);
  if (!primaryMap) return null;
  const territory = await getCountryTerritory(
    context.campaign.id,
    primaryMap.id,
    context.country.id,
    primaryMap.revision,
  );
  const center: [number, number] = [
    Number(territory.summary.centerLongitude ?? 0),
    Number(territory.summary.centerLatitude ?? 0),
  ];

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="NATIONAL TERRITORY"
        title={`${context.country.name} 국토`}
        description="현재 지도 원장을 기준으로 자국 영토와 광역행정구역을 확인합니다."
        aside={<span className="status-pill">R{primaryMap.revision}</span>}
      />
      <section className="territory-layout">
        <div className="map-stage">
          <CountryTerritoryMap
            mapId={primaryMap.id}
            mapRevision={primaryMap.revision}
            hexResolution={primaryMap.hexResolution}
            adaptiveResolution={primaryMap.adaptiveResolution}
            countryCode={context.country.code}
            countryName={context.country.name}
            center={center}
            divisionRevision={primaryMap.administrativeDivisionRevision}
          />
        </div>
        <aside className="panel territory-summary">
          <div className="panel-head">
            <h2>국토 현황</h2>
          </div>
          <div className="territory-metrics">
            <MetricCard
              label="영토 셀"
              value={territory.summary.cellCount.toLocaleString("ko-KR")}
            />
            <MetricCard
              label="지도 면적"
              value={`${formatDecimal(territory.summary.areaKm2, 0)} km²`}
            />
          </div>
          <div className="division-list">
            {territory.divisions.length ? (
              territory.divisions.map((division) => (
                <div key={division.id}>
                  <strong>{division.name}</strong>
                  <span>{division.typeName}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">등록된 광역행정구역이 없습니다.</div>
            )}
          </div>
        </aside>
      </section>
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>광역행정구역 이름 요청</h2>
        </div>
        <form action={requestAdministrativeDivisionAction} className="form-grid">
          <label>
            구역 종류
            <input name="typeName" defaultValue="주" required minLength={1} maxLength={40} />
          </label>
          <label>
            이름
            <input name="name" required minLength={1} maxLength={80} />
          </label>
          <div className="inline-actions">
            <button type="submit">관리자에게 요청</button>
          </div>
        </form>
        {territory.requests.length > 0 && (
          <div className="request-list">
            {territory.requests.slice(0, 8).map((request) => (
              <div className="data-row" key={request.id}>
                <dt>
                  {request.typeName} · {request.name}
                </dt>
                <dd>{requestStatusLabel[request.status] ?? request.status}</dd>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
