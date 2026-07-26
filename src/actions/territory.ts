"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getResolution, isValidCell } from "h3-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  administrativeDivisionRequests,
  administrativeDivisionCells,
  administrativeDivisions,
  auditLogs,
  campaignMaps,
  campaigns,
  countries,
  mapCells,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { getMapCellData } from "@/src/domain/map/cells";
import { getMapCellCandidates, resolveCellValue } from "@/src/domain/map/hierarchy";

const divisionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  typeName: z.string().trim().min(1).max(40).default("광역행정구역"),
});

export async function requestAdministrativeDivisionAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const context = await getViewerContext(session.user.id);
  if (!context.country) throw new Error("배정된 국가가 없습니다.");
  const input = divisionSchema.parse({
    name: formData.get("name"),
    typeName: formData.get("typeName") || "광역행정구역",
  });
  const [existing, pending] = await Promise.all([
    db.query.administrativeDivisions.findFirst({
      where: and(
        eq(administrativeDivisions.countryId, context.country.id),
        eq(administrativeDivisions.name, input.name),
      ),
    }),
    db.query.administrativeDivisionRequests.findFirst({
      where: and(
        eq(administrativeDivisionRequests.countryId, context.country.id),
        eq(administrativeDivisionRequests.name, input.name),
        eq(administrativeDivisionRequests.status, "PENDING"),
      ),
    }),
  ]);
  if (existing || pending) throw new Error("이미 등록됐거나 검토 중인 이름입니다.");

  await db.insert(administrativeDivisionRequests).values({
    countryId: context.country.id,
    requestedBy: session.user.id,
    ...input,
  });
  revalidatePath("/country/territory");
  revalidatePath(`/admin/countries/${context.country.id}`);
}

export async function createAdministrativeDivisionAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const countryId = z.string().uuid().parse(formData.get("countryId"));
  const input = divisionSchema.parse({
    name: formData.get("name"),
    typeName: formData.get("typeName") || "광역행정구역",
  });
  const country = await db.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");
  const duplicate = await db.query.administrativeDivisions.findFirst({
    where: and(
      eq(administrativeDivisions.countryId, countryId),
      eq(administrativeDivisions.name, input.name),
    ),
  });
  if (duplicate) throw new Error("이미 등록된 행정구역 이름입니다.");

  await db.transaction(async (tx) => {
    const [division] = await tx
      .insert(administrativeDivisions)
      .values({ countryId, level: 1, ...input })
      .returning();
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: "CREATE_ADMINISTRATIVE_DIVISION",
      targetType: "ADMINISTRATIVE_DIVISION",
      targetId: division.id,
      afterSummary: input,
      reason: "관리자 광역행정구역 이름 등록",
    });
  });
  revalidatePath(`/admin/countries/${countryId}`);
  revalidatePath("/admin/territory");
  revalidatePath("/country/territory");
}

export async function reviewAdministrativeDivisionRequestAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const requestId = z.string().uuid().parse(formData.get("requestId"));
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const reviewNote = z
    .string()
    .trim()
    .max(500)
    .parse(formData.get("reviewNote") || "");
  const request = await db.query.administrativeDivisionRequests.findFirst({
    where: and(
      eq(administrativeDivisionRequests.id, requestId),
      eq(administrativeDivisionRequests.status, "PENDING"),
    ),
  });
  if (!request) throw new Error("검토 가능한 요청이 아닙니다.");
  const country = await db.query.countries.findFirst({
    where: eq(countries.id, request.countryId),
  });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");

  await db.transaction(async (tx) => {
    if (decision === "APPROVED") {
      const duplicate = await tx.query.administrativeDivisions.findFirst({
        where: and(
          eq(administrativeDivisions.countryId, request.countryId),
          eq(administrativeDivisions.name, request.name),
        ),
      });
      if (!duplicate) {
        await tx.insert(administrativeDivisions).values({
          countryId: request.countryId,
          level: 1,
          typeName: request.typeName,
          name: request.name,
        });
      }
    }
    await tx
      .update(administrativeDivisionRequests)
      .set({
        status: decision,
        reviewNote: reviewNote || null,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(administrativeDivisionRequests.id, request.id));
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: `${decision}_ADMINISTRATIVE_DIVISION_REQUEST`,
      targetType: "ADMINISTRATIVE_DIVISION_REQUEST",
      targetId: request.id,
      afterSummary: { decision, name: request.name, typeName: request.typeName },
      reason: reviewNote || "광역행정구역 이름 요청 검토",
    });
  });
  revalidatePath(`/admin/countries/${request.countryId}`);
  revalidatePath("/admin/territory");
  revalidatePath("/country/territory");
}

const divisionCellSchema = z.object({
  campaignId: z.string().uuid(),
  mapId: z.string().uuid(),
  countryId: z.string().uuid(),
  divisionId: z.string().uuid().nullable(),
  mode: z.enum(["assign", "erase"]),
  cellIds: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/))
    .min(1)
    .max(10_000),
  reason: z.string().trim().min(5).max(1000),
});

export async function saveAdministrativeDivisionCellsAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  if (formData.get("confirm") !== "yes") throw new Error("변경 내용을 확인해 주세요.");
  const mode = formData.get("mode");
  const divisionRaw = String(formData.get("divisionId") ?? "").trim();
  const input = divisionCellSchema.parse({
    campaignId: formData.get("campaignId"),
    mapId: formData.get("mapId"),
    countryId: formData.get("countryId"),
    divisionId: divisionRaw || null,
    mode,
    cellIds: [
      ...new Set(
        String(formData.get("cellIds") ?? "")
          .split(",")
          .filter(Boolean),
      ),
    ],
    reason: formData.get("reason"),
  });
  if (input.mode === "assign" && !input.divisionId) throw new Error("행정구역을 선택해 주세요.");

  await db.transaction(async (tx) => {
    const locked = await tx.execute<{
      revision: number;
      position: number;
      hexResolution: number;
      administrativeDivisionRevision: number;
    }>(sql`
      SELECT
        revision,
        position,
        hex_resolution AS "hexResolution",
        administrative_division_revision AS "administrativeDivisionRevision"
      FROM campaign_maps
      WHERE id = ${input.mapId}
        AND campaign_id = ${input.campaignId}
      FOR UPDATE
    `);
    const campaignMap = locked.at(0);
    if (!campaignMap) throw new Error("지도를 찾을 수 없습니다.");
    const country = await tx.query.countries.findFirst({
      where: eq(countries.id, input.countryId),
    });
    if (!country || country.campaignId !== input.campaignId)
      throw new Error("국가가 유효하지 않습니다.");
    if (input.divisionId) {
      const division = await tx.query.administrativeDivisions.findFirst({
        where: eq(administrativeDivisions.id, input.divisionId),
      });
      if (!division || division.countryId !== input.countryId) {
        throw new Error("행정구역이 유효하지 않습니다.");
      }
    }
    if (
      input.cellIds.some(
        (cellId) => !isValidCell(cellId) || getResolution(cellId) !== campaignMap.hexResolution,
      )
    ) {
      throw new Error("현재 지도 해상도와 다른 셀이 포함되어 있습니다.");
    }
    const existingCells = await tx.query.mapCells.findMany({
      where: inArray(mapCells.id, input.cellIds),
    });
    const existingIds = new Set(existingCells.map((cell) => cell.id));
    const missingCells = input.cellIds.filter((cellId) => !existingIds.has(cellId));
    for (let offset = 0; offset < missingCells.length; offset += 500) {
      const chunk = missingCells.slice(offset, offset + 500).map(getMapCellData);
      await tx
        .insert(mapCells)
        .values(
          chunk.map(({ wkt, ...cell }) => ({
            ...cell,
            geometry: sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText(${wkt}, 4326)), 3))`,
          })),
        )
        .onConflictDoNothing({ target: mapCells.id });
    }

    const candidatesByCell = new Map(
      input.cellIds.map((cellId) => [cellId, getMapCellCandidates(cellId)]),
    );
    const candidateIds = [...new Set([...candidatesByCell.values()].flat())];
    const ownedRows = await tx.execute<{
      cellId: string;
      countryId: string | null;
      revision: number;
    }>(sql`
      SELECT DISTINCT ON (cell_id)
        cell_id AS "cellId",
        country_id AS "countryId",
        revision
      FROM map_ownership
      WHERE map_id = ${input.mapId}
        AND cell_id = ANY(ARRAY[
          ${sql.join(
            candidateIds.map((cellId) => sql`${cellId}`),
            sql`, `,
          )}
        ]::text[])
        AND revision <= ${campaignMap.revision}
      ORDER BY cell_id, revision DESC
    `);
    const ownershipByCell = new Map(ownedRows.map((row) => [row.cellId, row]));
    if (
      input.cellIds.some(
        (cellId) =>
          resolveCellValue(candidatesByCell.get(cellId)!, ownershipByCell)?.countryId !==
          input.countryId,
      )
    ) {
      throw new Error("선택 영역에 해당 국가의 영토가 아닌 셀이 포함되어 있습니다.");
    }

    if (input.mode === "erase") {
      await tx
        .delete(administrativeDivisionCells)
        .where(
          and(
            eq(administrativeDivisionCells.mapId, input.mapId),
            inArray(administrativeDivisionCells.cellId, input.cellIds),
          ),
        );
    } else {
      await tx
        .insert(administrativeDivisionCells)
        .values(
          input.cellIds.map((cellId) => ({
            campaignId: input.campaignId,
            mapId: input.mapId,
            countryId: input.countryId,
            divisionId: input.divisionId!,
            cellId,
            updatedBy: session.user.id,
          })),
        )
        .onConflictDoUpdate({
          target: [administrativeDivisionCells.mapId, administrativeDivisionCells.cellId],
          set: {
            countryId: input.countryId,
            divisionId: input.divisionId!,
            updatedBy: session.user.id,
            updatedAt: new Date(),
          },
        });
    }
    const nextRevision = campaignMap.administrativeDivisionRevision + 1;
    await tx
      .update(campaignMaps)
      .set({ administrativeDivisionRevision: nextRevision, updatedAt: new Date() })
      .where(eq(campaignMaps.id, input.mapId));
    if (campaignMap.position === 1) {
      await tx
        .update(campaigns)
        .set({ administrativeDivisionRevision: nextRevision, updatedAt: new Date() })
        .where(eq(campaigns.id, input.campaignId));
    }
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: session.user.id,
      action:
        input.mode === "erase"
          ? "ERASE_ADMINISTRATIVE_DIVISION_CELLS"
          : "ASSIGN_ADMINISTRATIVE_DIVISION_CELLS",
      targetType: "ADMINISTRATIVE_DIVISION",
      targetId: input.divisionId ?? input.countryId,
      afterSummary: {
        revision: nextRevision,
        mapId: input.mapId,
        mode: input.mode,
        cellCount: input.cellIds.length,
        divisionId: input.divisionId,
      },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/territory");
  revalidatePath("/country/territory");
  revalidatePath("/diplomacy");
}
