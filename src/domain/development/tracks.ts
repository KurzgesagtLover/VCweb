import Decimal from "decimal.js";

export const DEVELOPMENT_STAGE_MIN = 1;
export const DEVELOPMENT_STAGE_MAX = 5;
export const DEVELOPMENT_PROGRESS_BOUNDARY = 150;
export const DEFAULT_DEVELOPMENT_STAGE = 3;

const FIVE_GENERIC_STAGES = ["1단계", "2단계", "3단계", "4단계", "5단계"] as const;

export const DEVELOPMENT_METRICS = [
  { key: "literacy", label: "문해율", higherIsBetter: true, stages: FIVE_GENERIC_STAGES },
  { key: "poverty", label: "빈곤율", higherIsBetter: false, stages: FIVE_GENERIC_STAGES },
  {
    key: "agriculturalSelfSufficiency",
    label: "농업 자생력",
    higherIsBetter: true,
    stages: FIVE_GENERIC_STAGES,
  },
  {
    key: "factoryEquipment",
    label: "공장 설비",
    higherIsBetter: true,
    stages: FIVE_GENERIC_STAGES,
  },
  {
    key: "industrialExpertise",
    label: "산업 전문성",
    higherIsBetter: true,
    stages: FIVE_GENERIC_STAGES,
  },
  {
    key: "researchFacilities",
    label: "연구 시설",
    higherIsBetter: true,
    stages: FIVE_GENERIC_STAGES,
  },
  {
    key: "academicFoundation",
    label: "학문 기반",
    higherIsBetter: true,
    stages: FIVE_GENERIC_STAGES,
  },
] as const;

export const SOCIAL_INSTITUTIONS = [
  {
    key: "pressFreedom",
    label: "언론 자유",
    higherIsBetter: true,
    stages: ["언론 부재", "관제 언론", "통제적 독립 언론", "제약적 독립 언론", "자유 언론"],
  },
  {
    key: "religiousFreedom",
    label: "종교적 자유",
    higherIsBetter: true,
    stages: ["종교 탄압", "종교 금지", "제한적 종교 자유", "종교 자유"],
  },
  {
    key: "laborUnions",
    label: "노동조합",
    higherIsBetter: true,
    stages: [
      "노조 금지",
      "관제노조",
      "허가제 독립노조",
      "제약된 독립노조",
      "자유노조",
      "노동권 보장",
      "산업민주주의",
    ],
  },
  {
    key: "assemblyFreedom",
    label: "집회 및 시위",
    higherIsBetter: true,
    stages: ["집회 금지", "관제집회", "허가제 집회", "제한된 자유집회", "자유집회"],
  },
  {
    key: "suffrage",
    label: "참정권",
    higherIsBetter: true,
    stages: ["선거 없음", "간접선거", "불평등선거", "보통선거", "직접참정"],
  },
  {
    key: "partySystem",
    label: "정당제도",
    higherIsBetter: true,
    stages: ["정당 금지", "일당제", "관제 야당", "허가제 야당", "다당제"],
  },
  {
    key: "judicialIndependence",
    label: "사법 독립",
    higherIsBetter: true,
    stages: ["행정부 직속", "정치재판", "제약된 사법", "헌법적 사법권"],
  },
] as const;

export const COUNTRY_TRACKS = [...DEVELOPMENT_METRICS, ...SOCIAL_INSTITUTIONS] as const;

export type DevelopmentMetricKey = (typeof COUNTRY_TRACKS)[number]["key"];
export type DevelopmentTrackState = {
  stage: number;
  progress: string;
};

const DEVELOPMENT_METRIC_KEY_SET = new Set<string>(COUNTRY_TRACKS.map((metric) => metric.key));

export function isDevelopmentMetricKey(value: string): value is DevelopmentMetricKey {
  return DEVELOPMENT_METRIC_KEY_SET.has(value);
}

export function developmentMetricDefinition(metric: DevelopmentMetricKey) {
  const definition = COUNTRY_TRACKS.find((candidate) => candidate.key === metric);
  if (!definition) throw new Error("국가 발전 지표를 찾을 수 없습니다.");
  return definition;
}

export function advanceDevelopmentTrack(
  current: DevelopmentTrackState,
  delta: Decimal.Value,
  maximumStage = DEVELOPMENT_STAGE_MAX,
): DevelopmentTrackState {
  if (
    !Number.isInteger(maximumStage) ||
    maximumStage < DEVELOPMENT_STAGE_MIN ||
    !Number.isInteger(current.stage) ||
    current.stage < DEVELOPMENT_STAGE_MIN ||
    current.stage > maximumStage
  ) {
    throw new Error(`발전 단계는 1단계부터 ${maximumStage}단계 사이여야 합니다.`);
  }

  let progress = new Decimal(current.progress).plus(delta);
  if (!progress.isFinite()) throw new Error("발전 진척도는 유효한 숫자여야 합니다.");

  let stage = current.stage;
  while (progress.gte(DEVELOPMENT_PROGRESS_BOUNDARY) && stage < maximumStage) {
    stage += 1;
    progress = progress.minus(DEVELOPMENT_PROGRESS_BOUNDARY);
  }
  while (progress.lte(-DEVELOPMENT_PROGRESS_BOUNDARY) && stage > DEVELOPMENT_STAGE_MIN) {
    stage -= 1;
    progress = progress.plus(DEVELOPMENT_PROGRESS_BOUNDARY);
  }

  progress = Decimal.max(
    -DEVELOPMENT_PROGRESS_BOUNDARY,
    Decimal.min(DEVELOPMENT_PROGRESS_BOUNDARY, progress),
  );

  return { stage, progress: progress.toDecimalPlaces(4).toString() };
}

export function defaultDevelopmentTrackRows(countryId: string) {
  return COUNTRY_TRACKS.map((metric) => ({
    countryId,
    metric: metric.key,
    stage: DEFAULT_DEVELOPMENT_STAGE,
    progress: "0",
  }));
}

type TrackDefinition = {
  key: string;
  label: string;
  higherIsBetter: boolean;
  stages: readonly string[];
};

function mergeTrackGroup(
  rows: Array<{ metric: string; stage: number; progress: string }>,
  definitions: readonly TrackDefinition[],
) {
  const byMetric = new Map(rows.map((row) => [row.metric, row]));
  return definitions.map((definition) => {
    const row = byMetric.get(definition.key);
    const stage = row?.stage ?? DEFAULT_DEVELOPMENT_STAGE;
    return {
      ...definition,
      maxStage: definition.stages.length,
      stage,
      stageLabel: definition.stages[stage - 1],
      progress: row?.progress ?? "0",
    };
  });
}

export function mergeDevelopmentTracks(
  rows: Array<{ metric: string; stage: number; progress: string }>,
) {
  return mergeTrackGroup(rows, DEVELOPMENT_METRICS);
}

export function mergeSocialInstitutionTracks(
  rows: Array<{ metric: string; stage: number; progress: string }>,
) {
  return mergeTrackGroup(rows, SOCIAL_INSTITUTIONS);
}
