export const MAP_PROJECTIONS = [
  "EQUIRECTANGULAR",
  "MERCATOR",
  "MOLLWEIDE",
  "ROBINSON",
  "WINKEL_TRIPEL",
  "EQUAL_EARTH",
] as const;

export type MapProjection = (typeof MAP_PROJECTIONS)[number];

export const DEFAULT_MAP_PROJECTION: MapProjection = "EQUIRECTANGULAR";

export const MAP_PROJECTION_LABELS: Record<MapProjection, string> = {
  EQUIRECTANGULAR: "정거원통 (2:1 위경도 격자)",
  MERCATOR: "메르카토르 (정사각 세계지도)",
  MOLLWEIDE: "몰바이데 (타원)",
  ROBINSON: "로빈슨 (PROJ 표준)",
  WINKEL_TRIPEL: "빙켈 트리펠 (내셔널지오그래픽식)",
  EQUAL_EARTH: "이퀄 어스",
};

/** 투영별 좌우/상하 최대 좌표 비율. 이미지 가로세로비 추정과 UV 정규화에 함께 사용한다. */
export const MAP_PROJECTION_ASPECT: Record<MapProjection, number> = {
  EQUIRECTANGULAR: 2,
  MERCATOR: 1,
  MOLLWEIDE: 2,
  ROBINSON: 1.9716554648,
  WINKEL_TRIPEL: 1.6366,
  EQUAL_EARTH: 2.0463,
};

export function isMapProjection(value: unknown): value is MapProjection {
  return typeof value === "string" && (MAP_PROJECTIONS as readonly string[]).includes(value);
}

export function parseMapProjection(value: unknown): MapProjection {
  return isMapProjection(value) ? value : DEFAULT_MAP_PROJECTION;
}

const DEG = Math.PI / 180;
const WINKEL_COS_PHI1 = 2 / Math.PI;

type RobinsonCoefficients = readonly [number, number, number, number];

// PROJ의 +proj=robin 구현과 동일한 5도 구간별 3차 다항식 계수다.
const ROBINSON_X: readonly RobinsonCoefficients[] = [
  [1, 2.2199e-17, -7.15515e-5, 3.1103e-6],
  [0.9986, -4.82243e-4, -2.4897e-5, -1.3309e-6],
  [0.9954, -8.3103e-4, -4.48605e-5, -9.86701e-7],
  [0.99, -1.35364e-3, -5.9661e-5, 3.6777e-6],
  [0.9822, -1.67442e-3, -4.49547e-6, -5.72411e-6],
  [0.973, -2.14868e-3, -9.03571e-5, 1.8736e-8],
  [0.96, -3.05085e-3, -9.00761e-5, 1.64917e-6],
  [0.9427, -3.82792e-3, -6.53386e-5, -2.6154e-6],
  [0.9216, -4.67746e-3, -1.0457e-4, 4.81243e-6],
  [0.8962, -5.36223e-3, -3.23831e-5, -5.43432e-6],
  [0.8679, -6.09363e-3, -1.13898e-4, 3.32484e-6],
  [0.835, -6.98325e-3, -6.40253e-5, 9.34959e-7],
  [0.7986, -7.55338e-3, -5.00009e-5, 9.35324e-7],
  [0.7597, -7.98324e-3, -3.5971e-5, -2.27626e-6],
  [0.7186, -8.51367e-3, -7.01149e-5, -8.6303e-6],
  [0.6732, -9.86209e-3, -1.99569e-4, 1.91974e-5],
  [0.6213, -1.0418e-2, 8.83923e-5, 6.24051e-6],
  [0.5722, -9.06601e-3, 1.82e-4, 6.24051e-6],
  [0.5322, -6.77797e-3, 2.75608e-4, 6.24051e-6],
];
const ROBINSON_Y: readonly RobinsonCoefficients[] = [
  [-5.20417e-18, 1.24e-2, 1.21431e-18, -8.45284e-11],
  [0.062, 1.24e-2, -1.26793e-9, 4.22642e-10],
  [0.124, 1.24e-2, 5.07171e-9, -1.60604e-9],
  [0.186, 1.23999e-2, -1.90189e-8, 6.00152e-9],
  [0.248, 1.24002e-2, 7.10039e-8, -2.24e-8],
  [0.31, 1.23992e-2, -2.64997e-7, 8.35986e-8],
  [0.372, 1.24029e-2, 9.88983e-7, -3.11994e-7],
  [0.434, 1.23893e-2, -3.69093e-6, -4.35621e-7],
  [0.4958, 1.23198e-2, -1.02252e-5, -3.45523e-7],
  [0.5571, 1.21916e-2, -1.54081e-5, -5.82288e-7],
  [0.6176, 1.19938e-2, -2.41424e-5, -5.25327e-7],
  [0.6769, 1.1713e-2, -3.20223e-5, -5.16405e-7],
  [0.7346, 1.13541e-2, -3.97684e-5, -6.09052e-7],
  [0.7903, 1.09107e-2, -4.89042e-5, -1.04739e-6],
  [0.8435, 1.03431e-2, -6.4615e-5, -1.40374e-9],
  [0.8936, 9.69686e-3, -6.4636e-5, -8.547e-6],
  [0.9394, 8.40947e-3, -1.92841e-4, -4.2106e-6],
  [0.9761, 6.16527e-3, -2.56e-4, -4.2106e-6],
  [1, 3.28947e-3, -3.19159e-4, -4.2106e-6],
];
const EQUAL_EARTH_A = [1.340264, -0.081106, 0.000893, 0.003796];

