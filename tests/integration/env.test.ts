import { describe, expect, it } from "vitest";
import { validateEnv } from "../../src/config/env";

describe("environment validation", () => {
  it("accepts the documented local variables", () => {
    expect(
      validateEnv({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        BETTER_AUTH_SECRET: "x".repeat(32),
        APP_BASE_URL: "http://localhost:3000",
      }).success,
    ).toBe(true);
  });

  it("rejects missing secrets and non-PostgreSQL URLs", () => {
    expect(
      validateEnv({
        DATABASE_URL: "https://example.com",
        BETTER_AUTH_SECRET: "short",
        APP_BASE_URL: "not-a-url",
      }).success,
    ).toBe(false);
  });
});
