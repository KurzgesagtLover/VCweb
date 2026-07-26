"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { aiProviderCredentials, aiTaskConfigs, auditLogs } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { AI_PROVIDERS, AI_TASK_TYPES, parseAiRoute } from "@/src/ai/catalog";
import { apiKeyHint, encryptApiKey } from "@/src/ai/secret-box";

const credentialSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().trim().min(8).max(2000),
});

export async function saveAiProviderCredentialAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = credentialSchema.parse({
    provider: formData.get("provider"),
    apiKey: formData.get("apiKey"),
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(aiProviderCredentials)
      .values({
        campaignId: context.campaign!.id,
        provider: input.provider,
        encryptedKey: encryptApiKey(input.apiKey),
        keyHint: apiKeyHint(input.apiKey),
        isActive: true,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: [aiProviderCredentials.campaignId, aiProviderCredentials.provider],
        set: {
          encryptedKey: encryptApiKey(input.apiKey),
          keyHint: apiKeyHint(input.apiKey),
          isActive: true,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "UPDATE_AI_PROVIDER_CREDENTIAL",
      targetType: "AI_PROVIDER",
      targetId: input.provider,
      afterSummary: { provider: input.provider, keyHint: apiKeyHint(input.apiKey) },
      reason: "AI 공급자 API 키 갱신",
    });
  });
  revalidatePath("/admin/ai-jobs");
}

const taskConfigSchema = z.object({
  taskType: z.enum(AI_TASK_TYPES),
  route: z.string().min(1),
  systemPrompt: z.string().trim().min(30).max(20_000),
});

export async function saveAiTaskConfigAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = taskConfigSchema.parse({
    taskType: formData.get("taskType"),
    route: formData.get("route"),
    systemPrompt: formData.get("systemPrompt"),
  });
  const route = parseAiRoute(input.route);
  if (!route) throw new Error("지원하는 공급자와 모델을 선택해 주세요.");

  const credential = await db.query.aiProviderCredentials.findFirst({
    where: and(
      eq(aiProviderCredentials.campaignId, context.campaign.id),
      eq(aiProviderCredentials.provider, route.provider),
      eq(aiProviderCredentials.isActive, true),
    ),
  });
  if (!credential) throw new Error("선택한 공급자의 API 키를 먼저 저장해 주세요.");

  await db.transaction(async (tx) => {
    await tx
      .insert(aiTaskConfigs)
      .values({
        campaignId: context.campaign!.id,
        taskType: input.taskType,
        provider: route.provider,
        model: route.model,
        systemPrompt: input.systemPrompt,
        isActive: true,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: [aiTaskConfigs.campaignId, aiTaskConfigs.taskType],
        set: {
          provider: route.provider,
          model: route.model,
          systemPrompt: input.systemPrompt,
          isActive: true,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "UPDATE_AI_TASK_CONFIG",
      targetType: "AI_TASK",
      targetId: input.taskType,
      afterSummary: {
        taskType: input.taskType,
        provider: route.provider,
        model: route.model,
      },
      reason: "작업별 AI 모델 및 프롬프트 갱신",
    });
  });
  revalidatePath("/admin/ai-jobs");
}
