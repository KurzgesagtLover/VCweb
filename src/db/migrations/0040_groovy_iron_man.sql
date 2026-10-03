CREATE TABLE "world_cities" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"country_m49" text NOT NULL,
	"country_name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"population" integer NOT NULL,
	"population_year" integer NOT NULL,
	"urban_area_km2" numeric(14, 3) NOT NULL,
	"built_up_area_km2" numeric(14, 3) NOT NULL,
	"is_capital" boolean DEFAULT false NOT NULL,
	"size_class" integer NOT NULL,
	"population_plausibility" integer NOT NULL,
	"wup_calibrated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_cities_latitude_check" CHECK ("world_cities"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "world_cities_longitude_check" CHECK ("world_cities"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "world_cities_population_check" CHECK ("world_cities"."population" >= 0),
	CONSTRAINT "world_cities_population_year_check" CHECK ("world_cities"."population_year" BETWEEN 1900 AND 2200),
	CONSTRAINT "world_cities_urban_area_check" CHECK ("world_cities"."urban_area_km2" >= 0),
	CONSTRAINT "world_cities_built_up_area_check" CHECK ("world_cities"."built_up_area_km2" >= 0),
	CONSTRAINT "world_cities_size_class_check" CHECK ("world_cities"."size_class" BETWEEN 1 AND 7),
	CONSTRAINT "world_cities_population_plausibility_check" CHECK ("world_cities"."population_plausibility" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "world_cities_source_id_uidx" ON "world_cities" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "world_cities_viewport_idx" ON "world_cities" USING btree ("longitude","latitude");--> statement-breakpoint
CREATE INDEX "world_cities_population_idx" ON "world_cities" USING btree ("population");--> statement-breakpoint
CREATE INDEX "world_cities_country_idx" ON "world_cities" USING btree ("country_m49");