import { sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";

async function healthcheck() {
  const result = await db.execute(
    sql`select current_database() as database, postgis_version() as postgis`,
  );
  const row = result[0];
  if (!row?.postgis) throw new Error("PostGIS extension is unavailable.");
  console.log(`Database ${String(row.database)} is healthy; PostGIS ${String(row.postgis)}.`);
}

healthcheck().finally(() => sqlClient.end());
