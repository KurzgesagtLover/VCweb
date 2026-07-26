CREATE TABLE "map_raster_border_layers" (
	"map_id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"classifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rendered_data" "bytea" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_rasters" ADD COLUMN "borderless_image_data" "bytea";--> statement-breakpoint
ALTER TABLE "map_raster_border_layers" ADD CONSTRAINT "map_raster_border_layers_map_id_campaign_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_raster_border_layers" ADD CONSTRAINT "map_raster_border_layers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_raster_border_layers" ADD CONSTRAINT "map_raster_border_layers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;