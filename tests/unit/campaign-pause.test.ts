import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { campaignNow, currentGameInstant } from "@/src/domain/turn/schedule";

const HOUR = 3_600_000;

describe("campaign pause", () => {
  const turn = {
    gameDateStart: "2042-01-01",
    gameDateEnd: "2042-03-31",
    deadlineAt: new Date("2042-06-01T12:00:00.000Z"),
    intervalRealDays: 1,
  };

  it("freezes the real clock at the pause instant", () => {
    const pausedAt = new Date("2042-06-01T00:00:00.000Z");
    const later = new Date(pausedAt.getTime() + 5 * HOUR);
    expect(campaignNow(later, pausedAt)).toBe(pausedAt);
    expect(campaignNow(later, null)).toBe(later);
    expect(campaignNow(new Date(pausedAt.getTime() - HOUR), pausedAt).getTime()).toBe(
      pausedAt.getTime() - HOUR,
    );
  });

  it("stops game time while paused and continues from the same instant after the shift", () => {
    const pausedAt = new Date("2042-06-01T00:00:00.000Z");
    const atPause = currentGameInstant({ ...turn, now: pausedAt });
    const whilePaused = currentGameInstant({
      ...turn,
      now: new Date(pausedAt.getTime() + 5 * HOUR),
      pausedAt,
    });
    expect(whilePaused?.getTime()).toBe(atPause?.getTime());

    // 재개하면 마감을 멈춘 시간만큼 미룬다.
    const resumedAt = new Date(pausedAt.getTime() + 5 * HOUR);
    const shifted = { ...turn, deadlineAt: new Date(turn.deadlineAt.getTime() + 5 * HOUR) };
    expect(currentGameInstant({ ...shifted, now: resumedAt })?.getTime()).toBe(atPause?.getTime());
    const hourLater = currentGameInstant({ ...shifted, now: new Date(resumedAt.getTime() + HOUR) });
    expect(new Decimal(hourLater!.getTime()).gt(atPause!.getTime())).toBe(true);
  });
});
