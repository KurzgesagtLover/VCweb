import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { countries, mapRasterBorderLayers, mapRasters } from "@/src/db/schema";
import { getCampaignMaps } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import { parseMapProjection } from "@/src/domain/map/projection";
import { PageHead } from "@/src/ui/page-head";
import { PixelMapEditor } from "@/src/ui/pixel-map-editor";

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

  const [countryRows, raster, borderLayer] = await Promise.all([
    db.query.countries.findMany({ where: eq(countries.campaignId, context.campaign.id) }),
    db.query.mapRasters.findFirst({
      where: eq(mapRasters.mapId, selectedMap.id),
      columns: { revision: true, projection: true },
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
        description="평면 픽셀 지도를 편집합니다."
        aside={<span className="status-pill">PIXEL MAP</span>}
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
      <PixelMapEditor
        campaignId={context.campaign.id}
        mapId={selectedMap.id}
        mapRevision={selectedMap.revision}
        rasterRevision={raster?.revision ?? 0}
        hasRaster={Boolean(raster)}
        rasterProjection={parseMapProjection(raster?.projection)}
        borderRevision={borderLayer?.revision ?? 0}
        initialBorderClassifications={borderLayer?.classifications ?? []}
        countries={countryRows.map(({ id, name, code, color, isAi }) => ({
          id,
          name,
          code,
          color,
          isAi,
        }))}
      />
    </div>
  );
}
