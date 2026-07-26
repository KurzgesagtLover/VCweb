import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export type EconomyInput = {
  population: string;
  fertilityRate: string;
  populationGrowthRate: string;
  medianAge: string;
  lifeExpectancy: string;
  migrationShock: string;
  realGdp: string;
  nominalGdp: string;
  realGdpGrowth: string;
  gdpDeflator: string;
  realGni: string;
  realGnp: string;
  wealth: string;
  foreignReserves: string;
  currencyValue: string;
  creditScore: string;
  incomeGini: string;
  wealthGini: string;
  inflationRate: string;
  landPriceGrowth: string;
  unemploymentRate: string;
  governmentRevenue: string;
  governmentSpending: string;
  previousGovernmentSpending: string;
  nationalDebt: string;
  policyRate: string;
  currentAccountToGdp: string;
  productivityIndex: string;
  educationIndex: string;
  researchInvestmentRate: string;
  stateCapacity: string;
  structuralReform: string;
  externalShock: string;
  sectorShareWeightedGrowth: string;
  sectorProductivity: string;
  financialHealth: string;
  corporateHealth: string;
};

export const ECONOMIC_INPUT_PATHS = Object.freeze(
  Object.keys({
    population: 0,
    fertilityRate: 0,
    populationGrowthRate: 0,
    medianAge: 0,
    lifeExpectancy: 0,
    migrationShock: 0,
    realGdp: 0,
    nominalGdp: 0,
    realGdpGrowth: 0,
    gdpDeflator: 0,
    realGni: 0,
    realGnp: 0,
    wealth: 0,
    foreignReserves: 0,
    currencyValue: 0,
    creditScore: 0,
    incomeGini: 0,
    wealthGini: 0,
    inflationRate: 0,
    landPriceGrowth: 0,
    unemploymentRate: 0,
    governmentRevenue: 0,
    governmentSpending: 0,
    previousGovernmentSpending: 0,
    nationalDebt: 0,
    policyRate: 0,
    currentAccountToGdp: 0,
    productivityIndex: 0,
    educationIndex: 0,
    researchInvestmentRate: 0,
    stateCapacity: 0,
    structuralReform: 0,
    externalShock: 0,
    sectorShareWeightedGrowth: 0,
    sectorProductivity: 0,
    financialHealth: 0,
    corporateHealth: 0,
  }) as Array<keyof EconomyInput>,
);

export type EconomyRules = {
  version: string;
  coefficients: Record<string, string>;
  growthMin: string;
  growthMax: string;
};

export const DEFAULT_ECONOMY_RULES: EconomyRules = {
  version: "v1",
  growthMin: "-0.25",
  growthMax: "0.30",
  coefficients: {
    populationMomentum: "0.22",
    fertility: "0.0006",
    longevity: "0.00025",
    ageing: "-0.00018",
    productivity: "0.45",
    education: "0.012",
    research: "0.16",
    capacity: "0.01",
    sectorGrowth: "0.28",
    sectorProductivity: "0.002",
    priorGrowth: "0.12",
    unemploymentGap: "-0.08",
    fiscalImpulse: "0.14",
    realRate: "-0.09",
    landWealth: "0.025",
    currentAccount: "0.035",
    reserves: "0.012",
    credit: "0.0006",
    finance: "0.00035",
    corporate: "0.00025",
    structuralReform: "0.75",
    externalShock: "1",
  },
};

type Contribution = { source: keyof EconomyInput; value: string; explanation: string };

const d = (value: Decimal.Value) => new Decimal(value);
const clamp = (value: Decimal, min: Decimal.Value, max: Decimal.Value) =>
  Decimal.max(min, Decimal.min(max, value));

function signedSaturation(value: Decimal, curvature: Decimal.Value) {
  return value.div(d(1).plus(value.abs().mul(curvature)));
}

function signedLogDiminishing(value: Decimal, curvature: Decimal.Value) {
  const curve = d(curvature);
  if (curve.isZero() || value.isZero()) return value;
  const magnitude = d(1).plus(value.abs().mul(curve)).ln().div(curve);
  return value.isNegative() ? magnitude.neg() : magnitude;
}

