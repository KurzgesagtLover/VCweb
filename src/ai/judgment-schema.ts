import { z } from "zod";

const projectedChangeSchema = z.object({
  year: z.number().int().min(1).max(30),
  metric: z.string().min(1),
  delta: z.number(),
  unit: z.enum(["PERCENTAGE_POINT", "PERCENT", "INDEX", "CURRENCY", "COUNT"]),
  rationale: z.string().min(1).max(1000),
});

export const judgmentProposalSchema = z.object({
  verdict: z.enum(["SUCCESS", "PARTIAL", "FAILURE", "DELAYED", "NEEDS_ADMIN"]),
  publicSummary: z.string().min(1).max(1000),
  publicNarrative: z.string().min(1).max(6000),
  adminRationale: z.string().min(1).max(4000),
  assumptions: z.array(z.string().max(500)).max(20),
  confidence: z.number().min(0).max(1),
  projectedChanges: z.array(projectedChangeSchema).max(60).default([]),
  effects: z
    .array(
      z.object({
        targetType: z.enum(["COUNTRY", "PARTY", "RELATION", "RESEARCH"]),
        targetId: z.string().min(1),
        metric: z.string().min(1),
        operation: z.enum(["ADD", "MULTIPLY"]),
        value: z.number(),
        durationTurns: z.number().int().min(1).max(12).nullable(),
        reason: z.string().min(1).max(1000),
      }),
    )
    .max(20),
  followUpEvents: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().min(1).max(1000),
        visibility: z.enum(["PUBLIC", "COUNTRY", "ADMIN"]),
      }),
    )
    .max(8),
  warnings: z.array(z.string().max(1000)).max(20),
  requiresAdmin: z.boolean(),
});

export type JudgmentProposalOutput = z.infer<typeof judgmentProposalSchema>;

export const judgmentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict",
    "publicSummary",
    "publicNarrative",
    "adminRationale",
    "assumptions",
    "confidence",
    "effects",
    "followUpEvents",
    "warnings",
    "requiresAdmin",
  ],
  properties: {
    verdict: { enum: ["SUCCESS", "PARTIAL", "FAILURE", "DELAYED", "NEEDS_ADMIN"] },
    publicSummary: { type: "string" },
    publicNarrative: { type: "string" },
    adminRationale: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    projectedChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["year", "metric", "delta", "unit", "rationale"],
        properties: {
          year: { type: "integer", minimum: 1, maximum: 30 },
          metric: { type: "string" },
          delta: { type: "number" },
          unit: {
            enum: ["PERCENTAGE_POINT", "PERCENT", "INDEX", "CURRENCY", "COUNT"],
          },
          rationale: { type: "string" },
        },
      },
    },
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
    followUpEvents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "visibility"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          visibility: { enum: ["PUBLIC", "COUNTRY", "ADMIN"] },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    requiresAdmin: { type: "boolean" },
  },
} as const;
