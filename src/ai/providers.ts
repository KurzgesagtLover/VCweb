import {
  AIProviderError,
  type AIProvider,
  type AIResult,
  type GenerateStructuredInput,
} from "./types";

function extractOpenAIText(raw: Record<string, unknown>) {
  if (typeof raw.output_text === "string") return raw.output_text;
  const output = Array.isArray(raw.output) ? raw.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const maybeContent = (item as { content?: unknown }).content;
    const content = Array.isArray(maybeContent) ? maybeContent : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

async function requestJson(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = await response.text();
      if (response.status === 429) throw new AIProviderError("RATE_LIMIT", message, true);
      if (response.status >= 500) throw new AIProviderError("PROVIDER_5XX", message, true);
      if (response.status === 400 || response.status === 403) {
        throw new AIProviderError("POLICY_REFUSAL", message, false);
      }
      throw new AIProviderError("CONFIGURATION", message, false);
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AIProviderError("TIMEOUT", "AI 공급자 응답 시간이 초과되었습니다.", true);
    }
    throw new AIProviderError("PROVIDER_5XX", String(error), true);
  } finally {
    clearTimeout(timer);
  }
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  constructor(private readonly apiKey: string) {}

  async generateStructured<T>(input: GenerateStructuredInput): Promise<AIResult<T>> {
    const started = Date.now();
    const raw = await requestJson(
      "https://api.openai.com/v1/responses",
      this.apiKey,
      {
        model: input.model,
        instructions: input.system,
        input: JSON.stringify(input.payload),
        text: {
          format: {
            type: "json_schema",
            name: "judgment_proposal",
            strict: true,
            schema: input.schema,
          },
        },
        metadata: { idempotency_key: input.idempotencyKey },
      },
      input.timeoutMs,
    );
    const text = extractOpenAIText(raw);
    if (!text) throw new AIProviderError("EMPTY_OUTPUT", "OpenAI 응답 본문이 비었습니다.", true);
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new AIProviderError("INVALID_SCHEMA", "OpenAI 응답이 JSON이 아닙니다.", true);
    }
    const usage = (raw.usage ?? {}) as Record<string, unknown>;
    return {
      data,
      raw,
      provider: this.name,
      model: input.model,
      inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
      outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : null,
      latencyMs: Date.now() - started,
    };
  }
}

export class DeepSeekProvider implements AIProvider {
  readonly name = "deepseek";
  constructor(private readonly apiKey: string) {}

  async generateStructured<T>(input: GenerateStructuredInput): Promise<AIResult<T>> {
    const started = Date.now();
    const raw = await requestJson(
      "https://api.deepseek.com/chat/completions",
      this.apiKey,
      {
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: JSON.stringify({ schema: input.schema, payload: input.payload }),
          },
        ],
        response_format: { type: "json_object" },
      },
      input.timeoutMs,
    );
    const choices = Array.isArray(raw.choices) ? raw.choices : [];
    const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
    if (typeof message?.content !== "string") {
      throw new AIProviderError("EMPTY_OUTPUT", "DeepSeek 응답 본문이 비었습니다.", true);
    }
    let data: T;
    try {
      data = JSON.parse(message.content) as T;
    } catch {
      throw new AIProviderError("INVALID_SCHEMA", "DeepSeek 응답이 JSON이 아닙니다.", true);
    }
    const usage = (raw.usage ?? {}) as Record<string, unknown>;
    return {
      data,
      raw,
      provider: this.name,
      model: input.model,
      inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
      outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
      latencyMs: Date.now() - started,
    };
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    readonly name: string,
    private readonly apiKey: string,
    private readonly endpoint: string,
  ) {}

  async generateStructured<T>(input: GenerateStructuredInput): Promise<AIResult<T>> {
    const started = Date.now();
    const raw = await requestJson(
      this.endpoint,
      this.apiKey,
      {
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: JSON.stringify({ schema: input.schema, payload: input.payload }),
          },
        ],
        response_format: { type: "json_object" },
      },
      input.timeoutMs,
    );
    const choices = Array.isArray(raw.choices) ? raw.choices : [];
    const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
    if (typeof message?.content !== "string") {
      throw new AIProviderError("EMPTY_OUTPUT", "AI 공급자 응답 본문이 비었습니다.", true);
    }
    let data: T;
    try {
      data = JSON.parse(message.content) as T;
    } catch {
      throw new AIProviderError("INVALID_SCHEMA", "AI 공급자 응답이 JSON이 아닙니다.", true);
    }
    const usage = (raw.usage ?? {}) as Record<string, unknown>;
    return {
      data,
      raw,
      provider: this.name,
      model: input.model,
      inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
      outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
      latencyMs: Date.now() - started,
    };
  }
}

export class FakeAIProvider implements AIProvider {
  readonly name = "fake";