function equalEarthY(theta: number) {
  const theta2 = theta * theta;
  const theta6 = theta2 * theta2 * theta2;
  return (
    EQUAL_EARTH_A[0] * theta +
    EQUAL_EARTH_A[1] * theta * theta2 +
    EQUAL_EARTH_A[2] * theta * theta6 +
    EQUAL_EARTH_A[3] * theta * theta2 * theta6
  );
}

const EQUAL_EARTH_Y_MAX = equalEarthY(Math.asin(Math.sqrt(3) / 2));
const EQUAL_EARTH_X_MAX = Math.PI / ((Math.sqrt(3) / 2) * EQUAL_EARTH_A[0]);

function robinsonPolynomial(coefficients: RobinsonCoefficients, offsetDegrees: number) {
  return (
    coefficients[0] +
    offsetDegrees *
      (coefficients[1] + offsetDegrees * (coefficients[2] + offsetDegrees * coefficients[3]))
  );
}

function robinsonFactors(absLatDeg: number) {
  const clampedLat = Math.min(90, Math.max(0, absLatDeg));
  const position = clampedLat / 5;
  const index = Math.min(18, Math.floor(position + 1e-15));
  const offsetDegrees = clampedLat - index * 5;
  return {
    x: robinsonPolynomial(ROBINSON_X[index], offsetDegrees),
    y: robinsonPolynomial(ROBINSON_Y[index], offsetDegrees),
  };
}

function mollweideTheta(lat: number) {
  if (Math.abs(Math.abs(lat) - Math.PI / 2) < 1e-9) return Math.sign(lat) * (Math.PI / 2);
  let theta = lat;
  for (let step = 0; step < 12; step += 1) {
    const numerator = 2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(lat);
    const denominator = 2 + 2 * Math.cos(2 * theta);
    if (Math.abs(denominator) < 1e-9) break;
    theta -= numerator / denominator;
  }
  return theta;
}

/**
 * 경위도를 평면 투영 좌표(중심 원점, y는 북쪽이 양수)로 변환한다.
 * 반환값은 각 투영의 최대 반폭/반높이로 나눈 [-1, 1] 범위다.
 */
