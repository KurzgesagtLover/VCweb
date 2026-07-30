import { and, eq } from "drizzle-orm";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { mapRasterColorAssignments, mapRasters } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { createRasterPreview, extractTerritoryPreview } from "@/src/domain/map/raster-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) {
    return Response.json({ error: "COUNTRY_REQUIRED" }, { status: 403 });
  }

  const url = new URL(request.url);
  const mapId = url.searchParams.get("mapId") ?? "";
  const showBorders = url.searchParams.get("borders") !== "0";
  if (!/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }

  const [raster, assignment] = await Promise.all([
    db.query.mapRasters.findFirst({
      where: and(eq(mapRasters.mapId, mapId), eq(mapRasters.campaignId, context.campaign.id)),
      columns: {
        previewImageData: true,
        previewWidth: true,
        previewHeight: true,
        revision: true,
      },
    }),
    db.query.mapRasterColorAssignments.findFirst({
      where: and(
        eq(mapRasterColorAssignments.mapId, mapId),
        eq(mapRasterColorAssignments.campaignId, context.campaign.id),
        eq(mapRasterColorAssignments.countryId, context.country.id),
      ),
      columns: { colorHex: true },
    }),
  ]);

  if (!raster || !assignment) {
    return Response.json({ error: "TERRITORY_NOT_FOUND" }, { status: 404 });
  }

  let previewImageData = raster.previewImageData;
  if (!previewImageData) {
    const source = await db.query.mapRasters.findFirst({
      where: and(eq(mapRasters.mapId, mapId), eq(mapRasters.campaignId, context.campaign.id)),
      columns: { imageData: true },
    });
    if (!source) {
      return Response.json({ error: "MAP_IMAGE_NOT_FOUND" }, { status: 404 });
    }
    const preview = await createRasterPreview(source.imageData);
    previewImageData = preview.data;
    await db
      .update(mapRasters)
      .set({
        previewImageData: preview.data,
        previewWidth: preview.width,
        previewHeight: preview.height,
        updatedAt: new Date(),
      })
      .where(eq(mapRasters.mapId, mapId));
  }

  const territory = await extractTerritoryPreview(
    previewImageData,
    assignment.colorHex,
    showBorders,
  );
  if (!territory) {
    return Response.json({ error: "TERRITORY_NOT_FOUND" }, { status: 404 });
  }

  return new Response(new Uint8Array(territory.data) as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      ETag: `"territory-${raster.revision}-${assignment.colorHex}-${
        showBorders ? "borders" : "clean"
      }"`,
    },
  });
}
