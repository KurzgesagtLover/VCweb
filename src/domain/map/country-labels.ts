import type { CountryEntityType } from "@/src/domain/country/entity-type";

export type LabelCountry = {
  id: string;
  name: string;
  entityType: CountryEntityType;
};

export type CountryLabelGlyph = {
  char: string;
  x: number;
  y: number;
  angle: number;
};

export type CountryLabel = {
  countryId: string;
  name: string;
  fontSize: number;
  glyphs: CountryLabelGlyph[];
};

export type CountryLabelLayout = {
  width: number;
  height: number;
  labels: CountryLabel[];
};

/** 국명을 지도에 새기는 대상. 무장·게릴라 단체는 제외한다. */
const LABELLED_ENTITY_TYPES = new Set<CountryEntityType>([
  "STATE",
  "PARTIALLY_RECOGNIZED_STATE",
  "QUASI_STATE",
]);

const GRID_TARGET = 480;
const BIN_COUNT = 15;
const MIN_FONT_SIZE = 7;
const MAX_FONT_SIZE = 64;

function quantizedHex(red: number, green: number, blue: number) {
  return (
    "#" +
    [red & 0xf8, green & 0xf8, blue & 0xf8]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function isWideChar(char: string) {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60)
  );
}

function charWidthEm(char: string) {
  if (char === " ") return 0.34;
  return isWideChar(char) ? 1 : 0.58;
}

/** 가중 최소제곱으로 v = a·u² + b·u + c 를 맞춘다. */
function fitQuadratic(points: Array<{ u: number; v: number; weight: number }>) {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let t0 = 0;
  let t1 = 0;
  let t2 = 0;
  for (const point of points) {
    const { u, v, weight } = point;
    const u2 = u * u;
    s0 += weight;
    s1 += weight * u;
    s2 += weight * u2;
    s3 += weight * u2 * u;
    s4 += weight * u2 * u2;
    t0 += weight * v;
    t1 += weight * v * u;
    t2 += weight * v * u2;
  }
  const matrix = [
    [s4, s3, s2],
    [s3, s2, s1],
    [s2, s1, s0],
  ];
  const vector = [t2, t1, t0];
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < 1e-9) return { a: 0, b: 0, c: 0 };
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    [vector[column], vector[pivot]] = [vector[pivot], vector[column]];
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column] / matrix[column][column];
      for (let col = column; col < 3; col += 1) matrix[row][col] -= factor * matrix[column][col];
      vector[row] -= factor * vector[column];
    }
  }
  return {
    a: vector[0] / matrix[0][0],
    b: vector[1] / matrix[1][1],
    c: vector[2] / matrix[2][2],
  };
}

type Cell = { gx: number; gy: number };

function largestConnectedRegion(cells: Cell[], gridWidth: number) {
  if (cells.length < 2) return cells;
  const index = new Map<number, Cell>();
  for (const cell of cells) index.set(cell.gy * gridWidth + cell.gx, cell);
  const seen = new Set<number>();
  let best: Cell[] = [];
  for (const cell of cells) {
    const start = cell.gy * gridWidth + cell.gx;
    if (seen.has(start)) continue;
    const region: Cell[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const key = stack.pop()!;
      const current = index.get(key)!;
      region.push(current);
      const neighbours = [
        key - 1,
        key + 1,
        key - gridWidth,
        key + gridWidth,
        key - gridWidth - 1,
        key - gridWidth + 1,
        key + gridWidth - 1,
        key + gridWidth + 1,
      ];
      for (const neighbour of neighbours) {
        if (seen.has(neighbour) || !index.has(neighbour)) continue;
        seen.add(neighbour);
        stack.push(neighbour);
      }
    }
    if (region.length > best.length) best = region;
  }
  return best;
}

