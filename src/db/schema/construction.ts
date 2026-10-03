import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { campaigns, turns } from "./campaign";
import { countries } from "./country";
import { worldCities } from "./world";

export const campaignCities = pgTable(
  "campaign_cities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    cityId: text("city_id")
      .notNull()
      .references(() => worldCities.id, { onDelete: "restrict" }),
    ownerCountryId: uuid("owner_country_id").references(() => countries.id, {
      onDelete: "restrict",
    }),
    controllerCountryId: uuid("controller_country_id").references(() => countries.id, {
      onDelete: "restrict",
    }),
    slotCapacity: integer("slot_capacity").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("campaign_cities_campaign_city_uidx").on(table.campaignId, table.cityId),
    index("campaign_cities_owner_idx").on(table.campaignId, table.ownerCountryId),
    index("campaign_cities_controller_idx").on(table.campaignId, table.controllerCountryId),
    check("campaign_cities_slot_capacity_check", sql`${table.slotCapacity} BETWEEN 0 AND 100`),
  ],
);

export const cityBuildings = pgTable(
  "city_buildings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignCityId: uuid("campaign_city_id")
      .notNull()
      .references(() => campaignCities.id, { onDelete: "cascade" }),
    buildingType: text("building_type").notNull(),
    level: integer("level").notNull().default(0),
    damagedLevels: integer("damaged_levels").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("city_buildings_city_type_uidx").on(table.campaignCityId, table.buildingType),
    index("city_buildings_city_idx").on(table.campaignCityId),
    check("city_buildings_type_check", sql`length(btrim(${table.buildingType})) > 0`),
    check("city_buildings_level_check", sql`${table.level} >= 0`),
    check("city_buildings_damage_check", sql`${table.damagedLevels} BETWEEN 0 AND ${table.level}`),
  ],
);

export const cityConstructionProjects = pgTable(
  "city_construction_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignCityId: uuid("campaign_city_id")
      .notNull()
      .references(() => campaignCities.id, { onDelete: "cascade" }),
    orderedByCountryId: uuid("ordered_by_country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    buildingType: text("building_type").notNull(),
    targetLevel: integer("target_level").notNull(),
    queuePosition: integer("queue_position").notNull(),
    progress: numeric("progress", { precision: 20, scale: 4 }).notNull().default("0"),
    requiredWork: numeric("required_work", { precision: 20, scale: 4 }).notNull(),
    allocatedCapacity: numeric("allocated_capacity", { precision: 20, scale: 4 })
      .notNull()
      .default("0"),
    status: text("status").notNull().default("QUEUED"),
    createdTurnId: uuid("created_turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    startedTurnId: uuid("started_turn_id").references(() => turns.id, {
      onDelete: "restrict",
    }),
    completedTurnId: uuid("completed_turn_id").references(() => turns.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("city_construction_projects_queue_idx").on(
      table.campaignCityId,
      table.status,
      table.queuePosition,
    ),
    index("city_construction_projects_country_idx").on(table.orderedByCountryId, table.status),
    check("city_construction_projects_type_check", sql`length(btrim(${table.buildingType})) > 0`),
    check("city_construction_projects_target_check", sql`${table.targetLevel} > 0`),
    check("city_construction_projects_queue_check", sql`${table.queuePosition} >= 0`),
    check(
      "city_construction_projects_work_check",
      sql`${table.progress} BETWEEN 0 AND ${table.requiredWork} AND ${table.requiredWork} > 0 AND ${table.allocatedCapacity} >= 0`,
    ),
    check(
      "city_construction_projects_status_check",
      sql`${table.status} IN ('QUEUED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')`,
    ),
  ],
);
