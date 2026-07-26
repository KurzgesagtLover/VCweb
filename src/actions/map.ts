"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { getResolution, isValidCell } from "h3-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  campaignMaps,
  campaigns,
  countries,
  mapCellChanges,
  mapCells,
  mapChangeSets,
  mapOwnership,
} from "@/src/db/schema";
import { getMapCellData } from "@/src/domain/map/cells";
import { MAP_H3_RESOLUTIONS, type MapH3Resolution } from "@/src/domain/map/grid";
import { getMapCellCandidates, resolveCellValue } from "@/src/domain/map/hierarchy";
import { assertMapRevision } from "@/src/domain/map/revision";
import { enforceActionRateLimit } from "@/src/services/rate-limit";

const mapChangeSchema = z.object({
  campaignId: z.string().uuid(),
  mapId: z.string().uuid(),
  expectedRevision: z.coerce.number().int().min(0),
  targetCountryId: z.string().uuid().nullable(),
  cellIds: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/))
    .min(1)
    .max(5000),
  reason: z.string().trim().min(10).max(1000),
});

const mapResolutionSchema = z.object({
  campaignId: z.string().uuid(),
  mapId: z.string().uuid(),
  expectedRevision: z.coerce.number().int().min(0),
  resolution: z.coerce
    .number()
    .int()
    .refine(
      (value): value is MapH3Resolution => MAP_H3_RESOLUTIONS.includes(value as MapH3Resolution),
      "지원하지 않는 해상도입니다.",
    ),
  adaptiveResolution: z.boolean(),
});

export async function updateMapResolutionAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  if (formData.get("confirm") !== "yes") throw new Error("해상도 변경을 확인해 주세요.");
  const input = mapResolutionSchema.parse({
    campaignId: formData.get("campaignId"),
    mapId: formData.get("mapId"),
    expectedRevision: formData.get("expectedRevision"),
    resolution: formData.get("resolution"),
    adaptiveResolution: formData.get("adaptiveResolution") === "yes",
  });

  await db.transaction(async (tx) => {
    const lockedRows = await tx.execute<{
      id: string;
      position: number;
      revision: number;
      hexResolution: number;
      adaptiveResolution: boolean;
    }>(sql`
      SELECT
        id,
        position,
        revision,
        hex_resolution AS "hexResolution",
        adaptive_resolution AS "adaptiveResolution"
      FROM campaign_maps
      WHERE id = ${input.mapId}
        AND campaign_id = ${input.campaignId}
      FOR UPDATE
    `);
    const campaignMap = lockedRows.at(0);
    if (!campaignMap) throw new Error("지도를 찾을 수 없습니다.");
    assertMapRevision(input.expectedRevision, campaignMap.revision);
    if (
      campaignMap.hexResolution === input.resolution &&
      campaignMap.adaptiveResolution === input.adaptiveResolution
    ) {
      return;
    }

    const newRevision = campaignMap.revision + 1;

    await tx
      .update(campaignMaps)
      .set({
        hexResolution: input.resolution,
        adaptiveResolution: input.adaptiveResolution,
        revision: newRevision,
        updatedAt: new Date(),
      })
      .where(eq(campaignMaps.id, input.mapId));
    if (campaignMap.position === 1) {
      await tx
        .update(campaigns)
        .set({
          mapRevision: newRevision,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, input.campaignId));
    }
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: session.user.id,
      action: "UPDATE_MAP_HEX_RESOLUTION",
      targetType: "CAMPAIGN_MAP",
      targetId: input.mapId,
      beforeSummary: {
        mapId: input.mapId,
        revision: campaignMap.revision,
        hexResolution: campaignMap.hexResolution,
        adaptiveResolution: campaignMap.adaptiveResolution,
      },
      afterSummary: {
        mapId: input.mapId,
        revision: newRevision,
        hexResolution: input.resolution,
        adaptiveResolution: input.adaptiveResolution,
      },
      reason: "지도 헥사곤 해상도 변경",
    });
  });

  revalidatePath("/admin/map");
  revalidatePath("/admin/territory");
  revalidatePath("/country/territory");
  revalidatePath("/diplomacy");
}

