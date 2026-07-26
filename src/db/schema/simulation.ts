import { sql } from "drizzle-orm";
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
import { users } from "./auth";
import { campaigns, turns } from "./campaign";
import { countries } from "./country";
import { changeDomain, changeProposalStatus } from "./enums";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const demographicSnapshots = pgTable(
  "demographic_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    population: numeric("population", { precision: 24, scale: 0 }).notNull(),
    citizensAbroad: numeric("citizens_abroad", { precision: 24, scale: 0 }).notNull().default("0"),
    foreignResidents: numeric("foreign_residents", { precision: 24, scale: 0 })
      .notNull()
      .default("0"),
    diaspora: numeric("diaspora", { precision: 24, scale: 0 }).notNull().default("0"),
    fertilityRate: numeric("fertility_rate", { precision: 8, scale: 4 }).notNull(),
    populationGrowthRate: numeric("population_growth_rate", { precision: 9, scale: 6 }).notNull(),
    lifeExpectancy: numeric("life_expectancy", { precision: 6, scale: 2 }).notNull(),
    medianAge: numeric("median_age", { precision: 6, scale: 2 }).notNull(),
    populationDensity: numeric("population_density", { precision: 20, scale: 6 }).notNull(),
    estimatedFields: text("estimated_fields").array().notNull().default([]),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("demographic_country_turn_uidx").on(table.countryId, table.turnId),
    check("demographic_population_check", sql`${table.population} >= 0`),
    check("demographic_fertility_check", sql`${table.fertilityRate} >= 0`),
    check("demographic_life_expectancy_check", sql`${table.lifeExpectancy} > 0`),
  ],
);

export const economicSnapshots = pgTable(
  "economic_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    realGdp: numeric("real_gdp", { precision: 30, scale: 4 }).notNull(),
    nominalGdp: numeric("nominal_gdp", { precision: 30, scale: 4 }).notNull(),
    realGdpGrowth: numeric("real_gdp_growth", { precision: 10, scale: 7 }).notNull(),
    gdpDeflator: numeric("gdp_deflator", { precision: 14, scale: 7 }).notNull(),
    realGni: numeric("real_gni", { precision: 30, scale: 4 }).notNull(),
    realGnp: numeric("real_gnp", { precision: 30, scale: 4 }).notNull(),
    wealth: numeric("wealth", { precision: 30, scale: 4 }).notNull(),
    foreignReserves: numeric("foreign_reserves", { precision: 30, scale: 4 }).notNull(),
    currencyCode: text("currency_code").notNull(),
    currencyValue: numeric("currency_value", { precision: 20, scale: 8 }).notNull(),
    creditRating: text("credit_rating").notNull(),
    creditRatingAgency: text("credit_rating_agency").notNull().default("국가신용평가원"),
    creditScore: integer("credit_score").notNull(),
    incomeGini: numeric("income_gini", { precision: 8, scale: 6 }).notNull(),
    wealthGini: numeric("wealth_gini", { precision: 8, scale: 6 }).notNull(),
    inflationRate: numeric("inflation_rate", { precision: 10, scale: 7 }).notNull(),
    landPriceGrowth: numeric("land_price_growth", { precision: 10, scale: 7 }).notNull(),
    unemploymentRate: numeric("unemployment_rate", { precision: 10, scale: 7 }).notNull(),
    governmentRevenue: numeric("government_revenue", { precision: 30, scale: 4 }).notNull(),
    governmentSpending: numeric("government_spending", { precision: 30, scale: 4 }).notNull(),
    governmentSpendingGrowth: numeric("government_spending_growth", {
      precision: 10,
      scale: 7,
    }).notNull(),
    fiscalBalance: numeric("fiscal_balance", { precision: 30, scale: 4 }).notNull(),
    nationalDebt: numeric("national_debt", { precision: 30, scale: 4 }).notNull(),
    debtToGdp: numeric("debt_to_gdp", { precision: 10, scale: 7 }).notNull(),
    policyRate: numeric("policy_rate", { precision: 10, scale: 7 }).notNull(),
    currentAccountToGdp: numeric("current_account_to_gdp", { precision: 10, scale: 7 }).notNull(),
    productivityIndex: numeric("productivity_index", { precision: 14, scale: 6 }).notNull(),
    referenceYear: integer("reference_year").notNull(),
    priceBasis: text("price_basis").notNull(),
    scale: text("scale").notNull().default("million"),
    rulesVersion: text("rules_version").notNull(),
    contributions: jsonb("contributions")
      .$type<Record<string, Array<{ source: string; value: string; explanation: string }>>>()
      .notNull()
      .default({}),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("economic_country_turn_uidx").on(table.countryId, table.turnId),
    check("economic_real_gdp_check", sql`${table.realGdp} >= 0`),
    check("economic_nominal_gdp_check", sql`${table.nominalGdp} >= 0`),
    check("economic_wealth_check", sql`${table.wealth} >= 0`),
    check("economic_reserves_check", sql`${table.foreignReserves} >= 0`),
    check("economic_currency_value_check", sql`${table.currencyValue} > 0`),
    check("economic_credit_score_check", sql`${table.creditScore} BETWEEN 0 AND 100`),
    check("economic_income_gini_check", sql`${table.incomeGini} BETWEEN 0 AND 1`),
    check("economic_wealth_gini_check", sql`${table.wealthGini} BETWEEN 0 AND 1`),
    check("economic_unemployment_check", sql`${table.unemploymentRate} BETWEEN 0 AND 1`),
    check("economic_debt_check", sql`${table.nationalDebt} >= 0`),
  ],
);

