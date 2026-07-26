import {
  boolean,
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
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { campaigns, turns } from "./campaign";
import { profileRevisionStatus, setupStatus } from "./enums";

export const countries = pgTable(
  "countries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    color: text("color").notNull(),
    isAi: boolean("is_ai").notNull().default(false),
    economicSystem: text("economic_system").notNull().default("FREE_MARKET"),
    setupStatus: setupStatus("setup_status").notNull().default("DRAFT"),
    currentProfileRevisionId: uuid("current_profile_revision_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("countries_campaign_code_uidx").on(table.campaignId, table.code),
    check(
      "countries_economic_system_check",
      sql`${table.economicSystem} IN ('FREE_MARKET', 'PLANNED')`,
    ),
  ],
);

export const countryProfileRevisions = pgTable(
  "country_profile_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    status: profileRevisionStatus("status").notNull().default("DRAFT"),
    flag: text("flag"),
    motto: text("motto"),
    nationalAnthem: text("national_anthem"),
    nationalTree: text("national_tree"),
    nationalFlower: text("national_flower"),
    nationalBird: text("national_bird"),
    nationalAnimal: text("national_animal"),
    history: text("history"),
    timeline: jsonb("timeline")
      .$type<Array<{ year: string; event: string }>>()
      .notNull()
      .default([]),
    planet: text("planet"),
    capital: text("capital"),
    largestCity: text("largest_city"),
    totalAreaKm2: numeric("total_area_km2", { precision: 20, scale: 3 }),
    inlandWaterRatio: numeric("inland_water_ratio", { precision: 8, scale: 6 }).default("0"),
    officialLanguages: text("official_languages").array().notNull().default([]),
    officialScripts: text("official_scripts").array().notNull().default([]),
    stateReligion: text("state_religion"),
    militaryDescription: text("military_description"),
    governmentForm: text("government_form"),
    officialCurrency: text("official_currency"),
    currencyCode: text("currency_code"),
    majorIndustries: text("major_industries").array().notNull().default([]),
    approvedBy: text("approved_by").references(() => users.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("profile_revisions_country_revision_uidx").on(table.countryId, table.revision),
    check(
      "profile_inland_water_ratio_check",
      sql`${table.inlandWaterRatio} >= 0 AND ${table.inlandWaterRatio} <= 1`,
    ),
    check(
      "profile_total_area_check",
      sql`${table.totalAreaKm2} IS NULL OR ${table.totalAreaKm2} > 0`,
    ),
  ],
);

export const countrySymbols = pgTable("country_symbols", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileRevisionId: uuid("profile_revision_id")
    .notNull()
    .references(() => countryProfileRevisions.id, { onDelete: "cascade" }),
  mediaKey: text("media_key"),
  attribution: text("attribution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const administrativeDivisions = pgTable(
  "administrative_divisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    parentId: uuid("parent_id"),
    level: integer("level").notNull(),
    typeName: text("type_name").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("administrative_division_level_check", sql`${table.level} BETWEEN 1 AND 3`)],
);

export const administrativeDivisionRequests = pgTable(
  "administrative_division_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    typeName: text("type_name").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("PENDING"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("administrative_division_requests_country_idx").on(table.countryId, table.status),
    check(
      "administrative_division_request_status_check",
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
  ],
);

export const countryOffices = pgTable("country_offices", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "restrict" }),
  officeType: text("office_type").notNull(),
  holderName: text("holder_name").notNull(),
  startTurnId: uuid("start_turn_id").references(() => turns.id, { onDelete: "restrict" }),
  endTurnId: uuid("end_turn_id").references(() => turns.id, { onDelete: "restrict" }),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const governmentOfficeDefinitions = pgTable(
  "government_office_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    branch: text("branch").notNull(),
    title: text("title").notNull(),
    seatCount: integer("seat_count").notNull().default(1),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("government_office_country_branch_title_uidx").on(
      table.countryId,
      table.branch,
      table.title,
    ),
    check(
      "government_office_branch_check",
      sql`${table.branch} IN ('EXECUTIVE', 'JUDICIAL', 'LEGISLATIVE')`,
    ),
    check("government_office_seat_count_check", sql`${table.seatCount} BETWEEN 1 AND 12`),
  ],
);

export const governmentOfficeHolders = pgTable(
  "government_office_holders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => governmentOfficeDefinitions.id, { onDelete: "restrict" }),
    slotNumber: integer("slot_number").notNull(),
    holderName: text("holder_name"),
    portraitPath: text("portrait_path"),
    appointmentNarrative: text("appointment_narrative"),
    appointedBy: text("appointed_by").references(() => users.id, { onDelete: "restrict" }),
    startTurnId: uuid("start_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("government_office_holder_slot_uidx").on(table.officeId, table.slotNumber),
    check("government_office_holder_slot_check", sql`${table.slotNumber} BETWEEN 1 AND 12`),
  ],
);

export const officePersonnelChanges = pgTable(
  "office_personnel_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    officeId: uuid("office_id")
      .notNull()
      .references(() => governmentOfficeDefinitions.id, { onDelete: "restrict" }),
    slotNumber: integer("slot_number").notNull(),
    previousHolderName: text("previous_holder_name"),
    newHolderName: text("new_holder_name").notNull(),
    narrative: text("narrative").notNull(),
    portraitPath: text("portrait_path").notNull(),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("office_personnel_changes_country_idx").on(table.countryId, table.createdAt)],
);

export const countryUnitsAndCodes = pgTable("country_units_and_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileRevisionId: uuid("profile_revision_id")
    .notNull()
    .references(() => countryProfileRevisions.id, { onDelete: "cascade" })
    .unique(),
  legalEra: text("legal_era"),
  timeZone: text("time_zone"),
  measurementSystem: text("measurement_system"),
  ccTld: text("cc_tld"),
  countryCode: text("country_code"),
  trafficDirection: text("traffic_direction"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const countryAssignments = pgTable(
  "country_assignments",
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
    startTurnId: uuid("start_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    endTurnId: uuid("end_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("country_assignments_country_idx").on(table.countryId),
    index("country_assignments_user_idx").on(table.userId),
  ],
);

export const countrySetupSubmissions = pgTable("country_setup_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "restrict" }),
  submittedBy: text("submitted_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: setupStatus("status").notNull().default("DRAFT"),
  quickSetup: jsonb("quick_setup").$type<Record<string, unknown>>().notNull(),
  advancedSetup: jsonb("advanced_setup").$type<Record<string, unknown>>().notNull().default({}),
  reviewComment: text("review_comment"),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedProfileRevisionId: uuid("approved_profile_revision_id").references(
    () => countryProfileRevisions.id,
    { onDelete: "restrict" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const countryFlags = pgTable(
  "country_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("country_flags_country_key_uidx").on(table.countryId, table.key)],
);