export function projectNormalized(
  projection: MapProjection,
  lonDeg: number,
  latDeg: number,
): { x: number; y: number } {
  const lon = Math.max(-180, Math.min(180, lonDeg)) * DEG;
  const lat = Math.max(-90, Math.min(90, latDeg)) * DEG;
  switch (projection) {
    case "MERCATOR": {
      const clamped = Math.max(-85.05113, Math.min(85.05113, latDeg)) * DEG;
      const y = Math.log(Math.tan(Math.PI / 4 + clamped / 2));
      return { x: lon / Math.PI, y: y / Math.PI };
    }
    case "MOLLWEIDE": {
      const theta = mollweideTheta(lat);
      return { x: (lon * Math.cos(theta)) / Math.PI, y: Math.sin(theta) };
    }
    case "ROBINSON": {
      const factors = robinsonFactors(Math.abs(latDeg));
      return { x: (lon * factors.x) / Math.PI, y: Math.sign(latDeg) * factors.y };
    }
    case "WINKEL_TRIPEL": {
      const alpha = Math.acos(Math.max(-1, Math.min(1, Math.cos(lat) * Math.cos(lon / 2))));
      const sinc = Math.abs(alpha) < 1e-9 ? 1 : Math.sin(alpha) / alpha;
      const x = 0.5 * (lon * WINKEL_COS_PHI1 + (2 * Math.cos(lat) * Math.sin(lon / 2)) / sinc);
      const y = 0.5 * (lat + Math.sin(lat) / sinc);
      return { x: x / (1 + Math.PI / 2), y: y / (Math.PI / 2) };
    }
    case "EQUAL_EARTH": {
      const theta = Math.asin((Math.sqrt(3) / 2) * Math.sin(lat));
      const theta2 = theta * theta;
      const theta6 = theta2 * theta2 * theta2;
      const denominator =
        (Math.sqrt(3) / 2) *
        (EQUAL_EARTH_A[0] +
          3 * EQUAL_EARTH_A[1] * theta2 +
          theta6 * (7 * EQUAL_EARTH_A[2] + 9 * EQUAL_EARTH_A[3] * theta2));
      return {
        x: (lon * Math.cos(theta)) / denominator / EQUAL_EARTH_X_MAX,
        y: equalEarthY(theta) / EQUAL_EARTH_Y_MAX,
      };
    }
    default:
      return { x: lon / Math.PI, y: lat / (Math.PI / 2) };
  }
}

/**
 * 이미지 안에서 지도 본체가 차지하는 영역. 정규화 투영 좌표(-1..1)를
 * u = offsetU + (0.5 + x/2) * scaleU 형태로 이미지 UV에 대응시킨다.
 */
export type ProjectionFit = {
  offsetU: number;
  offsetV: number;
  scaleU: number;
  scaleV: number;
};

export const IDENTITY_FIT: ProjectionFit = { offsetU: 0, offsetV: 0, scaleU: 1, scaleV: 1 };

/**
 * 업로드 이미지가 투영 경계에 딱 맞게 잘려 있지 않은 경우(타원 밖 배경 여백)를 대비한
 * 추정치. 이미지 가로세로비와 투영 고유 비율을 비교해 중앙 정렬 사각형을 가정한다.
 */
export function projectionFit(
  projection: MapProjection,
  imageWidth: number,
  imageHeight: number,
): ProjectionFit {
  if (!imageWidth || !imageHeight) return IDENTITY_FIT;
  const target = MAP_PROJECTION_ASPECT[projection];
  const imageAspect = imageWidth / imageHeight;
  const scaleU = imageAspect > target ? target / imageAspect : 1;
  const scaleV = imageAspect > target ? 1 : imageAspect / target;
  return {
    offsetU: (1 - scaleU) / 2,
    offsetV: (1 - scaleV) / 2,
    scaleU,
    scaleV,
  };
}

