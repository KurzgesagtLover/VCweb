CREATE TYPE "public"."game_time_unit" AS ENUM('DAY', 'MONTH', 'YEAR');--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "game_time_per_real_day_value" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "game_time_per_real_day_unit" "game_time_unit" DEFAULT 'DAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "adjudication_interval_value" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "adjudication_interval_unit" "game_time_unit" DEFAULT 'DAY' NOT NULL;--> statement-breakpoint
UPDATE "campaigns"
SET
  "game_time_per_real_day_value" = "game_days_per_real_day",
  "game_time_per_real_day_unit" = 'DAY',
  "adjudication_interval_value" = "adjudication_interval_game_days",
  "adjudication_interval_unit" = 'DAY';
