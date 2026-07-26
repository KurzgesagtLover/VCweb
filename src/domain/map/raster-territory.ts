import type { Rgb } from "./image-colors";

export type TerritoryAssignmentMode = "COLOR" | "REGION" | "ISLAND";
export type RasterPoint = { x: number; y: number };

export function interpolateRasterPoints(from: RasterPoint, to: RasterPoint, spacing = 1) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, spacing)));
  const points: RasterPoint[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const point = {
      x: Math.round(from.x + (to.x - from.x) * ratio),
      y: Math.round(from.y + (to.y - from.y) * ratio),
    };
    const previous = points.at(-1);
    if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
  }
  return points;
}

function isBlack(data: Uint8Array, offset: number) {
  return (
    data[offset + 3] < 128 ||
    (data[offset] <= 32 && data[offset + 1] <= 32 && data[offset + 2] <= 32)
  );
}

function matchesRgb(data: Uint8Array, offset: number, rgb: Rgb, tolerance = 8) {
  return (
    Math.abs(data[offset] - rgb[0]) <= tolerance &&
    Math.abs(data[offset + 1] - rgb[1]) <= tolerance &&
    Math.abs(data[offset + 2] - rgb[2]) <= tolerance &&
    data[offset + 3] >= 128
  );
}

function matchesAny(data: Uint8Array, offset: number, colors: Rgb[]) {
  return colors.some((color) => matchesRgb(data, offset, color));
}

function setRgb(data: Uint8Array, offset: number, rgb: Rgb) {
  data[offset] = rgb[0];
  data[offset + 1] = rgb[1];
  data[offset + 2] = rgb[2];
  data[offset + 3] = 255;
}

export function assignColorPixels(
  data: Uint8Array,
  width: number,
  height: number,
  source: Rgb,
  target: Rgb,
  barrierColors: Rgb[] = [],
) {
  let changed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        isBlack(data, offset) ||
        matchesAny(data, offset, barrierColors) ||
        !matchesRgb(data, offset, source)
      )
        continue;
      setRgb(data, offset, target);
      changed += 1;
    }
  }
  return changed;
}

export function assignConnectedRegion(
  data: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  target: Rgb,
) {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return 0;
  const startOffset = (startY * width + startX) * 4;
  if (isBlack(data, startOffset)) return 0;
  const source: Rgb = [data[startOffset], data[startOffset + 1], data[startOffset + 2]];
  if (matchesRgb(data, startOffset, target, 0)) return 0;

  const stack: Array<[number, number]> = [[startX, startY]];
  let changed = 0;
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const [x, y] = next;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const offset = (y * width + x) * 4;
    if (!matchesRgb(data, offset, source, 0)) continue;
    setRgb(data, offset, target);
    changed += 1;
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return changed;
}

export function assignIslandBrush(
  data: Uint8Array,
  width: number,
  height: number,
  points: RasterPoint[],
  radius: number,
  ocean: Rgb,
  target: Rgb,
  barrierColors: Rgb[] = [],
) {
  const safeRadius = Math.max(1, Math.min(256, Math.round(radius)));
  const radiusSquared = safeRadius * safeRadius;
  let changed = 0;
  const touched = new Set<number>();
  for (const point of points) {
    const startX = Math.max(0, Math.floor(point.x - safeRadius));
    const endX = Math.min(width - 1, Math.ceil(point.x + safeRadius));
    const startY = Math.max(0, Math.floor(point.y - safeRadius));
    const endY = Math.min(height - 1, Math.ceil(point.y + safeRadius));
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        if ((x - point.x) ** 2 + (y - point.y) ** 2 > radiusSquared) continue;
        const pixelIndex = y * width + x;
        if (touched.has(pixelIndex)) continue;
        touched.add(pixelIndex);
        const offset = pixelIndex * 4;
        if (
          isBlack(data, offset) ||
          matchesAny(data, offset, barrierColors) ||
          matchesRgb(data, offset, ocean, 20)
        )
          continue;
        if (matchesRgb(data, offset, target, 0)) continue;
        setRgb(data, offset, target);
        changed += 1;
      }
    }
  }
  return changed;
}

export function removeRasterBorders(
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
  }

  for (let pass = 0; pass < 5 && pending.length > 0; pass += 1) {
    const nextPending: number[] = [];
    const updates: Array<{ offset: number; rgb: Rgb }> = [];
    for (const pixelIndex of pending) {
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const candidates = new Map<string, { rgb: Rgb; count: number }>();
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= height)
            continue;
          const offset = ((y + dy) * width + x + dx) * 4;
          if (isBorder(output, offset)) continue;
          const rgb: Rgb = [output[offset], output[offset + 1], output[offset + 2]];
          const key = rgb.join(",");
          const existing = candidates.get(key);
          if (existing) existing.count += 1;
          else candidates.set(key, { rgb, count: 1 });
        }
      }
      const best = [...candidates.values()].sort((left, right) => right.count - left.count)[0];
      if (best) updates.push({ offset: pixelIndex * 4, rgb: best.rgb });
      else nextPending.push(pixelIndex);
    }
    for (const update of updates) setRgb(output, update.offset, update.rgb);
    pending = nextPending;
  }
  return output;
}

export function removeBlackBorders(data: Uint8Array, width: number, height: number) {
  return removeRasterBorders(data, width, height);
}
