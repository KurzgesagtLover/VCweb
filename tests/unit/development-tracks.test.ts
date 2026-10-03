import { describe, expect, it } from "vitest";
import { advanceDevelopmentTrack } from "../../src/domain/development/tracks";
import { validateEffect } from "../../src/domain/effects/registry";

describe("development tracks", () => {
  it("keeps progress inside the current stage before a boundary", () => {
    expect(advanceDevelopmentTrack({ stage: 3, progress: "0" }, 149)).toEqual({
      stage: 3,
      progress: "149",
    });
  });

  it("moves to the next stage at 150 and resets progress", () => {
    expect(advanceDevelopmentTrack({ stage: 3, progress: "120" }, 30)).toEqual({
      stage: 4,
      progress: "0",
    });
  });

  it("moves to the previous stage at -150 and resets progress", () => {
    expect(advanceDevelopmentTrack({ stage: 3, progress: "-120" }, -30)).toEqual({
      stage: 2,
      progress: "0",
    });
  });

  it("carries overflow into the new stage", () => {
    expect(advanceDevelopmentTrack({ stage: 2, progress: "100" }, 100)).toEqual({
      stage: 3,
      progress: "50",
    });
  });

  it("clamps at the upper and lower terminal stages", () => {
    expect(advanceDevelopmentTrack({ stage: 5, progress: "140" }, 20)).toEqual({
      stage: 5,
      progress: "150",
    });
    expect(advanceDevelopmentTrack({ stage: 1, progress: "-140" }, -20)).toEqual({
      stage: 1,
      progress: "-150",
    });
  });

  it("supports four-stage social institutions", () => {
    expect(advanceDevelopmentTrack({ stage: 3, progress: "0" }, 150, 4)).toEqual({
      stage: 4,
      progress: "0",
    });
    expect(advanceDevelopmentTrack({ stage: 4, progress: "140" }, 20, 4)).toEqual({
      stage: 4,
      progress: "150",
    });
  });

  it("supports seven-stage social institutions", () => {
    expect(advanceDevelopmentTrack({ stage: 5, progress: "100" }, 50, 7)).toEqual({
      stage: 6,
      progress: "0",
    });
  });

  it("accepts social institution progress as a country effect", () => {
    expect(
      validateEffect({
        targetType: "COUNTRY",
        targetId: "country-1",
        metric: "pressFreedom",
        operation: "ADD",
        value: 50,
        durationTurns: 2,
        reason: "언론 제도 개혁",
      }).valid,
    ).toBe(true);
  });
});
