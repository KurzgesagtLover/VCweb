import { describe, expect, it } from "vitest";
import {
  canPostChatChannel,
  canReadChatChannel,
  remainingTimeoutMs,
} from "@/src/domain/chat/policy";
import { SlidingWindowRateLimiter } from "@/src/services/rate-limit";

describe("chat permissions", () => {
  it("allows a player to read and post only to their own country channel", () => {
    expect(
      canPostChatChannel({
        role: "PLAYER",
        assignedCountryId: "a",
        channelType: "COUNTRY",
        channelCountryId: "a",
      }),
    ).toBe(true);
    expect(
      canReadChatChannel({
        role: "PLAYER",
        assignedCountryId: "a",
        channelType: "COUNTRY",
        channelCountryId: "b",
      }),
    ).toBe(false);
  });

  it("keeps announcements read-only for players and moderators", () => {
    const input = {
      assignedCountryId: null,
      channelType: "ANNOUNCEMENT" as const,
      channelCountryId: null,
    };
    expect(canPostChatChannel({ ...input, role: "PLAYER" })).toBe(false);
    expect(canPostChatChannel({ ...input, role: "MODERATOR" })).toBe(false);
    expect(canPostChatChannel({ ...input, role: "ADMIN" })).toBe(true);
  });

  it("lets administrators inspect country chat without speaking as a country", () => {
    const input = {
      role: "ADMIN" as const,
      assignedCountryId: null,
      channelType: "COUNTRY" as const,
      channelCountryId: "a",
    };
    expect(canReadChatChannel(input)).toBe(true);
    expect(canPostChatChannel(input)).toBe(false);
  });
});

describe("chat enforcement", () => {
  it("calculates and clears timeout remaining time", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(
      remainingTimeoutMs(
        { type: "TIMEOUT_USER", expiresAt: new Date("2026-01-01T00:05:00Z") },
        now,
      ),
    ).toBe(300_000);
    expect(remainingTimeoutMs({ type: "CLEAR_TIMEOUT", expiresAt: null }, now)).toBe(0);
  });

  it("limits burst requests and permits them after the window", () => {
    const limiter = new SlidingWindowRateLimiter();
    expect(limiter.consume("user", 2, 1_000, 1_000).allowed).toBe(true);
    expect(limiter.consume("user", 2, 1_000, 1_100).allowed).toBe(true);
    expect(limiter.consume("user", 2, 1_000, 1_200).allowed).toBe(false);
    expect(limiter.consume("user", 2, 1_000, 2_101).allowed).toBe(true);
  });
});
