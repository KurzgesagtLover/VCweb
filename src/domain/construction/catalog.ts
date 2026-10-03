import type { CityBuildingDefinition } from "./model";

export const CONSTRUCTION_CATEGORIES = [
  {
    id: "BASIC_RESEARCH_EDUCATION",
    name: "기초 연구 및 교육시설",
    shortName: "교육·연구",
    description: "인력 양성과 공공 연구의 기반을 조성합니다.",
  },
  {
    id: "ADVANCED_RESEARCH",
    name: "첨단 연구시설",
    shortName: "첨단 연구",
    description: "대형 장비와 전문 인력이 필요한 국가급 연구시설입니다.",
  },
  {
    id: "INFRASTRUCTURE",
    name: "기반시설",
    shortName: "기반시설",
    description: "도시의 공급·이동·유통 능력을 확충합니다.",
  },
  {
    id: "SPECIAL_INFRASTRUCTURE",
    name: "특수 기반시설",
    shortName: "특수시설",
    description: "입지와 설비가 중요한 대규모 기반시설입니다.",
  },
] as const;

export type ConstructionCategoryId = (typeof CONSTRUCTION_CATEGORIES)[number]["id"];

export type ConstructionFacility = CityBuildingDefinition & {
  name: string;
  categoryId: ConstructionCategoryId;
  description: string;
  icon:
    | "campus"
    | "university"
    | "institute"
    | "accelerator"
    | "telescope"
    | "fusion"
    | "biology"
    | "utilities"
    | "transport"
    | "logistics"
    | "airport"
    | "harbor"
    | "nuclear"
    | "renewable"
    | "dam";
};

export const CONSTRUCTION_FACILITIES: ConstructionFacility[] = [
  {
    id: "education_complex",
    name: "교육단지",
    categoryId: "BASIC_RESEARCH_EDUCATION",
    description: "학교와 직업교육 기관을 한 권역에 집적합니다.",
    icon: "campus",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
  {
    id: "university",
    name: "대학",
    categoryId: "BASIC_RESEARCH_EDUCATION",
    description: "고등교육과 기초 학문 연구를 담당합니다.",
    icon: "university",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
  {
    id: "national_research_institute",
    name: "국책연구소",
    categoryId: "BASIC_RESEARCH_EDUCATION",
    description: "국가 전략 분야의 장기 연구를 수행합니다.",
    icon: "institute",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
  {
    id: "synchrotron_accelerator",
    name: "방사광가속기",
    categoryId: "ADVANCED_RESEARCH",
    description: "고휘도 방사광을 활용하는 대형 분석 시설입니다.",
    icon: "accelerator",
    maxLevel: 3,
    slotCostPerLevel: 1,
  },
  {
    id: "heavy_ion_accelerator",
    name: "중이온가속기",
    categoryId: "ADVANCED_RESEARCH",
    description: "중이온 빔을 이용해 물질과 원자핵을 연구합니다.",
    icon: "accelerator",
    maxLevel: 3,
    slotCostPerLevel: 1,
  },
  {
    id: "proton_accelerator",
    name: "양성자가속기",
    categoryId: "ADVANCED_RESEARCH",
    description: "양성자 빔을 연구·의료·산업 분야에 공급합니다.",
    icon: "accelerator",
    maxLevel: 3,
    slotCostPerLevel: 1,
  },
  {
    id: "astronomical_observatory",
    name: "천체망원경",
    categoryId: "ADVANCED_RESEARCH",
    description: "광학·전파 관측을 위한 국가 천문 시설입니다.",
    icon: "telescope",
    maxLevel: 3,
    slotCostPerLevel: 1,
  },
  {
    id: "fusion_research_facility",
    name: "핵융합 연구시설",
    categoryId: "ADVANCED_RESEARCH",
    description: "핵융합 플라즈마와 관련 공학 기술을 연구합니다.",
    icon: "fusion",
    maxLevel: 3,
    slotCostPerLevel: 1,
  },
  {
    id: "biological_research_facility",
    name: "생물학 연구시설",
    categoryId: "ADVANCED_RESEARCH",
    description: "생명과학·의생명 분야의 전문 연구를 수행합니다.",
    icon: "biology",
    maxLevel: 3,
    slotCostPerLevel: 1,
  },
  {
    id: "basic_utilities",
    name: "기초공급",
    categoryId: "INFRASTRUCTURE",
    description: "수도·전기·가스 공급망을 통합 확충합니다.",
    icon: "utilities",
    maxLevel: 10,
    slotCostPerLevel: 0,
  },
  {
    id: "transport_infrastructure",
    name: "교통시설",
    categoryId: "INFRASTRUCTURE",
    description: "도시권의 도로·철도·대중교통망을 개선합니다.",
    icon: "transport",
    maxLevel: 10,
    slotCostPerLevel: 0,
  },
  {
    id: "logistics_hub",
    name: "물류",
    categoryId: "INFRASTRUCTURE",
    description: "보관·분류·환적을 담당하는 물류 거점을 조성합니다.",
    icon: "logistics",
    maxLevel: 10,
    slotCostPerLevel: 1,
  },
  {
    id: "airport",
    name: "공항",
    categoryId: "SPECIAL_INFRASTRUCTURE",
    description: "여객과 화물을 처리하는 항공 교통 거점입니다.",
    icon: "airport",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
  {
    id: "seaport",
    name: "항만",
    categoryId: "SPECIAL_INFRASTRUCTURE",
    description: "해상 운송과 대규모 화물 처리를 담당합니다.",
    icon: "harbor",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
  {
    id: "nuclear_power_plant",
    name: "원자력 발전소",
    categoryId: "SPECIAL_INFRASTRUCTURE",
    description: "원자로를 이용하는 대규모 기저발전 시설입니다.",
    icon: "nuclear",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
  {
    id: "renewable_power_plant",
    name: "신재생 발전소",
    categoryId: "SPECIAL_INFRASTRUCTURE",
    description: "태양광·풍력 등 재생에너지 발전 설비를 집적합니다.",
    icon: "renewable",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
  {
    id: "dam",
    name: "댐",
    categoryId: "SPECIAL_INFRASTRUCTURE",
    description: "용수 조절·치수·발전을 지원하는 대형 수리시설입니다.",
    icon: "dam",
    maxLevel: 5,
    slotCostPerLevel: 1,
  },
];

export const CONSTRUCTION_FACILITY_BY_ID = new Map(
  CONSTRUCTION_FACILITIES.map((facility) => [facility.id, facility]),
);

export const DEFAULT_CITY_SLOT_CAPACITY = 10;
export const NORMALIZED_PROJECT_WORK = "100";
export const MIN_CONSTRUCTION_CITY_POPULATION = 250_000;