/** 측정된 지도 영역(픽셀 경계, 양끝 포함)을 UV 매핑으로 바꾼다. */
export function boundsFit(
  bounds: { left: number; right: number; top: number; bottom: number },
  imageWidth: number,
  imageHeight: number,
): ProjectionFit {
  if (!imageWidth || !imageHeight) return IDENTITY_FIT;
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  if (width <= 1 || height <= 1) return IDENTITY_FIT;
  return {
    offsetU: bounds.left / imageWidth,
    offsetV: bounds.top / imageHeight,
    scaleU: width / imageWidth,
    scaleV: height / imageHeight,
  };
}

/**
 * 정규화 평면 좌표를 경위도로 되돌린다. 정거원통·메르카토르는 닫힌 해가 있고,
 * 나머지는 수치 야코비안을 쓰는 뉴턴법으로 푼다. 초기값은 정거원통 근사다.
 */
export function unprojectNormalized(
  projection: MapProjection,
  x: number,
  y: number,
): { lon: number; lat: number } {
  if (projection === "EQUIRECTANGULAR") {
    return { lon: x * 180, lat: y * 90 };
  }
  if (projection === "MERCATOR") {
    return { lon: x * 180, lat: (2 * Math.atan(Math.exp(y * Math.PI)) - Math.PI / 2) / DEG };
  }

  let lon = Math.max(-180, Math.min(180, x * 180));
  let lat = Math.max(-90, Math.min(90, y * 90));
  const step = 1e-4;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const point = projectNormalized(projection, lon, lat);
    const errorX = point.x - x;
    const errorY = point.y - y;
    if (Math.abs(errorX) < 1e-10 && Math.abs(errorY) < 1e-10) break;
    // 경계에서 편미분이 잘리지 않도록 안쪽을 향해 차분한다.
    const lonStep = lon + step > 180 ? -step : step;
    const latStep = lat + step > 90 ? -step : step;
    const byLon = projectNormalized(projection, lon + lonStep, lat);
    const byLat = projectNormalized(projection, lon, lat + latStep);
    const j11 = (byLon.x - point.x) / lonStep;
    const j12 = (byLat.x - point.x) / latStep;
    const j21 = (byLon.y - point.y) / lonStep;
    const j22 = (byLat.y - point.y) / latStep;
    const determinant = j11 * j22 - j12 * j21;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) break;
    lon -= (j22 * errorX - j12 * errorY) / determinant;
    lat -= (-j21 * errorX + j11 * errorY) / determinant;
    lon = Math.max(-180, Math.min(180, lon));
    lat = Math.max(-90, Math.min(90, lat));
  }
  return { lon, lat };
}

/** 이미지 UV(좌상단 원점)를 경위도로 되돌린다. */
export function unprojectUv(
  projection: MapProjection,
  u: number,
  v: number,
  fit: ProjectionFit = IDENTITY_FIT,
) {
  if (!fit.scaleU || !fit.scaleV) return { lon: 0, lat: 0 };
  const x = ((u - fit.offsetU) / fit.scaleU - 0.5) * 2;
  const y = (0.5 - (v - fit.offsetV) / fit.scaleV) * 2;
  return unprojectNormalized(projection, x, y);
}

/** 경위도를 이미지 UV(좌상단 원점)로 변환한다. */
export function projectToUv(
  projection: MapProjection,
  lonDeg: number,
  latDeg: number,
  fit: ProjectionFit = IDENTITY_FIT,
) {
  const point = projectNormalized(projection, lonDeg, latDeg);
  return {
    u: fit.offsetU + (0.5 + point.x / 2) * fit.scaleU,
    v: fit.offsetV + (0.5 - point.y / 2) * fit.scaleV,
  };
}

