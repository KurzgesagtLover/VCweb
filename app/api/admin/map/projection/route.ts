import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, campaignMaps, mapRasters } from "@/src/db/schema";
import { isMapProjection } from "@/src/domain/map/projection";
import { actionRateLimiter } from "@/src/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rateLimit = actionRateLimiter.consume(`map-projection:${session.user.id}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return Response.json({ error: "요청이 너무 빠릅니다." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    campaignId?: string;
    mapId?: string;
    projection?: string;
  } | null;
  const campaignId = String(body?.campaignId ?? "");
  const mapId = String(body?.mapId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "잘못된 지도 정보입니다." }, { status: 400 });
  }
  if (!isMapProjection(body?.projection)) {
    return Response.json({ error: "지원하지 않는 투영입니다." }, { status: 400 });
  }
  const projection = body.projection;

  const campaignMap = await db.query.campaignMaps.findFirst({
    where: and(eq(campaignMaps.id, mapId), eq(campaignMaps.campaignId, campaignId)),
    columns: { id: true },
  });
  if (!campaignMap) return Response.json({ error: "지도를 찾을 수 없습니다." }, { status: 404 });

  const [raster] = await db
    .update(mapRasters)
    .set({
      projection,
      revision: sql`${mapRasters.revision} + 1`,
      updatedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(mapRasters.mapId, mapId))
    .returning({ revision: mapRasters.revision });
  if (!raster) {
    return Response.json({ error: "등록된 평면 지도가 없습니다." }, { status: 404 });
  }

  await db.insert(auditLogs).values({
    campaignId,
    actorId: session.user.id,
    action: "SET_PIXEL_MAP_PROJECTION",
    targetType: "CAMPAIGN_MAP",
    targetId: mapId,
    afterSummary: { projection, rasterRevision: raster.revision },
    reason: "구체 지구 투영 보정",
  });
  return Response.json({ revision: raster.revision, projection });
}
