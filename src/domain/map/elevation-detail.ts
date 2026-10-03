export type ElevationDetailWindow = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const ELEVATION_DETAIL_MIN_ZOOM = 1.55;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapUnit(value: number) {
  return ((value % 1) + 1) % 1;
}

function windowForView(
  view: {
    lon: number;
    lat: number;
    zoom: number;
  },
  padding: number,
): ElevationDetailWindow | null {
  if (view.zoom < ELEVATION_DETAIL_MIN_ZOOM) return null;
  const angularRadius = (Math.asin(Math.min(1, 1 / view.zoom)) * 180) / Math.PI;
  const latitudeRadius = angularRadius * padding;
  const south = clamp(view.lat - latitudeRadius, -89.98, 89.98);
  const north = clamp(view.lat + latitudeRadius, -89.98, 89.98);
  const longitudeRadius = Math.min(
    90,
    (angularRadius * padding) / Math.max(0.24, Math.cos((view.lat * Math.PI) / 180)),
  );
  const spanLongitude = longitudeRadius * 2;
  const west = view.lon - longitudeRadius;
  return {
    left: wrapUnit((west + 180) / 360),
    top: (90 - north) / 180,
    width: spanLongitude / 360,
    height: (north - south) / 180,
  };
}

export function elevationVisibleWindow(view: {
  lon: number;
  lat: number;
  zoom: number;
}): ElevationDetailWindow | null {
  return windowForView(view, 1);
}

export function elevationDetailWindow(view: {
  lon: number;
  lat: number;
  zoom: number;
}): ElevationDetailWindow | null {
  return windowForView(view, 1.32);
}

export function elevationWindowContains(
  outer: ElevationDetailWindow,
  inner: ElevationDetailWindow,
) {
  const relativeLeft = wrapUnit(inner.left - outer.left);
  return (
    relativeLeft + inner.width <= outer.width + 0.000001 &&
    inner.top >= outer.top - 0.000001 &&
    inner.top + inner.height <= outer.top + outer.height + 0.000001
  );
}

export function elevationWindowStride(window: ElevationDetailWindow, textureSize: number) {
  const rawWidth = window.width * 21_600;
  const rawHeight = window.height * 10_800;
  return Math.max(1, Math.ceil(Math.max(rawWidth, rawHeight) / textureSize));
}

export function packElevationSamples(values: readonly number[], width: number, height: number) {
  const packed = new Uint8Array(width * height * 4);
  for (let outputY = 0; outputY < height; outputY += 1) {
    const inputY = height - outputY - 1;
    for (let x = 0; x < width; x += 1) {
      const meters = clamp(values[inputY * width + x] ?? -11_000, -11_000, 9_000);
      const encoded = Math.round(((meters + 11_000) / 20_000) * 65_535);
      const offset = (outputY * width + x) * 4;
      packed[offset] = encoded >> 8;
      packed[offset + 1] = encoded & 0xff;
      packed[offset + 2] = meters > 0 ? 255 : 0;
      packed[offset + 3] = 255;
    }
  }
  return packed;
}
