import { z } from "zod";

const effectSchema = z.object({
  targetType: z.enum(["COUNTRY", "PARTY", "RELATION", "RESEARCH"]),
  targetId: z.string().min(1),
  metric: z.string().min(1),
  operation: z.enum(["ADD", "MULTIPLY"]),
  value: z.number(),
  durationTurns: z.number().int().min(1).max(12).nullable(),
  reason: z.string().min(1).max(1000),
});

export const turnEventSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().min(1).max(300),
  body: z.string().min(1).max(6000),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        description: z.string().min(1).max(1000),
        expectedEffect: z.string().min(1).max(1000),
        effects: z.array(effectSchema).max(8),
      }),
    )
    .min(2)
    .max(4),
});

export type TurnEventOutput = z.infer<typeof turnEventSchema>;

export const turnEventJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "body", "options"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    body: { type: "string" },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "description", "expectedEffect", "effects"],
        properties: {
          label: { type: "string" },
          description: { type: "string" },
          expectedEffect: { type: "string" },
          effects: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "targetType",
                "targetId",
                "metric",
                "operation",
                "value",
                "durationTurns",
                "reason",
              ],
              properties: {
                targetType: { enum: ["COUNTRY", "PARTY", "RELATION", "RESEARCH"] },
                targetId: { type: "string" },
                metric: { type: "string" },
                operation: { enum: ["ADD", "MULTIPLY"] },
                value: { type: "number" },
                durationTurns: {
                  anyOf: [{ type: "integer", minimum: 1, maximum: 12 }, { type: "null" }],
                },
                reason: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const diplomacyResponseSchema = z.object({
  responseType: z.enum(["ACCEPT", "REJECT", "COUNTER", "DELAY", "NEEDS_ADMIN"]),
  body: z.string().min(1).max(6000),
  relationDelta: z.number().int().min(-10).max(10),
  rationale: z.string().min(1).max(2000),
});

export type DiplomacyResponseOutput = z.infer<typeof diplomacyResponseSchema>;

export const diplomacyResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["responseType", "body", "relationDelta", "rationale"],
  properties: {
    responseType: { enum: ["ACCEPT", "REJECT", "COUNTER", "DELAY", "NEEDS_ADMIN"] },
    body: { type: "string" },
    relationDelta: { type: "integer", minimum: -10, maximum: 10 },
    rationale: { type: "string" },
  },
} as const;
