const DEG = Math.PI / 180;
const J2000 = 2_451_545;
const EARTH_RADIUS_KM = 6_371;
const SUN_RADIUS_KM = 695_700;
const MOON_RADIUS_KM = 1_737.4;
const ASTRONOMICAL_UNIT_KM = 149_597_870.7;

export type CelestialDirection = readonly [number, number, number];

export type CelestialBodyPosition = {
  longitude: number;
  latitude: number;
  direction: CelestialDirection;
  inertialDirection: CelestialDirection;
  distanceEarthRadii: number;
  angularRadius: number;
};

export type CelestialPositions = {
  sun: CelestialBodyPosition;
  moon: CelestialBodyPosition;
  moonIllumination: number;
};

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function wrapLongitude(value: number) {
  const normalized = normalizeDegrees(value + 180) - 180;
  return normalized === -180 ? 180 : normalized;
}

function julianDay(date: Date) {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

function meanObliquity(centuries: number) {
  const seconds = 21.448 - centuries * (46.815 + centuries * (0.00059 - centuries * 0.001813));
  return 23 + 26 / 60 + seconds / 3600;
}

function greenwichSiderealDegrees(julian: number, centuries: number) {
  const days = julian - J2000;
  return normalizeDegrees(
    280.46061837 +
      360.98564736629 * days +
      0.000387933 * centuries * centuries -
      (centuries * centuries * centuries) / 38_710_000,
  );
}

function equatorialToEarthFixed(
  rightAscension: number,
  declination: number,
  siderealDegrees: number,
  distanceEarthRadii: number,
  angularRadius: number,
): CelestialBodyPosition {
  const longitude = wrapLongitude(rightAscension - siderealDegrees);
  const latitude = declination;
  const lon = longitude * DEG;
  const lat = latitude * DEG;
  const cosLat = Math.cos(lat);
  const rightAscensionRadians = rightAscension * DEG;
  const declinationRadians = declination * DEG;
  const cosDeclination = Math.cos(declinationRadians);
  return {
    longitude,
    latitude,
    direction: [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)],
    inertialDirection: [
      cosDeclination * Math.cos(rightAscensionRadians),
      cosDeclination * Math.sin(rightAscensionRadians),
      Math.sin(declinationRadians),
    ],
    distanceEarthRadii,
    angularRadius,
  };
}

function eclipticToEquatorial(longitude: number, latitude: number, obliquity: number) {
  const lon = longitude * DEG;
  const lat = latitude * DEG;
  const tilt = obliquity * DEG;
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon) * Math.cos(tilt) - Math.sin(lat) * Math.sin(tilt);
  const z = Math.cos(lat) * Math.sin(lon) * Math.sin(tilt) + Math.sin(lat) * Math.cos(tilt);
  return {
    rightAscension: normalizeDegrees(Math.atan2(y, x) / DEG),
    declination: Math.asin(Math.max(-1, Math.min(1, z))) / DEG,
  };
}

function sunEquatorial(centuries: number) {
  const meanLongitude = normalizeDegrees(
    280.46646 + centuries * (36_000.76983 + 0.0003032 * centuries),
  );
  const meanAnomaly = normalizeDegrees(
    357.52911 + centuries * (35_999.05029 - 0.0001537 * centuries),
  );
  const anomaly = meanAnomaly * DEG;
  const equation =
    Math.sin(anomaly) * (1.914602 - centuries * (0.004817 + 0.000014 * centuries)) +
    Math.sin(2 * anomaly) * (0.019993 - 0.000101 * centuries) +
    Math.sin(3 * anomaly) * 0.000289;
  const omega = 125.04 - 1934.136 * centuries;
  const apparentLongitude = meanLongitude + equation - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const obliquity = meanObliquity(centuries) + 0.00256 * Math.cos(omega * DEG);
  const eccentricity = 0.016708634 - centuries * (0.000042037 + 0.0000001267 * centuries);
  const trueAnomaly = (meanAnomaly + equation) * DEG;
  const distanceKm =
    (ASTRONOMICAL_UNIT_KM * 1.000001018 * (1 - eccentricity * eccentricity)) /
    (1 + eccentricity * Math.cos(trueAnomaly));
  return {
    ...eclipticToEquatorial(apparentLongitude, 0, obliquity),
    distanceKm,
  };
}

