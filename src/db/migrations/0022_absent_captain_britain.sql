ALTER TABLE "super_events" ADD COLUMN "audio_start_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "super_events" ADD COLUMN "audio_intro_reduced" boolean DEFAULT false NOT NULL;
