import type { CountryEntityType } from "@/src/domain/country/entity-type";
import type { DiplomaticRelationStatus } from "@/src/domain/diplomacy/status";
import { DEFAULT_BORDER_SOURCE_COLORS, type BorderLayerKind } from "./border-palette";
import { parseHexColor, rgbToHex, type Rgb } from "./image-colors";

export type AutomaticBorderCountry = {
  id: string;
  entityType: CountryEntityType;
};

export type AutomaticBorderRelation = {
  fromCountryId: string;
  toCountryId: string;
  status: DiplomaticRelationStatus;
};

const BORDER_PRIORITY: Record<BorderLayerKind, number> = {
  COAST: 1,
  LEGAL: 2,
  INACTIVE: 3,
  ACTIVE: 4,
  GUERRILLA: 5,
};

function pixelKey(data: Uint8Array, offset: number) {
  return (
    ((data[offset] & 0xf8) << 16) | ((data[offset + 1] & 0xf8) << 8) | (data[offset + 2] & 0xf8)
  );
}

function colorKey(color: string) {
  const rgb = parseHexColor(color);
  return rgb ? ((rgb[0] & 0xf8) << 16) | ((rgb[1] & 0xf8) << 8) | (rgb[2] & 0xf8) : -1;
}

function relationKey(first: string, second: string) {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

export function collectRasterColors(data: Uint8Array) {
  const counts = new Map<string, number>();
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 128) continue;
    const hex = rgbToHex([data[offset] & 0xf8, data[offset + 1] & 0xf8, data[offset + 2] & 0xf8]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return counts;
}

export function detectRasterBackgroundColors(data: Uint8Array, width: number, height: number) {
  const counts = collectRasterColors(data);
  const backgrounds = new Set<string>();
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  for (const index of corners) {
    const offset = index * 4;
    if (data[offset + 3] >= 128) {
      backgrounds.add(
        rgbToHex([data[offset] & 0xf8, data[offset + 1] & 0xf8, data[offset + 2] & 0xf8]),
      );
    }
  }
  const pixels = width * height;
  for (const [color, count] of counts) {
    if (count / pixels >= 0.25) backgrounds.add(color);
  }
  return backgrounds;
}

export function territoryRasterColors(
  data: Uint8Array,
  width: number,
  height: number,
  reservedColors: Iterable<string>,
) {
  const excluded = new Set([...reservedColors].map((color) => color.toUpperCase()));
  for (const color of detectRasterBackgroundColors(data, width, height)) excluded.add(color);
  return [...collectRasterColors(data).keys()].filter((color) => !excluded.has(color));
}

function borderKindForPair(
  first: AutomaticBorderCountry,
  second: AutomaticBorderCountry,
  statuses: Map<string, DiplomaticRelationStatus>,
): BorderLayerKind | null {
  const hasGuerrilla =
    first.entityType === "GUERRILLA_GROUP" || second.entityType === "GUERRILLA_GROUP";
  const status = statuses.get(relationKey(first.id, second.id));
  if (hasGuerrilla) return status === "GUERRILLA" ? "GUERRILLA" : null;
  if (status === "WAR" || status === "CIVIL_WAR") return "ACTIVE";
  if (status === "STALEMATE" || status === "TRUCE") return "INACTIVE";
  if (status === "GUERRILLA") return "GUERRILLA";
  return "LEGAL";
}

export function drawAutomaticBorders(input: {
  data: Uint8Array;
  width: number;
  height: number;
  assignments: Array<{ colorHex: string; countryId: string }>;
  countries: AutomaticBorderCountry[];
  relations: AutomaticBorderRelation[];
  backgroundColors: Iterable<string>;
}) {
  const output = new Uint8Array(input.data);
  const countryById = new Map(input.countries.map((country) => [country.id, country]));
  const countryByColor = new Map(
    input.assignments.map((assignment) => [
      colorKey(assignment.colorHex),
      countryById.get(assignment.countryId),
    ]),
  );
  const backgrounds = new Set([...input.backgroundColors].map(colorKey));
  const reservedBorders = new Set(Object.values(DEFAULT_BORDER_SOURCE_COLORS).map(colorKey));
  const statuses = new Map<string, DiplomaticRelationStatus>();
  for (const relation of input.relations) {
    if (relation.status === "NORMAL") continue;
    statuses.set(relationKey(relation.fromCountryId, relation.toCountryId), relation.status);
  }
  const kinds = new Map<number, BorderLayerKind>();

  const mark = (index: number, kind: BorderLayerKind) => {
    const current = kinds.get(index);
    if (!current || BORDER_PRIORITY[kind] > BORDER_PRIORITY[current]) kinds.set(index, kind);
  };

  const inspect = (firstIndex: number, secondIndex: number) => {
    const firstOffset = firstIndex * 4;
    const secondOffset = secondIndex * 4;
    if (input.data[firstOffset + 3] < 128 || input.data[secondOffset + 3] < 128) return;
    const firstKey = pixelKey(input.data, firstOffset);
    const secondKey = pixelKey(input.data, secondOffset);
    if (firstKey === secondKey || reservedBorders.has(firstKey) || reservedBorders.has(secondKey))
      return;
    const firstCountry = countryByColor.get(firstKey);
    const secondCountry = countryByColor.get(secondKey);
    if (firstCountry && secondCountry && firstCountry.id !== secondCountry.id) {
      const kind = borderKindForPair(firstCountry, secondCountry, statuses);
      if (kind) mark(firstIndex, kind);
      return;
    }
    if (firstCountry && backgrounds.has(secondKey)) mark(firstIndex, "COAST");
    else if (secondCountry && backgrounds.has(firstKey)) mark(secondIndex, "COAST");
  };

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const index = y * input.width + x;
      if (x + 1 < input.width) inspect(index, index + 1);
      if (y + 1 < input.height) inspect(index, index + input.width);
    }
  }

  const counts: Record<BorderLayerKind, number> = {
    COAST: 0,
    LEGAL: 0,
    ACTIVE: 0,
    INACTIVE: 0,
    GUERRILLA: 0,
  };
  const rgbs = Object.fromEntries(
    Object.entries(DEFAULT_BORDER_SOURCE_COLORS).map(([kind, color]) => [
      kind,
      parseHexColor(color)!,
    ]),
  ) as Record<BorderLayerKind, Rgb>;
  for (const [index, kind] of kinds) {
    const offset = index * 4;
    const color = rgbs[kind];
    output[offset] = color[0];
    output[offset + 1] = color[1];
    output[offset + 2] = color[2];
    output[offset + 3] = 255;
    counts[kind] += 1;
  }
  return { data: output, counts };
}
