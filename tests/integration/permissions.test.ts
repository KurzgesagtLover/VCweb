import { describe, expect, it } from "vitest";
import {
  canManageSimulation,
  canModerate,
  canViewPrivateCountry,
  hasRole,
  roles,
} from "../../src/auth/permissions";

describe("server authorization matrix", () => {
  it("distinguishes all global roles", () => {
    expect(roles).toEqual(["USER", "PLAYER", "MODERATOR", "ADMIN"]);
    expect(hasRole("USER", "PLAYER")).toBe(false);
    expect(hasRole("PLAYER", "PLAYER")).toBe(true);
    expect(canModerate("MODERATOR")).toBe(true);
    expect(canManageSimulation("MODERATOR")).toBe(false);
    expect(canManageSimulation("ADMIN")).toBe(true);
  });

  it("allows only the assigned user or admin to see private country data", () => {
    expect(canViewPrivateCountry({ role: "PLAYER", userId: "one", assignedUserId: "one" })).toBe(
      true,
    );
    expect(canViewPrivateCountry({ role: "PLAYER", userId: "two", assignedUserId: "one" })).toBe(
      false,
    );
    expect(canViewPrivateCountry({ role: "ADMIN", userId: "admin", assignedUserId: "one" })).toBe(
      true,
    );
  });
});
