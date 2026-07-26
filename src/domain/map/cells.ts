import { UNITS, cellArea, cellToBoundary, cellToLatLng, getResolution } from "h3-js";

type Point = [number, number];

function clipAtAntimeridian(points: Point[], keepLeft: boolean) {
  const result: Point[] = [];
  const inside = ([longitude]: Point) => (keepLeft ? longitude <= 180 : longitude >= 180);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) {
      const ratio = (180 - previous[0]) / (current[0] - previous[0]);
      result.push([180, previous[1] + ratio * (current[1] - previous[1])]);
    }
    if (currentInside) result.push(current);
  }
  return result;
}

function ringWkt(points: Point[]) {
  const closed = [...points, points[0]];
  return `((${closed
    .map(([longitude, latitude]) => `${longitude.toFixed(7)} ${latitude.toFixed(7)}`)
    .join(",")}))`;
}

export function getMapCellWkt(cellId: string) {
  const boundary = cellToBoundary(cellId, true) as Point[];
  const longitudes = boundary.map(([longitude]) => longitude);
  const crosses = Math.max(...longitudes) - Math.min(...longitudes) > 180;
  if (!crosses) return `MULTIPOLYGON(${ringWkt(boundary)})`;

  const shifted = boundary.map(
    ([longitude, latitude]) => [longitude < 0 ? longitude + 360 : longitude, latitude] as Point,
  );
  const left = clipAtAntimeridian(shifted, true);
  const right = clipAtAntimeridian(shifted, false).map(
    ([longitude, latitude]) => [longitude - 360, latitude] as Point,
  );
  const polygons = [left, right].filter((ring) => ring.length >= 3).map(ringWkt);
  return `MULTIPOLYGON(${polygons.join(",")})`;
}

export function getMapCellData(cellId: string) {
  const [latitude, longitude] = cellToLatLng(cellId);
  return {
    id: cellId,
    q: 0,
    r: getResolution(cellId),
    wkt: getMapCellWkt(cellId),
    centerLatitude: latitude.toFixed(7),
    centerLongitude: longitude.toFixed(7),
    areaKm2: cellArea(cellId, UNITS.km2).toFixed(4),
  };
}
