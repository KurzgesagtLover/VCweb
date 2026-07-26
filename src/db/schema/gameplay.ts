import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { campaigns, turns } from "./campaign";
import { countries } from "./country";
import {
  effectStatus,
  eventStatus,
  eventVisibility,
  jobStatus,
  jobType,
  judgmentReviewStatus,
  judgmentRunStatus,
  judgmentVerdict,
  oppositionActionStatus,
  submissionCategory,
  submissionStatus,
} from "./enums";
import { parties } from "./simulation";

export type DomainEffect = {
  targetType: "COUNTRY" | "PARTY" | "RELATION" | "RESEARCH";
  targetId: string;
  metric: string;
  operation: "ADD" | "MULTIPLY";
  value: string;
  durationTurns: number | null;
  reason: string;
};

export type ProjectedPolicyChange = {
  year: number;
  metric: string;
  delta: number;
  unit: "PERCENTAGE_POINT" | "PERCENT" | "INDEX" | "CURRENCY" | "COUNT";
  rationale: string;
};

export const policyGoals = pgTable(
  "policy_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    goalType: text("goal_type").notNull(),
    metric: text("metric").notNull(),
    baselineValue: numeric("baseline_value", { precision: 30, scale: 8 }).notNull(),
    targetValue: numeric("target_value", { precision: 30, scale: 8 }).notNull(),
    latestValue: numeric("latest_value", { precision: 30, scale: 8 }).notNull(),
    startTurnId: uuid("start_turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    targetGameDate: date("target_game_date").notNull(),
    completedTurnId: uuid("completed_turn_id").references(() => turns.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("policy_goals_country_status_idx").on(table.countryId, table.status),
    check("policy_goals_type_check", sql`${table.goalType} IN ('FREE_MARKET', 'PLANNED')`),
    check(
      "policy_goals_status_check",
      sql`${table.status} IN ('ACTIVE', 'ACHIEVED', 'FAILED', 'CANCELLED')`,
    ),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    policyGoalId: uuid("policy_goal_id").references(() => policyGoals.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    category: submissionCategory("category").notNull(),
    body: text("body").notNull(),
    goal: text("goal").notNull(),
    expectedDurationTurns: integer("expected_duration_turns").notNull(),
    budget: numeric("budget", { precision: 30, scale: 4 }),
    relatedCountryIds: uuid("related_country_ids").array().notNull().default([]),
    relatedTechIds: uuid("related_tech_ids").array().notNull().default([]),
    targetMetrics: text("target_metrics").array().notNull().default([]),
    publicAwareness: numeric("public_awareness", { precision: 7, scale: 4 })
      .notNull()
      .default("15"),
    policySupport: numeric("policy_support", { precision: 7, scale: 4 }).notNull().default("50"),
    promotionSpend: numeric("promotion_spend", { precision: 30, scale: 4 }).notNull().default("0"),
    effectivenessMultiplier: numeric("effectiveness_multiplier", { precision: 8, scale: 6 })
      .notNull()
      .default("1"),
    overpromotionPenalty: numeric("overpromotion_penalty", { precision: 8, scale: 6 })
      .notNull()
      .default("0"),
    status: submissionStatus("status").notNull().default("DRAFT"),
    currentVersion: integer("current_version").notNull().default(1),
    characterCount: integer("character_count").notNull(),
    estimatedTokens: integer("estimated_tokens").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("submissions_turn_status_idx").on(table.turnId, table.status),
    index("submissions_country_idx").on(table.countryId),
    check("submission_duration_check", sql`${table.expectedDurationTurns} BETWEEN 1 AND 12`),
    check("submission_budget_check", sql`${table.budget} IS NULL OR ${table.budget} >= 0`),
    check("submission_content_size_check", sql`${table.characterCount} BETWEEN 1 AND 12000`),
    check(
      "submission_policy_metrics_check",
      sql`cardinality(${table.targetMetrics}) BETWEEN 0 AND 6`,
    ),
    check(
      "submission_policy_state_check",
      sql`${table.publicAwareness} BETWEEN 0 AND 100 AND ${table.policySupport} BETWEEN 0 AND 100 AND ${table.promotionSpend} >= 0 AND ${table.effectivenessMultiplier} BETWEEN 0.5 AND 1.55 AND ${table.overpromotionPenalty} BETWEEN 0 AND 0.48`,
    ),
  ],
);

export const submissionVersions = pgTable(
  "submission_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("submission_versions_submission_version_uidx").on(
      table.submissionId,
      table.version,
    ),
  ],
);

