import { z } from "zod";
import { parseHexColor, rgbToHex, type Rgb } from "./image-colors";

export const borderKindSchema = z.enum([
  "COAST",
  "INACTIVE",
  "ACTIVE",
  "LEGAL",
  "GUERRILLA",
  "NONE",
]);
export type BorderKind = z.infer<typeof borderKindSchema>;

export const borderLayerKindSchema = z.enum(["COAST", "LEGAL", "ACTIVE", "INACTIVE", "GUERRILLA"]);
export type BorderLayerKind = z.infer<typeof borderLayerKindSchema>;

export const borderClassificationSchema = z.object({
  sourceColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  kind: borderKindSchema,
  displayColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const borderClassificationsSchema = z
  .array(borderClassificationSchema)
  .max(32)
  .superRefine((rows, context) => {
    const colors = rows.map((row) => row.sourceColor.toUpperCase());
    if (new Set(colors).size !== colors.length) {
      context.addIssue({ code: "custom", message: "같은 원본 국경색을 두 번 분류할 수 없습니다." });
    }
  });

export type BorderClassification = z.infer<typeof borderClassificationSchema>;

export const BORDER_KIND_LABELS: Record<BorderKind, string> = {
  COAST: "해안선",
  INACTIVE: "교착 국경선",
  ACTIVE: "전쟁 국경선",
  LEGAL: "국경선",
  GUERRILLA: "게릴라 전선",
  NONE: "국경 없음",
};

export const DEFAULT_BORDER_DISPLAY_COLORS: Record<Exclude<BorderKind, "NONE">, string> = {
  COAST: "#111827",
  INACTIVE: "#7D8794",
  ACTIVE: "#F04444",
  LEGAL: "#F5F5F5",
  GUERRILLA: "#F2B84B",
};

export const BORDER_LAYER_LABELS: Record<BorderLayerKind, string> = {
  COAST: "해안선",
  LEGAL: "국경선",
  ACTIVE: "전쟁 국경선",
  INACTIVE: "교착 국경선",
  GUERRILLA: "게릴라 국경선",
};

export const DEFAULT_BORDER_LAYER_COLORS: Record<BorderLayerKind, string> = {
  COAST: DEFAULT_BORDER_DISPLAY_COLORS.COAST,
  LEGAL: DEFAULT_BORDER_DISPLAY_COLORS.LEGAL,
  ACTIVE: DEFAULT_BORDER_DISPLAY_COLORS.ACTIVE,
  INACTIVE: DEFAULT_BORDER_DISPLAY_COLORS.INACTIVE,
  GUERRILLA: DEFAULT_BORDER_DISPLAY_COLORS.GUERRILLA,
};

export const DEFAULT_BORDER_SOURCE_COLORS: Record<BorderLayerKind, string> = {
  COAST: "#000078",
  LEGAL: "#000000",
  ACTIVE: "#F8F8F8",
  INACTIVE: "#F80000",
  GUERRILLA: "#F8B800",
};

export const borderLayerColorsSchema = z.object({
  COAST: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  LEGAL: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  ACTIVE: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  INACTIVE: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  GUERRILLA: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export function borderLayerKind(kind: BorderKind): BorderLayerKind | null {
  if (kind === "NONE") return null;
  return kind;
}

export function inferDefaultBorderClassifications(
  data: Uint8Array,
  colors: Record<BorderLayerKind, string> = DEFAULT_BORDER_LAYER_COLORS,
) {
  const candidates = (
    Object.entries(DEFAULT_BORDER_SOURCE_COLORS) as Array<[BorderLayerKind, string]>
  ).map(([kind, sourceColor]) => ({
    kind,
    sourceColor,
    key: rgbKey(...parseHexColor(sourceColor)!),
    count: 0,
  }));
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 128) continue;
    const candidate = byKey.get(quantizedPixelKey(data, offset));
    if (candidate) candidate.count += 1;
  }
  const coast = candidates.find((candidate) => candidate.kind === "COAST")?.count ?? 0;
  const legal = candidates.find((candidate) => candidate.kind === "LEGAL")?.count ?? 0;
  if (coast < 16 || legal < 16) return [];
  return candidates
    .filter((candidate) => candidate.count >= 16)
    .map(({ kind, sourceColor }) => ({
      sourceColor,
      kind,
      displayColor: colors[kind].toUpperCase(),
    })) satisfies BorderClassification[];
}

export function automaticBorderClassifications(
  colors: Record<BorderLayerKind, string> = DEFAULT_BORDER_LAYER_COLORS,
) {
  return (Object.entries(DEFAULT_BORDER_SOURCE_COLORS) as Array<[BorderLayerKind, string]>).map(
    ([kind, sourceColor]) => ({
      sourceColor,
      kind,
      displayColor: colors[kind].toUpperCase(),
    }),
  ) satisfies BorderClassification[];
}

export function quantizedPixelHex(data: Uint8Array, offset: number) {
  return rgbToHex([data[offset] & 0xf8, data[offset + 1] & 0xf8, data[offset + 2] & 0xf8]);
}

function rgbKey(red: number, green: number, blue: number) {
  return ((red & 0xf8) << 16) | ((green & 0xf8) << 8) | (blue & 0xf8);
}

function quantizedPixelKey(data: Uint8Array, offset: number) {
  return rgbKey(data[offset], data[offset + 1], data[offset + 2]);
}

export function classificationPalette(rows: BorderClassification[]) {
  return rows.map((row) => ({
    ...row,
    sourceColor: row.sourceColor.toUpperCase(),
    displayColor: row.displayColor.toUpperCase(),
    sourceRgb: parseHexColor(row.sourceColor)!,
    displayRgb: parseHexColor(row.displayColor)!,
    sourceKey: rgbKey(...parseHexColor(row.sourceColor)!),
  }));
}

function writeBorderClassifications(
  output: Uint8Array,
  base: Uint8Array,
  borderless: Uint8Array,
  rows: BorderClassification[],
) {
  const palette = new Map(classificationPalette(rows).map((row) => [row.sourceKey, row] as const));
  for (let offset = 0; offset < base.length; offset += 4) {
    const row = palette.get(quantizedPixelKey(base, offset));
    if (!row) {
      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
      output[offset + 3] = 0;
      continue;
    }
    if (row.kind === "NONE") {
      output[offset] = borderless[offset];
      output[offset + 1] = borderless[offset + 1];
      output[offset + 2] = borderless[offset + 2];
      output[offset + 3] = 255;
      continue;
    }
    output[offset] = row.displayRgb[0];
    output[offset + 1] = row.displayRgb[1];
    output[offset + 2] = row.displayRgb[2];
    output[offset + 3] = 255;
  }
  return output;
}

export function applyBorderClassifications(
  base: Uint8Array,
  borderless: Uint8Array,
  rows: BorderClassification[],
) {
  const output = new Uint8Array(base.length);
  return writeBorderClassifications(output, base, borderless, rows);
}

export function applyBorderClassificationsInPlace(
  base: Uint8Array,
  borderless: Uint8Array,
  rows: BorderClassification[],
) {
  return writeBorderClassifications(base, base, borderless, rows);
}

export function applyBorderLayerSettings(
  base: Uint8Array,
  rows: BorderClassification[],
  visibleLayers: Iterable<BorderLayerKind>,
  colors: Record<BorderLayerKind, string>,
) {
  const output = new Uint8Array(base.length);
  const visible = new Set(visibleLayers);
  const palette = new Map(
    classificationPalette(rows).map((row) => [row.sourceKey, borderLayerKind(row.kind)] as const),
  );
  const displayRgbs = Object.fromEntries(
    Object.entries(colors).map(([kind, color]) => [kind, parseHexColor(color)!]),
  ) as Record<BorderLayerKind, Rgb>;

  for (let offset = 0; offset < base.length; offset += 4) {
    const layer = palette.get(quantizedPixelKey(base, offset));
    if (!layer || !visible.has(layer)) continue;
    const display = displayRgbs[layer];
    output[offset] = display[0];
    output[offset + 1] = display[1];
    output[offset + 2] = display[2];
    output[offset + 3] = 255;
  }
  return output;
}

export function borderSourceRgbs(rows: BorderClassification[]): Rgb[] {
  return classificationPalette(rows).map((row) => row.sourceRgb);
}
