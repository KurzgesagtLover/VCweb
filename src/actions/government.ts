"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { z } from "zod";
import { AuthorizationError, requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  countries,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  officePersonnelChanges,
} from "@/src/db/schema";
import { getOfficeSlot } from "@/src/db/queries/government";
import { getViewerContext } from "@/src/db/queries/viewer";
import { enforceActionRateLimit } from "@/src/services/rate-limit";

const officeSchema = z.object({
  officeId: z.string().uuid().optional().or(z.literal("")),
  countryId: z.string().uuid(),
  branch: z.enum(["EXECUTIVE", "JUDICIAL", "LEGISLATIVE"]),
  title: z.string().trim().min(2).max(80),
  seatCount: z.coerce.number().int().min(1).max(12),
  displayOrder: z.coerce.number().int().min(0).max(999),
  isActive: z.enum(["yes", "no"]),
});

export async function saveGovernmentOfficeAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = officeSchema.parse(Object.fromEntries(formData.entries()));
  const country = await db.query.countries.findFirst({ where: eq(countries.id, input.countryId) });
  if (!country) throw new Error("설정할 국가를 찾을 수 없습니다.");

  await db.transaction(async (tx) => {
    let officeId = input.officeId || null;
    if (officeId) {
      const existing = await tx.query.governmentOfficeDefinitions.findFirst({
        where: and(
          eq(governmentOfficeDefinitions.id, officeId),
          eq(governmentOfficeDefinitions.countryId, input.countryId),
        ),
      });
      if (!existing) throw new Error("수정할 직책을 찾을 수 없습니다.");
      await tx
        .update(governmentOfficeDefinitions)
        .set({
          branch: input.branch,
          title: input.title,
          seatCount: input.seatCount,
          displayOrder: input.displayOrder,
          isActive: input.isActive === "yes",
          updatedAt: new Date(),
        })
        .where(eq(governmentOfficeDefinitions.id, officeId));
    } else {
      const [created] = await tx
        .insert(governmentOfficeDefinitions)
        .values({
          countryId: input.countryId,
          branch: input.branch,
          title: input.title,
          seatCount: input.seatCount,
          displayOrder: input.displayOrder,
          isActive: input.isActive === "yes",
        })
        .returning();
      officeId = created.id;
    }

    await tx
      .insert(governmentOfficeHolders)
      .values(
        Array.from({ length: input.seatCount }, (_, index) => ({
          officeId: officeId!,
          slotNumber: index + 1,
        })),
      )
      .onConflictDoNothing({
        target: [governmentOfficeHolders.officeId, governmentOfficeHolders.slotNumber],
      });
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: "CONFIGURE_GOVERNMENT_OFFICE",
      targetType: "GOVERNMENT_OFFICE",
      targetId: officeId,
      afterSummary: {
        branch: input.branch,
        title: input.title,
        seatCount: input.seatCount,
        isActive: input.isActive,
      },
      reason: "정부 직책 구조 설정",
    });
  });
  revalidatePath("/admin/politics");
  revalidatePath("/country/politics");
}

const replacementSchema = z.object({
  officeSlot: z.string().regex(/^[0-9a-f-]{36}:([1-9]|1[0-2])$/i),
  newHolderName: z.string().trim().min(2).max(80),
  narrative: z.string().trim().min(80).max(12000),
});

export async function replaceOfficeHolderAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  if (session.user.role !== "PLAYER")
    throw new AuthorizationError("플레이어만 인사를 교체할 수 있습니다.");
  enforceActionRateLimit(`office-replacement:${session.user.id}`, 5, 60_000);
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) throw new Error("운영 중인 국가가 없습니다.");
  const input = replacementSchema.parse(Object.fromEntries(formData.entries()));
  const [officeId, slotValue] = input.officeSlot.split(":");
  const slotNumber = Number(slotValue);
  const slot = await getOfficeSlot(officeId, slotNumber);
  if (!slot || slot.office.countryId !== context.country.id) {
    throw new AuthorizationError("이 국가에서 교체할 수 없는 직책입니다.");
  }

  const portrait = formData.get("portrait");
  if (!(portrait instanceof File) || portrait.size === 0)
    throw new Error("새 인사의 초상화를 올려 주세요.");
  if (portrait.size > 8 * 1024 * 1024) throw new Error("초상화 파일은 8MB 이하여야 합니다.");
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(portrait.type)) {
    throw new Error("JPG, PNG, WebP 형식의 초상화만 사용할 수 있습니다.");
  }
  const image = sharp(await portrait.arrayBuffer(), { limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !new Set(["jpeg", "png", "webp"]).has(metadata.format)
  ) {
    throw new Error("올바른 이미지 파일이 아닙니다.");
  }
  const output = await image
    .rotate()
    .resize(640, 800, { fit: "cover", position: "attention" })
    .webp({ quality: 86 })
    .toBuffer();
  const fileName = `${randomUUID()}.webp`;
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "portraits");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, fileName), output, { flag: "wx" });
  const portraitPath = `/uploads/portraits/${fileName}`;

  await db.transaction(async (tx) => {
    const previousHolderName = slot.holder?.holderName ?? null;
    if (slot.holder) {
      await tx
        .update(governmentOfficeHolders)
        .set({
          holderName: input.newHolderName,
          portraitPath,
          appointmentNarrative: input.narrative,
          appointedBy: session.user.id,
          startTurnId: context.turn?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(governmentOfficeHolders.id, slot.holder.id));
    } else {
      await tx.insert(governmentOfficeHolders).values({
        officeId: slot.office.id,
        slotNumber,
        holderName: input.newHolderName,
        portraitPath,
        appointmentNarrative: input.narrative,
        appointedBy: session.user.id,
        startTurnId: context.turn?.id ?? null,
      });
    }
    const [change] = await tx
      .insert(officePersonnelChanges)
      .values({
        countryId: context.country!.id,
        officeId: slot.office.id,
        slotNumber,
        previousHolderName,
        newHolderName: input.newHolderName,
        narrative: input.narrative,
        portraitPath,
        submittedBy: session.user.id,
        turnId: context.turn?.id ?? null,
      })
      .returning();
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "REPLACE_OFFICE_HOLDER",
      targetType: "OFFICE_PERSONNEL_CHANGE",
      targetId: change.id,
      beforeSummary: { holderName: previousHolderName },
      afterSummary: {
        office: slot.office.title,
        slotNumber,
        holderName: input.newHolderName,
        portraitPath,
      },
      reason: input.narrative.slice(0, 1000),
    });
  });
  revalidatePath("/country/politics");
  revalidatePath("/admin/politics");
  redirect("/country/politics?tab=replace&updated=1");
}