export function creditRatingFromScore(score: Decimal.Value) {
  const value = d(score);
  if (value.gte(95)) return "AAA";
  if (value.gte(90)) return "AA+";
  if (value.gte(85)) return "AA";
  if (value.gte(80)) return "AA-";
  if (value.gte(75)) return "A+";
  if (value.gte(70)) return "A";
  if (value.gte(65)) return "A-";
  if (value.gte(60)) return "BBB+";
  if (value.gte(55)) return "BBB";
  if (value.gte(50)) return "BBB-";
  if (value.gte(40)) return "BB";
  if (value.gte(30)) return "B";
  return "CCC";
}

function c(source: keyof EconomyInput, value: Decimal, explanation: string): Contribution {
  return { source, value: value.toSignificantDigits(12).toString(), explanation };
}

export function calculateEconomy(input: EconomyInput, rules = DEFAULT_ECONOMY_RULES) {
  const x = Object.fromEntries(ECONOMIC_INPUT_PATHS.map((key) => [key, d(input[key])])) as Record<
    keyof EconomyInput,
    Decimal
  >;
  for (const [key, value] of Object.entries(x)) {
    if (!value.isFinite()) throw new Error(`${key} 입력값이 유효하지 않습니다.`);
  }
  const k = (name: string) => d(rules.coefficients[name] ?? 0);

  const spendingGrowth = x.previousGovernmentSpending.isZero()
    ? d(0)
    : x.governmentSpending.div(x.previousGovernmentSpending).minus(1);
  const structuralPopulationGrowth = x.fertilityRate
    .minus(2.1)
    .mul(k("fertility"))
    .plus(d(80).minus(x.lifeExpectancy).neg().mul(k("longevity")))
    .plus(Decimal.max(0, x.medianAge.minus(42)).mul(k("ageing")))
    .plus(x.migrationShock);
  const populationGrowth = clamp(
    x.populationGrowthRate.mul("0.65").plus(structuralPopulationGrowth.mul("0.35")),
    "-0.08",
    "0.08",
  );
  const nextPopulation = Decimal.max(0, x.population.mul(d(1).plus(populationGrowth)));

  const fertilityGap = x.fertilityRate.minus("2.1");
  const fertilitySignal = fertilityGap.isNegative()
    ? fertilityGap.mul(d(1).plus(fertilityGap.abs().mul("0.35")))
    : signedSaturation(fertilityGap, "0.5");
  const ageGap = x.medianAge.minus(38);
  const ageingSignal = ageGap.isPositive()
    ? ageGap.mul(d(1).plus(ageGap.div(35)))
    : signedSaturation(ageGap, d(1).div(30));
  const productivityLevelGap = Decimal.max(x.productivityIndex, "0.000001").div(100).ln();
  const productivitySignal = signedSaturation(productivityLevelGap, 8).mul("0.25");
  const educationSignal = signedSaturation(x.educationIndex.minus("0.5"), "1.5");
  const researchSignal = signedLogDiminishing(x.researchInvestmentRate, 20);
  const capacitySignal = signedSaturation(x.stateCapacity.minus(50).div(50), "0.8");
  const sectorProductivitySignal = signedSaturation(
    Decimal.max(x.sectorProductivity, "0.000001").div(100).ln(),
    6,
  )
    .mul(100)
    .mul("0.35");
  const productivityEducationSynergy = productivitySignal
    .mul(educationSignal)
    .mul(k("productivity"))
    .mul("0.12");

  const potentialContributions: Contribution[] = [
    c(
      "populationGrowthRate",
      signedSaturation(x.populationGrowthRate, 12).mul(k("populationMomentum")),
      "인구 증가의 체감 성장 기여",
    ),
    c("fertilityRate", fertilitySignal.mul(k("fertility")), "저출산 위험의 비대칭 보정"),
    c("medianAge", ageingSignal.mul(k("ageing")), "고령화 부담의 가속 효과"),
    c(
      "lifeExpectancy",
      signedSaturation(x.lifeExpectancy.minus(75), "0.04").mul(k("longevity")),
      "건강·숙련 축적의 체감 효과",
    ),
    c(
      "migrationShock",
      signedLogDiminishing(x.migrationShock, 12).mul(k("populationMomentum")),
      "순이동의 체감 인구 효과",
    ),
    c("productivityIndex", productivitySignal.mul(k("productivity")), "생산성의 로그 성장 효과"),
    c("educationIndex", educationSignal.mul(k("education")), "교육 기반 인적자본"),
    c("researchInvestmentRate", researchSignal.mul(k("research")), "연구 투자의 체감 수익"),
    c("stateCapacity", capacitySignal.mul(k("capacity")), "국가 역량의 포화 효과"),
    c(
      "sectorProductivity",
      sectorProductivitySignal.mul(k("sectorProductivity")),
      "산업 생산성의 로그 효과",
    ),
    c("productivityIndex", productivityEducationSynergy, "생산성과 교육 수준의 보완 효과"),
  ];
  const rawPotentialGrowth = potentialContributions.reduce(
    (sum, item) => sum.plus(item.value),
    d(0),
  );
  const potentialGrowth = clamp(rawPotentialGrowth, "-0.08", "0.12");

  const unemploymentGap = x.unemploymentRate.minus("0.05");
  const realRate = x.policyRate.minus(x.inflationRate);
  const realRateGap = realRate.minus("0.01");
  const reserveCover = x.realGdp.isZero() ? d(0) : x.foreignReserves.div(x.realGdp);
  const debtRatio = x.nominalGdp.isZero() ? d(0) : x.nationalDebt.div(x.nominalGdp);
  const debtOverhang = Decimal.max(0, debtRatio.minus("0.6"));
  const debtOverhangDrag = signedSaturation(debtOverhang, 1).mul(k("fiscalImpulse")).mul("-0.45");
  const priceInstability = Decimal.max(0, x.inflationRate.minus("0.02").abs().minus("0.03"));
  const priceInstabilityDrag = signedSaturation(priceInstability, 4).mul("-0.25");
  const fiscalMultiplier = clamp(
    d(1)
      .plus(Decimal.max(0, unemploymentGap).mul(3))
      .minus(Decimal.max(0, debtRatio.minus("0.6")).mul("0.45"))
      .minus(Decimal.max(0, realRateGap).mul(2)),
    "0.45",
    "1.5",
  );
  const fiscalImpulse = signedLogDiminishing(spendingGrowth, 4)
    .mul(k("fiscalImpulse"))
    .mul(fiscalMultiplier);
  const unemploymentSignal = signedLogDiminishing(unemploymentGap, 10).mul(
    unemploymentGap.isPositive() ? "1.2" : "0.7",
  );
  const monetaryImpulse = signedLogDiminishing(realRateGap, 8).mul(k("realRate"));
  const growthNormalization = signedSaturation(d("0.025").minus(x.realGdpGrowth), 4)
    .mul(k("priorGrowth"))
    .mul(4);
  const reformSignal = signedLogDiminishing(x.structuralReform, 10);
  const reformCapacitySynergy = reformSignal
    .mul(capacitySignal)
    .mul(k("structuralReform"))
    .mul("0.18");
  const financialStress = Decimal.max(0, d(50).minus(x.financialHealth).div(50));
  const corporateStress = Decimal.max(0, d(50).minus(x.corporateHealth).div(50));
  const balanceSheetContagion = financialStress.mul(corporateStress).mul("-0.04");
  const shockSignal = signedLogDiminishing(x.externalShock, 8);
  const shockAsymmetry = x.externalShock.isNegative() ? d("1.15") : d("0.85");
  const shockVulnerability = x.externalShock.isNegative()
    ? d(1).plus(financialStress.mul("0.5")).plus(corporateStress.mul("0.3"))
    : d(1);
  const externalShockContribution = shockSignal
    .mul(shockAsymmetry)
    .mul(shockVulnerability)
    .mul(k("externalShock"));

  const cycleContributions: Contribution[] = [
    c(
      "realGdpGrowth",
      signedSaturation(x.realGdpGrowth, 4).mul(k("priorGrowth")),
      "경기 관성의 포화 효과",
    ),
    c("realGdpGrowth", growthNormalization, "극단 성장률의 평균회귀 효과"),
    c("unemploymentRate", unemploymentSignal.mul(k("unemploymentGap")), "실업 충격의 비대칭 효과"),
    c("governmentSpending", fiscalImpulse.div(2), "경제 여건을 반영한 재정 승수"),
    c("previousGovernmentSpending", fiscalImpulse.div(2), "직전 지출 대비 재정 변화"),
    c("policyRate", monetaryImpulse.mul("0.85"), "중립금리 대비 통화 긴축 효과"),
    c("inflationRate", monetaryImpulse.mul("0.15"), "실질금리 구성 중 물가 효과"),
    c(
      "landPriceGrowth",
      signedLogDiminishing(x.landPriceGrowth, 5).mul(k("landWealth")),
      "자산가격의 체감 부 효과",
    ),
    c(
      "currentAccountToGdp",
      signedLogDiminishing(x.currentAccountToGdp, 4).mul(k("currentAccount")),
      "대외 수요의 체감 효과",
    ),
    c(
      "foreignReserves",
      d(1).plus(Decimal.max(0, reserveCover).mul(4)).ln().div(4).mul(k("reserves")),
      "외환 완충력의 체감 효과",
    ),
    c(
      "creditScore",
      signedSaturation(x.creditScore.minus(50), "0.03").mul(k("credit")).mul("0.5"),
      "국가 신용의 포화 효과",
    ),
    c(
      "financialHealth",
      signedSaturation(x.financialHealth.minus(50), "0.03").mul(k("finance")).mul("0.5"),
      "금융 건전성의 포화 효과",
    ),
    c(
      "corporateHealth",
      signedSaturation(x.corporateHealth.minus(50), "0.03").mul(k("corporate")).mul("0.5"),
      "기업 건전성의 포화 효과",
    ),
    c("financialHealth", balanceSheetContagion, "금융·기업 부실의 증폭 효과"),
    c("nationalDebt", debtOverhangDrag, "과도한 국가부채의 성장 제약"),
    c("inflationRate", priceInstabilityDrag, "물가 불안정의 성장 제약"),
    c(
      "sectorShareWeightedGrowth",
      signedLogDiminishing(x.sectorShareWeightedGrowth, 6).mul(k("sectorGrowth")),
      "산업 성장의 체감 기여",
    ),
    c("structuralReform", reformSignal.mul(k("structuralReform")), "구조개혁의 체감 효과"),
    c("stateCapacity", reformCapacitySynergy, "국가 역량과 개혁의 실행 시너지"),
    c("externalShock", externalShockContribution, "외부 충격의 불황 비대칭 효과"),
  ];
  const cycle = cycleContributions.reduce((sum, item) => sum.plus(item.value), d(0));
  const growth = clamp(potentialGrowth.plus(cycle), rules.growthMin, rules.growthMax);
  const nextRealGdp = Decimal.max(0, x.realGdp.mul(d(1).plus(growth)));

  const outputGap = clamp(growth.minus(potentialGrowth), "-0.12", "0.12");
  const currencyImportPressure = signedSaturation(
    d(1).div(Decimal.max(x.currencyValue, "0.000001")).minus(1),
    "1.5",
  );
  const inflationContributions: Contribution[] = [
    c("inflationRate", x.inflationRate.mul("0.58"), "소비자물가 관성"),
    c("gdpDeflator", x.gdpDeflator.minus(1).mul("0.16"), "생산 가격 관성"),
    c("currencyValue", currencyImportPressure.mul("0.025"), "수입물가의 포화 효과"),
    c(
      "nominalGdp",
      x.nominalGdp.div(Decimal.max(x.realGdp, 1)).minus(1).mul("0.04"),
      "명목·실질 가격 신호",
    ),
    c("externalShock", x.externalShock.mul("0.22"), "공급 충격"),
  ];
  const rawNextInflation = inflationContributions.reduce(
    (sum, item) => sum.plus(item.value),
    outputGap.mul("0.35"),
  );
  const nextInflation = clamp(
    rawNextInflation.mul("0.85").plus(d("0.02").mul("0.15")),
    "-0.1",
    "0.5",
  );
  const nextDeflator = Decimal.max("0.01", d(1).plus(nextInflation));
  const nextNominalGdp = nextRealGdp.mul(nextDeflator);
  const nextUnemployment = clamp(
    x.unemploymentRate.mul("0.82").plus(d("0.05").mul("0.18")).minus(outputGap.mul("0.35")),
    "0.015",
    "0.6",
  );

  const overseasIncomeRatio = x.realGdp.isZero() ? d(0) : x.realGni.minus(x.realGdp).div(x.realGdp);
  const productionIncomeRatio = x.realGdp.isZero()
    ? d(0)
    : x.realGnp.minus(x.realGdp).div(x.realGdp);
  const nextRealGni = nextRealGdp.mul(d(1).plus(overseasIncomeRatio));
  const nextRealGnp = nextRealGdp.mul(d(1).plus(productionIncomeRatio));
  const savingsProxy = x.realGni.minus(x.governmentSpending).mul("0.08");
  const nextWealth = Decimal.max(
    0,
    x.wealth.mul(d(1).plus(x.landPriceGrowth.mul("0.12"))).plus(savingsProxy),
  );

  const effectiveTaxRate = x.nominalGdp.isZero() ? d(0) : x.governmentRevenue.div(x.nominalGdp);
  const nextRevenue = nextNominalGdp
    .mul(effectiveTaxRate)
    .mul(d(1).plus(x.stateCapacity.minus(50).div(5000)));
  const nextSpending = x.governmentSpending.mul(d(1).plus(spendingGrowth));
  const fiscalBalance = nextRevenue.minus(nextSpending);
  const sovereignRiskSpread = d(100).minus(x.creditScore).div(100).mul("0.04");
  const debtInterestRate = clamp(x.policyRate.mul("0.35").plus(sovereignRiskSpread), 0, "0.12");
  const debtInterest = Decimal.min(
    x.nationalDebt.mul(debtInterestRate),
    Decimal.max(0, x.nominalGdp).mul("0.12"),
  );
  const nextDebt = Decimal.max(0, x.nationalDebt.minus(fiscalBalance).plus(debtInterest));
  const debtToGdp = nextNominalGdp.isZero() ? d(0) : nextDebt.div(nextNominalGdp);

  const nextIncomeGini = clamp(
    x.incomeGini
      .plus(nextUnemployment.minus(x.unemploymentRate).mul("0.08"))
      .minus(spendingGrowth.mul("0.01")),
    "0",
    "1",
  );
  const nextWealthGini = clamp(x.wealthGini.plus(x.landPriceGrowth.mul("0.015")), "0", "1");
  const nextLandPriceGrowth = clamp(
    x.landPriceGrowth.mul("0.55").plus(growth.mul("0.35")).minus(realRate.mul("0.18")),
    "-0.5",
    "0.8",
  );
  const nextCurrentAccount = clamp(
    x.currentAccountToGdp
      .mul("0.65")
      .minus(outputGap.mul("0.18"))
      .plus(d(1).div(x.currencyValue).minus(1).mul("0.02"))
      .plus(x.externalShock.mul("0.25")),
    "-0.3",
    "0.3",
  );
  const nextReserves = Decimal.max(
    0,
    x.foreignReserves
      .plus(nextNominalGdp.mul(nextCurrentAccount))
      .plus(x.externalShock.mul(nextNominalGdp)),
  );
  const marketCurrencyValue = x.currencyValue.mul(
    d(1)
      .plus(nextCurrentAccount.mul("0.08"))
      .plus(x.creditScore.minus(50).div(5000))
      .minus(nextInflation.minus("0.02").mul("0.12")),
  );
  const nextCurrencyValue = Decimal.max(
    "0.000001",
    marketCurrencyValue.plus(d(1).minus(marketCurrencyValue).mul("0.02")),
  );
  const nextCreditScore = clamp(
    x.creditScore
      .plus(reserveCover.mul(4))
      .minus(debtToGdp.mul(7))
      .plus(growth.mul(15))
      .plus(x.financialHealth.minus(50).div(20)),
    0,
    100,
  );
  const inflationGap = nextInflation.minus("0.02");
  const policyTarget = d("0.02")
    .plus(nextInflation)
    .plus(inflationGap.mul("0.8"))
    .plus(outputGap.mul("0.4"));
  const nextPolicyRate = clamp(
    x.policyRate.mul("0.55").plus(policyTarget.mul("0.45")),
    "-0.02",
    "0.35",
  );

  return {
    rulesVersion: `${rules.version}:nonlinear-v3.1-stable`,
    population: nextPopulation.toFixed(0),
    populationGrowthRate: populationGrowth.toSignificantDigits(12).toString(),
    realGdp: nextRealGdp.toFixed(4),
    nominalGdp: nextNominalGdp.toFixed(4),
    realGdpGrowth: growth.toSignificantDigits(12).toString(),
    gdpDeflator: nextDeflator.toSignificantDigits(12).toString(),
    realGni: nextRealGni.toFixed(4),
    realGnp: nextRealGnp.toFixed(4),
    wealth: nextWealth.toFixed(4),
    foreignReserves: nextReserves.toFixed(4),
    currencyValue: nextCurrencyValue.toSignificantDigits(12).toString(),
    creditScore: nextCreditScore.toDecimalPlaces(0).toNumber(),
    incomeGini: nextIncomeGini.toSignificantDigits(12).toString(),
    wealthGini: nextWealthGini.toSignificantDigits(12).toString(),
    inflationRate: nextInflation.toSignificantDigits(12).toString(),
    landPriceGrowth: nextLandPriceGrowth.toSignificantDigits(12).toString(),
    unemploymentRate: nextUnemployment.toSignificantDigits(12).toString(),
    governmentRevenue: nextRevenue.toFixed(4),
    governmentSpending: nextSpending.toFixed(4),
    governmentSpendingGrowth: spendingGrowth.toSignificantDigits(12).toString(),
    fiscalBalance: fiscalBalance.toFixed(4),
    nationalDebt: nextDebt.toFixed(4),
    debtToGdp: new Decimal(nextDebt.toFixed(4))
      .div(new Decimal(nextNominalGdp.toFixed(4)))
      .toString(),
    policyRate: nextPolicyRate.toSignificantDigits(12).toString(),
    currentAccountToGdp: nextCurrentAccount.toSignificantDigits(12).toString(),
    productivityIndex: x.productivityIndex
      .mul(d(1).plus(x.researchInvestmentRate.mul("0.06")).plus(x.structuralReform.mul("0.1")))
      .toSignificantDigits(12)
      .toString(),
    contributions: {
      growth: [...potentialContributions, ...cycleContributions],
      inflation: inflationContributions,
      distribution: [
        c("incomeGini", x.incomeGini, "전기 소득 분배"),
        c("wealthGini", x.wealthGini, "전기 자산 분배"),
      ],
      external: [
        c("realGni", overseasIncomeRatio, "해외 요소소득"),
        c("realGnp", productionIncomeRatio, "국민 생산 차이"),
        c("wealth", x.wealth, "국부 기준"),
      ],
      fiscal: [
        c("governmentRevenue", effectiveTaxRate, "실효 세입 비율"),
        c("nationalDebt", debtInterest, "채무 이자 부담"),
      ],
    },
  };
}
