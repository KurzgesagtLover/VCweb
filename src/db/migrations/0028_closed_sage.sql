ALTER TYPE "public"."diplomatic_relation_status" ADD VALUE 'STALEMATE';--> statement-breakpoint
ALTER TYPE "public"."diplomatic_relation_status" ADD VALUE 'GUERRILLA';--> statement-breakpoint
ALTER TABLE "map_raster_border_layers" ALTER COLUMN "layer_colors" SET DEFAULT '{"COAST":"#111827","LEGAL":"#F5F5F5","ACTIVE":"#F04444","INACTIVE":"#7D8794","GUERRILLA":"#F2B84B"}'::jsonb;--> statement-breakpoint
UPDATE "map_raster_border_layers"
SET "layer_colors" = "layer_colors" || '{"GUERRILLA":"#F2B84B"}'::jsonb
WHERE NOT ("layer_colors" ? 'GUERRILLA');--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "entity_type" text DEFAULT 'STATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "map_rasters" ADD COLUMN "source_image_data" "bytea";--> statement-breakpoint
ALTER TABLE "map_rasters" ADD COLUMN "source_width" integer;--> statement-breakpoint
ALTER TABLE "map_rasters" ADD COLUMN "source_height" integer;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_entity_type_check" CHECK ("countries"."entity_type" IN ('STATE', 'PARTIALLY_RECOGNIZED_STATE', 'QUASI_STATE', 'ARMED_GROUP', 'GUERRILLA_GROUP'));
