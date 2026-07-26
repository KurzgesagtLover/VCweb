import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  countries,
  mapChangeSets,
  mapRasterBorderLayers,
  mapRasters,
} from "@/src/db/schema";
import { getCampaignMaps } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";
import { MapResolutionForm } from "@/src/ui/map-resolution-form";
import { MapEditor } from "@/src/ui/world-map";

export const metadata = { title: "지도 편집" };

export default async function AdminMapPage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const params = await searchParams;
  const maps = await getCampaignMaps(context.campaign.id, context.campaign.mapCount);
  const selectedMap = maps.find((map) => map.id === params.map) ?? maps.at(0);
  if (!selectedMap) return null;
  const [countryRows, changes, raster, borderLayer] = await Promise.all([
    db.query.countries.findMany({ where: eq(countries.campaignId, context.campaign.id) }),
    db.query.mapChangeSets.findMany({
      where: and(
        eq(mapChangeSets.campaignId, context.campaign.id),
        eq(mapChangeSets.mapId, selectedMap.id),
      ),
      orderBy: [desc(mapChangeSets.createdAt)],
      limit: 10,
    }),
    db.query.mapRasters.findFirst({
      where: eq(mapRasters.mapId, selectedMap.id),
      columns: { revision: true },
    }),
    db.query.mapRasterBorderLayers.findFirst({
      where: eq(mapRasterBorderLayers.mapId, selectedMap.id),
      columns: { revision: true, classifications: true },
    }),
  ]);
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="WORLD MAP EDITOR"
        title="세계 지도 편집"
        description="구면 지도와 평면 픽셀 지도를 편집합니다."
        aside={<span className="status-pill">R{selectedMap.revision}</span>}
      />
      {maps.length > 1 && (
        <nav className="map-tabs" aria-label="지도 선택">
          {maps.map((map) => (
            <Link
              key={map.id}
              href={`/admin/map?map=${map.id}`}
              className={map.id === selectedMap.id ? "active" : undefined}
            >
              {map.name}
            </Link>
          ))}
        </nav>
      )}
      <section className="panel map-resolution-panel">
        <MapResolutionForm
          campaignId={context.campaign.id}
          mapId={selectedMap.id}
          expectedRevision={selectedMap.revision}
          resolution={selectedMap.hexResolution}
          adaptiveResolution={selectedMap.adaptiveResolution}
        />
      </section>
      <MapEditor
        campaignId={context.campaign.id}
        mapId={selectedMap.id}
        revision={selectedMap.revision}
        hexResolution={selectedMap.hexResolution}
        adaptiveResolution={selectedMap.adaptiveResolution}
        divisionRevision={selectedMap.administrativeDivisionRevision}
        rasterRevision={raster?.revision ?? 0}
        hasRaster={Boolean(raster)}
        borderRevision={borderLayer?.revision ?? 0}
        borderClassifications={borderLayer?.classifications ?? []}
        countries={countryRows.map(({ id, name, code, color, isAi }) => ({
          id,
          name,
          code,
          color,
          isAi,
        }))}
      />
      <details className="details-panel">
        <summary>최근 지도 변경 세트</summary>
        <div className="details-body data-list">
          {changes.map((change) => (
            <div className="data-row" key={change.id}>
              <dt>
                R{change.baseRevision} → R{change.newRevision}
              </dt>
              <dd>
                {change.cellCount}셀 · {change.reason}
              </dd>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
