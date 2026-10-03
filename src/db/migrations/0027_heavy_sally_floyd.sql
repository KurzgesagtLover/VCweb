ALTER TABLE "map_raster_border_layers" ADD COLUMN "layer_colors" jsonb DEFAULT '{"COAST":"#111827","LEGAL":"#F5F5F5","ACTIVE":"#F04444","INACTIVE":"#7D8794"}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "map_raster_border_layers"
SET "layer_colors" = jsonb_build_object(
	'COAST', COALESCE((SELECT row->>'displayColor' FROM jsonb_array_elements("classifications") row WHERE row->>'kind' = 'COAST' LIMIT 1), '#111827'),
	'LEGAL', COALESCE((SELECT row->>'displayColor' FROM jsonb_array_elements("classifications") row WHERE row->>'kind' = 'LEGAL' LIMIT 1), '#F5F5F5'),
	'ACTIVE', COALESCE((SELECT row->>'displayColor' FROM jsonb_array_elements("classifications") row WHERE row->>'kind' IN ('ACTIVE', 'GUERRILLA') ORDER BY CASE WHEN row->>'kind' = 'ACTIVE' THEN 0 ELSE 1 END LIMIT 1), '#F04444'),
	'INACTIVE', COALESCE((SELECT row->>'displayColor' FROM jsonb_array_elements("classifications") row WHERE row->>'kind' = 'INACTIVE' LIMIT 1), '#7D8794')
);
