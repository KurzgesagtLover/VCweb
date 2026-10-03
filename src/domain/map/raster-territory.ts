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
    matchesAny(pixels, offset, borderColors);
  const pixelCount = width * height;
  const fillDepth = new Uint8Array(pixelCount);
  fillDepth.fill(255);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (!isBorder(data, pixelIndex * 4)) fillDepth[pixelIndex] = 0;
  }

  for (let pass = 1; pass <= 5; pass += 1) {
    let changed = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        if (fillDepth[pixelIndex] !== 255) continue;
        let sourceIndex = -1;
        if (y > 0 && fillDepth[pixelIndex - width] < pass) sourceIndex = pixelIndex - width;
        else if (x > 0 && fillDepth[pixelIndex - 1] < pass) sourceIndex = pixelIndex - 1;
        else if (x + 1 < width && fillDepth[pixelIndex + 1] < pass) sourceIndex = pixelIndex + 1;
        else if (y + 1 < height && fillDepth[pixelIndex + width] < pass)
          sourceIndex = pixelIndex + width;
        else if (x > 0 && y > 0 && fillDepth[pixelIndex - width - 1] < pass)
          sourceIndex = pixelIndex - width - 1;
        else if (x + 1 < width && y > 0 && fillDepth[pixelIndex - width + 1] < pass)
          sourceIndex = pixelIndex - width + 1;
        else if (x > 0 && y + 1 < height && fillDepth[pixelIndex + width - 1] < pass)
          sourceIndex = pixelIndex + width - 1;
        else if (x + 1 < width && y + 1 < height && fillDepth[pixelIndex + width + 1] < pass)
          sourceIndex = pixelIndex + width + 1;
        if (sourceIndex < 0) continue;
        const sourceOffset = sourceIndex * 4;
        const targetOffset = pixelIndex * 4;
        output[targetOffset] = output[sourceOffset];
        output[targetOffset + 1] = output[sourceOffset + 1];
        output[targetOffset + 2] = output[sourceOffset + 2];
        output[targetOffset + 3] = 255;
        fillDepth[pixelIndex] = pass;
        changed += 1;
      }
    }
    if (!changed) break;
  }
  return output;
}

export function removeBlackBorders(data: Uint8Array, width: number, height: number) {
  return removeRasterBorders(data, width, height, [[0, 0, 0]]);
}
