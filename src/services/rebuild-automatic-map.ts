import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/src/db";
import {
  campaignMaps,
  countries,
  countryRelations,
  mapRasterBorderLayers,
  mapRasterColorAssignments,
  mapRasters,
} from "@/src/db/schema";
import { countryEntityTypeSchema } from "@/src/domain/country/entity-type";
import { DEFAULT_BORDER_LAYER_COLORS } from "@/src/domain/map/border-palette";
import { buildAutomaticMapRaster } from "./automatic-map-raster";

export async function rebuildAutomaticMapBorders(campaignId: string, updatedBy: string) {
  const maps = await db.query.campaignMaps.findMany({
    where: eq(campaignMaps.campaignId, campaignId),
  });
  for (const map of maps) {
    const [raster, borderLayer, assignments, countryRows, relations] = await Promise.all([
      db.query.mapRasters.findFirst({
        where: and(eq(mapRasters.mapId, map.id), eq(mapRasters.campaignId, campaignId)),
      }),
      db.query.mapRasterBorderLayers.findFirst({
        where: eq(mapRasterBorderLayers.mapId, map.id),
      }),
      db.query.mapRasterColorAssignments.findMany({
        where: eq(mapRasterColorAssignments.mapId, map.id),
      }),
      db.query.countries.findMany({ where: eq(countries.campaignId, campaignId) }),
      db.query.countryRelations.findMany({ where: eq(countryRelations.campaignId, campaignId) }),
    ]);
    if (!raster || !assignments.length) continue;
    const sourceImage = raster.sourceImageData
      ? Buffer.from(raster.sourceImageData)
      : await sharp(raster.imageData)
          .resize(
            Math.max(1, Math.floor(raster.width / 2)),
            Math.max(1, Math.floor(raster.height / 2)),
            {
              fit: "fill",
              kernel: sharp.kernel.nearest,
            },
          )
          .png({ compressionLevel: 6 })
          .toBuffer();
    const assignedIds = new Set(assignments.map((assignment) => assignment.countryId));
    const layerColors = {
      ...DEFAULT_BORDER_LAYER_COLORS,
      ...(borderLayer?.layerColors ?? {}),
    };
    const built = await buildAutomaticMapRaster({
      sourceImage,
      assignments,
      countries: countryRows
        .filter((country) => assignedIds.has(country.id))
        .map((country) => ({
          id: country.id,
          entityType: countryEntityTypeSchema.parse(country.entityType),
        })),
      relations,
      classifications: borderLayer?.classifications ?? [],
      layerColors,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(mapRasters)
        .set({
          imageData: built.imageData,
          sourceImageData: built.sourceImageData,
          sourceWidth: built.sourceWidth,
          sourceHeight: built.sourceHeight,
          borderlessImageData: built.borderlessImageData,
          previewImageData: built.preview.data,
          previewWidth: built.preview.width,
          previewHeight: built.preview.height,
          width: built.width,
          height: built.height,
          revision: sql`${mapRasters.revision} + 1`,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(mapRasters.mapId, map.id));
      await tx
        .insert(mapRasterBorderLayers)
        .values({
          mapId: map.id,
          campaignId,
          classifications: built.classifications,
          layerColors,
          renderedData: built.renderedData,
          updatedBy,
        })
        .onConflictDoUpdate({
          target: mapRasterBorderLayers.mapId,
          set: {
            classifications: built.classifications,
            layerColors,
            renderedData: built.renderedData,
            revision: sql`${mapRasterBorderLayers.revision} + 1`,
            updatedBy,
            updatedAt: new Date(),
          },
        });
    });
  }
}
