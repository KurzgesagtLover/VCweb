import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  APP_DEFAULT_LOCALE: z.string().default("ko"),
  MAP_HEX_EDGE_METERS: z.coerce.number().positive().default(20_000),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}

export function validateEnv(input: Record<string, string | undefined> = process.env) {
  return serverSchema.safeParse(input);
}
