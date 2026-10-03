"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  administrativeDivisionRequests,
  administrativeDivisions,
  auditLogs,
  countries,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";

const divisionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  typeName: z.string().trim().min(1).max(40).default("광역행정구역"),
  level: z.coerce.number().int().min(1).max(3).default(1),
  parentId: z.string().uuid().nullable().default(null),
});

export async function requestAdministrativeDivisionAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const context = await getViewerContext(session.user.id);
  if (!context.country) throw new Error("배정된 국가가 없습니다.");
  const input = divisionSchema.parse({
    name: formData.get("name"),
    typeName: formData.get("typeName") || "광역행정구역",
    level: 1,
    parentId: null,
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
    level: formData.get("level") || 1,
    parentId: String(formData.get("parentId") ?? "").trim() || null,
  });
  const country = await db.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");
  const duplicate = await db.query.administrativeDivisions.findFirst({
    where: and(
      eq(administrativeDivisions.countryId, countryId),
      eq(administrativeDivisions.level, input.level),
      eq(administrativeDivisions.name, input.name),
    ),
  });
  if (duplicate) throw new Error("이미 등록된 행정구역 이름입니다.");
  if (input.level === 1 && input.parentId) throw new Error("1단계 구역에는 상위 구역이 없습니다.");
  if (input.level > 1) {
    const parent = input.parentId
      ? await db.query.administrativeDivisions.findFirst({
          where: eq(administrativeDivisions.id, input.parentId),
        })
      : null;
    if (!parent || parent.countryId !== countryId || parent.level !== input.level - 1) {
      throw new Error("바로 위 단계의 상위 행정구역을 선택해 주세요.");
    }
  }

  await db.transaction(async (tx) => {
    const [division] = await tx
      .insert(administrativeDivisions)
      .values({ countryId, ...input })
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
  revalidatePath("/country/territory");
}
