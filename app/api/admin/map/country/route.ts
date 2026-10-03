import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, countries, mapRasterColorAssignments } from "@/src/db/schema";
import { countryEntityTypeSchema } from "@/src/domain/country/entity-type";
import { rebuildAutomaticMapBorders } from "@/src/services/rebuild-automatic-map";

export const runtime = "nodejs";

const updateSchema = z.object({
  countryId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  entityType: countryEntityTypeSchema,
});

const inputSchema = z.object({
  campaignId: z.string().uuid(),
  mapId: z.string().uuid(),
  updates: z.array(updateSchema).min(1).max(500),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "입력값을 확인하세요." }, { status: 400 });
  const input = parsed.data;

  const countryIds = input.updates.map((update) => update.countryId);
  const [countryRows, assignmentRows] = await Promise.all([
    db.query.countries.findMany({
      where: and(eq(countries.campaignId, input.campaignId), inArray(countries.id, countryIds)),
    }),
    db.query.mapRasterColorAssignments.findMany({
      where: and(
        eq(mapRasterColorAssignments.mapId, input.mapId),
        inArray(mapRasterColorAssignments.countryId, countryIds),
      ),
      columns: { countryId: true },
    }),
  ]);

  const countryById = new Map(countryRows.map((country) => [country.id, country]));
  const assignedIds = new Set(assignmentRows.map((row) => row.countryId));
  for (const update of input.updates) {
    if (!countryById.has(update.countryId) || !assignedIds.has(update.countryId)) {
      return Response.json({ error: "선택한 지도 국가를 찾을 수 없습니다." }, { status: 404 });
    }
  }

  const names = input.updates.map((update) => update.name);
  if (new Set(names).size !== names.length) {
    return Response.json({ error: "국명이 중복됩니다." }, { status: 400 });
  }

  let entityTypeChanged = false;
  await db.transaction(async (tx) => {
    for (const update of input.updates) {
      const country = countryById.get(update.countryId);
      if (!country) continue;
      if (
        country.name === update.name &&
        country.entityType === update.entityType
      ) {
        continue;
      }
      if (country.entityType !== update.entityType) entityTypeChanged = true;
      await tx
        .update(countries)
        .set({ name: update.name, entityType: update.entityType, updatedAt: new Date() })
        .where(eq(countries.id, country.id));
      await tx.insert(auditLogs).values({
        campaignId: input.campaignId,
        actorId: session.user.id,
        action: "UPDATE_MAP_COUNTRY",
        targetType: "COUNTRY",
        targetId: country.id,
        beforeSummary: { name: country.name, entityType: country.entityType },
        afterSummary: { name: update.name, entityType: update.entityType },
        reason: "지도에서 국가 정보 일괄 변경",
      });
    }
  });

  if (entityTypeChanged) {
    await rebuildAutomaticMapBorders(input.campaignId, session.user.id);
  }

  return Response.json({
    countries: input.updates.map((update) => ({
      id: update.countryId,
      name: update.name,
      entityType: update.entityType,
    })),
  });
}
