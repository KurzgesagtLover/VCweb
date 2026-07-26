export type Rgb = readonly [number, number, number];

export type DetectedMapColor = {
  hex: string;
  rgb: Rgb;
  samples: number;
  percentage: number;
};

export function parseHexColor(value: string): Rgb | null {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: Rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function detectMapColors(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
  maxColors = 256,
) {
  const pixelCount = width * height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(pixelCount / 1_000_000)));
  const counts = new Map<string, { rgb: Rgb; samples: number }>();
  let coloredSamples = 0;
  let borderSamples = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = channels >= 4 ? data[offset + 3] : 255;
      if (alpha < 128 || (red <= 32 && green <= 32 && blue <= 32)) {
        borderSamples += 1;
        continue;
      }
      const rgb: Rgb = [red & 0xf8, green & 0xf8, blue & 0xf8];
      const hex = rgbToHex(rgb);
      const current = counts.get(hex);
      if (current) current.samples += 1;
      else counts.set(hex, { rgb, samples: 1 });
      coloredSamples += 1;
    }
  }

  const minimumSamples =
    coloredSamples < 100 ? 1 : Math.max(4, Math.floor(coloredSamples * 0.0002));
  const colors: DetectedMapColor[] = [...counts.entries()]
    .filter(([, value]) => value.samples >= minimumSamples)
    .sort((left, right) => right[1].samples - left[1].samples)
    .slice(0, maxColors)
    .map(([hex, value]) => ({
      hex,
      rgb: value.rgb,
      samples: value.samples,
      percentage: coloredSamples ? (value.samples / coloredSamples) * 100 : 0,
    }));

  return { colors, coloredSamples, borderSamples, stride };
}

export function matchCountryColor<T>(
  pixel: readonly [number, number, number, number],
  palette: ReadonlyArray<{ value: T; rgb: Rgb }>,
  tolerance = 28,
): { kind: "border" } | { kind: "unmatched" } | { kind: "country"; value: T } {
  const [red, green, blue, alpha] = pixel;
  if (alpha < 128 || (red <= 32 && green <= 32 && blue <= 32)) return { kind: "border" };

  let best: { value: T; rgb: Rgb } | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const distance =
      (red - candidate.rgb[0]) ** 2 +
      (green - candidate.rgb[1]) ** 2 +
      (blue - candidate.rgb[2]) ** 2;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (!best || bestDistance > tolerance ** 2 * 3) return { kind: "unmatched" };
  return { kind: "country", value: best.value };
}
