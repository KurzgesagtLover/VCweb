import { describe, expect, it } from "vitest";
import { accruePoliticalPower } from "@/src/domain/politics/political-power";

describe("real-time political power", () => {
  it("pays political power continuously from elapsed real time", () => {
    const result = accruePoliticalPower({
      balance: "100",
      incomePerGameDay: "0.1",
      elapsedRealSeconds: 3_600,
      clock: { gameTimePerRealDayValue: 365, gameTimePerRealDayUnit: "DAY" },
    });

    expect(result.balance.toDecimalPlaces(6).toString()).toBe("101.520833");
  });

  it("caps the real-time balance at one thousand", () => {
    const result = accruePoliticalPower({
      balance: "999.9",
      incomePerGameDay: "1",
      elapsedRealSeconds: 86_400,
      clock: { gameTimePerRealDayValue: 365, gameTimePerRealDayUnit: "DAY" },
    });

    expect(result.balance.toString()).toBe("1000");
  });
});
