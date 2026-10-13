/**
 * 기술 파이프라인 1·2단계: 교육 → 고급 인력 → 연구 역량.
 *
 * 1) 대학 진학률: 소득, 학문 기반·문해율 단계, 대학 시설, 교육·연구 예산 구간으로 목표치가 정해지고
 *    실제 진학률은 해마다 목표 쪽으로 따라간다.
 * 2) 학사 이상 인력: 졸업생이 쌓이고 은퇴로 빠진다(연 1/40).
 * 3) 연구 인력: 학사 이상 인력 × 이공계 비율 × 연구 집약도(R&D 지출/GDP).
 * 4) 연구 역량: 연구 인력과 R&D 지출의 체감 함수에 국책연구소·연구시설을 곱한 연간 연구 포인트.
 *    분야별로는 관련 산업 비중과 전문 연구시설이 배율을 더한다.
 *
 * 기준 국가(인구 2,840만, 1인당 4만 달러대, R&D 2.5%)는 연 150포인트 안팎이다.
 */

import type { BudgetTierKey } from "../economy/budget-coverage";
import { STANDARD_ECONOMIC_SECTORS } from "../economy/sectors";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number | null | undefined, fallback: number) =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : fallback;

export const RETIREMENT_RATE_PER_YEAR = 1 / 40;
export const COMPLETION_RATE = 0.8;
const UNIVERSITY_COHORTS = 7;

const EDUCATION_TIER_FACTOR: Record<BudgetTierKey, number> = {
  PARALYSIS: 0.7,
  GAP: 0.88,
  NORMAL: 1,
  EXPANSION: 1.06,
  BLOAT: 1.08,
};

/** 1인당 소득 2천 달러 → 0, 6만 달러 → 1 */
export function incomeScore(gdpPerCapita: number | null) {
  const value = finite(gdpPerCapita, 20_000);
  if (value <= 0) return 0;
  return clamp((Math.log(value) - Math.log(2_000)) / (Math.log(60_000) - Math.log(2_000)), 0, 1);
}

export type HumanCapitalState = {
  tertiaryWorkers: number;
  enrollmentRate: number;
};

export type EducationInput = {
  universityAge: number;
  workingAge: number;
  previous: HumanCapitalState | null;
  gdpPerCapita: number | null;
  /** 학문 기반 단계(1~5) */
  academicStage: number;
  /** 문해율 단계(1~5) */
  literacyStage: number;
  /** 대학 시설 단계 합 */
  universityLevels: number;
  /** 교육·연구 예산 구간 */
  educationTier: BudgetTierKey | null;
  years: number;
};

export function enrollmentTarget(input: EducationInput) {
  const base =
    0.08 +
    0.55 * incomeScore(input.gdpPerCapita) +
    0.06 * (finite(input.academicStage, 3) - 3) +
    0.03 * (finite(input.literacyStage, 3) - 3) +
    Math.min(0.1, 0.01 * Math.max(0, finite(input.universityLevels, 0)));
  const tier = input.educationTier ? EDUCATION_TIER_FACTOR[input.educationTier] : 1;
  return clamp(base * tier, 0.03, 0.9);
}

export function initialTertiaryShare(
  input: Pick<EducationInput, "gdpPerCapita" | "academicStage">,
) {
  return clamp(
    0.04 + 0.45 * incomeScore(input.gdpPerCapita) + 0.03 * (finite(input.academicStage, 3) - 3),
    0.02,
    0.6,
  );
}

/** 한 계산 기간 동안의 진학·졸업·고급 인력 변화 */
export function advanceEducation(input: EducationInput) {
  const years = Math.max(0, finite(input.years, 0));
  const target = enrollmentTarget(input);
  const workingAge = Math.max(0, finite(input.workingAge, 0));
  const initialized = !input.previous;
  const previousRate = input.previous ? clamp(input.previous.enrollmentRate, 0, 1) : target;
  const enrollmentRate = previousRate + (target - previousRate) * (1 - Math.pow(0.75, years));
  const graduatesPerYear =
    (Math.max(0, finite(input.universityAge, 0)) / UNIVERSITY_COHORTS) *
    enrollmentRate *
    COMPLETION_RATE;
  const startStock = input.previous
    ? Math.max(0, input.previous.tertiaryWorkers)
    : workingAge * initialTertiaryShare(input);
  const tertiaryWorkers = Math.min(
    workingAge * 0.85,
    startStock * (1 - RETIREMENT_RATE_PER_YEAR * years) + graduatesPerYear * years,
  );
  return {
    initialized,
    enrollmentTarget: target,
    enrollmentRate,
    graduatesPerYear,
    tertiaryWorkers: Math.max(0, tertiaryWorkers),
    tertiaryShare: workingAge > 0 ? Math.max(0, tertiaryWorkers) / workingAge : 0,
  };
}

