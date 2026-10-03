import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_FACILITIES,
  CONSTRUCTION_FACILITY_BY_ID,
  MIN_CONSTRUCTION_CITY_POPULATION,
} from "../../src/domain/construction/catalog";

describe("construction catalog", () => {
  it("keeps every facility id unique and linked to a category", () => {
    expect(new Set(CONSTRUCTION_FACILITIES.map((facility) => facility.id)).size).toBe(
      CONSTRUCTION_FACILITIES.length,
    );
    const categories = new Set(CONSTRUCTION_CATEGORIES.map((category) => category.id));
    for (const facility of CONSTRUCTION_FACILITIES) {
      expect(categories.has(facility.categoryId)).toBe(true);
      expect(CONSTRUCTION_FACILITY_BY_ID.get(facility.id)).toBe(facility);
    }
  });

  it("contains the requested education, research and infrastructure facilities", () => {
    expect(CONSTRUCTION_FACILITIES.map((facility) => facility.name)).toEqual(
      expect.arrayContaining([
        "교육단지",
        "대학",
        "국책연구소",
        "방사광가속기",
        "중이온가속기",
        "양성자가속기",
        "천체망원경",
        "핵융합 연구시설",
        "생물학 연구시설",
        "기초공급",
        "교통시설",
        "물류",
        "공항",
        "항만",
        "원자력 발전소",
        "신재생 발전소",
        "댐",
      ]),
    );
  });

  it("excludes the map's small-city class from construction", () => {
    expect(MIN_CONSTRUCTION_CITY_POPULATION).toBe(250_000);
  });
});
