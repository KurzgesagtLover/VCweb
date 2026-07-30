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

export const borderLayerKindSchema = z.enum(["COAST", "LEGAL", "ACTIVE", "INACTIVE"]);
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
};

export const DEFAULT_BORDER_LAYER_COLORS: Record<BorderLayerKind, string> = {
  COAST: DEFAULT_BORDER_DISPLAY_COLORS.COAST,
  LEGAL: DEFAULT_BORDER_DISPLAY_COLORS.LEGAL,
  ACTIVE: DEFAULT_BORDER_DISPLAY_COLORS.ACTIVE,
  INACTIVE: DEFAULT_BORDER_DISPLAY_COLORS.INACTIVE,
};

export function borderLayerKind(kind: BorderKind): BorderLayerKind | null {
  if (kind === "NONE") return null;
  if (kind === "GUERRILLA") return "ACTIVE";
  return kind;
}

export function quantizedPixelHex(data: Uint8Array, offset: number) {
  return rgbToHex([data[offset] & 0xf8, data[offset + 1] & 0xf8, data[offset + 2] & 0xf8]);
}

export function classificationPalette(rows: BorderClassification[]) {
  return rows.map((row) => ({
    ...row,
    sourceColor: row.sourceColor.toUpperCase(),
    displayColor: row.displayColor.toUpperCase(),
    sourceRgb: parseHexColor(row.sourceColor)!,
    displayRgb: parseHexColor(row.displayColor)!,
  }));
}

export function applyBorderClassifications(
  base: Uint8Array,
  borderless: Uint8Array,
  rows: BorderClassification[],
) {
  const output = new Uint8Array(base.length);
  const palette = new Map(
    classificationPalette(rows).map((row) => [row.sourceColor, row] as const),
  );
  for (let offset = 0; offset < base.length; offset += 4) {
    const row = palette.get(quantizedPixelHex(base, offset));
    if (!row) continue;
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

export function applyBorderLayerSettings(
  base: Uint8Array,
  rows: BorderClassification[],
  visibleLayers: Iterable<BorderLayerKind>,
  colors: Record<BorderLayerKind, string>,
) {
  const output = new Uint8Array(base.length);
  const visible = new Set(visibleLayers);
  const palette = new Map(
    classificationPalette(rows).map((row) => [row.sourceColor, borderLayerKind(row.kind)] as const),
  );
  const displayRgbs = Object.fromEntries(
    Object.entries(colors).map(([kind, color]) => [kind, parseHexColor(color)!]),
  ) as Record<BorderLayerKind, Rgb>;

  for (let offset = 0; offset < base.length; offset += 4) {
    const layer = palette.get(quantizedPixelHex(base, offset));
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
