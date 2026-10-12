ALTER TABLE "demographic_snapshots" ADD COLUMN "age_structure" jsonb;--> statement-breakpoint
ALTER TABLE "demographic_snapshots" ADD COLUMN "net_migration_rate" numeric(10, 7);