export const reviewComments = pgTable("review_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "restrict" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  isAdmin: boolean("is_admin").notNull().default(false),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const judgmentRuns = pgTable(
  "judgment_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    attempt: integer("attempt").notNull().default(1),
    status: judgmentRunStatus("status").notNull().default("RUNNING"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 14, scale: 8 }),
    rawOutput: jsonb("raw_output"),
    validatedOutput: jsonb("validated_output"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("judgment_runs_idempotency_attempt_uidx").on(table.idempotencyKey, table.attempt),
    index("judgment_runs_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const judgmentProposals = pgTable(
  "judgment_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    judgmentRunId: uuid("judgment_run_id")
      .notNull()
      .references(() => judgmentRuns.id, { onDelete: "restrict" }),
    submissionId: uuid("submission_id").references(() => submissions.id, {
      onDelete: "restrict",
    }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    verdict: judgmentVerdict("verdict").notNull(),
    publicSummary: text("public_summary").notNull(),
    publicNarrative: text("public_narrative").notNull(),
    adminRationale: text("admin_rationale").notNull(),
    assumptions: text("assumptions").array().notNull().default([]),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    projectedChanges: jsonb("projected_changes")
      .$type<ProjectedPolicyChange[]>()
      .notNull()
      .default([]),
    followUpEvents: jsonb("follow_up_events")
      .$type<
        Array<{ title: string; summary: string; visibility: "PUBLIC" | "COUNTRY" | "ADMIN" }>
      >()
      .notNull(),
    warnings: text("warnings").array().notNull().default([]),
    requiresAdmin: boolean("requires_admin").notNull().default(true),
    status: judgmentReviewStatus("status").notNull().default("PENDING"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("judgment_proposal_run_uidx").on(table.judgmentRunId),
    check("judgment_confidence_check", sql`${table.confidence} BETWEEN 0 AND 1`),
  ],
);

export const effectProposals = pgTable(
  "effect_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    judgmentProposalId: uuid("judgment_proposal_id")
      .notNull()
      .references(() => judgmentProposals.id, { onDelete: "restrict" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metric: text("metric").notNull(),
    operation: text("operation").notNull(),
    value: numeric("value", { precision: 18, scale: 8 }).notNull(),
    durationTurns: integer("duration_turns"),
    reason: text("reason").notNull(),
    status: effectStatus("status").notNull(),
    validationWarning: text("validation_warning"),
    originalEffect: jsonb("original_effect").$type<DomainEffect>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("effect_operation_check", sql`${table.operation} IN ('ADD', 'MULTIPLY')`),
    check(
      "effect_duration_check",
      sql`${table.durationTurns} IS NULL OR ${table.durationTurns} BETWEEN 1 AND 12`,
    ),
  ],
);

export const appliedEffects = pgTable(
  "applied_effects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    effectProposalId: uuid("effect_proposal_id").references(() => effectProposals.id, {
      onDelete: "restrict",
    }),
    eventChoiceId: uuid("event_choice_id"),
    modifierId: uuid("modifier_id"),
    effect: jsonb("effect").$type<DomainEffect>().notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("applied_effects_source_key_uidx").on(table.sourceKey)],
);

export const turnStepRuns = pgTable(
  "turn_step_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    step: text("step").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: jobStatus("status").notNull().default("RUNNING"),
    result: jsonb("result"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("turn_step_runs_idempotency_uidx").on(table.idempotencyKey)],
);

export const turnCountryWorkspaces = pgTable(
  "turn_country_workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    beforeEconomic: jsonb("before_economic").$type<Record<string, unknown>>().notNull(),
    afterEconomic: jsonb("after_economic").$type<Record<string, unknown>>().notNull(),
    beforeDemographic: jsonb("before_demographic")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    afterDemographic: jsonb("after_demographic")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    beforePolitical: jsonb("before_political").$type<Record<string, unknown>>().notNull(),
    afterPolitical: jsonb("after_political").$type<Record<string, unknown>>().notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("turn_workspace_country_turn_uidx").on(table.countryId, table.turnId)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id").references(() => turns.id, { onDelete: "restrict" }),
    type: jobType("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: jobStatus("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("jobs_idempotency_uidx").on(table.idempotencyKey),
    index("jobs_claim_idx").on(table.status, table.availableAt),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id").references(() => countries.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    body: text("body").notNull(),
    backgroundImageKey: text("background_image_key"),
    portraitImageKey: text("portrait_image_key"),
    musicKey: text("music_key"),
    visibility: eventVisibility("visibility").notNull(),
    status: eventStatus("status").notNull().default("DRAFT"),
    startTurnId: uuid("start_turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    expiresTurnId: uuid("expires_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    trigger: jsonb("trigger").$type<Record<string, unknown>>(),
    required: boolean("required").notNull().default(false),
    choiceMutable: boolean("choice_mutable").notNull().default(true),
    requiresAdmin: boolean("requires_admin").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_country_status_idx").on(table.countryId, table.status)],
);

export const eventOptions = pgTable(
  "event_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    order: integer("order").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    expectedEffect: text("expected_effect").notNull(),
    effects: jsonb("effects").$type<DomainEffect[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("event_options_event_order_uidx").on(table.eventId, table.order)],
);

export const eventChoices = pgTable(
  "event_choices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => eventOptions.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    chosenAt: timestamp("chosen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("event_choices_event_country_uidx").on(table.eventId, table.countryId)],
);

export const oppositionActions = pgTable(
  "opposition_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    partyId: uuid("party_id").references(() => parties.id, { onDelete: "restrict" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    narrative: text("narrative").notNull(),
    rationale: text("rationale").notNull(),
    effects: jsonb("effects").$type<DomainEffect[]>().notNull(),
    requiresAdmin: boolean("requires_admin").notNull().default(true),
    status: oppositionActionStatus("status").notNull().default("PENDING_REVIEW"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("opposition_country_turn_uidx").on(table.countryId, table.turnId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_created_idx").on(table.userId, table.createdAt)],
);