  async generateStructured<T>(input: GenerateStructuredInput): Promise<AIResult<T>> {
    const payload = input.payload as {
      subjectType?: string;
      countryId?: string;
      targetId?: string;
      title?: string;
    };
    const targetId = payload.targetId ?? payload.countryId ?? "unknown";
    if (input.taskType === "GENERATE_TURN_EVENT") {
      const data = {
        title: "항만 물류망의 병목 신호",
        subtitle: "결정이 필요한 72시간",
        body: "동부 항만의 자동화 설비 장애와 노사 협의 지연이 겹쳤다. 정부는 복구 방식과 비용 부담을 결정해야 한다.",
        options: [
          {
            label: "긴급 공공투자 승인",
            description: "예비비와 공기업 인력을 투입합니다.",
            expectedEffect: "생산성 회복, 단기 재정 부담",
            effects: [
              {
                targetType: "COUNTRY",
                targetId,
                metric: "productivityIndex",
                operation: "ADD",
                value: 3,
                durationTurns: 2,
                reason: "항만 병목 긴급 해소",
              },
            ],
          },
          {
            label: "민간 컨소시엄 한시 위탁",
            description: "운영 복구를 민간에 맡기고 공개 감사를 붙입니다.",
            expectedEffect: "빠른 정상화, 지지도 논쟁",
            effects: [
              {
                targetType: "COUNTRY",
                targetId,
                metric: "governmentApproval",
                operation: "ADD",
                value: -2,
                durationTurns: 1,
                reason: "민간 위탁에 대한 정치적 논쟁",
              },
            ],
          },
        ],
      } as T;
      return {
        data,
        raw: data,
        provider: this.name,
        model: input.model,
        inputTokens: Math.ceil(JSON.stringify(input.payload).length / 4),
        outputTokens: Math.ceil(JSON.stringify(data).length / 4),
        latencyMs: 1,
      };
    }
    if (input.taskType === "GENERATE_AI_DIPLOMACY_RESPONSE") {
      const data = {
        responseType: "COUNTER",
        body: "제안의 기본 취지에는 동의합니다. 다만 이행 일정과 상호 검증 조항을 명문화하는 조건으로 협의를 계속하겠습니다.",
        relationDelta: 1,
        rationale: "자국 이익을 보호하면서 협상 통로를 유지하는 제한적 역제안입니다.",
      } as T;
      return {
        data,
        raw: data,
        provider: this.name,
        model: input.model,
        inputTokens: Math.ceil(JSON.stringify(input.payload).length / 4),
        outputTokens: Math.ceil(JSON.stringify(data).length / 4),
        latencyMs: 1,
      };
    }
    const isOpposition = payload.subjectType === "OPPOSITION";
    const data = {
      verdict: "PARTIAL",
      publicSummary: isOpposition
        ? "야당이 정부의 집행 계획에 공개 검증을 요구했습니다."
        : `${payload.title ?? "국가 계획"}이 단계적 조건부 승인되었습니다.`,
      publicNarrative: isOpposition
        ? "의회 회랑의 카메라 앞에서 야당 원내대표가 자료 공개와 집행 일정 재검토를 요구했다. 정부는 제한적 청문 절차를 수용했다."
        : "행정부는 핵심 사업을 우선 착수하되 재정·정치 위험을 분기별로 검토하기로 했다. 초기 성과는 제한적이지만 제도적 기반이 마련되었다.",
      adminRationale:
        "FakeAIProvider의 결정론적 판정입니다. 효과는 서버 허용 범위 안에서만 제안됩니다.",
      assumptions: ["현행 법률과 예산 집행 절차가 유지됨", "대규모 외부 충격이 없음"],
      confidence: 0.82,
      projectedChanges: isOpposition
        ? []
        : [
            {
              year: 1,
              metric: "productivityIndex",
              delta: 1.2,
              unit: "INDEX",
              rationale: "초기 집행과 제도 정비가 생산성에 반영됩니다.",
            },
            {
              year: 2,
              metric: "unemploymentRate",
              delta: -0.3,
              unit: "PERCENTAGE_POINT",
              rationale: "민간 투자와 고용 확대 효과가 시차를 두고 나타납니다.",
            },
          ],
      effects: [
        {
          targetType: "COUNTRY",
          targetId,
          metric: isOpposition ? "governmentApproval" : "productivityIndex",
          operation: "ADD",
          value: isOpposition ? -2 : 2,
          durationTurns: 2,
          reason: isOpposition ? "공개 검증 요구에 따른 단기 지지도 압박" : "단계적 제도 정비 효과",
        },
      ],
      followUpEvents: [
        {
          title: isOpposition ? "공개 청문 요구" : "첫 분기 집행 보고",
          summary: "다음 턴에 진행 상황을 확인할 후속 사건입니다.",
          visibility: "COUNTRY",
        },
      ],
      warnings: [],
      requiresAdmin: true,
    } as T;
    return {
      data,
      raw: data,
      provider: this.name,
      model: input.model,
      inputTokens: Math.ceil(JSON.stringify(input.payload).length / 4),
      outputTokens: Math.ceil(JSON.stringify(data).length / 4),
      latencyMs: 1,
    };
  }
}
