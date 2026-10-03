import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  doublePrecision,
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
import { countries } from "./country";
import {
  diplomaticBlocStatus,
  diplomaticMessageStatus,
  diplomaticProposalIntent,
  diplomaticProposalStatus,
  diplomaticProposalType,
  diplomaticRelationStatus,
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
    status: diplomaticRelationStatus("status").notNull().default("NORMAL"),
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
    intent: diplomaticProposalIntent("intent").notNull().default("GENERAL"),
    terms: jsonb("terms")
      .$type<{
        blocName?: string;
        blocAcronym?: string;
        blocColor?: string;
        blocDescription?: string;
      }>()
      .notNull()
      .default({}),
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

export const diplomaticBlocs = pgTable(
  "diplomatic_blocs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    acronym: text("acronym").notNull(),
    color: text("color").notNull().default("#5D7388"),
    description: text("description").notNull().default(""),
    status: diplomaticBlocStatus("status").notNull().default("ACTIVE"),
    foundedTurnId: uuid("founded_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("diplomatic_blocs_campaign_name_uidx").on(table.campaignId, table.name),
    uniqueIndex("diplomatic_blocs_campaign_acronym_uidx").on(table.campaignId, table.acronym),
  ],
);

export const diplomaticBlocMembers = pgTable(
  "diplomatic_bloc_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blocId: uuid("bloc_id")
      .notNull()
      .references(() => diplomaticBlocs.id, { onDelete: "cascade" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    role: text("role").notNull().default("MEMBER"),
    joinedTurnId: uuid("joined_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    addedBy: text("added_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("diplomatic_bloc_members_bloc_country_uidx").on(table.blocId, table.countryId),
    uniqueIndex("diplomatic_bloc_members_country_uidx").on(table.countryId),
    check("diplomatic_bloc_members_role_check", sql`${table.role} IN ('LEADER', 'MEMBER')`),
  ],
);

export const economicBlocs = pgTable(
  "economic_blocs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    acronym: text("acronym").notNull(),
    color: text("color").notNull().default("#8C7A52"),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("ACTIVE"),
    foundedTurnId: uuid("founded_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("economic_blocs_campaign_name_uidx").on(table.campaignId, table.name),
    uniqueIndex("economic_blocs_campaign_acronym_uidx").on(table.campaignId, table.acronym),
    check("economic_blocs_status_check", sql`${table.status} IN ('ACTIVE', 'DISSOLVED')`),
  ],
);

export const economicBlocMembers = pgTable(
  "economic_bloc_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blocId: uuid("bloc_id")
      .notNull()
      .references(() => economicBlocs.id, { onDelete: "cascade" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    role: text("role").notNull().default("MEMBER"),
    joinedTurnId: uuid("joined_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    addedBy: text("added_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("economic_bloc_members_bloc_country_uidx").on(table.blocId, table.countryId),
    uniqueIndex("economic_bloc_members_country_uidx").on(table.countryId),
    check("economic_bloc_members_role_check", sql`${table.role} IN ('LEADER', 'MEMBER')`),
  ],
);

export const worldCities = pgTable(
  "world_cities",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    nameKo: text("name_ko"),
    countryM49: text("country_m49").notNull(),
    countryName: text("country_name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    population: integer("population").notNull(),
    populationYear: integer("population_year").notNull(),
    urbanAreaKm2: numeric("urban_area_km2", { precision: 14, scale: 3 }).notNull(),
    builtUpAreaKm2: numeric("built_up_area_km2", { precision: 14, scale: 3 }).notNull(),
    isCapital: boolean("is_capital").notNull().default(false),
    sizeClass: integer("size_class").notNull(),
    populationPlausibility: integer("population_plausibility").notNull(),
    wupCalibrated: boolean("wup_calibrated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("world_cities_source_id_uidx").on(table.source, table.sourceId),
    index("world_cities_viewport_idx").on(table.longitude, table.latitude),
    index("world_cities_population_idx").on(table.population),
    index("world_cities_country_idx").on(table.countryM49),
    check("world_cities_latitude_check", sql`${table.latitude} BETWEEN -90 AND 90`),
    check("world_cities_longitude_check", sql`${table.longitude} BETWEEN -180 AND 180`),
    check("world_cities_population_check", sql`${table.population} >= 0`),
    check("world_cities_population_year_check", sql`${table.populationYear} BETWEEN 1900 AND 2200`),
    check("world_cities_urban_area_check", sql`${table.urbanAreaKm2} >= 0`),
    check("world_cities_built_up_area_check", sql`${table.builtUpAreaKm2} >= 0`),
    check("world_cities_size_class_check", sql`${table.sizeClass} BETWEEN 1 AND 7`),
    check(
      "world_cities_population_plausibility_check",
      sql`${table.populationPlausibility} BETWEEN 0 AND 3`,
    ),
  ],
);

export const worldAdministrativeDivisions = pgTable(
  "world_administrative_divisions",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    sourceBoundaryId: text("source_boundary_id").notNull(),
    sourceLicense: text("source_license").notNull(),
    boundaryYear: text("boundary_year"),
    countryIso3: text("country_iso3").notNull(),
    level: integer("level").notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    geometry: globeCellGeometry("geometry").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("world_administrative_divisions_source_uidx").on(table.source, table.sourceId),
    index("world_administrative_divisions_country_level_idx").on(table.countryIso3, table.level),
    index("world_administrative_divisions_parent_idx").on(table.parentId),
    index("world_administrative_divisions_geometry_gidx").using("gist", table.geometry),
    check("world_administrative_divisions_iso_check", sql`${table.countryIso3} ~ '^[A-Z]{3}$'`),
    check("world_administrative_divisions_level_check", sql`${table.level} BETWEEN 1 AND 2`),
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
  sourceImageData: binaryData("source_image_data"),
  sourceWidth: integer("source_width"),
  sourceHeight: integer("source_height"),
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
  layerColors: jsonb("layer_colors")
    .$type<Record<"COAST" | "LEGAL" | "ACTIVE" | "INACTIVE" | "GUERRILLA", string>>()
    .notNull()
    .default({
      COAST: "#111827",
      LEGAL: "#F5F5F5",
      ACTIVE: "#F04444",
      INACTIVE: "#7D8794",
      GUERRILLA: "#F2B84B",
    }),
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
