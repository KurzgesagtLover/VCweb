ALTER TABLE "campaign_maps" ALTER COLUMN "adaptive_resolution" SET DEFAULT false;
UPDATE "campaign_maps" SET "adaptive_resolution" = false;
