/**
 * 연령 구조 인구 모델 (Superpower 2식).
 *
 * 0~99세는 1세 단위, 마지막 칸은 100세 이상이다. 한 턴마다
 * 1) 연령별 사망 확률로 사망자를 빼고, 2) 턴 길이만큼 다음 나이로 옮기고,
 * 3) 가임기 여성(15~49세)과 합계출산율로 출생아를 더하고, 4) 순이동을 젊은 성인 연령에 나눠 더한다.
 *
 * 사망률은 기대수명에 맞춰 보정한 곰페르츠-메이컴 곡선이다. 연령 구조가 없는 국가는
 * 기대수명과 중위연령에 맞는 안정 인구 피라미드로 처음 구조를 만든다.
 */

export const MAX_AGE = 100;
export const COHORT_COUNT = MAX_AGE + 1;
/** 출생 성비 105:100 기준 여성 비율 */
export const FEMALE_SHARE = 100 / 205;
/** 남성 비율. 병력 자원 계산에 쓴다. */
export const MALE_SHARE = 1 - FEMALE_SHARE;
const CHILDBEARING_FIRST_AGE = 15;
const CHILDBEARING_LAST_AGE = 49;
const CHILDBEARING_YEARS = CHILDBEARING_LAST_AGE - CHILDBEARING_FIRST_AGE + 1;

const BACKGROUND_HAZARD = 0.0004;
const GOMPERTZ_SLOPE = 0.095;
const MIN_LIFE_EXPECTANCY = 25;
const MAX_LIFE_EXPECTANCY = 95;

/** 연령별 인구(명). 길이 101, 마지막 칸은 100세 이상. */
export type AgeStructure = number[];

