import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
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
import { campaignMaps, campaigns, turns } from "./campaign";
import { administrativeDivisions, countries } from "./country";
import {
  diplomaticMessageStatus,
  diplomaticProposalStatus,
  diplomaticProposalType,
  diplomaticVisibility,
} from "./enums";

const globeCellGeometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiPolygon,4326)";
  },
});

const binaryData = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const countryRelations = pgTable(
  "country_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    fromCountryId: uuid("from_country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    toCountryId: uuid("to_country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    score: integer("score").notNull().default(0),
    tags: text("tags").array().notNull().default([]),
    lastInteraction: text("last_interaction"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("country_relations_direction_uidx").on(
      table.campaignId,
      table.fromCountryId,
      table.toCountryId,
    ),
    check("country_relations_score_check", sql`${table.score} BETWEEN -100 AND 100`),
    check("country_relations_not_self_check", sql`${table.fromCountryId} <> ${table.toCountryId}`),
  ],
);

export const diplomaticOrientations = pgTable("diplomatic_orientations", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .unique()
    .references(() => countries.id, { onDelete: "restrict" }),
  publicPrinciples: text("public_principles").notNull(),
  interests: text("interests").array().notNull().default([]),
  taboos: text("taboos").array().notNull().default([]),
  riskTolerance: integer("risk_tolerance").notNull().default(50),
  goals: text("goals").array().notNull().default([]),
  privateContext: jsonb("private_context").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const diplomaticProposals = pgTable(
  "diplomatic_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    fromCountryId: uuid("from_country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    toCountryId: uuid("to_country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: diplomaticProposalType("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    visibility: diplomaticVisibility("visibility").notNull(),
    status: diplomaticProposalStatus("status").notNull().default("SENT"),
    expiresTurnId: uuid("expires_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    requiresAdmin: boolean("requires_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("diplomatic_proposals_inbox_idx").on(table.toCountryId, table.status),
    check(
      "diplomatic_proposals_not_self_check",
      sql`${table.fromCountryId} <> ${table.toCountryId}`,
    ),
  ],
);

export const diplomaticMessages = pgTable("diplomatic_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposalId: uuid("proposal_id")
    .notNull()
    .references(() => diplomaticProposals.id, { onDelete: "restrict" }),
  senderCountryId: uuid("sender_country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "restrict" }),
  authorUserId: text("author_user_id").references(() => users.id, { onDelete: "restrict" }),
  responseType: text("response_type").notNull(),
  body: text("body").notNull(),
  isAi: boolean("is_ai").notNull().default(false),
  status: diplomaticMessageStatus("status").notNull().default("SENT"),
  relationDelta: integer("relation_delta").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const treaties = pgTable("treaties", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  status: text("status").notNull(),
  partyCountryIds: uuid("party_country_ids").array().notNull(),
  terms: jsonb("terms").$type<Record<string, unknown>>().notNull(),
  startTurnId: uuid("start_turn_id").references(() => turns.id, { onDelete: "restrict" }),
  endTurnId: uuid("end_turn_id").references(() => turns.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mapCells = pgTable(
  "map_cells",
  {
    id: text("id").primaryKey(),
    q: integer("q").notNull(),
    r: integer("r").notNull(),
    geometry: globeCellGeometry("geometry").notNull(),
    centerLatitude: numeric("center_latitude", { precision: 10, scale: 7 }).notNull(),
    centerLongitude: numeric("center_longitude", { precision: 11, scale: 7 }).notNull(),
    isLand: boolean("is_land").notNull().default(true),
    isLocked: boolean("is_locked").notNull().default(false),
    areaKm2: numeric("area_km2", { precision: 18, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("map_cells_resolution_idx").on(table.r),
    index("map_cells_geometry_gidx").using("gist", table.geometry),
    check("map_cells_area_check", sql`${table.areaKm2} > 0`),
  ],
);

export const mapRasters = pgTable("map_rasters", {
  mapId: uuid("map_id")
    .primaryKey()
    .references(() => campaignMaps.id, { onDelete: "restrict" }),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  imageData: binaryData("image_data").notNull(),
  borderlessImageData: binaryData("borderless_image_data"),
  previewImageData: binaryData("preview_image_data"),
  previewWidth: integer("preview_width"),
  previewHeight: integer("preview_height"),
  contentType: text("content_type").notNull().default("image/png"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  projection: text("projection").notNull().default("EQUIRECTANGULAR"),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mapRasterBorderLayers = pgTable("map_raster_border_layers", {
  mapId: uuid("map_id")
    .primaryKey()
    .references(() => campaignMaps.id, { onDelete: "restrict" }),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  classifications: jsonb("classifications")
    .$type<
      Array<{
        sourceColor: string;
        kind: "COAST" | "INACTIVE" | "ACTIVE" | "LEGAL" | "GUERRILLA" | "NONE";
        displayColor: string;
      }>
    >()
    .notNull()
    .default([]),
  renderedData: binaryData("rendered_data").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mapRasterColorAssignments = pgTable(
  "map_raster_color_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => campaignMaps.id, { onDelete: "restrict" }),
    colorHex: text("color_hex").notNull(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("map_raster_colors_map_color_uidx").on(table.mapId, table.colorHex),
    uniqueIndex("map_raster_colors_map_country_uidx").on(table.mapId, table.countryId),
  ],
);

export const mapOwnership = pgTable(
  "map_ownership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => campaignMaps.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    cellId: text("cell_id")
      .notNull()
      .references(() => mapCells.id, { onDelete: "restrict" }),
    countryId: uuid("country_id").references(() => countries.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("map_ownership_revision_cell_uidx").on(table.mapId, table.revision, table.cellId),
    index("map_ownership_lookup_idx").on(table.mapId, table.cellId, table.revision),
  ],
);

export const administrativeDivisionCells = pgTable(
  "administrative_division_cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => campaignMaps.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => administrativeDivisions.id, { onDelete: "restrict" }),
    cellId: text("cell_id")
      .notNull()
      .references(() => mapCells.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("administrative_division_cells_campaign_cell_uidx").on(table.mapId, table.cellId),
    index("administrative_division_cells_division_idx").on(table.divisionId),
  ],
);

export const mapChangeSets = pgTable("map_change_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  mapId: uuid("map_id")
    .notNull()
    .references(() => campaignMaps.id, { onDelete: "restrict" }),
  baseRevision: integer("base_revision").notNull(),
  newRevision: integer("new_revision").notNull(),
  targetCountryId: uuid("target_country_id").references(() => countries.id, {
    onDelete: "restrict",
  }),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  cellCount: integer("cell_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mapCellChanges = pgTable(
  "map_cell_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    changeSetId: uuid("change_set_id")
      .notNull()
      .references(() => mapChangeSets.id, { onDelete: "restrict" }),
    cellId: text("cell_id")
      .notNull()
      .references(() => mapCells.id, { onDelete: "restrict" }),
    previousCountryId: uuid("previous_country_id").references(() => countries.id, {
      onDelete: "restrict",
    }),
    newCountryId: uuid("new_country_id").references(() => countries.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [uniqueIndex("map_cell_changes_set_cell_uidx").on(table.changeSetId, table.cellId)],
);
