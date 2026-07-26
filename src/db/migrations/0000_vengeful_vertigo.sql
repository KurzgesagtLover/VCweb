CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."change_domain" AS ENUM('ECONOMY', 'POLITICS');--> statement-breakpoint
CREATE TYPE "public"."change_proposal_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."profile_revision_status" AS ENUM('DRAFT', 'APPROVED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."setup_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."turn_status" AS ENUM('DRAFT', 'LOCKED', 'CALCULATING', 'AI_RUNNING', 'REVIEW', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'PLAYER', 'MODERATOR', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"lore" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"start_game_date" date NOT NULL,
	"months_per_turn" integer DEFAULT 12 NOT NULL,
	"rules_version" text DEFAULT 'v1' NOT NULL,
	"map_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "country_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"requested_country_name" text NOT NULL,
	"reason" text NOT NULL,
	"status" "application_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"game_date_start" date NOT NULL,
	"game_date_end" date NOT NULL,
	"deadline_at" timestamp with time zone,
	"status" "turn_status" DEFAULT 'DRAFT' NOT NULL,
	"step_completed_at" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "administrative_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"parent_id" uuid,
	"level" integer NOT NULL,
	"type_name" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "administrative_division_level_check" CHECK ("administrative_divisions"."level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"color" text NOT NULL,
	"is_ai" boolean DEFAULT false NOT NULL,
	"setup_status" "setup_status" DEFAULT 'DRAFT' NOT NULL,
	"current_profile_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"start_turn_id" uuid,
	"end_turn_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"office_type" text NOT NULL,
	"holder_name" text NOT NULL,
	"start_turn_id" uuid,
	"end_turn_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_profile_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" "profile_revision_status" DEFAULT 'DRAFT' NOT NULL,
	"flag" text,
	"motto" text,
	"national_anthem" text,
	"national_tree" text,
	"national_flower" text,
	"national_bird" text,
	"national_animal" text,
	"history" text,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planet" text,
	"capital" text,
	"largest_city" text,
	"total_area_km2" numeric(20, 3),
	"inland_water_ratio" numeric(8, 6) DEFAULT '0',
	"official_languages" text[] DEFAULT '{}' NOT NULL,
	"official_scripts" text[] DEFAULT '{}' NOT NULL,
	"state_religion" text,
	"military_description" text,
	"government_form" text,
	"official_currency" text,
	"currency_code" text,
	"major_industries" text[] DEFAULT '{}' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_inland_water_ratio_check" CHECK ("country_profile_revisions"."inland_water_ratio" >= 0 AND "country_profile_revisions"."inland_water_ratio" <= 1),
	CONSTRAINT "profile_total_area_check" CHECK ("country_profile_revisions"."total_area_km2" IS NULL OR "country_profile_revisions"."total_area_km2" > 0)
);
--> statement-breakpoint
CREATE TABLE "country_setup_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"submitted_by" text NOT NULL,
	"status" "setup_status" DEFAULT 'DRAFT' NOT NULL,
	"quick_setup" jsonb NOT NULL,
	"advanced_setup" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_comment" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"approved_profile_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_revision_id" uuid NOT NULL,
	"media_key" text,
	"attribution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_units_and_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_revision_id" uuid NOT NULL,
	"legal_era" text,
	"time_zone" text,
	"measurement_system" text,
	"cc_tld" text,
	"country_code" text,
	"traffic_direction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_units_and_codes_profile_revision_id_unique" UNIQUE("profile_revision_id")
);
--> statement-breakpoint
CREATE TABLE "country_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"tech_node_id" uuid NOT NULL,
	"status" "research_status" DEFAULT 'LOCKED' NOT NULL,
	"progress_points" numeric(18, 4) DEFAULT '0' NOT NULL,
	"started_turn_id" uuid,
	"completed_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_research_progress_check" CHECK ("country_research"."progress_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "research_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"tech_node_id" uuid NOT NULL,
	"points" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_allocations_points_check" CHECK ("research_allocations"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tech_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"field" text NOT NULL,
	"era" integer NOT NULL,
	"description" text NOT NULL,
	"cost" numeric(18, 4) NOT NULL,
	"exclusive_group" text,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_key" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tech_nodes_cost_check" CHECK ("tech_nodes"."cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "tech_prerequisites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tech_node_id" uuid NOT NULL,
	"prerequisite_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tech_prerequisites_no_self_check" CHECK ("tech_prerequisites"."tech_node_id" <> "tech_prerequisites"."prerequisite_id")
);
--> statement-breakpoint
CREATE TABLE "admin_change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"domain" "change_domain" NOT NULL,
	"metric" text NOT NULL,
	"before_value" jsonb NOT NULL,
	"after_value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" "change_proposal_status" DEFAULT 'PENDING' NOT NULL,
	"proposed_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before_summary" jsonb,
	"after_summary" jsonb,
	"reason" text,
	"request_id" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demographic_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"population" numeric(24, 0) NOT NULL,
	"citizens_abroad" numeric(24, 0) DEFAULT '0' NOT NULL,
	"foreign_residents" numeric(24, 0) DEFAULT '0' NOT NULL,
	"diaspora" numeric(24, 0) DEFAULT '0' NOT NULL,
	"fertility_rate" numeric(8, 4) NOT NULL,
	"population_growth_rate" numeric(9, 6) NOT NULL,
	"life_expectancy" numeric(6, 2) NOT NULL,
	"median_age" numeric(6, 2) NOT NULL,
	"population_density" numeric(20, 6) NOT NULL,
	"estimated_fields" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demographic_population_check" CHECK ("demographic_snapshots"."population" >= 0),
	CONSTRAINT "demographic_fertility_check" CHECK ("demographic_snapshots"."fertility_rate" >= 0),
	CONSTRAINT "demographic_life_expectancy_check" CHECK ("demographic_snapshots"."life_expectancy" > 0)
);
--> statement-breakpoint
CREATE TABLE "economic_sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"share" numeric(9, 7) NOT NULL,
	"production_index" numeric(14, 6) NOT NULL,
	"productivity" numeric(14, 6) NOT NULL,
	"growth_rate" numeric(10, 7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sector_share_check" CHECK ("economic_sectors"."share" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "economic_snapshot_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"value" numeric(30, 8) NOT NULL,
	"unit" text NOT NULL,
	"reference_year" integer NOT NULL,
	"source" text NOT NULL,
	"is_estimated" boolean DEFAULT false NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"real_gdp" numeric(30, 4) NOT NULL,
	"nominal_gdp" numeric(30, 4) NOT NULL,
	"real_gdp_growth" numeric(10, 7) NOT NULL,
	"gdp_deflator" numeric(14, 7) NOT NULL,
	"real_gni" numeric(30, 4) NOT NULL,
	"real_gnp" numeric(30, 4) NOT NULL,
	"wealth" numeric(30, 4) NOT NULL,
	"foreign_reserves" numeric(30, 4) NOT NULL,
	"currency_code" text NOT NULL,
	"currency_value" numeric(20, 8) NOT NULL,
	"credit_rating" text NOT NULL,
	"credit_score" integer NOT NULL,
	"income_gini" numeric(8, 6) NOT NULL,
	"wealth_gini" numeric(8, 6) NOT NULL,
	"inflation_rate" numeric(10, 7) NOT NULL,
	"land_price_growth" numeric(10, 7) NOT NULL,
	"unemployment_rate" numeric(10, 7) NOT NULL,
	"government_revenue" numeric(30, 4) NOT NULL,
	"government_spending" numeric(30, 4) NOT NULL,
	"government_spending_growth" numeric(10, 7) NOT NULL,
	"fiscal_balance" numeric(30, 4) NOT NULL,
	"national_debt" numeric(30, 4) NOT NULL,
	"debt_to_gdp" numeric(10, 7) NOT NULL,
	"policy_rate" numeric(10, 7) NOT NULL,
	"current_account_to_gdp" numeric(10, 7) NOT NULL,
	"productivity_index" numeric(14, 6) NOT NULL,
	"reference_year" integer NOT NULL,
	"price_basis" text NOT NULL,
	"scale" text DEFAULT 'million' NOT NULL,
	"rules_version" text NOT NULL,
	"contributions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_real_gdp_check" CHECK ("economic_snapshots"."real_gdp" >= 0),
	CONSTRAINT "economic_nominal_gdp_check" CHECK ("economic_snapshots"."nominal_gdp" >= 0),
	CONSTRAINT "economic_wealth_check" CHECK ("economic_snapshots"."wealth" >= 0),
	CONSTRAINT "economic_reserves_check" CHECK ("economic_snapshots"."foreign_reserves" >= 0),
	CONSTRAINT "economic_currency_value_check" CHECK ("economic_snapshots"."currency_value" > 0),
	CONSTRAINT "economic_credit_score_check" CHECK ("economic_snapshots"."credit_score" BETWEEN 0 AND 100),
	CONSTRAINT "economic_income_gini_check" CHECK ("economic_snapshots"."income_gini" BETWEEN 0 AND 1),
	CONSTRAINT "economic_wealth_gini_check" CHECK ("economic_snapshots"."wealth_gini" BETWEEN 0 AND 1),
	CONSTRAINT "economic_unemployment_check" CHECK ("economic_snapshots"."unemployment_rate" BETWEEN 0 AND 1),
	CONSTRAINT "economic_debt_check" CHECK ("economic_snapshots"."national_debt" >= 0)
);
--> statement-breakpoint
CREATE TABLE "financial_institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"name" text NOT NULL,
	"systemic_importance" integer NOT NULL,
	"health" integer NOT NULL,
	"industry_tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "major_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text NOT NULL,
	"size_index" integer NOT NULL,
	"state_owned" boolean DEFAULT false NOT NULL,
	"systemic_importance" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"metric" text NOT NULL,
	"operation" text NOT NULL,
	"value" numeric(18, 8) NOT NULL,
	"start_turn_id" uuid NOT NULL,
	"end_turn_id" uuid,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"economic_axis" integer NOT NULL,
	"social_axis" integer NOT NULL,
	"notable_people" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_axes_check" CHECK ("parties"."economic_axis" BETWEEN -100 AND 100 AND "parties"."social_axis" BETWEEN -100 AND 100)
);
--> statement-breakpoint
CREATE TABLE "party_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"support" numeric(9, 7) NOT NULL,
	"seats" integer NOT NULL,
	"organization" integer NOT NULL,
	"funds" numeric(24, 4) DEFAULT '0' NOT NULL,
	"is_government" boolean DEFAULT false NOT NULL,
	"is_fixed" boolean DEFAULT false NOT NULL,
	"minimum_support" numeric(9, 7) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_support_check" CHECK ("party_snapshots"."support" BETWEEN 0 AND 1),
	CONSTRAINT "party_seats_check" CHECK ("party_snapshots"."seats" >= 0)
);
--> statement-breakpoint
CREATE TABLE "political_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"government_form" text NOT NULL,
	"head_of_state" text NOT NULL,
	"head_of_government" text,
	"assembly_speaker" text,
	"chief_justice" text,
	"ruling_party" text NOT NULL,
	"opposition_party" text NOT NULL,
	"stability" integer NOT NULL,
	"legitimacy" integer NOT NULL,
	"government_approval" integer NOT NULL,
	"unrest" integer NOT NULL,
	"state_capacity" integer NOT NULL,
	"corruption" integer NOT NULL,
	"democracy" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "political_metrics_check" CHECK ("political_snapshots"."stability" BETWEEN 0 AND 100 AND "political_snapshots"."legitimacy" BETWEEN 0 AND 100 AND "political_snapshots"."government_approval" BETWEEN 0 AND 100 AND "political_snapshots"."unrest" BETWEEN 0 AND 100 AND "political_snapshots"."state_capacity" BETWEEN 0 AND 100 AND "political_snapshots"."corruption" BETWEEN 0 AND 100 AND "political_snapshots"."democracy" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "simulation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" text NOT NULL,
	"coefficients" jsonb NOT NULL,
	"ranges" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_applications" ADD CONSTRAINT "country_applications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_applications" ADD CONSTRAINT "country_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_applications" ADD CONSTRAINT "country_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_divisions" ADD CONSTRAINT "administrative_divisions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_assignments" ADD CONSTRAINT "country_assignments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_assignments" ADD CONSTRAINT "country_assignments_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_assignments" ADD CONSTRAINT "country_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_assignments" ADD CONSTRAINT "country_assignments_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_assignments" ADD CONSTRAINT "country_assignments_end_turn_id_turns_id_fk" FOREIGN KEY ("end_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_flags" ADD CONSTRAINT "country_flags_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_offices" ADD CONSTRAINT "country_offices_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_offices" ADD CONSTRAINT "country_offices_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_offices" ADD CONSTRAINT "country_offices_end_turn_id_turns_id_fk" FOREIGN KEY ("end_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_profile_revisions" ADD CONSTRAINT "country_profile_revisions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_profile_revisions" ADD CONSTRAINT "country_profile_revisions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_setup_submissions" ADD CONSTRAINT "country_setup_submissions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_setup_submissions" ADD CONSTRAINT "country_setup_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_setup_submissions" ADD CONSTRAINT "country_setup_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_setup_submissions" ADD CONSTRAINT "country_setup_submissions_approved_profile_revision_id_country_profile_revisions_id_fk" FOREIGN KEY ("approved_profile_revision_id") REFERENCES "public"."country_profile_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_symbols" ADD CONSTRAINT "country_symbols_profile_revision_id_country_profile_revisions_id_fk" FOREIGN KEY ("profile_revision_id") REFERENCES "public"."country_profile_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_units_and_codes" ADD CONSTRAINT "country_units_and_codes_profile_revision_id_country_profile_revisions_id_fk" FOREIGN KEY ("profile_revision_id") REFERENCES "public"."country_profile_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_research" ADD CONSTRAINT "country_research_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_research" ADD CONSTRAINT "country_research_tech_node_id_tech_nodes_id_fk" FOREIGN KEY ("tech_node_id") REFERENCES "public"."tech_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_research" ADD CONSTRAINT "country_research_started_turn_id_turns_id_fk" FOREIGN KEY ("started_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_research" ADD CONSTRAINT "country_research_completed_turn_id_turns_id_fk" FOREIGN KEY ("completed_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_allocations" ADD CONSTRAINT "research_allocations_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_allocations" ADD CONSTRAINT "research_allocations_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_allocations" ADD CONSTRAINT "research_allocations_tech_node_id_tech_nodes_id_fk" FOREIGN KEY ("tech_node_id") REFERENCES "public"."tech_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_nodes" ADD CONSTRAINT "tech_nodes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_prerequisites" ADD CONSTRAINT "tech_prerequisites_tech_node_id_tech_nodes_id_fk" FOREIGN KEY ("tech_node_id") REFERENCES "public"."tech_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_prerequisites" ADD CONSTRAINT "tech_prerequisites_prerequisite_id_tech_nodes_id_fk" FOREIGN KEY ("prerequisite_id") REFERENCES "public"."tech_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_change_proposals" ADD CONSTRAINT "admin_change_proposals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_change_proposals" ADD CONSTRAINT "admin_change_proposals_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_change_proposals" ADD CONSTRAINT "admin_change_proposals_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_change_proposals" ADD CONSTRAINT "admin_change_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_change_proposals" ADD CONSTRAINT "admin_change_proposals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demographic_snapshots" ADD CONSTRAINT "demographic_snapshots_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demographic_snapshots" ADD CONSTRAINT "demographic_snapshots_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_sectors" ADD CONSTRAINT "economic_sectors_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_sectors" ADD CONSTRAINT "economic_sectors_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_snapshot_inputs" ADD CONSTRAINT "economic_snapshot_inputs_snapshot_id_economic_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."economic_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_snapshots_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_snapshots_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_institutions" ADD CONSTRAINT "financial_institutions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "major_companies" ADD CONSTRAINT "major_companies_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_end_turn_id_turns_id_fk" FOREIGN KEY ("end_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_snapshots" ADD CONSTRAINT "party_snapshots_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_snapshots" ADD CONSTRAINT "party_snapshots_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_snapshots" ADD CONSTRAINT "political_snapshots_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_snapshots" ADD CONSTRAINT "political_snapshots_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_rules" ADD CONSTRAINT "simulation_rules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_campaign_user_uidx" ON "campaign_memberships" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "country_applications_campaign_idx" ON "country_applications" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "country_applications_user_idx" ON "country_applications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_campaign_sequence_uidx" ON "turns" USING btree ("campaign_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "countries_campaign_code_uidx" ON "countries" USING btree ("campaign_id","code");--> statement-breakpoint
CREATE INDEX "country_assignments_country_idx" ON "country_assignments" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "country_assignments_user_idx" ON "country_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "country_flags_country_key_uidx" ON "country_flags" USING btree ("country_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_revisions_country_revision_uidx" ON "country_profile_revisions" USING btree ("country_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "country_research_country_tech_uidx" ON "country_research" USING btree ("country_id","tech_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_allocations_country_turn_tech_uidx" ON "research_allocations" USING btree ("country_id","turn_id","tech_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tech_nodes_campaign_code_uidx" ON "tech_nodes" USING btree ("campaign_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "tech_prerequisites_edge_uidx" ON "tech_prerequisites" USING btree ("tech_node_id","prerequisite_id");--> statement-breakpoint
CREATE INDEX "admin_changes_country_status_idx" ON "admin_change_proposals" USING btree ("country_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demographic_country_turn_uidx" ON "demographic_snapshots" USING btree ("country_id","turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sectors_country_turn_code_uidx" ON "economic_sectors" USING btree ("country_id","turn_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_country_turn_uidx" ON "economic_snapshots" USING btree ("country_id","turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parties_country_code_uidx" ON "parties" USING btree ("country_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "party_snapshots_party_turn_uidx" ON "party_snapshots" USING btree ("party_id","turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "political_country_turn_uidx" ON "political_snapshots" USING btree ("country_id","turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simulation_rules_campaign_version_uidx" ON "simulation_rules" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "country_assignments_active_user_uidx" ON "country_assignments" ("campaign_id", "user_id") WHERE "is_active" = true AND "end_turn_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "country_assignments_active_country_uidx" ON "country_assignments" ("campaign_id", "country_id") WHERE "is_active" = true AND "end_turn_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "country_profile_one_approved_uidx" ON "country_profile_revisions" ("country_id") WHERE "status" = 'APPROVED';--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_current_profile_revision_id_fkey" FOREIGN KEY ("current_profile_revision_id") REFERENCES "country_profile_revisions"("id") ON DELETE RESTRICT;
