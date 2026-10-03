import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/src/db";
import { countries, mapRasterColorAssignments, mapRasters } from "@/src/db/schema";
import type { CountryEntityType } from "@/src/domain/country/entity-type";
import { layoutCountryLabels, type CountryLabelLayout } from "@/src/domain/map/country-labels";

type CacheEntry = { revision: number; countrySignature: string; layout: CountryLabelLayout };

const cache = new Map<string, CacheEntry>();

/**
 * 국명 라벨은 래스터를 통째로 읽어야 해서 비싸다.
 * 지도 리비전과 국명·국체 조합이 그대로면 재사용한다.
 */
export async function getCountryMapLabels(
  campaignId: string,
  mapId: string,
): Promise<CountryLabelLayout> {
  const [raster, assignments, countryRows] = await Promise.all([
    db.query.mapRasters.findFirst({
      where: and(eq(mapRasters.mapId, mapId), eq(mapRasters.campaignId, campaignId)),
      columns: {
        sourceImageData: true,
        borderlessImageData: true,
        imageData: true,
        revision: true,
      },
    }),
    db.query.mapRasterColorAssignments.findMany({
      where: eq(mapRasterColorAssignments.mapId, mapId),
      columns: { colorHex: true, countryId: true },
    }),
    db.query.countries.findMany({
      where: eq(countries.campaignId, campaignId),
      columns: { id: true, name: true, entityType: true },
    }),
  ]);
  if (!raster || !assignments.length) return { width: 0, height: 0, labels: [] };

  const countrySignature = countryRows
    .map((country) => `${country.id}:${country.name}:${country.entityType}`)
    .sort()
    .join("|");
  const cached = cache.get(mapId);
  if (
    cached &&
    cached.revision === raster.revision &&
    cached.countrySignature === countrySignature
  ) {
    return cached.layout;
  }

  const buffer = raster.sourceImageData ?? raster.borderlessImageData ?? raster.imageData;
  const decoded = await sharp(Buffer.from(buffer))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const layout = layoutCountryLabels({
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    assignments,
    countries: countryRows.map((country) => ({
      id: country.id,
      name: country.name,
      entityType: country.entityType as CountryEntityType,
    })),
  });

  cache.set(mapId, { revision: raster.revision, countrySignature, layout });
  return layout;
}
