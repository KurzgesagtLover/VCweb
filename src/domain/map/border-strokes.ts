import { z } from "zod";

export const borderTypeSchema = z.enum(["INACTIVE", "ACTIVE", "LEGAL", "GUERRILLA", "NONE"]);
export type BorderType = z.infer<typeof borderTypeSchema>;

export const borderStrokeSchema = z.object({
  type: borderTypeSchema,
  width: z.number().min(1).max(64),
  points: z
    .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .min(1)
    .max(20_000),
});

export type BorderStroke = z.infer<typeof borderStrokeSchema>;

export const borderColorsSchema = z.object({
  INACTIVE: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  ACTIVE: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  LEGAL: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  GUERRILLA: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export type BorderColors = z.infer<typeof borderColorsSchema>;

export const DEFAULT_BORDER_COLORS: BorderColors = {
  INACTIVE: "#7D8794",
  ACTIVE: "#F04444",
  LEGAL: "#F5F5F5",
  GUERRILLA: "#F2B84B",
};

export function strokeSvg(
  width: number,
  height: number,
  strokes: BorderStroke[],
  colors: BorderColors,
  filter?: (stroke: BorderStroke) => boolean,
) {
  const lines = strokes
    .filter((stroke) => (filter ? filter(stroke) : true))
    .map((stroke) => {
      const color = stroke.type === "NONE" ? "#FFFFFF" : colors[stroke.type];
      const points = stroke.points
        .map((point) => `${Math.round(point.x * width)},${Math.round(point.y * height)}`)
        .join(" ");
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`,
  );
}

