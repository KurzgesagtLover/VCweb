CREATE TABLE "policy_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"goal_type" text NOT NULL,
	"metric" text NOT NULL,
	"baseline_value" numeric(30, 8) NOT NULL,
	"target_value" numeric(30, 8) NOT NULL,
	"latest_value" numeric(30, 8) NOT NULL,
	"start_turn_id" uuid NOT NULL,
	"target_game_date" date NOT NULL,
	"completed_turn_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_goals_type_check" CHECK ("policy_goals"."goal_type" IN ('FREE_MARKET', 'PLANNED')),
	CONSTRAINT "policy_goals_status_check" CHECK ("policy_goals"."status" IN ('ACTIVE', 'ACHIEVED', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
ALTER TABLE "political_snapshots" DROP CONSTRAINT "political_metrics_check";--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."submission_category";--> statement-breakpoint
CREATE TYPE "public"."submission_category" AS ENUM('ECONOMY', 'POLITICS', 'DIPLOMACY', 'INTELLIGENCE', 'RESEARCH', 'SOCIETY', 'OTHER');--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "category" SET DATA TYPE "public"."submission_category" USING "category"::"public"."submission_category";--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "economic_system" text DEFAULT 'FREE_MARKET' NOT NULL;--> statement-breakpoint
ALTER TABLE "judgment_proposals" ADD COLUMN "projected_changes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "policy_goal_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "target_metrics" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "public_awareness" numeric(7, 4) DEFAULT '15' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "policy_support" numeric(7, 4) DEFAULT '50' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "promotion_spend" numeric(30, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "effectiveness_multiplier" numeric(8, 6) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "overpromotion_penalty" numeric(8, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "modifiers" ADD COLUMN "duration_turns" integer;--> statement-breakpoint
ALTER TABLE "political_snapshots" ADD COLUMN "policy_support" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_goals" ADD CONSTRAINT "policy_goals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_goals" ADD CONSTRAINT "policy_goals_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_goals" ADD CONSTRAINT "policy_goals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_goals" ADD CONSTRAINT "policy_goals_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_goals" ADD CONSTRAINT "policy_goals_completed_turn_id_turns_id_fk" FOREIGN KEY ("completed_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_goals_country_status_idx" ON "policy_goals" USING btree ("country_id","status");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_policy_goal_id_policy_goals_id_fk" FOREIGN KEY ("policy_goal_id") REFERENCES "public"."policy_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_economic_system_check" CHECK ("countries"."economic_system" IN ('FREE_MARKET', 'PLANNED'));--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submission_policy_metrics_check" CHECK (cardinality("submissions"."target_metrics") BETWEEN 0 AND 6);--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submission_policy_state_check" CHECK ("submissions"."public_awareness" BETWEEN 0 AND 100 AND "submissions"."policy_support" BETWEEN 0 AND 100 AND "submissions"."promotion_spend" >= 0 AND "submissions"."effectiveness_multiplier" BETWEEN 0.5 AND 1.55 AND "submissions"."overpromotion_penalty" BETWEEN 0 AND 0.48);--> statement-breakpoint
ALTER TABLE "political_snapshots" ADD CONSTRAINT "political_metrics_check" CHECK ("political_snapshots"."stability" BETWEEN 0 AND 100 AND "political_snapshots"."legitimacy" BETWEEN 0 AND 100 AND "political_snapshots"."government_approval" BETWEEN 0 AND 100 AND "political_snapshots"."policy_support" BETWEEN 0 AND 100 AND "political_snapshots"."unrest" BETWEEN 0 AND 100 AND "political_snapshots"."state_capacity" BETWEEN 0 AND 100 AND "political_snapshots"."corruption" BETWEEN 0 AND 100 AND "political_snapshots"."democracy" BETWEEN 0 AND 100);