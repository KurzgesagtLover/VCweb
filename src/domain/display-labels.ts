const metricLabels: Record<string, string> = {
  population: "인구",
  citizensAbroad: "해외 국민",
  foreignResidents: "외국인 거주자",
  diaspora: "재외동포",
  fertilityRate: "합계출산율",
  populationGrowthRate: "인구 성장률",
  lifeExpectancy: "기대수명",
  medianAge: "중위 연령",
  populationDensity: "인구 밀도",
  migrationShock: "순이동 충격",
  realGdp: "실질 GDP",
  nominalGdp: "명목 GDP",
  realGdpGrowth: "실질 GDP 성장률",
  gdpDeflator: "GDP 디플레이터",
  realGni: "실질 GNI",
  realGnp: "실질 GNP",
  wealth: "국부",
  foreignReserves: "외환보유고",
  currencyCode: "통화 코드",
  currencyValue: "통화 가치 지수",
  creditRating: "국가신용등급",
  creditRatingAgency: "신용평가 기관",
  creditScore: "신용 점수",
  incomeGini: "소득 지니계수",
  wealthGini: "자산 지니계수",
  inflationRate: "소비자물가 상승률",
  landPriceGrowth: "토지가격 상승률",
  unemploymentRate: "실업률",
  governmentRevenue: "정부 수입",
  governmentSpending: "정부 지출",
  previousGovernmentSpending: "직전 턴 정부 지출",
  governmentSpendingGrowth: "정부 지출 증가율",
  fiscalBalance: "재정 수지",
  nationalDebt: "국가 부채",
  debtToGdp: "GDP 대비 부채",
  policyRate: "기준금리",
  currentAccountToGdp: "GDP 대비 경상수지",
  productivityIndex: "생산성 지수",
  referenceYear: "기준 연도",
  priceBasis: "가격 기준",
  scale: "금액 단위",
  educationIndex: "교육 수준 지수",
  researchInvestmentRate: "연구개발 투자율",
  stateCapacity: "국가 역량",
  structuralReform: "구조개혁 효과",
  externalShock: "대외 경제 충격",
  sectorShareWeightedGrowth: "산업 비중 가중 성장률",
  sectorProductivity: "산업 생산성",
  financialHealth: "금융기관 건전성",
  corporateHealth: "주요 기업 건전성",
  stability: "정치 안정도",
  legitimacy: "정부 정통성",
  governmentApproval: "정부 지지도",
  policySupport: "정책 지지도",
  publicAwareness: "국민 인지도",
  unrest: "사회 불안",
  corruption: "부패 수준",
  democracy: "민주성",
  support: "정당 지지율",
  organization: "정당 조직력",
  score: "외교 관계 점수",
  progressPoints: "연구 진척도",
};

const contributionGroupLabels: Record<string, string> = {
  growth: "경제성장 기여",
  inflation: "물가 변동 기여",
  distribution: "소득·자산 분배",
  external: "대외 부문 기여",
  fiscal: "재정 부문 기여",
};

const domainLabels: Record<string, string> = {
  ECONOMY: "경제",
  POLITICS: "정치",
};

const targetLabels: Record<string, string> = {
  COUNTRY: "국가",
  PARTY: "정당",
  RELATION: "외교 관계",
  RESEARCH: "연구",
};

const operationLabels: Record<string, string> = {
  ADD: "증감",
  MULTIPLY: "배율 적용",
};

const governmentBranchLabels: Record<string, string> = {
  EXECUTIVE: "행정부",
  JUDICIAL: "사법부",
  LEGISLATIVE: "입법부",
};

const turnStatusLabels: Record<string, string> = {
  DRAFT: "접수 중",
  LOCKED: "접수 마감",
  CALCULATING: "지표 계산 중",
  AI_RUNNING: "판정 중",
  REVIEW: "공개 준비 중",
  PUBLISHED: "공개 완료",
  FAILED: "처리 오류",
};

export function metricLabel(metric: string) {
  return metricLabels[metric] ?? "기타 지표";
}

export function contributionGroupLabel(group: string) {
  return contributionGroupLabels[group] ?? "기타 계산 기여";
}

export function turnStatusLabel(status: string) {
  return turnStatusLabels[status] ?? status;
}

export function domainLabel(domain: string) {
  return domainLabels[domain] ?? "기타 영역";
}

export function effectTargetLabel(target: string) {
  return targetLabels[target] ?? "기타 대상";
}

export function effectOperationLabel(operation: string) {
  return operationLabels[operation] ?? "변경";
}

export function governmentBranchLabel(branch: string) {
  return governmentBranchLabels[branch] ?? "기타 기관";
}
