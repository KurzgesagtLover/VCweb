import { z } from "zod";

export const countryEntityTypeSchema = z.enum([
  "STATE",
  "PARTIALLY_RECOGNIZED_STATE",
  "QUASI_STATE",
  "ARMED_GROUP",
  "GUERRILLA_GROUP",
]);

export type CountryEntityType = z.infer<typeof countryEntityTypeSchema>;

export const COUNTRY_ENTITY_TYPE_LABELS: Record<CountryEntityType, string> = {
  STATE: "국가",
  PARTIALLY_RECOGNIZED_STATE: "부분승인국",
  QUASI_STATE: "준국가단체",
  ARMED_GROUP: "무장단체",
  GUERRILLA_GROUP: "게릴라 단체",
};

export const REGULAR_COUNTRY_ENTITY_TYPES = new Set<CountryEntityType>([
  "STATE",
  "PARTIALLY_RECOGNIZED_STATE",
]);

export function canUseRegularDiplomacy(type: CountryEntityType) {
  return type !== "GUERRILLA_GROUP";
}
