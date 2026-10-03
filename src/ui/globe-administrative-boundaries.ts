export type AdministrativeBoundarySource = {
  level: 1 | 2;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
};

type PreparedPoint = {
  lon: number;
  sinLat: number;
  cosLat: number;
};

type PreparedBoundary = {
  level: 1 | 2;
  rings: PreparedPoint[][];
};

function preparePoint(coordinate: unknown): PreparedPoint | null {
  if (
    !Array.isArray(coordinate) ||
    coordinate.length < 2 ||
    typeof coordinate[0] !== "number" ||
    typeof coordinate[1] !== "number"
  ) {
    return null;
  }
  const latitude = (coordinate[1] * Math.PI) / 180;
  return {
    lon: (coordinate[0] * Math.PI) / 180,
    sinLat: Math.sin(latitude),
    cosLat: Math.cos(latitude),
  };
}

function geometryRings(source: AdministrativeBoundarySource) {
  const polygons =
    source.geometry.type === "Polygon"
      ? [source.geometry.coordinates]
      : source.geometry.coordinates;
  if (!Array.isArray(polygons)) return [];
  return polygons.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];
    return polygon.flatMap((ring) => {
      if (!Array.isArray(ring)) return [];
      const points = ring.flatMap((coordinate) => {
        const point = preparePoint(coordinate);
        return point ? [point] : [];
      });
      return points.length >= 2 ? [points] : [];
    });
  });
}

export function createGlobeAdministrativeBoundaryLayer(host: HTMLCanvasElement) {
  const context = host.getContext("2d");
  let boundaries: PreparedBoundary[] = [];
  let version = 0;
  let lastDrawKey = "";

  const drawLevel = (
    level: 1 | 2,
    view: { lon: number; lat: number },
    centerX: number,
    centerY: number,
    radius: number,
  ) => {
    if (!context) return;
    const lon0 = (view.lon * Math.PI) / 180;
    const lat0 = (view.lat * Math.PI) / 180;
    const sinLat0 = Math.sin(lat0);
    const cosLat0 = Math.cos(lat0);

    context.beginPath();
    for (const boundary of boundaries) {
      if (boundary.level !== level) continue;
      for (const ring of boundary.rings) {
        let drawing = false;
        for (const point of ring) {
          const delta = point.lon - lon0;
          const cosDelta = Math.cos(delta);
          const depth = sinLat0 * point.sinLat + cosLat0 * point.cosLat * cosDelta;
          if (depth <= 0.015) {
            drawing = false;
            continue;
          }
          const x = point.cosLat * Math.sin(delta);
          const y = cosLat0 * point.sinLat - sinLat0 * point.cosLat * cosDelta;
          const screenX = centerX + x * radius;
          const screenY = centerY - y * radius;
          if (drawing) context.lineTo(screenX, screenY);
          else {
            context.moveTo(screenX, screenY);
            drawing = true;
          }
        }
      }
    }
    context.stroke();
  };

  return {
    clear() {
      boundaries = [];
      version += 1;
      lastDrawKey = "";
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, host.width, host.height);
    },

    setBoundaries(source: AdministrativeBoundarySource[]) {
      boundaries = source.map((boundary) => ({
        level: boundary.level,
        rings: geometryRings(boundary),
      }));
      version += 1;
      lastDrawKey = "";
    },

    draw(params: {
      width: number;
      height: number;
      panelInset: number;
      view: { lon: number; lat: number; zoom: number };
    }) {
      if (!context) return;
      const { width, height, panelInset, view } = params;
      const drawKey = `${version}:${width}:${height}:${panelInset}:${view.lon}:${view.lat}:${view.zoom}`;
      if (drawKey === lastDrawKey) return;
      lastDrawKey = drawKey;

      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(width * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      if (host.width !== pixelWidth || host.height !== pixelHeight) {
        host.width = pixelWidth;
        host.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!boundaries.length) return;

      // WebGL과 같은 정수 픽셀 버퍼를 기준으로 계산해 소수 배율에서도 겹친다.
      const radius = (Math.min(pixelWidth, pixelHeight) / (2 * ratio)) * view.zoom;
      const centerX = (pixelWidth / ratio - panelInset) / 2;
      const centerY = pixelHeight / (2 * ratio);
      context.lineJoin = "round";
      context.lineCap = "round";

      context.strokeStyle = "rgba(225, 203, 161, 0.46)";
      context.lineWidth = 0.75;
      drawLevel(2, view, centerX, centerY, radius);

      context.strokeStyle = "rgba(242, 211, 151, 0.9)";
      context.lineWidth = 2.1;
      drawLevel(1, view, centerX, centerY, radius);
    },
  };
}

export type GlobeAdministrativeBoundaryLayer = ReturnType<
  typeof createGlobeAdministrativeBoundaryLayer
>;
