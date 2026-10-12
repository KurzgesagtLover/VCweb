import { sql } from "drizzle-orm";
import {
  check,
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

/** 징병법·수출 정책·경제법의 현재 단계. 사회·문화 제도는 country_development_tracks를 쓴다. */
export const countryLaws = pgTable(
  "country_laws",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    lawKey: text("law_key").notNull(),
    stage: integer("stage").notNull(),
    changedTurnId: uuid("changed_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("country_laws_country_law_uidx").on(table.countryId, table.lawKey),
    check(
      "country_laws_key_check",
      sql`${table.lawKey} IN ('conscriptionLaw', 'tradePolicy', 'economyLaw')`,
    ),
    check("country_laws_stage_check", sql`${table.stage} BETWEEN 1 AND 7`),
  ],
);

/**
 * 정치력으로 추진한 법·제도 변경.
 * PENDING은 다음 턴 공개 때 시행되고, 사회·문화 제도 변경은 시행 뒤 ACTIVE 상태로 적응형 유지비를 낸다.
 */
export const countryLawChanges = pgTable(
  "country_law_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    lawKey: text("law_key").notNull(),
    fromStage: integer("from_stage").notNull(),
    toStage: integer("to_stage").notNull(),
    cost: numeric("cost", { precision: 12, scale: 4 }).notNull().default("0"),
    upkeepMode: text("upkeep_mode").notNull(),
    upkeepMax: numeric("upkeep_max", { precision: 12, scale: 4 }).notNull().default("0"),
    halfLifeYears: numeric("half_life_years", { precision: 8, scale: 4 }).notNull().default("3"),
    adaptation: numeric("adaptation", { precision: 10, scale: 8 }).notNull().default("0"),
    erosion: numeric("erosion", { precision: 12, scale: 4 }).notNull().default("0"),
    status: text("status").notNull().default("PENDING"),
    orderedBy: text("ordered_by").references(() => users.id, { onDelete: "restrict" }),
    orderedTurnId: uuid("ordered_turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    appliedTurnId: uuid("applied_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    closedTurnId: uuid("closed_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("country_law_changes_country_status_idx").on(table.countryId, table.status),
    index("country_law_changes_campaign_status_idx").on(table.campaignId, table.status),
    uniqueIndex("country_law_changes_pending_uidx")
      .on(table.countryId, table.lawKey)
      .where(sql`${table.status} = 'PENDING'`),
    check(
      "country_law_changes_status_check",
      sql`${table.status} IN ('PENDING', 'ACTIVE', 'ADAPTED', 'APPLIED', 'CANCELLED', 'REVERTED', 'SUPERSEDED')`,
    ),
    check("country_law_changes_mode_check", sql`${table.upkeepMode} IN ('FIXED', 'ADAPTIVE')`),
    check("country_law_changes_step_check", sql`${table.fromStage} <> ${table.toStage}`),
    check(
      "country_law_changes_values_check",
      sql`${table.cost} >= 0 AND ${table.upkeepMax} >= 0 AND ${table.halfLifeYears} > 0 AND ${table.adaptation} BETWEEN 0 AND 1 AND ${table.erosion} BETWEEN 0 AND 150`,
    ),
  ],
);

/** 턴 공개 때 정산한 국가별 정치력 수지 */
export const politicalPowerLedger = pgTable(
  "political_power_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    balanceBefore: numeric("balance_before", { precision: 12, scale: 4 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 4 }).notNull(),
    grossIncome: numeric("gross_income", { precision: 12, scale: 4 }).notNull(),
    upkeep: numeric("upkeep", { precision: 12, scale: 4 }).notNull(),
    net: numeric("net", { precision: 12, scale: 4 }).notNull(),
    state: text("state").notNull(),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("political_power_ledger_country_turn_uidx").on(table.countryId, table.turnId),
    check(
      "political_power_ledger_state_check",
      sql`${table.state} IN ('NORMAL', 'HOLD', 'DEFICIT')`,
    ),
  ],
);
