import { and, eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { getEnv } from "@/src/config/env";
import { db } from "@/src/db";
import { aiProviderCredentials, aiTaskConfigs } from "@/src/db/schema";
import {
  DEFAULT_AI_TASKS,
  isAiProvider,
  isSupportedModel,
  type AiProviderName,
  type AiTaskType,
} from "./catalog";
import {
  judgmentJsonSchema,
  judgmentProposalSchema,
  type JudgmentProposalOutput,
} from "./judgment-schema";
import { FakeAIProvider, OpenAICompatibleProvider, OpenAIProvider } from "./providers";
import { decryptApiKey } from "./secret-box";
import {
  diplomacyResponseJsonSchema,
  diplomacyResponseSchema,
  turnEventJsonSchema,
  turnEventSchema,
  type DiplomacyResponseOutput,
  type TurnEventOutput,
} from "./task-schemas";
import { AIProviderError, type AIProvider, type AIResult, type JsonSchema } from "./types";

type RuntimeRoute = {
  provider: AiProviderName | "fake";
  model: string;
  systemPrompt: string;
  promptVersion: string;
  apiKey?: string;
};

async function runtimeRoute(campaignId: string, taskType: AiTaskType): Promise<RuntimeRoute> {
  const config = await db.query.aiTaskConfigs.findFirst({
    where: and(
      eq(aiTaskConfigs.campaignId, campaignId),
      eq(aiTaskConfigs.taskType, taskType),
      eq(aiTaskConfigs.isActive, true),
    ),
  });
  if (!config) {
    return {
      provider: "fake",
      model: `built-in-${taskType.toLowerCase()}`,
      systemPrompt: DEFAULT_AI_TASKS[taskType].systemPrompt,
      promptVersion: "default-v1",
    };
  }
  if (!isAiProvider(config.provider) || !isSupportedModel(config.provider, config.model)) {
    throw new AIProviderError("CONFIGURATION", "지원하지 않는 AI 모델 설정입니다.", false);
  }
  const credential = await db.query.aiProviderCredentials.findFirst({
    where: and(
      eq(aiProviderCredentials.campaignId, campaignId),
      eq(aiProviderCredentials.provider, config.provider),
      eq(aiProviderCredentials.isActive, true),
    ),
  });
  if (!credential) {
    throw new AIProviderError("CONFIGURATION", "선택한 AI 공급자의 API 키가 없습니다.", false);
  }
  return {
    provider: config.provider,
    model: config.model,
    systemPrompt: config.systemPrompt,
    promptVersion: `config-${config.updatedAt.toISOString()}`,
    apiKey: decryptApiKey(credential.encryptedKey),
  };
}

function providerFor(route: RuntimeRoute): AIProvider {
  if (route.provider === "fake") return new FakeAIProvider();
  if (!route.apiKey) {
    throw new AIProviderError("CONFIGURATION", "AI 공급자 API 키가 없습니다.", false);
  }
  if (route.provider === "openai") return new OpenAIProvider(route.apiKey);
  return new OpenAICompatibleProvider(
    "opencode_go",
    route.apiKey,
    "https://opencode.ai/zen/go/v1/chat/completions",
  );
}

async function generateConfiguredTask<T>(input: {
  campaignId: string;
  taskType: AiTaskType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  schema: JsonSchema;
  parser: ZodType<T>;
}): Promise<AIResult<T> & { promptVersion: string }> {
  const env = getEnv();
  const route = await runtimeRoute(input.campaignId, input.taskType);
  let lastError: unknown;
  for (let attempt = 0; attempt <= env.AI_MAX_RETRIES; attempt += 1) {
    try {
      const result = await providerFor(route).generateStructured<unknown>({
        taskType: input.taskType,
        model: route.model,
        system: route.systemPrompt,
        payload: input.payload,
        schema: input.schema,
        timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
        idempotencyKey: input.idempotencyKey,
      });
      const parsed = input.parser.safeParse(result.data);
      if (!parsed.success) {
        throw new AIProviderError("INVALID_SCHEMA", parsed.error.message, attempt === 0);
      }
      return { ...result, data: parsed.data, promptVersion: route.promptVersion };
    } catch (error) {
      lastError = error;
      const providerError = error instanceof AIProviderError ? error : null;
      if (!providerError?.retryable || attempt >= env.AI_MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 2_000)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI 공급자 실행에 실패했습니다.");
}

export function generateJudgment(input: {
  campaignId: string;
  taskType: "JUDGE_SUBMISSION" | "GENERATE_OPPOSITION_ACTION";
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return generateConfiguredTask<JudgmentProposalOutput>({
    ...input,
    schema: judgmentJsonSchema,
    parser: judgmentProposalSchema,
  });
}

export function generateTurnEvent(input: {
  campaignId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return generateConfiguredTask<TurnEventOutput>({
    ...input,
    taskType: "GENERATE_TURN_EVENT",
    schema: turnEventJsonSchema,
    parser: turnEventSchema,
  });
}

export function generateDiplomacyResponse(input: {
  campaignId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  return generateConfiguredTask<DiplomacyResponseOutput>({
    ...input,
    taskType: "GENERATE_AI_DIPLOMACY_RESPONSE",
    schema: diplomacyResponseJsonSchema,
    parser: diplomacyResponseSchema,
  });
}
