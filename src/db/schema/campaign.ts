import {
  boolean,
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
  monthsPerTurn: integer("months_per_turn").notNull().default(12),
  gameDaysPerRealDay: integer("game_days_per_real_day").notNull().default(365),
  adjudicationIntervalGameDays: integer("adjudication_interval_game_days").notNull().default(365),
  gameTimePerRealDayValue: integer("game_time_per_real_day_value").notNull().default(365),
  gameTimePerRealDayUnit: gameTimeUnit("game_time_per_real_day_unit").notNull().default("DAY"),
  adjudicationIntervalValue: integer("adjudication_interval_value").notNull().default(365),
  adjudicationIntervalUnit: gameTimeUnit("adjudication_interval_unit").notNull().default("DAY"),
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
    hexResolution: integer("hex_resolution").notNull().default(4),
    adaptiveResolution: boolean("adaptive_resolution").notNull().default(false),
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
  ],
);
