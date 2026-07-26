import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/src/config/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sqlClient?: ReturnType<typeof postgres> };

export const sqlClient =
  globalForDb.sqlClient ??
  postgres(getEnv().DATABASE_URL, {
    max: process.env.NODE_ENV === "production" ? 10 : 4,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sqlClient = sqlClient;

export const db = drizzle(sqlClient, { schema, casing: "snake_case" });