export async function saveMapChangeSetAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  enforceActionRateLimit(`map-save:${session.user.id}`, 10, 60_000);
  if (formData.get("confirm") !== "yes") throw new Error("지도 변경 요약을 확인해야 합니다.");
  const targetRaw = String(formData.get("targetCountryId") ?? "").trim();
  const input = mapChangeSchema.parse({
    campaignId: formData.get("campaignId"),
    mapId: formData.get("mapId"),
    expectedRevision: formData.get("expectedRevision"),
    targetCountryId: targetRaw || null,
    cellIds: [
      ...new Set(
        String(formData.get("cellIds") ?? "")
          .split(",")
          .filter(Boolean),
      ),
    ],
    reason: formData.get("reason"),
  });

  await db.transaction(async (tx) => {
    const lockedMaps = await tx.execute<{
      id: string;
      revision: number;
      position: number;
      hexResolution: number;
    }>(sql`
      SELECT
        id,
        revision,
        position,
        hex_resolution AS "hexResolution"
      FROM campaign_maps
      WHERE id = ${input.mapId}
        AND campaign_id = ${input.campaignId}
      FOR UPDATE
    `);
    const campaignMap = lockedMaps.at(0);
    if (!campaignMap) throw new Error("지도를 찾을 수 없습니다.");
    assertMapRevision(input.expectedRevision, campaignMap.revision);
    if (input.targetCountryId) {
      const target = await tx.query.countries.findFirst({
        where: eq(countries.id, input.targetCountryId),
      });
      if (!target || target.campaignId !== input.campaignId)
        throw new Error("대상 국가가 유효하지 않습니다.");
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
    const cells = missingCells.length
      ? await tx.query.mapCells.findMany({ where: inArray(mapCells.id, input.cellIds) })
      : existingCells;
    if (cells.length !== input.cellIds.length) {
      throw new Error("지도 셀을 생성하지 못했습니다.");
    }
    if (cells.some((cell) => cell.isLocked)) throw new Error("잠긴 셀은 변경할 수 없습니다.");
    const candidatesByCell = new Map(
      input.cellIds.map((cellId) => [cellId, getMapCellCandidates(cellId)]),
    );
    const candidateIds = [...new Set([...candidatesByCell.values()].flat())];
    const currentRows = await tx.execute<{
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
        AND revision <= ${input.expectedRevision}
      ORDER BY cell_id, revision DESC
    `);
    const ownershipByCell = new Map(currentRows.map((row) => [row.cellId, row]));
    const current = new Map(
      input.cellIds.map((cellId) => [
        cellId,
        resolveCellValue(candidatesByCell.get(cellId)!, ownershipByCell)?.countryId ?? null,
      ]),
    );
    const changed = input.cellIds.filter((cellId) => current.get(cellId) !== input.targetCountryId);
    if (!changed.length) throw new Error("실제로 소유권이 바뀌는 셀이 없습니다.");
    const newRevision = input.expectedRevision + 1;
    const [changeSet] = await tx
      .insert(mapChangeSets)
      .values({
        campaignId: input.campaignId,
        mapId: input.mapId,
        baseRevision: input.expectedRevision,
        newRevision,
        targetCountryId: input.targetCountryId,
        actorId: session.user.id,
        reason: input.reason,
        cellCount: changed.length,
      })
      .returning();
    await tx.insert(mapOwnership).values(
      changed.map((cellId) => ({
        campaignId: input.campaignId,
        mapId: input.mapId,
        revision: newRevision,
        cellId,
        countryId: input.targetCountryId,
      })),
    );
    await tx.insert(mapCellChanges).values(
      changed.map((cellId) => ({
        changeSetId: changeSet.id,
        cellId,
        previousCountryId: current.get(cellId) ?? null,
        newCountryId: input.targetCountryId,
      })),
    );
    await tx
      .update(campaignMaps)
      .set({ revision: newRevision, updatedAt: new Date() })
      .where(eq(campaignMaps.id, input.mapId));
    if (campaignMap.position === 1) {
      await tx
        .update(campaigns)
        .set({ mapRevision: newRevision, updatedAt: new Date() })
        .where(eq(campaigns.id, input.campaignId));
    }
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: session.user.id,
      action: "SAVE_MAP_CHANGE_SET",
      targetType: "MAP_CHANGE_SET",
      targetId: changeSet.id,
      beforeSummary: {
        mapId: input.mapId,
        revision: input.expectedRevision,
        cells: changed.length,
      },
      afterSummary: {
        mapId: input.mapId,
        revision: newRevision,
        targetCountryId: input.targetCountryId,
      },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/map");
  revalidatePath("/diplomacy");
}
