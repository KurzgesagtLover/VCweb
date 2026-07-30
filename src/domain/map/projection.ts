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
  ROBINSON: "로빈슨 (위키백과식 타원)",
  WINKEL_TRIPEL: "빙켈 트리펠 (내셔널지오그래픽식)",
  EQUAL_EARTH: "이퀄 어스",
};

/** 투영별 좌우/상하 최대 좌표 비율. 이미지 가로세로비 추정과 UV 정규화에 함께 사용한다. */
export const MAP_PROJECTION_ASPECT: Record<MapProjection, number> = {
  EQUIRECTANGULAR: 2,
  MERCATOR: 1,
  MOLLWEIDE: 2,
  ROBINSON: 1.9716,
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

const ROBINSON_X = [
  1.0, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962, 0.8679, 0.835, 0.7986,
  0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322,
];
const ROBINSON_Y = [
  0.0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346,
  0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1.0,
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

/**
 * 로빈슨 도법은 5도 간격 표로 정의되므로 보간 방식이 곧 정확도다. 선형 보간은
 * 표 사이에서 반폭 기준 0.3%까지 벌어져 경도 ±180 근처에서 지도 경계를 벗어난다.
 * 표준 구현과 같이 곡률을 반영하는 Catmull-Rom 스플라인으로 보간한다.
 */
function catmullRom(table: number[], index: number, ratio: number) {
  const at = (position: number) => table[Math.max(0, Math.min(table.length - 1, position))];
  const p0 = at(index - 1);
  const p1 = at(index);
  const p2 = at(index + 1);
  const p3 = at(index + 2);
  return (
    p1 +
    0.5 *
      ratio *
      (p2 - p0 + ratio * (2 * p0 - 5 * p1 + 4 * p2 - p3 + ratio * (3 * (p1 - p2) + p3 - p0)))
  );
}

function robinsonFactors(absLatDeg: number) {
  const position = Math.min(18, Math.max(0, absLatDeg / 5));
  const index = Math.min(17, Math.floor(position));
  const ratio = position - index;
  return {
    x: catmullRom(ROBINSON_X, index, ratio),
    y: catmullRom(ROBINSON_Y, index, ratio),
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
const float ROBINSON_X[19] = float[19](
  1.0, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962,
  0.8679, 0.835, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322
);
const float ROBINSON_Y[19] = float[19](
  0.0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571,
  0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1.0
);
const float EQUAL_EARTH_A1 = 1.340264;
const float EQUAL_EARTH_A2 = -0.081106;
const float EQUAL_EARTH_A3 = 0.000893;
const float EQUAL_EARTH_A4 = 0.003796;
const float EQUAL_EARTH_X_MAX = ${EQUAL_EARTH_X_MAX.toFixed(8)};
const float EQUAL_EARTH_Y_MAX = ${EQUAL_EARTH_Y_MAX.toFixed(8)};

float robinsonTable(int table, int index) {
  int clamped = clamp(index, 0, 18);
  return table == 0 ? ROBINSON_X[clamped] : ROBINSON_Y[clamped];
}

/** 5도 간격 표를 Catmull-Rom으로 보간해 경계 오차를 1픽셀 미만으로 줄인다. */
float robinsonSpline(int table, int index, float ratio) {
  float p0 = robinsonTable(table, index - 1);
  float p1 = robinsonTable(table, index);
  float p2 = robinsonTable(table, index + 1);
  float p3 = robinsonTable(table, index + 2);
  return p1 + 0.5 * ratio * (p2 - p0 + ratio * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3
    + ratio * (3.0 * (p1 - p2) + p3 - p0)));
}

vec2 robinsonFactors(float absLatDeg) {
  float position = clamp(absLatDeg / 5.0, 0.0, 18.0);
  int index = int(min(17.0, floor(position)));
  float ratio = position - float(index);
  return vec2(robinsonSpline(0, index, ratio), robinsonSpline(1, index, ratio));
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
