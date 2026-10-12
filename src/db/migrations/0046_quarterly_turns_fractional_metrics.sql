ALTER TABLE "political_snapshots" ALTER COLUMN "stability" SET DATA TYPE double precision USING "stability"::double precision;--> statement-breakpoint
ALTER TABLE "political_snapshots" ALTER COLUMN "legitimacy" SET DATA TYPE double precision USING "legitimacy"::double precision;--> statement-breakpoint
ALTER TABLE "political_snapshots" ALTER COLUMN "government_approval" SET DATA TYPE double precision USING "government_approval"::double precision;--> statement-breakpoint
ALTER TABLE "political_snapshots" ALTER COLUMN "policy_support" SET DATA TYPE double precision USING "policy_support"::double precision;--> statement-breakpoint
ALTER TABLE "political_snapshots" ALTER COLUMN "unrest" SET DATA TYPE double precision USING "unrest"::double precision;--> statement-breakpoint
ALTER TABLE "political_snapshots" ALTER COLUMN "state_capacity" SET DATA TYPE double precision USING "state_capacity"::double precision;--> statement-breakpoint
ALTER TABLE "political_snapshots" ALTER COLUMN "corruption" SET DATA TYPE double precision USING "corruption"::double precision;--> statement-breakpoint
ALTER TABLE "political_snapshots" ALTER COLUMN "democracy" SET DATA TYPE double precision USING "democracy"::double precision;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ALTER COLUMN "credit_score" SET DATA TYPE double precision USING "credit_score"::double precision;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "months_per_turn" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "game_days_per_real_day" SET DEFAULT 91;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "adjudication_interval_game_days" SET DEFAULT 91;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "game_time_per_real_day_value" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "game_time_per_real_day_unit" SET DEFAULT 'MONTH';--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "adjudication_interval_value" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "adjudication_interval_unit" SET DEFAULT 'MONTH';