export const economicSnapshotInputs = pgTable("economic_snapshot_inputs", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id")
    .notNull()
    .references(() => economicSnapshots.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  value: numeric("value", { precision: 30, scale: 8 }).notNull(),
  unit: text("unit").notNull(),
  referenceYear: integer("reference_year").notNull(),
  source: text("source").notNull(),
  isEstimated: boolean("is_estimated").notNull().default(false),
  isOverride: boolean("is_override").notNull().default(false),
  overrideReason: text("override_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const countryFiscalPolicies = pgTable(
  "country_fiscal_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .unique()
      .references(() => countries.id, { onDelete: "restrict" }),
    taxRate: numeric("tax_rate", { precision: 8, scale: 6 }).notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (table) => [
    check("country_fiscal_policy_tax_rate_check", sql`${table.taxRate} BETWEEN 0 AND 0.75`),
  ],
);

export const economicSectors = pgTable(
  "economic_sectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    share: numeric("share", { precision: 9, scale: 7 }).notNull(),
    productionIndex: numeric("production_index", { precision: 14, scale: 6 }).notNull(),
    productivity: numeric("productivity", { precision: 14, scale: 6 }).notNull(),
    growthRate: numeric("growth_rate", { precision: 10, scale: 7 }).notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("sectors_country_turn_code_uidx").on(table.countryId, table.turnId, table.code),
    check("sector_share_check", sql`${table.share} BETWEEN 0 AND 1`),
  ],
);

export const financialInstitutions = pgTable("financial_institutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  systemicImportance: integer("systemic_importance").notNull(),
  health: integer("health").notNull(),
  industryTags: text("industry_tags").array().notNull().default([]),
  ...auditColumns,
});

export const majorCompanies = pgTable("major_companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  sizeIndex: integer("size_index").notNull(),
  stateOwned: boolean("state_owned").notNull().default(false),
  systemicImportance: integer("systemic_importance").notNull(),
  health: integer("health").notNull().default(60),
  industryTags: text("industry_tags").array().notNull().default([]),
  ...auditColumns,
});

