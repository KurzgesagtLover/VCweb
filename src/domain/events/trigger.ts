import { z } from "zod";

type TriggerContext = {
  metrics: Record<string, number>;
  technologies: Set<string>;
  flags: Record<string, string | boolean | number>;
};

type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { metric: string; gte?: number; lte?: number }
  | { hasTech: string }
  | { hasFlag: string; equals?: string | boolean | number };

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema).min(1) }),
    z.object({ any: z.array(conditionSchema).min(1) }),
    z
      .object({ metric: z.string().min(1), gte: z.number().optional(), lte: z.number().optional() })
      .refine((value) => value.gte !== undefined || value.lte !== undefined),
    z.object({ hasTech: z.string().min(1) }),
    z.object({
      hasFlag: z.string().min(1),
      equals: z.union([z.string(), z.boolean(), z.number()]).optional(),
    }),
  ]),
);

export function evaluateTrigger(raw: unknown, context: TriggerContext): boolean {
  const condition = conditionSchema.parse(raw);
  if ("all" in condition) return condition.all.every((item) => evaluateTrigger(item, context));
  if ("any" in condition) return condition.any.some((item) => evaluateTrigger(item, context));
  if ("metric" in condition) {
    const value = context.metrics[condition.metric];
    if (value === undefined) return false;
    return (
      (condition.gte === undefined || value >= condition.gte) &&
      (condition.lte === undefined || value <= condition.lte)
    );
  }
  if ("hasTech" in condition) return context.technologies.has(condition.hasTech);
  const value = context.flags[condition.hasFlag];
  return condition.equals === undefined ? value !== undefined : value === condition.equals;
}
