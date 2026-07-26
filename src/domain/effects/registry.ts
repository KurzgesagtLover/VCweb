import Decimal from "decimal.js";
import { z } from "zod";

export const effectInputSchema = z.object({
  targetType: z.enum(["COUNTRY", "PARTY", "RELATION", "RESEARCH"]),
  targetId: z.string().min(1),
  metric: z.string().min(1),
  operation: z.enum(["ADD", "MULTIPLY"]),
  value: z.union([z.number(), z.string()]).transform(String),
  durationTurns: z.number().int().min(1).max(12).nullable(),
  reason: z.string().min(3).max(1000),
});

export type EffectInput = z.infer<typeof effectInputSchema>;
type Rule = { operations: Array<"ADD" | "MULTIPLY">; min: string; max: string };

const rules: Record<string, Rule> = {
  "COUNTRY.realGdpGrowth": { operations: ["ADD", "MULTIPLY"], min: "-0.08", max: "0.08" },
  "COUNTRY.inflationRate": { operations: ["ADD", "MULTIPLY"], min: "-0.05", max: "0.08" },
  "COUNTRY.unemploymentRate": {
    operations: ["ADD", "MULTIPLY"],
    min: "-0.05",
    max: "0.08",
  },
  "COUNTRY.productivityIndex": { operations: ["ADD", "MULTIPLY"], min: "-10", max: "15" },
  "COUNTRY.incomeGini": { operations: ["ADD", "MULTIPLY"], min: "-0.04", max: "0.04" },
  "COUNTRY.wealthGini": { operations: ["ADD", "MULTIPLY"], min: "-0.04", max: "0.04" },
  "COUNTRY.debtToGdp": { operations: ["ADD", "MULTIPLY"], min: "-0.08", max: "0.12" },
  "COUNTRY.currentAccountToGdp": {
    operations: ["ADD", "MULTIPLY"],
    min: "-0.08",
    max: "0.08",
  },
  "COUNTRY.stability": { operations: ["ADD"], min: "-12", max: "12" },
  "COUNTRY.legitimacy": { operations: ["ADD"], min: "-12", max: "12" },
  "COUNTRY.governmentApproval": { operations: ["ADD"], min: "-15", max: "15" },
  "COUNTRY.policySupport": { operations: ["ADD"], min: "-15", max: "15" },
  "COUNTRY.unrest": { operations: ["ADD"], min: "-12", max: "12" },
  "COUNTRY.stateCapacity": { operations: ["ADD"], min: "-8", max: "8" },
  "COUNTRY.corruption": { operations: ["ADD"], min: "-8", max: "8" },
  "COUNTRY.democracy": { operations: ["ADD"], min: "-8", max: "8" },
  "PARTY.support": { operations: ["ADD"], min: "-0.08", max: "0.08" },
  "PARTY.organization": { operations: ["ADD"], min: "-12", max: "12" },
  "RELATION.score": { operations: ["ADD"], min: "-20", max: "20" },
  "RESEARCH.progressPoints": { operations: ["ADD"], min: "0", max: "100" },
};

export function validateEffect(raw: unknown) {
  const parsed = effectInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false as const,
      warning: parsed.error.issues.map((issue) => issue.message).join(", "),
    };
  }
  const effect = parsed.data;
  const rule = rules[`${effect.targetType}.${effect.metric}`];
  if (!rule) return { valid: false as const, effect, warning: "허용되지 않은 대상 지표입니다." };
  if (!rule.operations.includes(effect.operation)) {
    return { valid: false as const, effect, warning: "허용되지 않은 연산입니다." };
  }
  const value = new Decimal(effect.value);
  if (!value.isFinite() || value.lt(rule.min) || value.gt(rule.max)) {
    return {
      valid: false as const,
      effect,
      warning: `1회 변화 허용 범위 ${rule.min}~${rule.max}를 벗어났습니다.`,
    };
  }
  return { valid: true as const, effect };
}

export function validateEffects(effects: unknown[]) {
  return effects.map(validateEffect);
}
