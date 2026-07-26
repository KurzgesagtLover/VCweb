import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://virtual_nation:virtual_nation_dev@localhost:5432/virtual_nation",
  },
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
