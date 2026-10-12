import { sql } from "drizzle-orm";
import {
  check,
  index,
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

/** 캠페인 전체가 공유하는 세계 메커니즘의 현재 진행도 (예: 케슬러 증후군). */
export const worldMechanics = pgTable(
  "world_mechanics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    mechanicKey: text("mechanic_key").notNull(),
    progress: numeric("progress", { precision: 12, scale: 4 }).notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    updatedTurnId: uuid("updated_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("world_mechanics_campaign_key_uidx").on(table.campaignId, table.mechanicKey),
  ],
);

/** 턴마다 남기는 진행도 기록. */
export const worldMechanicHistory = pgTable(
  "world_mechanic_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mechanicId: uuid("mechanic_id")
      .notNull()
      .references(() => worldMechanics.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    progressBefore: numeric("progress_before", { precision: 12, scale: 4 }).notNull(),
    progressAfter: numeric("progress_after", { precision: 12, scale: 4 }).notNull(),
    naturalGrowth: numeric("natural_growth", { precision: 12, scale: 4 }).notNull(),
    reduction: numeric("reduction", { precision: 12, scale: 4 }).notNull(),
    stage: text("stage").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("world_mechanic_history_turn_uidx").on(table.mechanicId, table.turnId)],
);

/** 국가가 세계 메커니즘에 대응해 시행하는 행동. 정치력은 주문 때, 예산은 계산 때, 효과는 공개 때 반영한다. */
export const worldMechanicActions = pgTable(
  "world_mechanic_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    mechanicKey: text("mechanic_key").notNull(),
    actionKey: text("action_key").notNull(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    orderedBy: text("ordered_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderedTurnId: uuid("ordered_turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    politicalPowerCost: numeric("political_power_cost", { precision: 12, scale: 4 }).notNull(),
    budgetCost: numeric("budget_cost", { precision: 20, scale: 4 }).notNull(),
    reduction: numeric("reduction", { precision: 12, scale: 4 }).notNull(),
    status: text("status").notNull().default("PENDING"),
    appliedTurnId: uuid("applied_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("world_mechanic_actions_country_idx").on(table.countryId, table.mechanicKey),
    index("world_mechanic_actions_turn_idx").on(table.orderedTurnId, table.status),
    uniqueIndex("world_mechanic_actions_pending_uidx")
      .on(table.countryId, table.mechanicKey, table.actionKey)
      .where(sql`${table.status} = 'PENDING'`),
    check(
      "world_mechanic_actions_status_check",
      sql`${table.status} IN ('PENDING', 'APPLIED', 'CANCELLED')`,
    ),
    check(
      "world_mechanic_actions_costs_check",
      sql`${table.politicalPowerCost} >= 0 AND ${table.budgetCost} >= 0 AND ${table.reduction} >= 0`,
    ),
  ],
);
