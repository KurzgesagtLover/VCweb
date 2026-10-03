UPDATE "economic_sectors" AS existing
SET "share" = existing."share" * 0.82,
    "updated_at" = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM "economic_sectors" AS general_manufacturing
  WHERE general_manufacturing."country_id" = existing."country_id"
    AND general_manufacturing."turn_id" = existing."turn_id"
    AND general_manufacturing."code" = 'GMF'
);
--> statement-breakpoint
INSERT INTO "economic_sectors" (
  "id",
  "country_id",
  "turn_id",
  "code",
  "name",
  "share",
  "production_index",
  "productivity",
  "growth_rate"
)
SELECT
  gen_random_uuid(),
  existing."country_id",
  existing."turn_id",
  'GMF',
  '일반 제조업',
  0.18,
  COALESCE(
    SUM(existing."production_index" * existing."share") / NULLIF(SUM(existing."share"), 0),
    100
  ),
  COALESCE(
    SUM(existing."productivity" * existing."share") / NULLIF(SUM(existing."share"), 0),
    100
  ),
  COALESCE(
    SUM(existing."growth_rate" * existing."share") / NULLIF(SUM(existing."share"), 0),
    0.02
  )
FROM "economic_sectors" AS existing
WHERE NOT EXISTS (
  SELECT 1
  FROM "economic_sectors" AS general_manufacturing
  WHERE general_manufacturing."country_id" = existing."country_id"
    AND general_manufacturing."turn_id" = existing."turn_id"
    AND general_manufacturing."code" = 'GMF'
)
GROUP BY existing."country_id", existing."turn_id"
ON CONFLICT ("country_id", "turn_id", "code") DO NOTHING;
