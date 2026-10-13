ALTER TABLE "campaigns" ADD COLUMN "realtime_tick_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "realtime_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "realtime_clocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"last_tick_at" timestamp with time zone,
	"last_game_at" timestamp with time zone,
	"tick_count" integer DEFAULT 0 NOT NULL,
	"last_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "realtime_clocks_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
ALTER TABLE "realtime_clocks" ADD CONSTRAINT "realtime_clocks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_nodes" ADD COLUMN "required_facilities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "country_research" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "country_research" ADD COLUMN "effects_applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "country_research" ADD COLUMN "classified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "country_research" SET "completed_at" = now(), "effects_applied_at" = now() WHERE "status" = 'COMPLETED';--> statement-breakpoint
CREATE TABLE "country_research_capacity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"enrollment_rate" numeric(8, 6) NOT NULL,
	"graduates_per_year" numeric(20, 2) NOT NULL,
	"tertiary_workers" numeric(20, 2) NOT NULL,
	"researchers" numeric(20, 2) NOT NULL,
	"rd_spending_millions" numeric(24, 4) NOT NULL,
	"points_per_year" numeric(14, 4) NOT NULL,
	"field_factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"facilities" text[] DEFAULT '{}' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_research_capacity_country_id_unique" UNIQUE("country_id"),
	CONSTRAINT "country_research_capacity_values_check" CHECK ("country_research_capacity"."points_per_year" >= 0 AND "country_research_capacity"."researchers" >= 0 AND "country_research_capacity"."tertiary_workers" >= 0)
);
--> statement-breakpoint
ALTER TABLE "country_research_capacity" ADD CONSTRAINT "country_research_capacity_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_research_capacity" ADD CONSTRAINT "country_research_capacity_updated_turn_id_turns_id_fk" FOREIGN KEY ("updated_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;
