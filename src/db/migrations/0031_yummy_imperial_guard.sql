ALTER TABLE "country_development_tracks" DROP CONSTRAINT "country_development_tracks_metric_check";--> statement-breakpoint
ALTER TABLE "country_development_tracks" DROP CONSTRAINT "country_development_tracks_stage_check";--> statement-breakpoint
ALTER TABLE "country_development_tracks" ADD CONSTRAINT "country_development_tracks_metric_check" CHECK ("country_development_tracks"."metric" IN ('literacy', 'poverty', 'agriculturalSelfSufficiency', 'factoryEquipment', 'industrialExpertise', 'researchFacilities', 'academicFoundation', 'pressFreedom', 'religiousFreedom', 'laborUnions', 'assemblyFreedom', 'suffrage', 'partySystem', 'judicialIndependence'));--> statement-breakpoint
ALTER TABLE "country_development_tracks" ADD CONSTRAINT "country_development_tracks_stage_check" CHECK ((
        "country_development_tracks"."metric" = 'laborUnions' AND "country_development_tracks"."stage" BETWEEN 1 AND 7
      ) OR (
        "country_development_tracks"."metric" IN ('religiousFreedom', 'judicialIndependence') AND "country_development_tracks"."stage" BETWEEN 1 AND 4
      ) OR (
        "country_development_tracks"."metric" NOT IN ('laborUnions', 'religiousFreedom', 'judicialIndependence') AND "country_development_tracks"."stage" BETWEEN 1 AND 5
      ));--> statement-breakpoint
INSERT INTO "country_development_tracks" ("country_id", "metric", "stage", "progress")
SELECT "countries"."id", "institutions"."metric", 3, 0
FROM "countries"
CROSS JOIN (
	VALUES
		('pressFreedom'),
		('religiousFreedom'),
		('laborUnions'),
		('assemblyFreedom'),
		('suffrage'),
		('partySystem'),
		('judicialIndependence')
) AS "institutions"("metric")
ON CONFLICT ("country_id", "metric") DO NOTHING;