export type MortalitySchedule = {
  /** 연령별 1년 사망 확률 */
  q: number[];
  /** 이 표의 출생 시 기대수명 */
  lifeExpectancy: number;
  /** 연령별 생존 인년(안정 인구 계산용) */
  personYears: number[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 기대수명에 따른 영아 사망 확률. 기대수명 85세 ≈ 0.25%, 55세 ≈ 4%. */
export function infantMortality(lifeExpectancy: number) {
  return clamp(0.0015 + 0.5 * Math.exp(-(lifeExpectancy - 35) / 8), 0.001, 0.3);
}

function buildSchedule(gompertzLevel: number, infant: number): MortalitySchedule {
  const q: number[] = [];
  for (let age = 0; age <= MAX_AGE; age += 1) {
    if (age === 0) {
      q.push(infant);
      continue;
    }
    const childExtra = age <= 4 ? infant * 0.12 * Math.exp(-(age - 1)) : 0;
    const hazard = BACKGROUND_HAZARD + gompertzLevel * Math.exp(GOMPERTZ_SLOPE * age) + childExtra;
    q.push(clamp(1 - Math.exp(-hazard), 0, 1));
  }
  const personYears: number[] = [];
  let survivors = 1;
  let lifeExpectancy = 0;
  for (let age = 0; age < MAX_AGE; age += 1) {
    const next = survivors * (1 - q[age]);
    // 영아 사망은 첫해 초반에 몰린다.
    const lived = age === 0 ? next + 0.15 * (survivors - next) : (survivors + next) / 2;
    personYears.push(lived);
    lifeExpectancy += lived;
    survivors = next;
  }
  const lastHazard = -Math.log(Math.max(1e-9, 1 - q[MAX_AGE]));
  const lastYears = survivors / Math.max(lastHazard, 1e-6);
  personYears.push(lastYears);
  lifeExpectancy += lastYears;
  return { q, lifeExpectancy, personYears };
}

const scheduleCache = new Map<number, MortalitySchedule>();

/** 기대수명에 맞춘 연령별 사망 확률표. */
export function mortalitySchedule(lifeExpectancy: number): MortalitySchedule {
  const target = clamp(
    Number.isFinite(lifeExpectancy) ? lifeExpectancy : 72,
    MIN_LIFE_EXPECTANCY,
    MAX_LIFE_EXPECTANCY,
  );
  const key = Math.round(target * 100) / 100;
  const cached = scheduleCache.get(key);
  if (cached) return cached;
  const infant = infantMortality(key);
  let low = Math.log(1e-9);
  let high = Math.log(0.2);
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (low + high) / 2;
    const schedule = buildSchedule(Math.exp(middle), infant);
    // 곰페르츠 수준이 높을수록 기대수명이 짧아진다.
    if (schedule.lifeExpectancy > key) low = middle;
    else high = middle;
  }
  const schedule = buildSchedule(Math.exp((low + high) / 2), infant);
  if (scheduleCache.size > 512) scheduleCache.clear();
  scheduleCache.set(key, schedule);
  return schedule;
}

export function totalPopulation(structure: AgeStructure) {
  return structure.reduce((sum, value) => sum + value, 0);
}

/** 1세 단위 구간 안에서는 고르게 분포한다고 보고 중위연령을 구한다. */
export function medianAgeOf(structure: AgeStructure) {
  const total = totalPopulation(structure);
  if (!(total > 0)) return 0;
  const half = total / 2;
  let cumulative = 0;
  for (let age = 0; age < structure.length; age += 1) {
    const cohort = structure[age];
    if (cumulative + cohort >= half && cohort > 0) {
      return age + (half - cumulative) / cohort;
    }
    cumulative += cohort;
  }
  return MAX_AGE;
}

function stableShape(schedule: MortalitySchedule, growthRate: number) {
  return schedule.personYears.map(
    (years, age) => years * Math.exp(-growthRate * (age + (age === MAX_AGE ? 2 : 0.5))),
  );
}

/**
 * 기대수명과 중위연령에 맞는 안정 인구 피라미드.
 * 성장률 r을 바꿔 가며 중위연령이 맞을 때까지 찾는다.
 */
export function stableAgeStructure(input: {
  population: number;
  lifeExpectancy: number;
  medianAge: number;
}): AgeStructure {
  const schedule = mortalitySchedule(input.lifeExpectancy);
  const population = Math.max(0, Number.isFinite(input.population) ? input.population : 0);
  const targetMedian = Number.isFinite(input.medianAge) ? input.medianAge : 35;
  let low = -0.06;
  let high = 0.08;
  for (let iteration = 0; iteration < 70; iteration += 1) {
    const middle = (low + high) / 2;
    // 성장률이 높을수록 젊은 인구가 많아 중위연령이 낮아진다.
    if (medianAgeOf(stableShape(schedule, middle)) > targetMedian) low = middle;
    else high = middle;
  }
  const shape = stableShape(schedule, (low + high) / 2);
  const shapeTotal = totalPopulation(shape);
  return shape.map((value) => (shapeTotal > 0 ? (value / shapeTotal) * population : 0));
}

/** 저장값 검증. 길이가 맞고 음수·비유한 값이 없을 때만 받는다. */
export function normalizeAgeStructure(value: unknown): AgeStructure | null {
  if (!Array.isArray(value) || value.length !== COHORT_COUNT) return null;
  const numbers = value.map((item) => Number(item));
  if (numbers.some((item) => !Number.isFinite(item) || item < 0)) return null;
  return numbers;
}

/** 저장용으로 정수로 반올림한다. */
export function roundAgeStructure(structure: AgeStructure) {
  return structure.map((value) => Math.max(0, Math.round(value)));
}

/**
 * 스냅샷의 총인구·중위연령과 저장된 연령 구조를 맞춘다.
 * - 구조가 없으면 안정 인구 피라미드를 만든다.
 * - 관리자가 중위연령을 1세 넘게 바꿨으면 피라미드를 새로 만든다.
 * - 총인구만 바뀌었으면(0.5% 넘게) 비율을 유지한 채 크기만 맞춘다.
 */
export function reconcileAgeStructure(input: {
  structure: unknown;
  population: number;
  medianAge: number;
  lifeExpectancy: number;
}): { structure: AgeStructure; source: "STORED" | "RESCALED" | "REBUILT" | "SYNTHESIZED" } {
  const stored = normalizeAgeStructure(input.structure);
  const population = Math.max(0, Number.isFinite(input.population) ? input.population : 0);
  if (!stored || totalPopulation(stored) <= 0) {
    return {
      structure: stableAgeStructure({
        population,
        lifeExpectancy: input.lifeExpectancy,
        medianAge: input.medianAge,
      }),
      source: "SYNTHESIZED",
    };
  }
  if (Number.isFinite(input.medianAge) && Math.abs(medianAgeOf(stored) - input.medianAge) > 1) {
    return {
      structure: stableAgeStructure({
        population,
        lifeExpectancy: input.lifeExpectancy,
        medianAge: input.medianAge,
      }),
      source: "REBUILT",
    };
  }
  const storedTotal = totalPopulation(stored);
  if (population > 0 && Math.abs(storedTotal / population - 1) > 0.005) {
    return {
      structure: stored.map((value) => (value / storedTotal) * population),
      source: "RESCALED",
    };
  }
  return { structure: stored, source: "STORED" };
}

/** 이민·이주 연령 분포: 15~44세, 27세 정점의 삼각형. */
const MIGRATION_WEIGHTS = (() => {
  const weights = Array.from({ length: COHORT_COUNT }, (_, age) =>
    age >= 15 && age <= 44 ? Math.max(0, 1 - Math.abs(age - 27) / 18) : 0,
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
})();

export type ProjectionInput = {
  /** 진행 기간(연) */
  years: number;
  fertilityRate: number;
  lifeExpectancy: number;
  /** 연간 순이동률(총인구 대비) */
  netMigrationRate?: number;
};

export type ProjectionResult = {
  structure: AgeStructure;
  births: number;
  deaths: number;
  migrants: number;
  population: number;
  /** 기간 성장을 연율로 환산한 값 */
  annualGrowthRate: number;
  medianAge: number;
};

function stepYearFraction(
  structure: AgeStructure,
  fraction: number,
  input: ProjectionInput,
  schedule: MortalitySchedule,
) {
  const start = structure;
  const startTotal = totalPopulation(start);
  let deaths = 0;
  const survivors = start.map((value, age) => {
    const survived = value * Math.pow(1 - schedule.q[age], fraction);
    deaths += value - survived;
    return survived;
  });
  const next = new Array<number>(COHORT_COUNT).fill(0);
  for (let age = 0; age < COHORT_COUNT; age += 1) {
    if (age === MAX_AGE) {
      next[age] += survivors[age];
      continue;
    }
    const moved = survivors[age] * fraction;
    next[age] += survivors[age] - moved;
    next[age + 1] += moved;
  }
  let women = 0;
  for (let age = CHILDBEARING_FIRST_AGE; age <= CHILDBEARING_LAST_AGE; age += 1) {
    women += start[age] * FEMALE_SHARE;
  }
  const fertility = Math.max(0, Number.isFinite(input.fertilityRate) ? input.fertilityRate : 0);
  const births = (fertility / CHILDBEARING_YEARS) * women * fraction;
  const newbornDeaths = births * schedule.q[0] * fraction * 0.5;
  next[0] += births - newbornDeaths;
  deaths += newbornDeaths;

  const migrationRate = Number.isFinite(input.netMigrationRate ?? 0)
    ? (input.netMigrationRate ?? 0)
    : 0;
  let migrants = migrationRate * startTotal * fraction;
  if (migrants < 0) {
    const eligible = MIGRATION_WEIGHTS.reduce(
      (sum, weight, age) => sum + (weight > 0 ? next[age] : 0),
      0,
    );
    migrants = Math.max(migrants, -eligible);
    for (let age = 0; age < COHORT_COUNT; age += 1) {
      if (MIGRATION_WEIGHTS[age] > 0 && eligible > 0) {
        next[age] += migrants * (next[age] / eligible);
      }
    }
  } else if (migrants > 0) {
    for (let age = 0; age < COHORT_COUNT; age += 1) {
      next[age] += migrants * MIGRATION_WEIGHTS[age];
    }
  }
  return {
    structure: next.map((value) => Math.max(0, value)),
    births,
    deaths,
    migrants,
  };
}

/** 연령 구조를 주어진 기간만큼 진행한다. 1년이 넘으면 1년 단위로 나눠 계산한다. */
export function projectAgeStructure(
  structure: AgeStructure,
  input: ProjectionInput,
): ProjectionResult {
  const schedule = mortalitySchedule(input.lifeExpectancy);
  const years = clamp(Number.isFinite(input.years) ? input.years : 1, 0, 50);
  const startTotal = totalPopulation(structure);
  let current = structure.slice();
  let births = 0;
  let deaths = 0;
  let migrants = 0;
  let remaining = years;
  while (remaining > 1e-9) {
    const fraction = Math.min(1, remaining);
    const step = stepYearFraction(current, fraction, input, schedule);
    current = step.structure;
    births += step.births;
    deaths += step.deaths;
    migrants += step.migrants;
    remaining -= fraction;
  }
  const population = totalPopulation(current);
  const annualGrowthRate =
    startTotal > 0 && years > 0 ? Math.pow(population / startTotal, 1 / years) - 1 : 0;
  return {
    structure: current,
    births,
    deaths,
    migrants,
    population,
    annualGrowthRate,
    medianAge: medianAgeOf(current),
  };
}

function sumAges(structure: AgeStructure, from: number, to: number) {
  let total = 0;
  for (let age = Math.max(0, from); age <= Math.min(MAX_AGE, to); age += 1) {
    total += structure[age] ?? 0;
  }
  return total;
}

/** 연령대별 인구와 비율. */
export function ageGroups(structure: AgeStructure) {
  const total = totalPopulation(structure);
  const children = sumAges(structure, 0, 14);
  const working = sumAges(structure, 15, 64);
  const elderly = sumAges(structure, 65, MAX_AGE);
  const share = (value: number) => (total > 0 ? value / total : 0);
  return {
    total,
    children,
    working,
    elderly,
    /** 초중등 학령(6~17세) */
    schoolAge: sumAges(structure, 6, 17),
    /** 대학 진학 연령(18~24세) */
    universityAge: sumAges(structure, 18, 24),
    /** 병역 연령(18~49세) */
    militaryAge: sumAges(structure, 18, 49),
    childShare: share(children),
    workingShare: share(working),
    elderlyShare: share(elderly),
    /** (유소년 + 고령) ÷ 생산가능인구 */
    dependencyRatio: working > 0 ? (children + elderly) / working : 0,
    medianAge: medianAgeOf(structure),
  };
}

/** 체력 기준을 통과하는 병역 연령 남성 비율 */
const FIT_FOR_SERVICE = 0.85;

/**
 * 동원 가능 병력 자원. 징병법의 동원 비율(총인구 대비)을 쓰되,
 * 병역 연령 남성 가운데 복무 가능한 인원을 넘지 못한다.
 */
export function manpowerPool(structure: AgeStructure, manpowerShare: number) {
  const groups = ageGroups(structure);
  const share = Math.max(0, Number.isFinite(manpowerShare) ? manpowerShare : 0);
  const ceiling = groups.militaryAge * MALE_SHARE * FIT_FOR_SERVICE;
  return Math.min(groups.total * share, ceiling);
}

/** 5세 단위로 묶은 피라미드(화면용). */
export function fiveYearBands(structure: AgeStructure) {
  const bands: Array<{ label: string; value: number }> = [];
  for (let start = 0; start < MAX_AGE; start += 5) {
    bands.push({
      label: `${start}–${start + 4}`,
      value: sumAges(structure, start, start + 4),
    });
  }
  bands.push({ label: `${MAX_AGE}+`, value: structure[MAX_AGE] ?? 0 });
  return bands;
}

/** 순이동률 상한(연간, 총인구 대비) */
export const NET_MIGRATION_LIMIT = 0.03;

/**
 * 한 턴의 인구 변화.
 * 저장된 연령 구조를 스냅샷과 맞춘 뒤 진행하고, 순이동률이 없으면
 * 기존 인구 성장률과 자연 증가율의 차이로 역산해 이후 턴에도 유지한다.
 */
export function advanceDemography(input: {
  population: number;
  medianAge: number;
  lifeExpectancy: number;
  fertilityRate: number;
  /** 스냅샷의 연간 인구 성장률. 순이동률 역산에 쓴다. */
  populationGrowthRate: number;
  ageStructure: unknown;
  netMigrationRate: number | null;
  years: number;
  /** 이번 턴만 더하는 일시적 순이동(연율) */
  migrationShock?: number;
}) {
  const reconciled = reconcileAgeStructure({
    structure: input.ageStructure,
    population: input.population,
    medianAge: input.medianAge,
    lifeExpectancy: input.lifeExpectancy,
  });
  let netMigrationRate =
    input.netMigrationRate !== null && Number.isFinite(input.netMigrationRate)
      ? input.netMigrationRate
      : null;
  if (netMigrationRate === null || reconciled.source === "REBUILT") {
    const natural = projectAgeStructure(reconciled.structure, {
      years: 1,
      fertilityRate: input.fertilityRate,
      lifeExpectancy: input.lifeExpectancy,
      netMigrationRate: 0,
    }).annualGrowthRate;
    const observed = Number.isFinite(input.populationGrowthRate) ? input.populationGrowthRate : 0;
    netMigrationRate = clamp(observed - natural, -NET_MIGRATION_LIMIT, NET_MIGRATION_LIMIT);
  }
  netMigrationRate = Math.round(netMigrationRate * 1e7) / 1e7;
  const shock = Number.isFinite(input.migrationShock ?? 0) ? (input.migrationShock ?? 0) : 0;
  const projection = projectAgeStructure(reconciled.structure, {
    years: input.years,
    fertilityRate: input.fertilityRate,
    lifeExpectancy: input.lifeExpectancy,
    netMigrationRate: clamp(netMigrationRate + shock, -0.1, 0.1),
  });
  return {
    ...projection,
    source: reconciled.source,
    netMigrationRate,
    groups: ageGroups(projection.structure),
  };
}
