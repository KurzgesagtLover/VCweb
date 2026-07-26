"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  campaignMemberships,
  chatChannelMembers,
  chatChannels,
  countryAssignments,
  users,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";

const roleSchema = z.object({
  targetUserId: z.string().min(1),
  role: z.enum(["USER", "PLAYER", "MODERATOR", "ADMIN"]),
  reason: z.string().trim().min(3).max(300),
});

export async function setUserRoleAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = roleSchema.parse({
    targetUserId: formData.get("targetUserId"),
    role: formData.get("role"),
    reason: formData.get("reason"),
  });
  if (input.targetUserId === session.user.id)
    throw new Error("현재 로그인한 계정의 역할은 변경할 수 없습니다.");
  const [target, context] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, input.targetUserId) }),
    getViewerContext(session.user.id),
  ]);
  if (!target || !context.campaign) throw new Error("대상 사용자 또는 캠페인을 찾을 수 없습니다.");
  const assignment = await db.query.countryAssignments.findFirst({
    where: and(
      eq(countryAssignments.campaignId, context.campaign.id),
      eq(countryAssignments.userId, target.id),
      eq(countryAssignments.isActive, true),
    ),
  });
  if (assignment && input.role !== "PLAYER") throw new Error("국가 배정을 먼저 해제해 주세요.");

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(users.id, target.id));
    await tx
      .update(campaignMemberships)
      .set({ role: input.role, updatedAt: new Date() })
      .where(
        and(
          eq(campaignMemberships.campaignId, context.campaign!.id),
          eq(campaignMemberships.userId, target.id),
        ),
      );
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "CHANGE_USER_ROLE",
      targetType: "USER",
      targetId: target.id,
      beforeSummary: { role: target.role },
      afterSummary: { role: input.role },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/users");
}

export async function releaseCountryAssignmentAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = z
    .object({ assignmentId: z.string().uuid(), reason: z.string().trim().min(3).max(300) })
    .parse({ assignmentId: formData.get("assignmentId"), reason: formData.get("reason") });
  const [assignment, context] = await Promise.all([
    db.query.countryAssignments.findFirst({
      where: and(
        eq(countryAssignments.id, input.assignmentId),
        eq(countryAssignments.isActive, true),
      ),
    }),
    getViewerContext(session.user.id),
  ]);
  if (!assignment || !context.campaign) throw new Error("활성 국가 배정을 찾을 수 없습니다.");
  const channel = await db.query.chatChannels.findFirst({
    where: and(
      eq(chatChannels.campaignId, assignment.campaignId),
      eq(chatChannels.countryId, assignment.countryId),
    ),
  });
  await db.transaction(async (tx) => {
    await tx
      .update(countryAssignments)
      .set({ isActive: false, endTurnId: context.turn?.id, updatedAt: new Date() })
      .where(eq(countryAssignments.id, assignment.id));
    await tx
      .update(users)
      .set({ role: "USER", updatedAt: new Date() })
      .where(eq(users.id, assignment.userId));
    await tx
      .update(campaignMemberships)
      .set({ role: "USER", updatedAt: new Date() })
      .where(
        and(
          eq(campaignMemberships.campaignId, assignment.campaignId),
          eq(campaignMemberships.userId, assignment.userId),
        ),
      );
    if (channel) {
      await tx
        .delete(chatChannelMembers)
        .where(
          and(
            eq(chatChannelMembers.channelId, channel.id),
            eq(chatChannelMembers.userId, assignment.userId),
          ),
        );
    }
    await tx.insert(auditLogs).values({
      campaignId: assignment.campaignId,
      actorId: session.user.id,
      action: "RELEASE_COUNTRY_ASSIGNMENT",
      targetType: "COUNTRY_ASSIGNMENT",
      targetId: assignment.id,
      beforeSummary: { countryId: assignment.countryId, userId: assignment.userId, active: true },
      afterSummary: { active: false },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/countries");
}
