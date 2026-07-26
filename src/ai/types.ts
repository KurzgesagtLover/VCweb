export type JsonSchema = Record<string, unknown>;

export type AIResult<T> = {
  data: T;
  raw: unknown;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

export type GenerateStructuredInput = {
  taskType?: string;
  model: string;
  system: string;
  payload: unknown;
  schema: JsonSchema;
  timeoutMs: number;
  idempotencyKey: string;
};

export interface AIProvider {
  readonly name: string;
  generateStructured<T>(input: GenerateStructuredInput): Promise<AIResult<T>>;
}

export class AIProviderError extends Error {
  constructor(
    public readonly code:
      | "CONFIGURATION"
      | "TIMEOUT"
      | "RATE_LIMIT"
      | "PROVIDER_5XX"
      | "POLICY_REFUSAL"
      | "EMPTY_OUTPUT"
      | "INVALID_SCHEMA",
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
