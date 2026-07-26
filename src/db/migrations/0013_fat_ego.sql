DROP INDEX "map_cells_axial_uidx";--> statement-breakpoint
ALTER TABLE "campaign_maps" ADD COLUMN "hex_resolution" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
CREATE INDEX "map_cells_resolution_idx" ON "map_cells" USING btree ("r");