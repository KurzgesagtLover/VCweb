DROP TABLE IF EXISTS "administrative_division_cells";--> statement-breakpoint
DROP TABLE IF EXISTS "map_cell_changes";--> statement-breakpoint
DROP TABLE IF EXISTS "map_change_sets";--> statement-breakpoint
DROP TABLE IF EXISTS "map_ownership";--> statement-breakpoint
DROP TABLE IF EXISTS "map_cells";--> statement-breakpoint
ALTER TABLE "campaign_maps" DROP COLUMN IF EXISTS "hex_resolution";--> statement-breakpoint
ALTER TABLE "campaign_maps" DROP COLUMN IF EXISTS "adaptive_resolution";
