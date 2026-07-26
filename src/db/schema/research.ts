import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { campaigns, turns } from "./campaign";
import { countries } from "./country";
import { researchStatus } from "./enums";

export const techNodes = pgTable(
  "tech_nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    field: text("field").notNull(),
    era: integer("era").notNull(),
    description: text("description").notNull(),
    cost: numeric("cost", { precision: 18, scale: 4 }).notNull(),
    exclusiveGroup: text("exclusive_group"),
    effects: jsonb("effects")
      .$type<Array<{ metric: string; operation: "ADD" | "MULTIPLY"; value: string }>>()
      .notNull()
      .default([]),
    imageKey: text("image_key"),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tech_nodes_campaign_code_uidx").on(table.campaignId, table.code),
    check("tech_nodes_cost_check", sql`${table.cost} > 0`),
  ],
);

export const techPrerequisites = pgTable(
  "tech_prerequisites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    techNodeId: uuid("tech_node_id")
      .notNull()
      .references(() => techNodes.id, { onDelete: "cascade" }),
    prerequisiteId: uuid("prerequisite_id")
      .notNull()
      .references(() => techNodes.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tech_prerequisites_edge_uidx").on(table.techNodeId, table.prerequisiteId),
    check("tech_prerequisites_no_self_check", sql`${table.techNodeId} <> ${table.prerequisiteId}`),
  ],
);

export const countryResearch = pgTable(
  "country_research",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    techNodeId: uuid("tech_node_id")
      .notNull()
      .references(() => techNodes.id, { onDelete: "restrict" }),
    status: researchStatus("status").notNull().default("LOCKED"),
    progressPoints: numeric("progress_points", { precision: 18, scale: 4 }).notNull().default("0"),
    startedTurnId: uuid("started_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    completedTurnId: uuid("completed_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("country_research_country_tech_uidx").on(table.countryId, table.techNodeId),
    check("country_research_progress_check", sql`${table.progressPoints} >= 0`),
  ],
);

export const researchAllocations = pgTable(
  "research_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    techNodeId: uuid("tech_node_id")
      .notNull()
      .references(() => techNodes.id, { onDelete: "restrict" }),
    points: numeric("points", { precision: 18, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("research_allocations_country_turn_tech_uidx").on(
      table.countryId,
      table.turnId,
      table.techNodeId,
    ),
    check("research_allocations_points_check", sql`${table.points} >= 0`),
  ],
);
