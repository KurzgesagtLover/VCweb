CREATE TABLE "world_administrative_divisions" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_boundary_id" text NOT NULL,
	"source_license" text NOT NULL,
	"boundary_year" text,
	"country_iso3" text NOT NULL,
	"level" integer NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"geometry" geometry(MultiPolygon,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_administrative_divisions_iso_check" CHECK ("world_administrative_divisions"."country_iso3" ~ '^[A-Z]{3}$'),
	CONSTRAINT "world_administrative_divisions_level_check" CHECK ("world_administrative_divisions"."level" BETWEEN 1 AND 2)
);
--> statement-breakpoint
DROP INDEX "administrative_division_cells_campaign_cell_uidx";--> statement-breakpoint
ALTER TABLE "administrative_divisions" ADD COLUMN "reference_id" text;--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "iso_alpha3" text;--> statement-breakpoint
UPDATE "countries" SET "iso_alpha3" = 'CHN' WHERE "code" = 'CHN';--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "world_administrative_divisions_source_uidx" ON "world_administrative_divisions" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "world_administrative_divisions_country_level_idx" ON "world_administrative_divisions" USING btree ("country_iso3","level");--> statement-breakpoint
CREATE INDEX "world_administrative_divisions_parent_idx" ON "world_administrative_divisions" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "world_administrative_divisions_geometry_gidx" ON "world_administrative_divisions" USING gist ("geometry");--> statement-breakpoint
CREATE UNIQUE INDEX "administrative_divisions_reference_uidx" ON "administrative_divisions" USING btree ("country_id","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "countries_campaign_iso_alpha3_uidx" ON "countries" USING btree ("campaign_id","iso_alpha3");--> statement-breakpoint
CREATE UNIQUE INDEX "administrative_division_cells_map_cell_level_uidx" ON "administrative_division_cells" USING btree ("map_id","cell_id","level");--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_iso_alpha3_check" CHECK ("countries"."iso_alpha3" IS NULL OR "countries"."iso_alpha3" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD CONSTRAINT "administrative_division_cells_level_check" CHECK ("administrative_division_cells"."level" BETWEEN 1 AND 3);
