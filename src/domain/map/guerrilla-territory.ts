import type { CountryEntityType } from "@/src/domain/country/entity-type";
import type { DiplomaticRelationStatus } from "@/src/domain/diplomacy/status";
import { DEFAULT_BORDER_SOURCE_COLORS } from "./border-palette";
import { parseHexColor, type Rgb } from "./image-colors";

function colorKey(color: string) {
  const rgb = parseHexColor(color);
  return rgb ? ((rgb[0] & 0xf8) << 16) | ((rgb[1] & 0xf8) << 8) | (rgb[2] & 0xf8) : -1;
}

function pixelKey(data: Uint8Array, offset: number) {
  return (
    ((data[offset] & 0xf8) << 16) | ((data[offset + 1] & 0xf8) << 8) | (data[offset + 2] & 0xf8)
  );
}

function writeRgb(data: Uint8Array, offset: number, rgb: Rgb) {
  data[offset] = rgb[0];
  data[offset + 1] = rgb[1];
  data[offset + 2] = rgb[2];
  data[offset + 3] = 255;
}

/** Sparse but readable dots after 2× nearest upscale. */
function isGuerrillaDot(x: number, y: number) {
  return x % 3 === 1 && y % 3 === 1;
}

/**
 * Paint guerrilla-held pixels as the target country's territory color,
 * with the guerrilla group's own color as scattered dots on top.
 * Call after automatic borders so front lines stay intact.
 */
export function applyGuerrillaTerritoryOverlay(input: {
  data: Uint8Array;
  width: number;
  height: number;
  assignments: Array<{ colorHex: string; countryId: string }>;
  countries: Array<{ id: string; entityType: CountryEntityType }>;
  relations: Array<{
    fromCountryId: string;
    toCountryId: string;
    status: DiplomaticRelationStatus;
  }>;
  protectedColors?: Iterable<string>;
}) {
  const output = new Uint8Array(input.data);
  const entityById = new Map(input.countries.map((country) => [country.id, country.entityType]));
  const colorByCountry = new Map(
    input.assignments.map((row) => [row.countryId, row.colorHex.toUpperCase()]),
  );

  /** guerrillaCountryId → targetCountryId */
  const guerrillaTargets = new Map<string, string>();
  for (const relation of input.relations) {
    if (relation.status !== "GUERRILLA") continue;
    const fromType = entityById.get(relation.fromCountryId);
    const toType = entityById.get(relation.toCountryId);
    if (fromType === "GUERRILLA_GROUP" && toType !== "GUERRILLA_GROUP") {
      guerrillaTargets.set(relation.fromCountryId, relation.toCountryId);
    } else if (toType === "GUERRILLA_GROUP" && fromType !== "GUERRILLA_GROUP") {
      guerrillaTargets.set(relation.toCountryId, relation.fromCountryId);
    }
  }
  if (!guerrillaTargets.size) return { data: output, paintedPixels: 0 };

  const protectedKeys = new Set<number>(
    [
      ...Object.values(DEFAULT_BORDER_SOURCE_COLORS),
      ...(input.protectedColors ?? []),
    ].map(colorKey),
  );

  const paintJobs: Array<{ guerrillaKey: number; targetRgb: Rgb; guerrillaRgb: Rgb }> = [];
  for (const [guerrillaId, targetId] of guerrillaTargets) {
    const guerrillaHex = colorByCountry.get(guerrillaId);
    const targetHex = colorByCountry.get(targetId);
    if (!guerrillaHex || !targetHex) continue;
    const guerrillaRgb = parseHexColor(guerrillaHex);
    const targetRgb = parseHexColor(targetHex);
    if (!guerrillaRgb || !targetRgb) continue;
    const guerrillaKey = colorKey(guerrillaHex);
    if (guerrillaKey < 0 || protectedKeys.has(guerrillaKey)) continue;
    paintJobs.push({ guerrillaKey, targetRgb, guerrillaRgb });
  }
  if (!paintJobs.length) return { data: output, paintedPixels: 0 };

  const jobByKey = new Map(paintJobs.map((job) => [job.guerrillaKey, job]));
  let paintedPixels = 0;
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const offset = (y * input.width + x) * 4;
      if (output[offset + 3] < 128) continue;
      const key = pixelKey(output, offset);
      if (protectedKeys.has(key)) continue;
      const job = jobByKey.get(key);
      if (!job) continue;
      writeRgb(output, offset, isGuerrillaDot(x, y) ? job.guerrillaRgb : job.targetRgb);
      paintedPixels += 1;
    }
  }

  return { data: output, paintedPixels };
}