function layoutSingleLabel(
  name: string,
  cells: Cell[],
  scale: number,
): { fontSize: number; glyphs: CountryLabelGlyph[] } | null {
  const count = cells.length;
  if (count < 6) return null;

  let sumX = 0;
  let sumY = 0;
  for (const cell of cells) {
    sumX += cell.gx;
    sumY += cell.gy;
  }
  const centerX = sumX / count;
  const centerY = sumY / count;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const cell of cells) {
    const dx = cell.gx - centerX;
    const dy = cell.gy - centerY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  let minU = Infinity;
  let maxU = -Infinity;
  let sumVV = 0;
  const projected: Array<{ u: number; v: number }> = [];
  for (const cell of cells) {
    const dx = cell.gx - centerX;
    const dy = cell.gy - centerY;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    projected.push({ u, v });
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    sumVV += v * v;
  }
  const spanU = maxU - minU;
  if (spanU <= 0) return null;
  const thickness = 4 * Math.sqrt(sumVV / count);

  const binWidth = spanU / BIN_COUNT;
  const binCounts = new Array<number>(BIN_COUNT).fill(0);
  const binSumV = new Array<number>(BIN_COUNT).fill(0);
  for (const point of projected) {
    const bin = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((point.u - minU) / binWidth)));
    binCounts[bin] += 1;
    binSumV[bin] += point.v;
  }

  // 양 끝의 가느다란 반도·섬은 글자 배치에서 제외한다.
  let cumulative = 0;
  let startBin = 0;
  let endBin = BIN_COUNT - 1;
  for (let bin = 0; bin < BIN_COUNT; bin += 1) {
    cumulative += binCounts[bin];
    if (cumulative >= count * 0.08) {
      startBin = bin;
      break;
    }
  }
  cumulative = 0;
  for (let bin = BIN_COUNT - 1; bin >= 0; bin -= 1) {
    cumulative += binCounts[bin];
    if (cumulative >= count * 0.08) {
      endBin = bin;
      break;
    }
  }
  if (endBin <= startBin) {
    startBin = 0;
    endBin = BIN_COUNT - 1;
  }

  const samples: Array<{ u: number; v: number; weight: number }> = [];
  for (let bin = startBin; bin <= endBin; bin += 1) {
    if (!binCounts[bin]) continue;
    samples.push({
      u: minU + (bin + 0.5) * binWidth,
      v: binSumV[bin] / binCounts[bin],
      weight: binCounts[bin],
    });
  }
  if (samples.length < 2) return null;
  const curve = samples.length >= 3 ? fitQuadratic(samples) : { a: 0, b: 0, c: 0 };

  const usableStart = minU + startBin * binWidth;
  const usableEnd = minU + (endBin + 1) * binWidth;
  const usableLength = (usableEnd - usableStart) * 0.9;
  const characters = [...name.trim()];
  if (!characters.length) return null;
  const emWidth = characters.reduce((total, char) => total + charWidthEm(char), 0);

  const fontSize = Math.min(
    (usableLength / emWidth) * scale,
    thickness * 0.8 * scale,
    MAX_FONT_SIZE,
  );
  if (fontSize < MIN_FONT_SIZE) return null;

  const gridFont = fontSize / scale;
  const naturalWidth = emWidth * gridFont;
  const extraSpace = Math.max(0, usableLength - naturalWidth);
  const letterSpacing =
    characters.length > 1 ? Math.min(extraSpace / (characters.length - 1), gridFont * 0.9) : 0;
  const totalWidth = naturalWidth + letterSpacing * (characters.length - 1);

  const midU = (usableStart + usableEnd) / 2;
  let cursor = midU - totalWidth / 2;
  const glyphs: CountryLabelGlyph[] = [];
  for (const char of characters) {
    const advance = charWidthEm(char) * gridFont;
    const u = cursor + advance / 2;
    const v = curve.a * u * u + curve.b * u + curve.c;
    const slope = 2 * curve.a * u + curve.b;
    const tangent = Math.atan(slope);
    // 공백도 구면 라벨의 한 글자 칸으로 전달한다. 렌더러에서는 보이지 않지만
    // 앞뒤 글자 사이의 표면 거리를 계산할 때 정확한 빈 칸으로 사용된다.
    glyphs.push({
      char,
      x: (centerX + u * cos - v * sin) * scale,
      y: (centerY + u * sin + v * cos) * scale,
      angle: ((theta + tangent) * 180) / Math.PI,
    });
    cursor += advance + letterSpacing;
  }
  return glyphs.length ? { fontSize, glyphs } : null;
}

/**
 * 래스터 픽셀에서 국가별 영토를 읽어 국명을 영토 위 곡선에 배치한다.
 * 좌표는 입력 래스터 픽셀 기준이다.
 */
export function layoutCountryLabels(input: {
  data: Uint8Array;
  width: number;
  height: number;
  assignments: Array<{ colorHex: string; countryId: string }>;
  countries: LabelCountry[];
}): CountryLabelLayout {
  const { data, width, height } = input;
  const countryById = new Map(input.countries.map((country) => [country.id, country]));
  const countryByColor = new Map<string, string>();
  for (const assignment of input.assignments) {
    const country = countryById.get(assignment.countryId);
    if (!country || !LABELLED_ENTITY_TYPES.has(country.entityType)) continue;
    countryByColor.set(assignment.colorHex.toUpperCase(), assignment.countryId);
  }
  if (!countryByColor.size) return { width, height, labels: [] };

  const scale = Math.max(1, Math.round(Math.max(width, height) / GRID_TARGET));
  const gridWidth = Math.ceil(width / scale);
  const gridHeight = Math.ceil(height / scale);
  const cellsByCountry = new Map<string, Cell[]>();

  for (let gy = 0; gy < gridHeight; gy += 1) {
    const y = Math.min(height - 1, Math.floor(gy * scale + scale / 2));
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const x = Math.min(width - 1, Math.floor(gx * scale + scale / 2));
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < 128) continue;
      const countryId = countryByColor.get(
        quantizedHex(data[offset], data[offset + 1], data[offset + 2]),
      );
      if (!countryId) continue;
      const bucket = cellsByCountry.get(countryId);
      if (bucket) bucket.push({ gx, gy });
      else cellsByCountry.set(countryId, [{ gx, gy }]);
    }
  }

  const labels: CountryLabel[] = [];
  for (const [countryId, cells] of cellsByCountry) {
    const country = countryById.get(countryId);
    if (!country) continue;
    const region = largestConnectedRegion(cells, gridWidth);
    const layout = layoutSingleLabel(country.name, region, scale);
    if (!layout) continue;
    labels.push({
      countryId,
      name: country.name,
      fontSize: Math.round(layout.fontSize * 10) / 10,
      glyphs: layout.glyphs,
    });
  }
  return { width, height, labels };
}
