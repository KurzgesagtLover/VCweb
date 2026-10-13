ALTER TABLE "campaigns" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
UPDATE "campaigns" SET "paused_at" = now() WHERE "realtime_paused" = true;--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "realtime_paused";
