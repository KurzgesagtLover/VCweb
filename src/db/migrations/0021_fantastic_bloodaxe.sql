CREATE TYPE "public"."super_event_audience" AS ENUM('ALL', 'COUNTRY');--> statement-breakpoint
CREATE TYPE "public"."super_event_status" AS ENUM('DRAFT', 'BROADCAST', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "super_event_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"super_event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_id" uuid,
	"status" "super_event_status" DEFAULT 'DRAFT' NOT NULL,
	"audience" "super_event_audience" DEFAULT 'ALL' NOT NULL,
	"target_country_id" uuid,
	"code_name" text DEFAULT '' NOT NULL,
	"source_label" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"footnote" text DEFAULT '' NOT NULL,
	"stamp_text" text DEFAULT '' NOT NULL,
	"image_url" text,
	"image_alt" text DEFAULT '' NOT NULL,
	"audio_url" text,
	"audio_volume" integer DEFAULT 70 NOT NULL,
	"dismiss_label" text DEFAULT '확인' NOT NULL,
	"hold_seconds" integer DEFAULT 4 NOT NULL,
	"created_by" text NOT NULL,
	"broadcast_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "super_event_receipts" ADD CONSTRAINT "super_event_receipts_super_event_id_super_events_id_fk" FOREIGN KEY ("super_event_id") REFERENCES "public"."super_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_event_receipts" ADD CONSTRAINT "super_event_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_events" ADD CONSTRAINT "super_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_events" ADD CONSTRAINT "super_events_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_events" ADD CONSTRAINT "super_events_target_country_id_countries_id_fk" FOREIGN KEY ("target_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_events" ADD CONSTRAINT "super_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "super_event_receipts_event_user_uidx" ON "super_event_receipts" USING btree ("super_event_id","user_id");--> statement-breakpoint
CREATE INDEX "super_event_receipts_user_idx" ON "super_event_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "super_events_campaign_status_idx" ON "super_events" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "super_events_broadcast_idx" ON "super_events" USING btree ("campaign_id","broadcast_at");