/** WebGL 셰이더에서 같은 수식을 쓰기 위한 GLSL 조각. mode 값은 MAP_PROJECTIONS 인덱스와 같다. */
export const MAP_PROJECTION_GLSL = /* glsl */ `
const float PI = 3.141592653589793;
const float WINKEL_COS_PHI1 = 2.0 / PI;
const vec4 ROBINSON_X[19] = vec4[19](
  vec4(1.0, 2.2199e-17, -7.15515e-5, 3.1103e-6),
  vec4(0.9986, -0.000482243, -2.4897e-5, -1.3309e-6),
  vec4(0.9954, -0.00083103, -4.4861e-5, -9.86701e-7),
  vec4(0.99, -0.00135364, -5.9661e-5, 3.6777e-6),
  vec4(0.9822, -0.00167442, -4.49547e-6, -5.72411e-6),
  vec4(0.973, -0.00214868, -9.03571e-5, 1.8736e-8),
  vec4(0.96, -0.00305085, -9.00761e-5, 1.64917e-6),
  vec4(0.9427, -0.00382792, -6.53386e-5, -2.6154e-6),
  vec4(0.9216, -0.00467746, -0.00010457, 4.81243e-6),
  vec4(0.8962, -0.00536223, -3.23831e-5, -5.43432e-6),
  vec4(0.8679, -0.00609363, -0.000113898, 3.32484e-6),
  vec4(0.835, -0.00698325, -6.40253e-5, 9.34959e-7),
  vec4(0.7986, -0.00755338, -5.00009e-5, 9.35324e-7),
  vec4(0.7597, -0.00798324, -3.5971e-5, -2.27626e-6),
  vec4(0.7186, -0.00851367, -7.01149e-5, -8.6303e-6),
  vec4(0.6732, -0.00986209, -0.000199569, 1.91974e-5),
  vec4(0.6213, -0.010418, 8.83923e-5, 6.24051e-6),
  vec4(0.5722, -0.00906601, 0.000182, 6.24051e-6),
  vec4(0.5322, -0.00677797, 0.000275608, 6.24051e-6)
);
const vec4 ROBINSON_Y[19] = vec4[19](
  vec4(-5.20417e-18, 0.0124, 1.21431e-18, -8.45284e-11),
  vec4(0.062, 0.0124, -1.26793e-9, 4.22642e-10),
  vec4(0.124, 0.0124, 5.07171e-9, -1.60604e-9),
  vec4(0.186, 0.0123999, -1.90189e-8, 6.00152e-9),
  vec4(0.248, 0.0124002, 7.10039e-8, -2.24e-8),
  vec4(0.31, 0.0123992, -2.64997e-7, 8.35986e-8),
  vec4(0.372, 0.0124029, 9.88983e-7, -3.11994e-7),
  vec4(0.434, 0.0123893, -3.69093e-6, -4.35621e-7),
  vec4(0.4958, 0.0123198, -1.02252e-5, -3.45523e-7),
  vec4(0.5571, 0.0121916, -1.54081e-5, -5.82288e-7),
  vec4(0.6176, 0.0119938, -2.41424e-5, -5.25327e-7),
  vec4(0.6769, 0.011713, -3.20223e-5, -5.16405e-7),
  vec4(0.7346, 0.0113541, -3.97684e-5, -6.09052e-7),
  vec4(0.7903, 0.0109107, -4.89042e-5, -1.04739e-6),
  vec4(0.8435, 0.0103431, -6.4615e-5, -1.40374e-9),
  vec4(0.8936, 0.00969686, -6.4636e-5, -8.547e-6),
  vec4(0.9394, 0.00840947, -0.000192841, -4.2106e-6),
  vec4(0.9761, 0.00616527, -0.000256, -4.2106e-6),
  vec4(1.0, 0.00328947, -0.000319159, -4.2106e-6)
);
const float EQUAL_EARTH_A1 = 1.340264;
const float EQUAL_EARTH_A2 = -0.081106;
const float EQUAL_EARTH_A3 = 0.000893;
const float EQUAL_EARTH_A4 = 0.003796;
const float EQUAL_EARTH_X_MAX = ${EQUAL_EARTH_X_MAX.toFixed(8)};
const float EQUAL_EARTH_Y_MAX = ${EQUAL_EARTH_Y_MAX.toFixed(8)};

float robinsonPolynomial(vec4 coefficients, float offsetDegrees) {
  return coefficients.x + offsetDegrees * (coefficients.y
    + offsetDegrees * (coefficients.z + offsetDegrees * coefficients.w));
}

vec2 robinsonFactors(float absLatDeg) {
  float clampedLat = clamp(absLatDeg, 0.0, 90.0);
  int index = int(min(18.0, floor(clampedLat / 5.0 + 1e-7)));
  float offsetDegrees = clampedLat - float(index) * 5.0;
  return vec2(
    robinsonPolynomial(ROBINSON_X[index], offsetDegrees),
    robinsonPolynomial(ROBINSON_Y[index], offsetDegrees)
  );
}

float mollweideTheta(float lat) {
  float theta = lat;
  for (int step = 0; step < 12; step += 1) {
    float numerator = 2.0 * theta + sin(2.0 * theta) - PI * sin(lat);
    float denominator = 2.0 + 2.0 * cos(2.0 * theta);
    if (abs(denominator) < 1e-6) break;
    theta -= numerator / denominator;
  }
  return theta;
}

/** lon, lat 라디안 입력 → 정규화 평면 좌표(-1..1) */
vec2 projectNormalized(int mode, float lon, float lat) {
  if (mode == 1) {
    float clamped = clamp(lat, -1.4844222, 1.4844222);
    return vec2(lon / PI, log(tan(PI / 4.0 + clamped / 2.0)) / PI);
  }
  if (mode == 2) {
    float theta = mollweideTheta(lat);
    return vec2(lon * cos(theta) / PI, sin(theta));
  }
  if (mode == 3) {
    vec2 factors = robinsonFactors(abs(lat) * 180.0 / PI);
    return vec2(lon * factors.x / PI, sign(lat) * factors.y);
  }
  if (mode == 4) {
    float alpha = acos(clamp(cos(lat) * cos(lon / 2.0), -1.0, 1.0));
    float sinc = abs(alpha) < 1e-6 ? 1.0 : sin(alpha) / alpha;
    float x = 0.5 * (lon * WINKEL_COS_PHI1 + (2.0 * cos(lat) * sin(lon / 2.0)) / sinc);
    float y = 0.5 * (lat + sin(lat) / sinc);
    return vec2(x / (1.0 + PI / 2.0), y / (PI / 2.0));
  }
  if (mode == 5) {
    float theta = asin(clamp(0.8660254 * sin(lat), -1.0, 1.0));
    float theta2 = theta * theta;
    float theta6 = theta2 * theta2 * theta2;
    float denominator = 0.8660254 * (EQUAL_EARTH_A1 + 3.0 * EQUAL_EARTH_A2 * theta2
      + theta6 * (7.0 * EQUAL_EARTH_A3 + 9.0 * EQUAL_EARTH_A4 * theta2));
    float x = lon * cos(theta) / denominator;
    float y = EQUAL_EARTH_A1 * theta + EQUAL_EARTH_A2 * theta * theta2
      + EQUAL_EARTH_A3 * theta * theta6 + EQUAL_EARTH_A4 * theta * theta2 * theta6;
    return vec2(x / EQUAL_EARTH_X_MAX, y / EQUAL_EARTH_Y_MAX);
  }
  return vec2(lon / PI, lat / (PI / 2.0));
}

/** fit = vec4(offsetU, offsetV, scaleU, scaleV) */
vec2 projectToUv(int mode, float lon, float lat, vec4 fit) {
  vec2 point = projectNormalized(mode, lon, lat);
  return vec2(
    fit.x + (0.5 + point.x * 0.5) * fit.z,
    fit.y + (0.5 - point.y * 0.5) * fit.w
  );
}
`;

export function projectionMode(projection: MapProjection) {
  return MAP_PROJECTIONS.indexOf(projection);
}
