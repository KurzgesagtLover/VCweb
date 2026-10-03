export const STANDARD_ECONOMIC_SECTORS = [
  { code: "MFG", name: "첨단 제조업", defaultShare: "0.12" },
  { code: "GMF", name: "일반 제조업", defaultShare: "0.18" },
  { code: "DIG", name: "디지털·사업서비스", defaultShare: "0.12" },
  { code: "FIN", name: "금융·부동산", defaultShare: "0.11" },
  { code: "PUB", name: "공공·사회서비스", defaultShare: "0.15" },
  { code: "CON", name: "건설·인프라", defaultShare: "0.11" },
  { code: "ENE", name: "에너지·광업", defaultShare: "0.09" },
  { code: "AGR", name: "농림수산업", defaultShare: "0.12" },
] as const;

export function standardEconomicSectorRows({
  productionIndex = "100",
  productivity = "100",
  growthRate = "0.025",
}: {
  productionIndex?: string;
  productivity?: string;
  growthRate?: string;
} = {}) {
  return STANDARD_ECONOMIC_SECTORS.map((sector) => ({
    code: sector.code,
    name: sector.name,
    share: sector.defaultShare,
    productionIndex,
    productivity,
    growthRate,
  }));
}
