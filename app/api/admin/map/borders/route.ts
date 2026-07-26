import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, campaignMaps, mapRasterBorderLayers, mapRasters } from "@/src/db/schema";
import {
  applyBorderClassifications,
  borderClassificationsSchema,
  borderSourceRgbs,
} from "@/src/domain/map/border-palette";
import { removeRasterBorders } from "@/src/domain/map/raster-territory";
import { actionRateLimiter } from "@/src/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  campaignId: z.string().uuid(),
  mapId: z.string().uuid(),
  expectedRasterRevision: z.number().int().positive(),
  classifications: borderClassificationsSchema,
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rateLimit = actionRateLimiter.consume(`map-border-config:${session.user.id}`, 12, 60_000);
  if (!rateLimit.allowed) {
    return Response.json({ error: "요청이 너무 빠릅니다." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "국경 분류 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const input = parsed.data;
  const [campaignMap, raster] = await Promise.all([
    db.query.campaignMaps.findFirst({
      where: and(eq(campaignMaps.id, input.mapId), eq(campaignMaps.campaignId, input.campaignId)),
    }),
    db.query.mapRasters.findFirst({
      where: and(eq(mapRasters.mapId, input.mapId), eq(mapRasters.campaignId, input.campaignId)),
    }),
  ]);
  if (!campaignMap || !raster) {
    return Response.json({ error: "지도를 찾을 수 없습니다." }, { status: 404 });
  }
  if (raster.revision !== input.expectedRasterRevision) {
    return Response.json(
      { error: "지도가 변경됐습니다. 새로고침 후 다시 시도하세요." },
      { status: 409 },
    );
  }

  const decoded = await sharp(raster.imageData)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = decoded.info;
  const borderlessRaw = removeRasterBorders(
    decoded.data,
    width,
    height,
    borderSourceRgbs(input.classifications),
  );
  const renderedRaw = applyBorderClassifications(
    decoded.data,
    borderlessRaw,
    input.classifications,
  );
  const [borderlessImageData, renderedData] = await Promise.all([
    sharp(borderlessRaw, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    sharp(renderedRaw, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  ]);
  const rasterRevision = input.expectedRasterRevision + 1;

  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ revision: number }>(sql`
      SELECT revision FROM map_rasters WHERE map_id = ${input.mapId} FOR UPDATE
    `);
    if (!locked.at(0)) throw new Error("MAP_NOT_FOUND");
    if (locked[0].revision !== input.expectedRasterRevision) {
      throw new Error("RASTER_REVISION_CONFLICT");
    }
    await tx
      .update(mapRasters)
      .set({
        borderlessImageData,
        revision: rasterRevision,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(mapRasters.mapId, input.mapId));
    await tx
      .insert(mapRasterBorderLayers)
      .values({
        mapId: input.mapId,
        campaignId: input.campaignId,
        classifications: input.classifications,
        renderedData,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: mapRasterBorderLayers.mapId,
        set: {
          classifications: input.classifications,
          renderedData,
          revision: sql`${mapRasterBorderLayers.revision} + 1`,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: session.user.id,
      action: "CONFIGURE_PIXEL_MAP_BORDERS",
      targetType: "CAMPAIGN_MAP",
      targetId: input.mapId,
      afterSummary: {
        classifications: input.classifications,
        rasterRevision,
      },
      reason: "업로드 지도 국경색 분류",
    });
  });

  return Response.json({ rasterRevision, classifications: input.classifications });
}
