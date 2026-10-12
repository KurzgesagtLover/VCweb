CREATE TABLE "country_spirits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"spirit_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'SPECIAL' NOT NULL,
	"effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"start_turn_id" uuid,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"ended_turn_id" uuid,
	"ended_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_spirits_status_check" CHECK ("country_spirits"."status" IN ('ACTIVE', 'EXPIRED', 'REMOVED')),
	CONSTRAINT "country_spirits_source_check" CHECK ("country_spirits"."source_type" IN ('ADMIN', 'EVENT', 'JUDGMENT', 'WORLD', 'SCRIPT', 'SYSTEM')),
	CONSTRAINT "country_spirits_category_check" CHECK ("country_spirits"."category" IN ('POLITICS', 'ECONOMY', 'SOCIETY', 'MILITARY', 'DIPLOMACY', 'WORLD', 'SPECIAL'))
);
--> statement-breakpoint
ALTER TABLE "country_spirits" ADD CONSTRAINT "country_spirits_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_spirits" ADD CONSTRAINT "country_spirits_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_spirits" ADD CONSTRAINT "country_spirits_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_spirits" ADD CONSTRAINT "country_spirits_ended_turn_id_turns_id_fk" FOREIGN KEY ("ended_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_spirits" ADD CONSTRAINT "country_spirits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "country_spirits_country_idx" ON "country_spirits" USING btree ("country_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "country_spirits_active_key_uidx" ON "country_spirits" USING btree ("country_id","spirit_key") WHERE "country_spirits"."status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "event_options" ADD COLUMN "spirits" jsonb DEFAULT '[]'::jsonb NOT NULL;
