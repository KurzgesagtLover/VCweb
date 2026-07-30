import { and, eq } from "drizzle-orm";
import { requestAdministrativeDivisionAction } from "@/src/actions/territory";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getCountryTerritory } from "@/src/db/queries/territory";
import { getPrimaryCampaignMap } from "@/src/db/queries/maps";
import { mapRasterBorderLayers, mapRasterColorAssignments, mapRasters } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { formatDecimal } from "@/src/ui/format";
import { PixelCountryTerritoryMap } from "@/src/ui/pixel-country-territory-map";
import { TnoHeadline, TnoPlate, TnoReadout, TnoWindow } from "@/src/ui/tno-frame";

export const metadata = { title: "국토" };

const REQUEST_STATUS_LABELS: Record<string, string> = {
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
  const [territory, raster, borderLayer, colorAssignment] = await Promise.all([
    getCountryTerritory(
      context.campaign.id,
      primaryMap.id,
      context.country.id,
      primaryMap.revision,
    ),
    db.query.mapRasters.findFirst({
      where: eq(mapRasters.mapId, primaryMap.id),
      columns: { revision: true },
    }),
    db.query.mapRasterBorderLayers.findFirst({
      where: eq(mapRasterBorderLayers.mapId, primaryMap.id),
      columns: { revision: true },
    }),
    db.query.mapRasterColorAssignments.findFirst({
      where: and(
        eq(mapRasterColorAssignments.mapId, primaryMap.id),
        eq(mapRasterColorAssignments.countryId, context.country.id),
      ),
      columns: { colorHex: true },
    }),
  ]);
  const pendingRequests = territory.requests.filter(
    (request) => request.status === "PENDING",
  ).length;

  return (
    <TnoWindow
      title="국토 원장"
      readout={
        <>
          <TnoReadout label="지도" value={`R${primaryMap.revision}`} />
          <TnoReadout label="배정" value={colorAssignment ? "완료" : "미배정"} />
          <TnoReadout label="대기 요청" value={`${pendingRequests}건`} />
        </>
      }
    >
      <div className="tno-headline-row">
        <TnoHeadline
          label="영토 배정"
          value={colorAssignment ? "완료" : "미배정"}
          meta={colorAssignment?.colorHex ?? "관리자 배정 대기"}
          tone={colorAssignment ? "good" : "bad"}
        />
        <TnoHeadline
          label="광역행정구역"
          value={`${territory.divisions.length}개`}
          meta="승인 기준"
        />
        <TnoHeadline
          label="실효 면적"
          value={formatDecimal(territory.summary.areaKm2, 0)}
          meta={`km² · ${territory.summary.cellCount}셀`}
        />
        <TnoHeadline
          label="검토 대기"
          value={`${pendingRequests}건`}
          meta={`누적 요청 ${territory.requests.length}건`}
          tone={pendingRequests ? "bad" : "good"}
        />
      </div>

      <div className="tno-map-slot">
        <PixelCountryTerritoryMap
          mapId={primaryMap.id}
          rasterRevision={raster?.revision ?? 0}
          borderRevision={borderLayer?.revision ?? 0}
          countryName={context.country.name}
          territoryColor={colorAssignment?.colorHex ?? null}
        />
      </div>

      <div className="tno-two-column">
        <TnoPlate title="광역행정구역">
          {territory.divisions.length ? (
            <ul className="tno-entity-list">
              {territory.divisions.map((division) => (
                <li key={division.id}>
                  <span>{division.name}</span>
                  <em>{division.typeName}</em>
                  <b>광역</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>등록된 광역행정구역이 없습니다.</p>
          )}
        </TnoPlate>

        <div className="tno-column-stack">
          <TnoPlate title="구역 이름 요청">
            <form action={requestAdministrativeDivisionAction} className="tno-form-stack">
              <label>
                구역 종류
                <input name="typeName" defaultValue="주" required minLength={1} maxLength={40} />
              </label>
              <label>
                이름
                <input name="name" required minLength={1} maxLength={80} />
              </label>
              <div className="tno-form-actions">
                <button type="submit">관리자에게 요청</button>
              </div>
            </form>
          </TnoPlate>

          <TnoPlate title="요청 이력">
            {territory.requests.length ? (
              <ul className="tno-entity-list">
                {territory.requests.slice(0, 8).map((request) => (
                  <li key={request.id}>
                    <span>{request.name}</span>
                    <em>{request.typeName}</em>
                    <b>{REQUEST_STATUS_LABELS[request.status] ?? request.status}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p>제출한 요청이 없습니다.</p>
            )}
          </TnoPlate>
        </div>
      </div>
    </TnoWindow>
  );
}
