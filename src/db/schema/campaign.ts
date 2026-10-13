import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { applicationStatus, gameTimeUnit, membershipStatus, turnStatus, userRole } from "./enums";

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  lore: text("lore").notNull().default(""),
  loreCss: text("lore_css").notNull().default(""),
  loreVersion: integer("lore_version").notNull().default(0),
  lorePublishedAt: timestamp("lore_published_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(false),
  startGameDate: date("start_game_date").notNull(),
  // 기본 진행: 분기 턴, 실제 하루에 게임 한 분기
  monthsPerTurn: integer("months_per_turn").notNull().default(3),
  gameDaysPerRealDay: integer("game_days_per_real_day").notNull().default(91),
  adjudicationIntervalGameDays: integer("adjudication_interval_game_days").notNull().default(91),
  gameTimePerRealDayValue: integer("game_time_per_real_day_value").notNull().default(3),
  gameTimePerRealDayUnit: gameTimeUnit("game_time_per_real_day_unit").notNull().default("MONTH"),
  adjudicationIntervalValue: integer("adjudication_interval_value").notNull().default(3),
  adjudicationIntervalUnit: gameTimeUnit("adjudication_interval_unit").notNull().default("MONTH"),
  /** 실시간 계층 판정 주기(실제 초). 연구·첩보·외교·군사가 이 주기로 진행한다. */
  realtimeTickSeconds: integer("realtime_tick_seconds").notNull().default(60),
  /** 실시간 계층 일시정지 */
  realtimePaused: boolean("realtime_paused").notNull().default(false),
  turnCloseHour: integer("turn_close_hour").notNull().default(23),
  turnCloseMinute: integer("turn_close_minute").notNull().default(55),
  mapCount: integer("map_count").notNull().default(1),
  rulesVersion: text("rules_version").notNull().default("v1"),
  autoApproveEconomicMultipliers: boolean("auto_approve_economic_multipliers")
    .notNull()
    .default(false),
  administrativeDivisionRevision: integer("administrative_division_revision").notNull().default(0),
  mapRevision: integer("map_revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignMaps = pgTable(
  "campaign_maps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(0),
    administrativeDivisionRevision: integer("administrative_division_revision")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("campaign_maps_campaign_position_uidx").on(table.campaignId, table.position),
  ],
);

export const campaignMemberships = pgTable(
  "campaign_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: userRole("role").notNull().default("USER"),
    status: membershipStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("memberships_campaign_user_uidx").on(table.campaignId, table.userId)],
);

export const campaignLoreViews = pgTable(
  "campaign_lore_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("campaign_lore_views_campaign_user_uidx").on(table.campaignId, table.userId),
  ],
);

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    gameDateStart: date("game_date_start").notNull(),
    gameDateEnd: date("game_date_end").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    status: turnStatus("status").notNull().default("DRAFT"),
    stepCompletedAt: jsonb("step_completed_at")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("turns_campaign_sequence_uidx").on(table.campaignId, table.sequence)],
);

export const countryApplications = pgTable(
  "country_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestedCountryName: text("requested_country_name").notNull(),
    // 지도에서 고른 국가. 반납 신청이거나 국가가 삭제된 경우 비어 있을 수 있다.
    requestedCountryId: uuid("requested_country_id"),
    kind: text("kind").notNull().default("ASSIGN"),
    reason: text("reason").notNull(),
    status: applicationStatus("status").notNull().default("PENDING"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("country_applications_campaign_idx").on(table.campaignId),
    index("country_applications_user_idx").on(table.userId),
    check(
      "country_applications_kind_check",
      sql`${table.kind} IN ('ASSIGN', 'TRANSFER', 'RELEASE')`,
    ),
  ],
);
