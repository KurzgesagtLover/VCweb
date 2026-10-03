export type GlobeCitySource = {
  id: string;
  name: string;
  nameKo: string | null;
  countryM49: string;
  latitude: number;
  longitude: number;
  population: number;
  populationYear: number;
  isCapital: boolean;
  sizeClass: number;
};

const SURFACE_ALTITUDE = 1;
const LIMB_CUTOFF = 0.18;
const LABEL_LIMB_CUTOFF = 0.34;
const MAX_LABELS = 140;

type PreparedCity = {
  source: GlobeCitySource;
  lon: number;
  sinLat: number;
  cosLat: number;
};

type ProjectedCity = {
  city: PreparedCity;
  kind: ReturnType<typeof cityKind>;
  depth: number;
  x: number;
  y: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cityKind(population: number) {
  if (population >= 10_000_000) return "megacity";
  if (population >= 1_000_000) return "large-city";
  if (population >= 250_000) return "city";
  return "small-city";
}

export function cityPopulationThreshold(zoom: number) {
  if (zoom < 1.05) return 5_000_000;
  if (zoom < 1.5) return 2_500_000;
  if (zoom < 2.2) return 1_000_000;
  if (zoom < 3.5) return 250_000;
  if (zoom < 5.5) return 100_000;
  return 50_000;
}

export function citiesForZoom(cities: GlobeCitySource[], zoom: number) {
  const minimumPopulation = cityPopulationThreshold(zoom);
  return cities.filter((city) => city.population >= minimumPopulation);
}

function labelPopulationThreshold(zoom: number) {
  if (zoom < 1.05) return 10_000_000;
  if (zoom < 1.4) return 5_000_000;
  if (zoom < 1.9) return 2_500_000;
  if (zoom < 2.7) return 750_000;
  return 180_000;
}

function overlaps(
  left: number,
  top: number,
  right: number,
  bottom: number,
  occupied: Array<[number, number, number, number]>,
) {
  return occupied.some(
    ([otherLeft, otherTop, otherRight, otherBottom]) =>
      left < otherRight && right > otherLeft && top < otherBottom && bottom > otherTop,
  );
}

export function createGlobeCityLayer(host: HTMLCanvasElement) {
  let cities: PreparedCity[] = [];
  let projectedCities: ProjectedCity[] = [];
  let selectableCityIds = new Set<string>();
  let selectedCityId: string | null = null;
  let lastDrawKey = "";
  const context = host.getContext("2d");

  return {
    clear() {
      cities = [];
      projectedCities = [];
      lastDrawKey = "";
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, host.width, host.height);
    },

    setCities(source: GlobeCitySource[]) {
      lastDrawKey = "";
      cities = [...source]
        .sort(
          (left, right) =>
            Number(right.isCapital) - Number(left.isCapital) || right.population - left.population,
        )
        .map((city) => {
          const radians = (city.latitude * Math.PI) / 180;
          return {
            source: city,
            lon: (city.longitude * Math.PI) / 180,
            sinLat: Math.sin(radians),
            cosLat: Math.cos(radians),
          };
        });
    },

    setInteractiveCities(cityIds: string[], selectedId: string | null) {
      selectableCityIds = new Set(cityIds);
      selectedCityId = selectedId;
      lastDrawKey = "";
    },

    hitTest(x: number, y: number) {
      let nearest: ProjectedCity | null = null;
      let nearestDistance = 11;
      for (const point of projectedCities) {
        if (!selectableCityIds.has(point.city.source.id)) continue;
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance >= nearestDistance) continue;
        nearest = point;
        nearestDistance = distance;
      }
      return nearest?.city.source ?? null;
    },

    draw(params: {
      width: number;
      height: number;
      panelInset: number;
      view: { lon: number; lat: number; zoom: number };
    }) {
      if (!context) return;
      const { width, height, panelInset, view } = params;
      const drawKey = `${width}:${height}:${panelInset}:${view.lon}:${view.lat}:${view.zoom}`;
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

      const radius = (Math.min(width, height) / 2) * view.zoom;
      const panelWidth = Math.abs(panelInset);
      const mapWidth = width - panelWidth;
      const mapLeft = panelInset < 0 ? panelWidth : 0;
      const mapRight = mapLeft + mapWidth;
      const centerX = mapLeft + mapWidth / 2;
      const centerY = height / 2;
      const lon0 = (view.lon * Math.PI) / 180;
      const lat0 = (view.lat * Math.PI) / 180;
      const sinLat0 = Math.sin(lat0);
      const cosLat0 = Math.cos(lat0);
      const labelThreshold = labelPopulationThreshold(view.zoom);
      const projected: ProjectedCity[] = [];
      const occupied: Array<[number, number, number, number]> = [];
      let labelCount = 0;

      for (const city of cities) {
        const delta = city.lon - lon0;
        const cosDelta = Math.cos(delta);
        const depth = sinLat0 * city.sinLat + cosLat0 * city.cosLat * cosDelta;
        if (depth <= LIMB_CUTOFF) continue;
        const x = city.cosLat * Math.sin(delta);
        const y = cosLat0 * city.sinLat - sinLat0 * city.cosLat * cosDelta;
        const screenX = centerX + x * radius * SURFACE_ALTITUDE;
        const screenY = centerY - y * radius * SURFACE_ALTITUDE;
        if (
          screenX < mapLeft - 6 ||
          screenX > mapRight + 6 ||
          screenY < -6 ||
          screenY > height + 6
        ) {
          continue;
        }
        projected.push({
          city,
          kind: cityKind(city.source.population),
          depth,
          x: screenX,
          y: screenY,
        });
      }
      projectedCities = projected;

      context.save();
      context.globalAlpha = 0.64;
      context.fillStyle = "#f1ddae";
      context.beginPath();
      for (const point of projected) {
        if (point.kind === "megacity") {
          context.rect(point.x - 2.75, point.y - 2.75, 5.5, 5.5);
        } else if (point.kind === "large-city") {
          context.rect(point.x - 1.9, point.y - 1.9, 3.8, 3.8);
        } else {
          const radius = point.kind === "city" ? 1 : 0.55;
          context.moveTo(point.x + radius, point.y);
          context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        }
      }
      context.fill();
      context.fillStyle = "#15110a";
      context.beginPath();
      for (const point of projected) {
        if (point.kind === "megacity") context.rect(point.x - 0.9, point.y - 0.9, 1.8, 1.8);
      }
      context.fill();
      context.restore();

      if (selectableCityIds.size) {
        context.save();
        context.strokeStyle = "#77efeb";
        context.lineWidth = 1.2;
        for (const point of projected) {
          if (!selectableCityIds.has(point.city.source.id)) continue;
          context.beginPath();
          context.arc(
            point.x,
            point.y,
            point.city.source.id === selectedCityId ? 7 : 4.5,
            0,
            Math.PI * 2,
          );
          context.stroke();
        }
        context.restore();
      }

      const fontSize = 9.4 + clamp((view.zoom - 1) * 0.3, 0, 1.4);
      const fontFamily = getComputedStyle(host).fontFamily || "sans-serif";
      context.fillStyle = "#f7f1df";
      context.font = `400 ${fontSize.toFixed(2)}px ${fontFamily}`;
      context.textBaseline = "alphabetic";

      for (const point of projected) {
        const city = point.city;
        if (point.depth <= LABEL_LIMB_CUTOFF) continue;

        const showByRank =
          city.source.population >= labelThreshold ||
          (city.source.isCapital && city.source.population >= labelThreshold * 0.38);
        if (!showByRank || labelCount >= MAX_LABELS) continue;
        const displayName = city.source.nameKo ?? city.source.name;
        const labelWidth = Math.max(18, context.measureText(displayName).width);
        const left = point.x + 4;
        const right = left + labelWidth;
        const top = point.y - fontSize - 5;
        const bottom = point.y + 2;
        if (
          left < mapLeft ||
          right > mapRight ||
          top < 0 ||
          bottom > height ||
          overlaps(left, top, right, bottom, occupied)
        )
          continue;
        occupied.push([left - 3, top - 2, right + 3, bottom + 2]);
        labelCount += 1;
        context.fillText(displayName, left, point.y - 3);
      }
    },
  };
}

export type GlobeCityLayer = ReturnType<typeof createGlobeCityLayer>;