/** 연구 분야와 관련 산업 부문 */
export const FIELD_SECTORS: Record<string, string[]> = {
  에너지: ["ENE"],
  산업: ["MFG", "GMF"],
  정보: ["DIG"],
  생명: ["AGR", "PUB"],
  사회: ["PUB"],
  인프라: ["CON"],
};

/** 분야별로 연구를 돕는 전문 연구시설(단계당 +10%, 최대 +30%) */
export const FIELD_FACILITIES: Record<string, string[]> = {
  에너지: ["fusion_research_facility", "proton_accelerator"],
  산업: ["synchrotron_accelerator", "heavy_ion_accelerator"],
  정보: ["synchrotron_accelerator"],
  생명: ["biological_research_facility"],
  사회: [],
  인프라: ["astronomical_observatory"],
};

const DEFAULT_SECTOR_SHARE = new Map<string, number>(
  STANDARD_ECONOMIC_SECTORS.map((sector) => [sector.code, Number(sector.defaultShare)]),
);

export function fieldFactor(
  field: string,
  sectorShares: Record<string, number>,
  facilityLevels: Record<string, number>,
) {
  const sectors = FIELD_SECTORS[field];
  let factor = 1;
  if (sectors?.length) {
    const actual = sectors.reduce((sum, code) => sum + finite(sectorShares[code], 0), 0);
    const reference = sectors.reduce((sum, code) => sum + (DEFAULT_SECTOR_SHARE.get(code) ?? 0), 0);
    if (actual > 0 && reference > 0) factor = clamp(Math.pow(actual / reference, 0.35), 0.75, 1.3);
  }
  const facilities = FIELD_FACILITIES[field] ?? [];
  const facilityBonus = Math.min(
    0.3,
    facilities.reduce((sum, type) => sum + 0.1 * Math.max(0, finite(facilityLevels[type], 0)), 0),
  );
  return Math.round(factor * (1 + facilityBonus) * 10_000) / 10_000;
}

export type ResearchCapacityInput = {
  tertiaryWorkers: number;
  /** 학문 기반 단계(1~5). 이공계 비율에 쓴다 */
  academicStage: number;
  /** 명목 GDP($1M) */
  gdpMillions: number;
  /** 국가 R&D 집약도(GDP 대비) */
  researchInvestmentRate: number;
  /** 교육·연구 예산 구간 */
  educationTier: BudgetTierKey | null;
  /** 주요 기업 R&D 지출 합($1M) */
  corporateRdMillions: number;
  /** 국책연구소 단계 합 */
  instituteLevels: number;
  /** 연구 시설 발전 단계(1~5) */
  researchFacilityStage: number;
};

const REFERENCE_RESEARCHERS = 75_000;
const REFERENCE_RD_MILLIONS = 30_000;
const REFERENCE_POINTS_PER_YEAR = 150;

export function researchCapacity(input: ResearchCapacityInput) {
  const tier = input.educationTier ? EDUCATION_TIER_FACTOR[input.educationTier] : 1;
  const gdp = Math.max(0, finite(input.gdpMillions, 0));
  const nationalRd = gdp * clamp(finite(input.researchInvestmentRate, 0.025), 0, 0.2) * tier;
  const rdSpendingMillions = nationalRd + 0.3 * Math.max(0, finite(input.corporateRdMillions, 0));
  const intensity = gdp > 0 ? clamp(0.02 + 1.2 * (rdSpendingMillions / gdp), 0.01, 0.12) : 0.02;
  const stemShare = clamp(0.25 + 0.03 * (finite(input.academicStage, 3) - 3), 0.15, 0.4);
  const researchers = Math.max(0, finite(input.tertiaryWorkers, 0)) * stemShare * intensity;
  const institutes = 1 + Math.min(0.6, 0.03 * Math.max(0, finite(input.instituteLevels, 0)));
  const facilities = clamp(1 + 0.05 * (finite(input.researchFacilityStage, 3) - 3), 0.85, 1.15);
  const pointsPerYear =
    researchers > 0 && rdSpendingMillions > 0
      ? REFERENCE_POINTS_PER_YEAR *
        Math.pow(researchers / REFERENCE_RESEARCHERS, 0.4) *
        Math.pow(rdSpendingMillions / REFERENCE_RD_MILLIONS, 0.3) *
        institutes *
        facilities
      : 0;
  return {
    rdSpendingMillions: Math.round(rdSpendingMillions * 100) / 100,
    researchIntensity: Math.round(intensity * 10_000) / 10_000,
    stemShare,
    researchers: Math.round(researchers),
    institutesFactor: institutes,
    facilitiesFactor: facilities,
    pointsPerYear: Math.round(pointsPerYear * 100) / 100,
  };
}
