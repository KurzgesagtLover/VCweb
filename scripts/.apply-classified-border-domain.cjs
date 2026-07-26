const fs = require("node:fs");

function edit(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one match, found ${count}`);
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

edit(
  "src/domain/map/raster-territory.ts",
  `function matchesRgb(data: Uint8Array, offset: number, rgb: Rgb, tolerance = 8) {`,
  `function matchesRgb(data: Uint8Array, offset: number, rgb: Rgb, tolerance = 8) {`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `function setRgb(data: Uint8Array, offset: number, rgb: Rgb) {`,
  `function matchesAny(data: Uint8Array, offset: number, colors: Rgb[]) {
  return colors.some((color) => matchesRgb(data, offset, color));
}

function setRgb(data: Uint8Array, offset: number, rgb: Rgb) {`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `  source: Rgb,
  target: Rgb,
) {`,
  `  source: Rgb,
  target: Rgb,
  barrierColors: Rgb[] = [],
) {`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `      if (isBlack(data, offset) || !matchesRgb(data, offset, source)) continue;`,
  `      if (
        isBlack(data, offset) ||
        matchesAny(data, offset, barrierColors) ||
        !matchesRgb(data, offset, source)
      )
        continue;`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `  ocean: Rgb,
  target: Rgb,
) {`,
  `  ocean: Rgb,
  target: Rgb,
  barrierColors: Rgb[] = [],
) {`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `        if (isBlack(data, offset) || matchesRgb(data, offset, ocean, 20)) continue;`,
  `        if (
          isBlack(data, offset) ||
          matchesAny(data, offset, barrierColors) ||
          matchesRgb(data, offset, ocean, 20)
        )
          continue;`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `export function removeBlackBorders(data: Uint8Array, width: number, height: number) {
  const output = new Uint8Array(data);
  let pending: number[] = [];
  for (let index = 0; index < width * height; index += 1) {
    if (isBlack(data, index * 4)) pending.push(index);
  }`,
  `export function removeRasterBorders(
  data: Uint8Array,
  width: number,
  height: number,
  borderColors: Rgb[] = [],
) {
  const output = new Uint8Array(data);
  const isBorder = (pixels: Uint8Array, offset: number) =>
    isBlack(pixels, offset) || matchesAny(pixels, offset, borderColors);
  let pending: number[] = [];
  for (let index = 0; index < width * height; index += 1) {
    if (isBorder(data, index * 4)) pending.push(index);
  }`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `          if (isBlack(output, offset)) continue;`,
  `          if (isBorder(output, offset)) continue;`,
);

edit(
  "src/domain/map/raster-territory.ts",
  `  return output;
}
`,
  `  return output;
}

export function removeBlackBorders(data: Uint8Array, width: number, height: number) {
  return removeRasterBorders(data, width, height);
}
`,
);

edit(
  "src/db/schema/world.ts",
  `  strokes: jsonb("strokes")
    .$type<
      Array<{
        type: "INACTIVE" | "ACTIVE" | "LEGAL" | "GUERRILLA" | "NONE";
        width: number;
        points: Array<{ x: number; y: number }>;
      }>
    >()
    .notNull()
    .default([]),
  colors: jsonb("colors")
    .$type<Record<"INACTIVE" | "ACTIVE" | "LEGAL" | "GUERRILLA", string>>()
    .notNull(),`,
  `  classifications: jsonb("classifications")
    .$type<
      Array<{
        sourceColor: string;
        kind: "INACTIVE" | "ACTIVE" | "LEGAL" | "GUERRILLA" | "NONE";
        displayColor: string;
      }>
    >()
    .notNull()
    .default([]),`,
);
