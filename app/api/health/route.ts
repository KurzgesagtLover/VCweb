import { sql } from "drizzle-orm";
import { db } from "@/src/db";

export async function GET() {
  try {
    const result = await db.execute(sql`select 1 as ok, postgis_version() as postgis_version`);
    return Response.json({ status: "ok", database: true, postgis: result[0]?.postgis_version });
  } catch {
    return Response.json({ status: "unhealthy", database: false }, { status: 503 });
  }
}
