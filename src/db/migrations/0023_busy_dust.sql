ALTER TABLE "super_events" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "video_sound" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "super_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_outlet" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_section" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_headline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_byline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_body" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_image_url" text;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_image_caption" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "bulletin_kicker" text DEFAULT '' NOT NULL;