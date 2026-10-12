CREATE TABLE "world_mechanics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"mechanic_key" text NOT NULL,
	"progress" numeric(12, 4) NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_mechanic_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mechanic_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"progress_before" numeric(12, 4) NOT NULL,
	"progress_after" numeric(12, 4) NOT NULL,
	"natural_growth" numeric(12, 4) NOT NULL,
	"reduction" numeric(12, 4) NOT NULL,
	"stage" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_mechanic_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"mechanic_key" text NOT NULL,
	"action_key" text NOT NULL,
	"country_id" uuid NOT NULL,
	"ordered_by" text NOT NULL,
	"ordered_turn_id" uuid NOT NULL,
	"political_power_cost" numeric(12, 4) NOT NULL,
	"budget_cost" numeric(20, 4) NOT NULL,
	"reduction" numeric(12, 4) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"applied_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_mechanic_actions_status_check" CHECK ("world_mechanic_actions"."status" IN ('PENDING', 'APPLIED', 'CANCELLED')),
	CONSTRAINT "world_mechanic_actions_costs_check" CHECK ("world_mechanic_actions"."political_power_cost" >= 0 AND "world_mechanic_actions"."budget_cost" >= 0 AND "world_mechanic_actions"."reduction" >= 0)
);
--> statement-breakpoint
ALTER TABLE "world_mechanics" ADD CONSTRAINT "world_mechanics_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanics" ADD CONSTRAINT "world_mechanics_updated_turn_id_turns_id_fk" FOREIGN KEY ("updated_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanic_history" ADD CONSTRAINT "world_mechanic_history_mechanic_id_world_mechanics_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."world_mechanics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanic_history" ADD CONSTRAINT "world_mechanic_history_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanic_actions" ADD CONSTRAINT "world_mechanic_actions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanic_actions" ADD CONSTRAINT "world_mechanic_actions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanic_actions" ADD CONSTRAINT "world_mechanic_actions_ordered_by_users_id_fk" FOREIGN KEY ("ordered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanic_actions" ADD CONSTRAINT "world_mechanic_actions_ordered_turn_id_turns_id_fk" FOREIGN KEY ("ordered_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_mechanic_actions" ADD CONSTRAINT "world_mechanic_actions_applied_turn_id_turns_id_fk" FOREIGN KEY ("applied_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "world_mechanics_campaign_key_uidx" ON "world_mechanics" USING btree ("campaign_id","mechanic_key");--> statement-breakpoint
CREATE UNIQUE INDEX "world_mechanic_history_turn_uidx" ON "world_mechanic_history" USING btree ("mechanic_id","turn_id");--> statement-breakpoint
CREATE INDEX "world_mechanic_actions_country_idx" ON "world_mechanic_actions" USING btree ("country_id","mechanic_key");--> statement-breakpoint
CREATE INDEX "world_mechanic_actions_turn_idx" ON "world_mechanic_actions" USING btree ("ordered_turn_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "world_mechanic_actions_pending_uidx" ON "world_mechanic_actions" USING btree ("country_id","mechanic_key","action_key") WHERE "world_mechanic_actions"."status" = 'PENDING';