export const politicalSnapshots = pgTable(
  "political_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    governmentForm: text("government_form").notNull(),
    headOfState: text("head_of_state").notNull(),
    headOfGovernment: text("head_of_government"),
    assemblySpeaker: text("assembly_speaker"),
    chiefJustice: text("chief_justice"),
    rulingParty: text("ruling_party").notNull(),
    oppositionParty: text("opposition_party").notNull(),
    stability: integer("stability").notNull(),
    legitimacy: integer("legitimacy").notNull(),
    governmentApproval: integer("government_approval").notNull(),
    policySupport: integer("policy_support").notNull().default(50),
    unrest: integer("unrest").notNull(),
    stateCapacity: integer("state_capacity").notNull(),
    corruption: integer("corruption").notNull(),
    democracy: integer("democracy").notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("political_country_turn_uidx").on(table.countryId, table.turnId),
    check(
      "political_metrics_check",
      sql`${table.stability} BETWEEN 0 AND 100 AND ${table.legitimacy} BETWEEN 0 AND 100 AND ${table.governmentApproval} BETWEEN 0 AND 100 AND ${table.policySupport} BETWEEN 0 AND 100 AND ${table.unrest} BETWEEN 0 AND 100 AND ${table.stateCapacity} BETWEEN 0 AND 100 AND ${table.corruption} BETWEEN 0 AND 100 AND ${table.democracy} BETWEEN 0 AND 100`,
    ),
  ],
);

export const parties = pgTable(
  "parties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    economicAxis: integer("economic_axis").notNull(),
    socialAxis: integer("social_axis").notNull(),
    notablePeople: text("notable_people").array().notNull().default([]),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("parties_country_code_uidx").on(table.countryId, table.code),
    check(
      "party_axes_check",
      sql`${table.economicAxis} BETWEEN -100 AND 100 AND ${table.socialAxis} BETWEEN -100 AND 100`,
    ),
  ],
);

export const partySnapshots = pgTable(
  "party_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "restrict" }),
    support: numeric("support", { precision: 9, scale: 7 }).notNull(),
    seats: integer("seats").notNull(),
    organization: integer("organization").notNull(),
    funds: numeric("funds", { precision: 24, scale: 4 }).notNull().default("0"),
    isGovernment: boolean("is_government").notNull().default(false),
    isFixed: boolean("is_fixed").notNull().default(false),
    minimumSupport: numeric("minimum_support", { precision: 9, scale: 7 }).notNull().default("0"),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("party_snapshots_party_turn_uidx").on(table.partyId, table.turnId),
    check("party_support_check", sql`${table.support} BETWEEN 0 AND 1`),
    check("party_seats_check", sql`${table.seats} >= 0`),
  ],
);

export const modifiers = pgTable("modifiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  metric: text("metric").notNull(),
  operation: text("operation").notNull(),
  value: numeric("value", { precision: 18, scale: 8 }).notNull(),
  startTurnId: uuid("start_turn_id")
    .notNull()
    .references(() => turns.id, { onDelete: "restrict" }),
  endTurnId: uuid("end_turn_id").references(() => turns.id, { onDelete: "restrict" }),
  durationTurns: integer("duration_turns"),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  ...auditColumns,
});

export const simulationRules = pgTable(
  "simulation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    coefficients: jsonb("coefficients").$type<Record<string, string>>().notNull(),
    ranges: jsonb("ranges").$type<Record<string, { min: string; max: string }>>().notNull(),
    isActive: boolean("is_active").notNull().default(false),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("simulation_rules_campaign_version_uidx").on(table.campaignId, table.version),
  ],
);

export const adminChangeProposals = pgTable(
  "admin_change_proposals",
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
    domain: changeDomain("domain").notNull(),
    metric: text("metric").notNull(),
    beforeValue: jsonb("before_value").notNull(),
    afterValue: jsonb("after_value").notNull(),
    reason: text("reason").notNull(),
    status: changeProposalStatus("status").notNull().default("PENDING"),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [index("admin_changes_country_status_idx").on(table.countryId, table.status)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    beforeSummary: jsonb("before_summary"),
    afterSummary: jsonb("after_summary"),
    reason: text("reason"),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
    index("audit_logs_campaign_created_idx").on(table.campaignId, table.createdAt),
  ],
);
