CREATE TABLE "campaign_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"administrative_division_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "administrative_division_cells_campaign_cell_uidx";--> statement-breakpoint
DROP INDEX "map_ownership_revision_cell_uidx";--> statement-breakpoint
DROP INDEX "map_ownership_lookup_idx";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "game_days_per_real_day" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "adjudication_interval_game_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "turn_close_hour" integer DEFAULT 23 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "turn_close_minute" integer DEFAULT 55 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "map_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
INSERT INTO "campaign_maps" (
	"campaign_id",
	"position",
	"name",
	"revision",
	"administrative_division_revision"
)
SELECT
	"id",
	1,
	'지도 1',
	"map_revision",
	"administrative_division_revision"
FROM "campaigns";--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD COLUMN "map_id" uuid;--> statement-breakpoint
ALTER TABLE "map_change_sets" ADD COLUMN "map_id" uuid;--> statement-breakpoint
ALTER TABLE "map_ownership" ADD COLUMN "map_id" uuid;--> statement-breakpoint
UPDATE "administrative_division_cells" AS target
SET "map_id" = source."id"
FROM "campaign_maps" AS source
WHERE source."campaign_id" = target."campaign_id" AND source."position" = 1;--> statement-breakpoint
UPDATE "map_change_sets" AS target
SET "map_id" = source."id"
FROM "campaign_maps" AS source
WHERE source."campaign_id" = target."campaign_id" AND source."position" = 1;--> statement-breakpoint
UPDATE "map_ownership" AS target
SET "map_id" = source."id"
FROM "campaign_maps" AS source
WHERE source."campaign_id" = target."campaign_id" AND source."position" = 1;--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ALTER COLUMN "map_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "map_change_sets" ALTER COLUMN "map_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "map_ownership" ALTER COLUMN "map_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_maps" ADD CONSTRAINT "campaign_maps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_maps_campaign_position_uidx" ON "campaign_maps" USING btree ("campaign_id","position");--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD CONSTRAINT "administrative_division_cells_map_id_campaign_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_change_sets" ADD CONSTRAINT "map_change_sets_map_id_campaign_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_ownership" ADD CONSTRAINT "map_ownership_map_id_campaign_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "administrative_division_cells_campaign_cell_uidx" ON "administrative_division_cells" USING btree ("map_id","cell_id");--> statement-breakpoint
CREATE UNIQUE INDEX "map_ownership_revision_cell_uidx" ON "map_ownership" USING btree ("map_id","revision","cell_id");--> statement-breakpoint
CREATE INDEX "map_ownership_lookup_idx" ON "map_ownership" USING btree ("map_id","cell_id","revision");
