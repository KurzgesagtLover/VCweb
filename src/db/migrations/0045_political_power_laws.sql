ALTER TABLE "country_political_resources" DROP CONSTRAINT IF EXISTS "political_resource_balance_check";--> statement-breakpoint
ALTER TABLE "country_political_resources" ADD CONSTRAINT "political_resource_balance_check" CHECK ("country_political_resources"."balance" BETWEEN -250 AND 1000);--> statement-breakpoint
ALTER TABLE "political_snapshots" DROP CONSTRAINT IF EXISTS "political_power_check";--> statement-breakpoint
ALTER TABLE "political_snapshots" ADD CONSTRAINT "political_power_check" CHECK ("political_snapshots"."political_power" BETWEEN -250 AND 1000);--> statement-breakpoint
CREATE TABLE "country_laws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"law_key" text NOT NULL,
	"stage" integer NOT NULL,
	"changed_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_laws_key_check" CHECK ("country_laws"."law_key" IN ('conscriptionLaw', 'tradePolicy', 'economyLaw')),
	CONSTRAINT "country_laws_stage_check" CHECK ("country_laws"."stage" BETWEEN 1 AND 7)
);
--> statement-breakpoint
CREATE TABLE "country_law_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"law_key" text NOT NULL,
	"from_stage" integer NOT NULL,
	"to_stage" integer NOT NULL,
	"cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"upkeep_mode" text NOT NULL,
	"upkeep_max" numeric(12, 4) DEFAULT '0' NOT NULL,
	"half_life_years" numeric(8, 4) DEFAULT '3' NOT NULL,
	"adaptation" numeric(10, 8) DEFAULT '0' NOT NULL,
	"erosion" numeric(12, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"ordered_by" text,
	"ordered_turn_id" uuid NOT NULL,
	"applied_turn_id" uuid,
	"closed_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_law_changes_status_check" CHECK ("country_law_changes"."status" IN ('PENDING', 'ACTIVE', 'ADAPTED', 'APPLIED', 'CANCELLED', 'REVERTED', 'SUPERSEDED')),
	CONSTRAINT "country_law_changes_mode_check" CHECK ("country_law_changes"."upkeep_mode" IN ('FIXED', 'ADAPTIVE')),
	CONSTRAINT "country_law_changes_step_check" CHECK ("country_law_changes"."from_stage" <> "country_law_changes"."to_stage"),
	CONSTRAINT "country_law_changes_values_check" CHECK ("country_law_changes"."cost" >= 0 AND "country_law_changes"."upkeep_max" >= 0 AND "country_law_changes"."half_life_years" > 0 AND "country_law_changes"."adaptation" BETWEEN 0 AND 1 AND "country_law_changes"."erosion" BETWEEN 0 AND 150)
);
--> statement-breakpoint
CREATE TABLE "political_power_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"balance_before" numeric(12, 4) NOT NULL,
	"balance_after" numeric(12, 4) NOT NULL,
	"gross_income" numeric(12, 4) NOT NULL,
	"upkeep" numeric(12, 4) NOT NULL,
	"net" numeric(12, 4) NOT NULL,
	"state" text NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "political_power_ledger_state_check" CHECK ("political_power_ledger"."state" IN ('NORMAL', 'HOLD', 'DEFICIT'))
);
--> statement-breakpoint
ALTER TABLE "country_laws" ADD CONSTRAINT "country_laws_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_laws" ADD CONSTRAINT "country_laws_changed_turn_id_turns_id_fk" FOREIGN KEY ("changed_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_law_changes" ADD CONSTRAINT "country_law_changes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_law_changes" ADD CONSTRAINT "country_law_changes_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_law_changes" ADD CONSTRAINT "country_law_changes_ordered_by_users_id_fk" FOREIGN KEY ("ordered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_law_changes" ADD CONSTRAINT "country_law_changes_ordered_turn_id_turns_id_fk" FOREIGN KEY ("ordered_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_law_changes" ADD CONSTRAINT "country_law_changes_applied_turn_id_turns_id_fk" FOREIGN KEY ("applied_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_law_changes" ADD CONSTRAINT "country_law_changes_closed_turn_id_turns_id_fk" FOREIGN KEY ("closed_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_power_ledger" ADD CONSTRAINT "political_power_ledger_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_power_ledger" ADD CONSTRAINT "political_power_ledger_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_power_ledger" ADD CONSTRAINT "political_power_ledger_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "country_laws_country_law_uidx" ON "country_laws" USING btree ("country_id","law_key");--> statement-breakpoint
CREATE INDEX "country_law_changes_country_status_idx" ON "country_law_changes" USING btree ("country_id","status");--> statement-breakpoint
CREATE INDEX "country_law_changes_campaign_status_idx" ON "country_law_changes" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "country_law_changes_pending_uidx" ON "country_law_changes" USING btree ("country_id","law_key") WHERE "country_law_changes"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "political_power_ledger_country_turn_uidx" ON "political_power_ledger" USING btree ("country_id","turn_id");
