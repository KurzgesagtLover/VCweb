ALTER TABLE "economic_snapshots" ALTER COLUMN "currency_code" SET DEFAULT 'USD';--> statement-breakpoint
UPDATE "economic_snapshots" SET "currency_code" = 'USD' WHERE "currency_code" <> 'USD';--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_currency_code_usd_check" CHECK ("economic_snapshots"."currency_code" = 'USD');
