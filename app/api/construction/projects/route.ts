import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  campaignCities,
  cityBuildings,
  cityConstructionProjects,
  worldCities,
} from "@/src/db/schema";
import {
  CONSTRUCTION_FACILITY_BY_ID,
  CONSTRUCTION_FACILITIES,
  MIN_CONSTRUCTION_CITY_POPULATION,
  NORMALIZED_PROJECT_WORK,
} from "@/src/domain/construction/catalog";
import { summarizeCitySlots } from "@/src/domain/construction/model";
import { getViewerContext } from "@/src/db/queries/viewer";
import { actionRateLimiter } from "@/src/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderSchema = z.object({
  campaignCityId: z.string().uuid(),
  buildingType: z.string().min(1).max(80),
});

const cancelSchema = z.object({ projectId: z.string().uuid() });
const OPEN_PROJECT_STATUSES = ["QUEUED", "ACTIVE", "PAUSED"];

async function playerContext() {
  const session = await getSession();
  if (!session || session.user.status !== "ACTIVE") return null;
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn) return null;
  return {
    session,
    campaign: context.campaign,
    country: context.country,
    turn: context.turn,
  };
}

export async function POST(request: Request) {
  const viewer = await playerContext();
  if (!viewer) return Response.json({ error: "국가와 진행 중인 캠페인이 필요합니다." }, { status: 403 });
  if (viewer.turn.status !== "DRAFT") {
    return Response.json({ error: "턴이 열려 있을 때만 건설을 지시할 수 있습니다." }, { status: 409 });
  }
  const rateLimit = actionRateLimiter.consume(
    `construction-order:${viewer.session.user.id}`,
    60,
    60_000,
  );
  if (!rateLimit.allowed) {
    return Response.json({ error: "요청이 너무 빠릅니다." }, { status: 429 });
  }
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "건설 요청이 올바르지 않습니다." }, { status: 400 });
  const facility = CONSTRUCTION_FACILITY_BY_ID.get(parsed.data.buildingType);
  if (!facility) return Response.json({ error: "등록되지 않은 시설입니다." }, { status: 400 });

  try {
    const result = await db.transaction(async (tx) => {
      const [city] = await tx
        .select({
          id: campaignCities.id,
          campaignId: campaignCities.campaignId,
          controllerCountryId: campaignCities.controllerCountryId,
          slotCapacity: campaignCities.slotCapacity,
          population: worldCities.population,
        })
        .from(campaignCities)
        .innerJoin(worldCities, eq(campaignCities.cityId, worldCities.id))
        .where(
          and(
            eq(campaignCities.id, parsed.data.campaignCityId),
            eq(campaignCities.campaignId, viewer.campaign.id),
          ),
        )
        .limit(1);
      if (!city || city.controllerCountryId !== viewer.country.id) {
        throw new Error("CONTROL_REQUIRED");
      }
      if (city.population < MIN_CONSTRUCTION_CITY_POPULATION) {
        throw new Error("CITY_TOO_SMALL");
      }
      const [buildings, projects] = await Promise.all([
        tx
          .select({
            buildingType: cityBuildings.buildingType,
            level: cityBuildings.level,
            damagedLevels: cityBuildings.damagedLevels,
          })
          .from(cityBuildings)
          .where(eq(cityBuildings.campaignCityId, city.id)),
        tx
          .select({
            buildingType: cityConstructionProjects.buildingType,
            queuePosition: cityConstructionProjects.queuePosition,
          })
          .from(cityConstructionProjects)
          .where(
            and(
              eq(cityConstructionProjects.campaignCityId, city.id),
              inArray(cityConstructionProjects.status, OPEN_PROJECT_STATUSES),
            ),
          ),
      ]);
      const currentLevel =
        buildings.find((building) => building.buildingType === facility.id)?.level ?? 0;
      const pendingLevels = projects.filter((project) => project.buildingType === facility.id).length;
      const targetLevel = currentLevel + pendingLevels + 1;
      if (targetLevel > facility.maxLevel) throw new Error("MAX_LEVEL");

      const currentSlots = summarizeCitySlots(
        city.slotCapacity,
        buildings,
        CONSTRUCTION_FACILITIES,
      );
      const reservedSlots = projects.reduce(
        (total, project) =>
          total + (CONSTRUCTION_FACILITY_BY_ID.get(project.buildingType)?.slotCostPerLevel ?? 0),
        0,
      );
      if (currentSlots.used + reservedSlots + facility.slotCostPerLevel > city.slotCapacity) {
        throw new Error("NO_SLOT");
      }
      const queuePosition =
        projects.reduce((highest, project) => Math.max(highest, project.queuePosition), -1) + 1;
      const [project] = await tx
        .insert(cityConstructionProjects)
        .values({
          campaignCityId: city.id,
          orderedByCountryId: viewer.country.id,
          buildingType: facility.id,
          targetLevel,
          queuePosition,
          requiredWork: NORMALIZED_PROJECT_WORK,
          createdTurnId: viewer.turn.id,
        })
        .returning({ id: cityConstructionProjects.id });
      return project;
    });
    return Response.json({ ok: true, projectId: result.id });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CONTROL_REQUIRED") {
      return Response.json({ error: "통제 중인 도시에서만 건설할 수 있습니다." }, { status: 403 });
    }
    if (code === "MAX_LEVEL") {
      return Response.json({ error: "이 시설은 이미 최고 단계까지 예약되었습니다." }, { status: 409 });
    }
    if (code === "NO_SLOT") {
      return Response.json({ error: "도시에 남은 건설 슬롯이 없습니다." }, { status: 409 });
    }
    if (code === "CITY_TOO_SMALL") {
      return Response.json(
        { error: "인구 25만 명 미만의 소도시에는 건설할 수 없습니다." },
        { status: 409 },
      );
    }
    console.error(error);
    return Response.json({ error: "건설 지시를 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const viewer = await playerContext();
  if (!viewer) return Response.json({ error: "국가와 진행 중인 캠페인이 필요합니다." }, { status: 403 });
  if (viewer.turn.status !== "DRAFT") {
    return Response.json({ error: "턴이 열려 있을 때만 대기열을 수정할 수 있습니다." }, { status: 409 });
  }
  const parsed = cancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "취소 요청이 올바르지 않습니다." }, { status: 400 });

  const [project] = await db
    .select({ id: cityConstructionProjects.id, campaignCityId: cityConstructionProjects.campaignCityId })
    .from(cityConstructionProjects)
    .innerJoin(campaignCities, eq(cityConstructionProjects.campaignCityId, campaignCities.id))
    .where(
      and(
        eq(cityConstructionProjects.id, parsed.data.projectId),
        eq(campaignCities.campaignId, viewer.campaign.id),
        eq(campaignCities.controllerCountryId, viewer.country.id),
        inArray(cityConstructionProjects.status, OPEN_PROJECT_STATUSES),
      ),
    )
    .limit(1);
  if (!project) return Response.json({ error: "취소할 건설 지시를 찾을 수 없습니다." }, { status: 404 });

  await db
    .update(cityConstructionProjects)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(cityConstructionProjects.id, project.id));
  return Response.json({ ok: true });
}