function moonEquatorial(centuries: number) {
  const t2 = centuries * centuries;
  const t3 = t2 * centuries;
  const t4 = t3 * centuries;
  const meanLongitude = normalizeDegrees(
    218.3164477 + 481_267.88123421 * centuries - 0.0015786 * t2 + t3 / 538_841 - t4 / 65_194_000,
  );
  const elongation = normalizeDegrees(
    297.8501921 + 445_267.1114034 * centuries - 0.0018819 * t2 + t3 / 545_868 - t4 / 113_065_000,
  );
  const solarAnomaly = normalizeDegrees(
    357.5291092 + 35_999.0502909 * centuries - 0.0001536 * t2 + t3 / 24_490_000,
  );
  const lunarAnomaly = normalizeDegrees(
    134.9633964 + 477_198.8675055 * centuries + 0.0087414 * t2 + t3 / 69_699 - t4 / 14_712_000,
  );
  const latitudeArgument = normalizeDegrees(
    93.272095 + 483_202.0175233 * centuries - 0.0036539 * t2 - t3 / 3_526_000 + t4 / 863_310_000,
  );

  const d = elongation * DEG;
  const m = solarAnomaly * DEG;
  const mp = lunarAnomaly * DEG;
  const f = latitudeArgument * DEG;
  const longitude =
    meanLongitude +
    6.289 * Math.sin(mp) +
    1.274 * Math.sin(2 * d - mp) +
    0.658 * Math.sin(2 * d) +
    0.214 * Math.sin(2 * mp) -
    0.186 * Math.sin(m) -
    0.114 * Math.sin(2 * f) +
    0.059 * Math.sin(2 * d - 2 * mp) +
    0.057 * Math.sin(2 * d - m - mp) +
    0.053 * Math.sin(2 * d + mp) +
    0.046 * Math.sin(2 * d - m);
  const latitude =
    5.128 * Math.sin(f) +
    0.28 * Math.sin(mp + f) +
    0.277 * Math.sin(mp - f) +
    0.173 * Math.sin(2 * d - f) +
    0.055 * Math.sin(2 * d - mp + f) +
    0.046 * Math.sin(2 * d - mp - f) +
    0.033 * Math.sin(2 * d + f) +
    0.017 * Math.sin(2 * mp + f);
  const distanceKm =
    385_000.56 -
    20_905.355 * Math.cos(mp) -
    3_699.111 * Math.cos(2 * d - mp) -
    2_955.968 * Math.cos(2 * d) -
    569.925 * Math.cos(2 * mp) +
    246.158 * Math.cos(2 * mp - 2 * d) -
    204.586 * Math.cos(m - 2 * d) -
    170.733 * Math.cos(mp + 2 * d) -
    152.137 * Math.cos(mp + m - 2 * d);
  return {
    ...eclipticToEquatorial(longitude, latitude, meanObliquity(centuries)),
    distanceKm,
  };
}

/** 게임 시각의 태양·달 지상 직하점과 지구 고정 좌표 방향을 계산한다. */
export function celestialPositions(date: Date): CelestialPositions {
  const julian = julianDay(date);
  const centuries = (julian - J2000) / 36_525;
  const sidereal = greenwichSiderealDegrees(julian, centuries);
  const sunEquatorialPosition = sunEquatorial(centuries);
  const moonEquatorialPosition = moonEquatorial(centuries);
  const sun = equatorialToEarthFixed(
    sunEquatorialPosition.rightAscension,
    sunEquatorialPosition.declination,
    sidereal,
    sunEquatorialPosition.distanceKm / EARTH_RADIUS_KM,
    Math.asin(SUN_RADIUS_KM / sunEquatorialPosition.distanceKm),
  );
  const moon = equatorialToEarthFixed(
    moonEquatorialPosition.rightAscension,
    moonEquatorialPosition.declination,
    sidereal,
    moonEquatorialPosition.distanceKm / EARTH_RADIUS_KM,
    Math.asin(MOON_RADIUS_KM / moonEquatorialPosition.distanceKm),
  );
  const alignment = sun.direction.reduce(
    (sum, component, index) => sum + component * moon.direction[index],
    0,
  );
  return {
    sun,
    moon,
    moonIllumination: Math.max(0, Math.min(1, (1 - alignment) / 2)),
  };
}

/** 지구를 도는 카메라에서 실제 천체 위치를 바라본 전방 기준 단위 벡터다. */
export function celestialDirectionFromCamera(
  body: CelestialBodyPosition,
  centerLongitude: number,
  centerLatitude: number,
  zoom: number,
): CelestialDirection {
  const lon = centerLongitude * DEG;
  const lat = centerLatitude * DEG;
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const outward: CelestialDirection = [cosLat * cosLon, cosLat * sinLon, sinLat];
  const right: CelestialDirection = [-sinLon, cosLon, 0];
  const up: CelestialDirection = [-sinLat * cosLon, -sinLat * sinLon, cosLat];
  const cameraDistance = 1 + 1.2 / Math.max(zoom, 0.1);
  const relative: CelestialDirection = [
    body.direction[0] * body.distanceEarthRadii - outward[0] * cameraDistance,
    body.direction[1] * body.distanceEarthRadii - outward[1] * cameraDistance,
    body.direction[2] * body.distanceEarthRadii - outward[2] * cameraDistance,
  ];
  const length = Math.hypot(...relative);
  return [
    (relative[0] * right[0] + relative[1] * right[1] + relative[2] * right[2]) / length,
    (relative[0] * up[0] + relative[1] * up[1] + relative[2] * up[2]) / length,
    -(relative[0] * outward[0] + relative[1] * outward[1] + relative[2] * outward[2]) / length,
  ];
}

export function directionToView(
  direction: CelestialDirection,
  centerLongitude: number,
  centerLatitude: number,
) {
  const lon = centerLongitude * DEG;
  const lat = centerLatitude * DEG;
  const [x, y, z] = direction;
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  return {
    x: -sinLon * x + cosLon * y,
    y: -sinLat * cosLon * x - sinLat * sinLon * y + cosLat * z,
    z: cosLat * cosLon * x + cosLat * sinLon * y + sinLat * z,
  };
}
