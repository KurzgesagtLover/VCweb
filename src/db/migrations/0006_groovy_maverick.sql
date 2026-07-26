ALTER TABLE "turn_country_workspaces" ADD COLUMN "before_demographic" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_country_workspaces" ADD COLUMN "after_demographic" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD COLUMN "credit_rating_agency" text DEFAULT '국가신용평가원' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "health" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "industry_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
INSERT INTO "financial_institutions" ("country_id", "name", "systemic_importance", "health", "industry_tags")
SELECT c."id", c."name" || ' 중앙은행', 95, 75, ARRAY['중앙은행', '통화정책']::text[]
FROM "countries" c
WHERE EXISTS (SELECT 1 FROM "economic_snapshots" e WHERE e."country_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "financial_institutions" f WHERE f."country_id" = c."id");--> statement-breakpoint
INSERT INTO "major_companies" ("country_id", "name", "industry", "size_index", "state_owned", "systemic_importance", "health", "industry_tags")
SELECT c."id",
       c."code" || ' 기간산업공사',
       COALESCE(p."major_industries"[1], '기간산업'),
       80,
       true,
       85,
       72,
       ARRAY[COALESCE(p."major_industries"[1], '기간산업'), '기간산업']::text[]
FROM "countries" c
LEFT JOIN "country_profile_revisions" p ON p."id" = c."current_profile_revision_id"
WHERE EXISTS (SELECT 1 FROM "economic_snapshots" e WHERE e."country_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "major_companies" m WHERE m."country_id" = c."id");
