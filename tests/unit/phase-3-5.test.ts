import { cellToCenterChild, cellToParent, getNumCells, latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { judgmentProposalSchema } from "../../src/ai/judgment-schema";
import { FakeAIProvider } from "../../src/ai/providers";
import { parseAiRoute } from "../../src/ai/catalog";
import { diplomacyResponseSchema, turnEventSchema } from "../../src/ai/task-schemas";
import { validateEffect } from "../../src/domain/effects/registry";
import { evaluateTrigger } from "../../src/domain/events/trigger";
import {
  getMapTileResolution,
  getMinimumSafeTileZoom,
  GLOBAL_MAP_H3_RESOLUTION,
  MAP_H3_RESOLUTIONS,
} from "../../src/domain/map/grid";
import { getMapCellCandidates } from "../../src/domain/map/hierarchy";
import {
  detectMapColors,
  matchCountryColor,
  parseHexColor,
} from "../../src/domain/map/image-colors";
import { assertMapRevision } from "../../src/domain/map/revision";
import { canTransitionTurn, turnStepKey } from "../../src/domain/turn/state-machine";
import {
  adjudicationRealDayInterval,
  addGameDuration,
  advanceTurnDeadline,
  formatAdjudicationCadence,
  judgmentEndsAt,
  nextTurnDeadline,
} from "../../src/domain/turn/schedule";

describe("Phase 3 판정과 턴 안전장치", () => {
  it("서울 시간 23시 55분에 마감하고 10분 뒤 판정을 종료한다", () => {
    const beforeClose = new Date("2026-07-21T14:54:00.000Z");
    const deadline = nextTurnDeadline(beforeClose);
    expect(deadline.toISOString()).toBe("2026-07-21T14:55:00.000Z");
    expect(judgmentEndsAt(deadline).toISOString()).toBe("2026-07-21T15:05:00.000Z");
    expect(nextTurnDeadline(deadline).toISOString()).toBe("2026-07-22T14:55:00.000Z");
  });
  it("게임 시간 설정으로 실제 판정 간격과 마감 시각을 계산한다", () => {
    expect(adjudicationRealDayInterval(30, 90)).toBe(3);
    expect(adjudicationRealDayInterval(365, 365)).toBe(1);
    expect(adjudicationRealDayInterval(730, 365)).toBe(0.5);
    expect(adjudicationRealDayInterval(1_095, 365)).toBeCloseTo(1 / 3);
    const deadline = nextTurnDeadline(new Date("2026-07-21T13:00:00.000Z"), 3, 21, 30);
    expect(deadline.toISOString()).toBe("2026-07-24T12:30:00.000Z");
  });
  it("하루 여러 번 또는 여러 날에 한 번 판정할 수 있다", () => {
    const twiceDaily = nextTurnDeadline(new Date("2026-07-21T00:00:00.000Z"), 0.5);
    expect(twiceDaily.toISOString()).toBe("2026-07-21T02:55:00.000Z");
    expect(advanceTurnDeadline(twiceDaily, 0.5).toISOString()).toBe("2026-07-21T14:55:00.000Z");

    const threeTimesDaily = nextTurnDeadline(new Date("2026-07-21T00:00:00.000Z"), 1 / 3);
    expect(threeTimesDaily.toISOString()).toBe("2026-07-21T06:55:00.000Z");
    expect(formatAdjudicationCadence(1 / 3)).toBe("하루 3회 · 07:55 · 15:55 · 23:55");

    const everyTwoDays = nextTurnDeadline(new Date("2026-07-21T14:55:00.000Z"), 2);
    expect(everyTwoDays.toISOString()).toBe("2026-07-23T14:55:00.000Z");
    expect(formatAdjudicationCadence(2)).toBe("2일마다 · 기준 23:55");
  });
  it("게임 시간 단위를 일, 개월, 년으로 바꿔 정확히 분할한다", () => {
    expect(adjudicationRealDayInterval(1, 6, "YEAR", "MONTH")).toBe(0.5);
    expect(adjudicationRealDayInterval(1, 4, "YEAR", "MONTH")).toBeCloseTo(1 / 3);
    expect(adjudicationRealDayInterval(1, 2, "YEAR", "YEAR")).toBe(2);
    expect(addGameDuration(new Date("2080-01-01T00:00:00.000Z"), 4, "MONTH").toISOString()).toBe(
      "2080-05-01T00:00:00.000Z",
    );
  });
  it("효과 대상, 범위, 기간을 허용 목록으로 제한한다", () => {
    expect(
      validateEffect({
        targetType: "COUNTRY",
        targetId: "country-1",
        metric: "stability",
        operation: "ADD",
        value: 4,
        durationTurns: 2,
        reason: "정책 효과",
      }).valid,
    ).toBe(true);
    expect(
      validateEffect({
        targetType: "COUNTRY",
        targetId: "country-1",
        metric: "stability",
        operation: "ADD",
        value: 99,
        durationTurns: 2,
        reason: "과도한 효과",
      }).valid,
    ).toBe(false);
    expect(
      validateEffect({
        targetType: "COUNTRY",
        targetId: "country-1",
        metric: "unknown",
        operation: "ADD",
        value: 1,
        durationTurns: 99,
        reason: "잘못된 효과",
      }).valid,
    ).toBe(false);
  });

  it("Fake 공급자 출력이 판정 스키마를 통과한다", async () => {
    const result = await new FakeAIProvider().generateStructured({
      model: "fake-judgment-v1",
      system: "test",
      payload: { countryId: "country-1", title: "산업 전환" },
      schema: {},
      timeoutMs: 1000,
      idempotencyKey: "same-input",
    });
    expect(judgmentProposalSchema.safeParse(result.data).success).toBe(true);
    expect(result.provider).toBe("fake");
  });

  it("지원 모델 조합만 AI 작업 경로로 허용한다", () => {
    expect(parseAiRoute("opencode_go:deepseek-v4-pro")).toEqual({
      provider: "opencode_go",
      model: "deepseek-v4-pro",
    });
    expect(parseAiRoute("openai:gpt-5.6-luna")).toEqual({
      provider: "openai",
      model: "gpt-5.6-luna",
    });
    expect(parseAiRoute("openai:deepseek-v4-pro")).toBeNull();
  });

  it("내장 공급자가 사건과 외교 응답 스키마도 충족한다", async () => {
    const provider = new FakeAIProvider();
    const base = {
      model: "built-in",
      system: "test",
      payload: { countryId: "country-1" },
      schema: {},
      timeoutMs: 1_000,
      idempotencyKey: "task-test",
    };
    const event = await provider.generateStructured({
      ...base,
      taskType: "GENERATE_TURN_EVENT",
    });
    const diplomacy = await provider.generateStructured({
      ...base,
      taskType: "GENERATE_AI_DIPLOMACY_RESPONSE",
    });
    expect(turnEventSchema.safeParse(event.data).success).toBe(true);
    expect(diplomacyResponseSchema.safeParse(diplomacy.data).success).toBe(true);
  });

  it("턴 전이와 단계 키가 결정론적이다", () => {
    expect(canTransitionTurn("DRAFT", "LOCKED")).toBe(true);
    expect(canTransitionTurn("DRAFT", "PUBLISHED")).toBe(false);
    expect(turnStepKey("campaign", "turn", "LOCK")).toBe("campaign:turn:LOCK");
  });
});

describe("Phase 4 사건 조건", () => {
  it("허용된 조건식만 조합해 평가한다", () => {
    expect(
      evaluateTrigger(
        { all: [{ metric: "unrest", gte: 50 }, { hasTech: "mass-media" }] },
        { metrics: { unrest: 62 }, technologies: new Set(["mass-media"]), flags: {} },
      ),
    ).toBe(true);
    expect(() =>
      evaluateTrigger(
        { script: "process.exit()" },
        { metrics: {}, technologies: new Set(), flags: {} },
      ),
    ).toThrow();
  });
});

describe("Phase 5 지도", () => {
  const palette = [
    { value: "alpha", rgb: parseHexColor("#c63c42")! },
    { value: "beta", rgb: parseHexColor("#3976c6")! },
  ];

  it("검은색과 투명 픽셀은 국경으로 제외한다", () => {
    expect(matchCountryColor([0, 0, 0, 255], palette)).toEqual({ kind: "border" });
    expect(matchCountryColor([200, 30, 30, 0], palette)).toEqual({ kind: "border" });
  });

  it("지도 이미지에서 검은 국경을 제외하고 고유 색상을 검출한다", () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255]);
    const result = detectMapColors(pixels, 2, 2, 4);
    expect(result.colors.map(({ hex }) => hex)).toEqual(["#F80000", "#00F800"]);
    expect(result.borderSamples).toBe(1);
  });

  it("동일하거나 가까운 국가 색상을 인식하고 무관한 색은 제외한다", () => {
    expect(matchCountryColor([198, 60, 66, 255], palette)).toEqual({
      kind: "country",
      value: "alpha",
    });
    expect(matchCountryColor([60, 120, 200, 255], palette)).toEqual({
      kind: "country",
      value: "beta",
    });
    expect(matchCountryColor([255, 255, 255, 255], palette)).toEqual({ kind: "unmatched" });
  });

  it("전 세계 지도는 수십만 개 H3 셀을 사용한다", () => {
    expect(getNumCells(GLOBAL_MAP_H3_RESOLUTION)).toBe(288_122);
  });

  it("지도 해상도 1~8을 지원하고 축소 단계에서는 가벼운 타일을 사용한다", () => {
    expect(MAP_H3_RESOLUTIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(getMapTileResolution(8, 0)).toBe(2);
    expect(getMapTileResolution(8, 10)).toBe(8);
    expect(getMapTileResolution(3, 9)).toBe(3);
  });

  it("세밀한 셀은 상위 영토를 상속하고 축소 셀은 기준 셀을 참조한다", () => {
    const fineCell = latLngToCell(37.5665, 126.978, 8);
    expect(getMapCellCandidates(fineCell)).toContain(cellToParent(fineCell, 4));

    const overviewCell = latLngToCell(37.5665, 126.978, 2);
    expect(getMapCellCandidates(overviewCell)).toContain(cellToCenterChild(overviewCell, 4));
  });

  it("fixed high-resolution tiles wait for a safe zoom level", () => {
    expect(getMinimumSafeTileZoom(4)).toBe(4);
    expect(getMinimumSafeTileZoom(6)).toBe(6);
    expect(getMinimumSafeTileZoom(8)).toBe(9);
  });

  it("오래된 지도 리비전 저장을 거절한다", () => {
    expect(() => assertMapRevision(2, 3)).toThrow("지도 리비전 충돌");
    expect(() => assertMapRevision(3, 3)).not.toThrow();
  });
});
