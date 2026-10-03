import {
  MAP_PROJECTION_GLSL,
  projectToUv,
  type MapProjection,
  type ProjectionFit,
} from "@/src/domain/map/projection";

export const BASE_TEXTURE_WIDTH = 2048;
export const DETAIL_TEXTURE_WIDTH = 4096;
export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 0.92;

export type Sampler = { data: Uint8ClampedArray; width: number; height: number };
export type GlobeView = { lon: number; lat: number; zoom: number };

export const VERTEX_SHADER = `#version 300 es
void main() {
  float x = float((gl_VertexID << 1) & 2);
  float y = float(gl_VertexID & 2);
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uLon0;
uniform float uLat0;
uniform int uMode;
uniform vec4 uFit;
uniform float uGrid;
uniform float uCoastline;
uniform vec3 uSeaColor;
uniform sampler2D uMap;
uniform sampler2D uElevation;
uniform float uElevationReady;
uniform sampler2D uElevationDetail;
uniform vec4 uElevationDetailBounds;
uniform float uElevationDetailReady;
uniform vec3 uSunDirection;
uniform vec3 uMoonDirection;
uniform vec3 uSunViewDirection;
uniform vec3 uMoonViewDirection;
uniform float uSunAngularRadius;
uniform float uMoonAngularRadius;
uniform float uMoonIllumination;
uniform float uCelestialReady;

out vec4 outColor;

uniform sampler2D uDetailMap;
uniform vec4 uDetailBounds;
uniform float uDetailReady;
${MAP_PROJECTION_GLSL}

float hash(vec2 cell) {
  return fract(sin(dot(cell, vec2(41.7913, 78.233))) * 43758.5453);
}

vec3 starField(vec2 point) {
  vec3 accumulated = vec3(0.0);
  for (int layer = 0; layer < 3; layer += 1) {
    float cellSize = 38.0 + float(layer) * 27.0;
    vec2 scaled = point / cellSize;
    vec2 cell = floor(scaled);
    vec2 local = fract(scaled);
    float seed = hash(cell + float(layer) * 19.7);
    if (seed < 0.80) continue;
    vec2 position = vec2(hash(cell + 3.7), hash(cell + 9.13));
    float radius = (0.9 + 1.6 * fract(seed * 17.3)) / cellSize;
    float brightness = smoothstep(radius, 0.0, length(local - position));
    vec3 tint = mix(vec3(0.66, 0.74, 0.9), vec3(0.9, 0.86, 0.78), fract(seed * 7.1));
    accumulated += tint * brightness * (0.55 + 0.75 * fract(seed * 3.3));
  }
  return accumulated;
}

vec3 sampleSurface(vec2 uv) {
  vec3 sampled = texture(uMap, uv).rgb;
  vec2 detailUv = (uv - uDetailBounds.xy) / uDetailBounds.zw;
  bool insideDetail = all(greaterThanEqual(detailUv, vec2(0.0)))
    && all(lessThanEqual(detailUv, vec2(1.0)));
  if (uDetailReady > 0.5 && insideDetail) {
    sampled = texture(uDetailMap, detailUv).rgb;
  }
  return sampled;
}

vec3 earthDirectionToView(vec3 direction) {
  float sinLon = sin(uLon0);
  float cosLon = cos(uLon0);
  float sinLat = sin(uLat0);
  float cosLat = cos(uLat0);
  return vec3(
    -sinLon * direction.x + cosLon * direction.y,
    -sinLat * cosLon * direction.x - sinLat * sinLon * direction.y + cosLat * direction.z,
    cosLat * cosLon * direction.x + cosLat * sinLon * direction.y + sinLat * direction.z
  );
}

vec3 celestialScreenPosition(vec3 viewDirection) {
  const float TAN_HALF_VERTICAL_FOV = 0.62486935;
  if (viewDirection.z <= 0.0) return vec3(-100000.0, -100000.0, 0.0);
  vec2 projected = viewDirection.xy / (viewDirection.z * TAN_HALF_VERTICAL_FOV);
  vec2 screen = uCenter + projected * (uResolution.y * 0.5);
  float visible = step(abs(projected.x), uResolution.x / uResolution.y + 0.08)
    * step(abs(projected.y), 1.08);
  return vec3(screen, visible);
}

vec3 celestialBodies(vec2 point) {
  const float TAN_HALF_VERTICAL_FOV = 0.62486935;
  vec3 sunProjection = celestialScreenPosition(uSunViewDirection);
  float sunRadius = max(
    2.0,
    tan(uSunAngularRadius) * uResolution.y / (2.0 * TAN_HALF_VERTICAL_FOV)
  );
  float sunDistance = length(point - sunProjection.xy);
  float sunDisc = 1.0 - smoothstep(sunRadius * 0.88, sunRadius, sunDistance);
  float sunGlow = exp(-sunDistance / max(sunRadius * 3.6, 1.0));
  vec3 sun = vec3(1.0, 0.77, 0.37) * sunDisc * 1.08;
  sun += vec3(1.0, 0.36, 0.08) * sunGlow * 0.24;
  sun *= sunProjection.z;

  vec3 moonProjection = celestialScreenPosition(uMoonViewDirection);
  float moonRadiusPixels = max(
    1.7,
    tan(uMoonAngularRadius) * uResolution.y / (2.0 * TAN_HALF_VERTICAL_FOV)
  );
  vec2 moonOffset = (point - moonProjection.xy) / moonRadiusPixels;
  float moonDistance = length(moonOffset);
  float moonDisc = 1.0 - smoothstep(0.88, 1.0, moonDistance);
  float moonLight = 0.17 + uMoonIllumination * 0.83;
  float moonTexture = 0.84 + hash(floor(point / 2.0)) * 0.16;
  vec3 moon = vec3(0.71, 0.79, 0.83) * moonDisc * moonLight * moonTexture;
  moon += vec3(0.29, 0.43, 0.52) * exp(-moonDistance * 3.8) * 0.16;
  moon *= moonProjection.z;
  return sun + moon;
}

vec2 elevationUv(float lon, float lat) {
  return vec2(fract(lon / (2.0 * PI) + 0.5), clamp(0.5 - lat / PI, 0.0, 1.0));
}

vec2 decodedElevation(float lon, float lat) {
  vec2 uv = elevationUv(lon, lat);
  vec3 packed = texture(uElevation, uv).rgb;
  float detailU = mod(uv.x - uElevationDetailBounds.x + 1.0, 1.0);
  vec2 detailUv = vec2(
    detailU / max(uElevationDetailBounds.z, 0.000001),
    (uv.y - uElevationDetailBounds.y) / max(uElevationDetailBounds.w, 0.000001)
  );
  bool insideDetail = detailU <= uElevationDetailBounds.z
    && detailUv.y >= 0.0
    && detailUv.y <= 1.0;
  if (uElevationDetailReady > 0.5 && insideDetail) {
    packed = texture(uElevationDetail, detailUv).rgb;
  }
  float encoded = packed.r * 65280.0 + packed.g * 255.0;
  float meters = encoded * (20000.0 / 65535.0) - 11000.0;
  return vec2(meters, packed.b);
}

float reliefHeight(vec2 elevation) {
  float landRelief = pow(clamp(max(elevation.x, 0.0) / 9000.0, 0.0, 1.0), 0.68);
  float seaRelief = -pow(clamp(max(-elevation.x, 0.0) / 11000.0, 0.0, 1.0), 0.64) * 0.72;
  return mix(seaRelief, landRelief, step(0.5, elevation.y));
}

float seaMask(vec2 uv) {
  return 1.0 - smoothstep(0.02, 0.11, distance(sampleSurface(uv), uSeaColor));
}

float coastlineMask(vec2 uv) {
  return 1.0 - smoothstep(0.02, 0.11, distance(texture(uMap, uv).rgb, uSeaColor));
}

void main() {
  vec2 offset = gl_FragCoord.xy - uCenter;
  float x = offset.x / uRadius;
  float y = offset.y / uRadius;
  float rho = length(vec2(x, y));

  if (rho > 1.0) {
    float halo = exp(-(rho - 1.0) * 13.0);
    vec3 space = vec3(0.008, 0.014, 0.022);
    vec3 atmosphere = vec3(0.14, 0.5, 0.68) * halo * 0.36;
    if (uCelestialReady > 0.5 && length(offset) > 1.0) {
      vec2 sunAxis = normalize(earthDirectionToView(uSunDirection).xy + vec2(1e-6));
      float towardSun = pow(max(dot(normalize(offset), sunAxis), 0.0), 16.0);
      atmosphere += vec3(1.0, 0.46, 0.12) * halo * towardSun * 0.42;
    }
    vec3 bodies = uCelestialReady > 0.5 ? celestialBodies(gl_FragCoord.xy) : vec3(0.0);
    outColor = vec4(
      space + atmosphere + starField(gl_FragCoord.xy) * (1.0 - halo) + bodies,
      1.0
    );
    return;
  }

  float c = asin(clamp(rho, 0.0, 1.0));
  float sinC = sin(c);
  float cosC = cos(c);
  float lat = uLat0;
  float lon = uLon0;
  if (rho > 1e-6) {
    lat = asin(clamp(cosC * sin(uLat0) + (y * sinC * cos(uLat0)) / rho, -1.0, 1.0));
    lon = uLon0 + atan(x * sinC, rho * cosC * cos(uLat0) - y * sinC * sin(uLat0));
  }
  lon = mod(lon + PI, 2.0 * PI) - PI;

  vec2 uv = projectToUv(uMode, lon, lat, uFit);
  vec3 surface = sampleSurface(uv);
  vec3 geographicNormal = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec2 elevation = decodedElevation(lon, lat);
  float relief = uElevationReady > 0.5 ? reliefHeight(elevation) : 0.0;

  // 국색은 낮과 밤 모두 식별 가능하게 유지하고, 바다는 실제 수심에 따라 색을 나눈다.
  float seaness = seaMask(uv);
  float seaDepth = uElevationReady > 0.5
    ? clamp(max(-elevation.x, 0.0) / 11000.0, 0.0, 1.0)
    : 0.45;
  vec3 landSurface = surface * 0.56;
  vec3 shallowSea = vec3(0.026, 0.092, 0.175);
  vec3 deepSea = vec3(0.004, 0.014, 0.046);
  vec3 navySea = mix(shallowSea, deepSea, pow(seaDepth, 0.56));
  navySea = mix(navySea, surface * 0.34, 0.08);
  surface = mix(landSurface, navySea, seaness);

  vec3 normal = vec3(x, y, sqrt(max(0.0, 1.0 - rho * rho)));
  vec3 terrainNormal = normal;
  if (uElevationReady > 0.5) {
    vec3 tangentX = normalize(dFdx(normal) + vec3(1e-7));
    vec3 tangentY = normalize(dFdy(normal) + vec3(1e-7));
    float reliefStrength = mix(62.0, 46.0, step(0.5, elevation.y));
    terrainNormal = normalize(
      normal - tangentX * dFdx(relief) * reliefStrength
      - tangentY * dFdy(relief) * reliefStrength
    );
  }

  vec3 lightDirection = normalize(vec3(-0.35, 0.42, 0.84));
  float dayAmount = 1.0;
  float illumination = 0.68 + 0.10 * max(dot(terrainNormal, lightDirection), 0.0);
  if (uCelestialReady > 0.5) {
    float solarAltitude = dot(geographicNormal, uSunDirection);
    dayAmount = smoothstep(-0.105, 0.07, solarAltitude);
    vec3 sunView = normalize(earthDirectionToView(uSunDirection));
    vec3 moonView = normalize(earthDirectionToView(uMoonDirection));
    float sunDiffuse = max(dot(terrainNormal, sunView), 0.0);
    float moonDiffuse = max(dot(terrainNormal, moonView), 0.0) * uMoonIllumination;
    float sphereDiffuse = max(dot(normal, sunView), 0.0);
    float terrainContrast = clamp(sunDiffuse - sphereDiffuse, -0.32, 0.32);
    float nightLight = 0.27 + moonDiffuse * 0.045;
    float dayLight = 0.50 + sunDiffuse * 0.28 + terrainContrast * 0.36;
    illumination = mix(nightLight, dayLight, dayAmount);
  }

  float limb = smoothstep(1.0, 0.86, rho);
  vec3 color = surface * illumination * mix(0.72, 1.0, limb);
  color += vec3(0.12, 0.075, 0.038) * max(relief, 0.0) * dayAmount * 0.055;

  if (uGrid > 0.5) {
    float latDeg = lat * 180.0 / PI;
    float lonDeg = lon * 180.0 / PI;
    float latLine = 1.0 - smoothstep(0.0, 0.55, abs(fract(latDeg / 15.0 + 0.5) - 0.5) * 15.0);
    float lonLine = 1.0 - smoothstep(0.0, 0.55 / max(cos(lat), 0.12),
      abs(fract(lonDeg / 15.0 + 0.5) - 0.5) * 15.0);
    float equator = 1.0 - smoothstep(0.0, 0.7, abs(latDeg));
    float grid = clamp(max(latLine, lonLine) * 0.42 + equator * 0.45, 0.0, 1.0);
    color = mix(color, vec3(0.55, 0.88, 0.96), grid * limb * 0.5);
  }

  // 저장된 국경선과 무관한 화면 공간 해안선. 텍셀을 이진 비교하지 않고
  // 화면 픽셀 기준 9탭으로 경계를 먼저 부드럽게 만든 뒤 발광 등고선만 그린다.
  if (uCoastline > 0.5) {
    vec2 coastDx = dFdx(uv) * 1.6;
    vec2 coastDy = dFdy(uv) * 1.6;
    float coastField = coastlineMask(uv) * 4.0;
    coastField += coastlineMask(uv - coastDx) * 2.0;
    coastField += coastlineMask(uv + coastDx) * 2.0;
    coastField += coastlineMask(uv - coastDy) * 2.0;
    coastField += coastlineMask(uv + coastDy) * 2.0;
    coastField += coastlineMask(uv - coastDx - coastDy);
    coastField += coastlineMask(uv - coastDx + coastDy);
    coastField += coastlineMask(uv + coastDx - coastDy);
    coastField += coastlineMask(uv + coastDx + coastDy);
    coastField /= 16.0;
    float antialiasWidth = max(fwidth(coastField), 0.00001);
    float distanceFromCoast = abs(coastField - 0.5);
    float core = 1.0 - smoothstep(antialiasWidth * 0.35, antialiasWidth * 1.25, distanceFromCoast);
    float glow = 1.0 - smoothstep(antialiasWidth * 1.0, antialiasWidth * 5.5, distanceFromCoast);
    color += vec3(0.18, 0.58, 0.7) * core * limb * 0.17;
    color += vec3(0.08, 0.34, 0.46) * glow * limb * 0.055;
  }

  float rim = smoothstep(0.94, 1.0, rho);
  color += vec3(0.16, 0.52, 0.7) * rim * 0.3;
  outColor = vec4(color, 1.0);
}`;

export function quantizedHex(red: number, green: number, blue: number) {
  return (
    "#" +
    [red & 0xf8, green & 0xf8, blue & 0xf8]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function hexChannels(color: string) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return match
    ? [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)]
    : null;
}

export function recolorMapPixels(
  sampler: Sampler,
  assignments: Map<string, string>,
  countryColors: Map<string, string>,
) {
  if (!countryColors.size) return new Uint8ClampedArray(sampler.data);
  const output = new Uint8ClampedArray(sampler.data);
  const channels = new Map(
    [...countryColors].flatMap(([countryId, color]) => {
      const parsed = hexChannels(color);
      return parsed ? [[countryId, parsed] as const] : [];
    }),
  );
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] < 128) continue;
    const countryId = assignments.get(
      quantizedHex(output[offset], output[offset + 1], output[offset + 2]),
    );
    const replacement = countryId ? channels.get(countryId) : null;
    if (!replacement) continue;
    output[offset] = replacement[0];
    output[offset + 1] = replacement[1];
    output[offset + 2] = replacement[2];
  }
  return output;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function globeUniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram) {
  return {
    center: gl.getUniformLocation(program, "uCenter"),
    resolution: gl.getUniformLocation(program, "uResolution"),
    radius: gl.getUniformLocation(program, "uRadius"),
    lon0: gl.getUniformLocation(program, "uLon0"),
    lat0: gl.getUniformLocation(program, "uLat0"),
    mode: gl.getUniformLocation(program, "uMode"),
    fit: gl.getUniformLocation(program, "uFit"),
    grid: gl.getUniformLocation(program, "uGrid"),
    coastline: gl.getUniformLocation(program, "uCoastline"),
    seaColor: gl.getUniformLocation(program, "uSeaColor"),
    map: gl.getUniformLocation(program, "uMap"),
    elevation: gl.getUniformLocation(program, "uElevation"),
    elevationReady: gl.getUniformLocation(program, "uElevationReady"),
    elevationDetail: gl.getUniformLocation(program, "uElevationDetail"),
    elevationDetailBounds: gl.getUniformLocation(program, "uElevationDetailBounds"),
    elevationDetailReady: gl.getUniformLocation(program, "uElevationDetailReady"),
    sunDirection: gl.getUniformLocation(program, "uSunDirection"),
    moonDirection: gl.getUniformLocation(program, "uMoonDirection"),
    sunViewDirection: gl.getUniformLocation(program, "uSunViewDirection"),
    moonViewDirection: gl.getUniformLocation(program, "uMoonViewDirection"),
    sunAngularRadius: gl.getUniformLocation(program, "uSunAngularRadius"),
    moonAngularRadius: gl.getUniformLocation(program, "uMoonAngularRadius"),
    moonIllumination: gl.getUniformLocation(program, "uMoonIllumination"),
    celestialReady: gl.getUniformLocation(program, "uCelestialReady"),
    detailMap: gl.getUniformLocation(program, "uDetailMap"),
    detailBounds: gl.getUniformLocation(program, "uDetailBounds"),
    detailReady: gl.getUniformLocation(program, "uDetailReady"),
  };
}

/** 화면 좌표를 정사도법 구체 위의 경위도로 되돌린다. 구체 밖이면 null. */
export function globePointToLonLat(
  x: number,
  y: number,
  width: number,
  height: number,
  panelInset: number,
  view: GlobeView,
) {
  const radius = (Math.min(width, height) / 2) * view.zoom;
  const globeX = (x - (width - panelInset) / 2) / radius;
  const globeY = (height / 2 - y) / radius;
  const rho = Math.hypot(globeX, globeY);
  if (rho > 1) return null;
  const lat0 = (view.lat * Math.PI) / 180;
  const lon0 = (view.lon * Math.PI) / 180;
  const c = Math.asin(Math.min(1, rho));
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  if (rho < 1e-6) return { lon: view.lon, lat: view.lat };
  const lat = Math.asin(
    Math.max(-1, Math.min(1, cosC * Math.sin(lat0) + (globeY * sinC * Math.cos(lat0)) / rho)),
  );
  const lon =
    lon0 + Math.atan2(globeX * sinC, rho * cosC * Math.cos(lat0) - globeY * sinC * Math.sin(lat0));
  return {
    lon: (((((lon * 180) / Math.PI + 180) % 360) + 360) % 360) - 180,
    lat: (lat * 180) / Math.PI,
  };
}

export function sampleCountry(
  sampler: Sampler,
  projection: MapProjection,
  fit: ProjectionFit,
  assignments: Map<string, string>,
  lon: number,
  lat: number,
) {
  const uv = projectToUv(projection, lon, lat, fit);
  const x = Math.max(0, Math.min(sampler.width - 1, Math.round(uv.u * (sampler.width - 1))));
  const y = Math.max(0, Math.min(sampler.height - 1, Math.round(uv.v * (sampler.height - 1))));
  const index = (y * sampler.width + x) * 4;
  if (sampler.data[index + 3] < 128) return null;
  return (
    assignments.get(
      quantizedHex(sampler.data[index], sampler.data[index + 1], sampler.data[index + 2]),
    ) ?? null
  );
}

/** 셰이더가 바다를 더 어둡게 칠할 때 쓰는 기준색. 감지 실패 시의 기본값이다. */
export const DEFAULT_SEA_COLOR: [number, number, number] = [0.07, 0.13, 0.2];

/**
 * 어느 국가에도 배정되지 않은 색 중 가장 넓게 깔린 색을 바다로 본다.
 * 타원 투영은 지도 밖 여백이 더 넓을 수 있어, 경계가 잡힌 경우 그 배경색은 제외한다.
 */
export function detectSeaColor(
  sampler: Sampler,
  assignments: Map<string, string>,
  excludeOuterBackground: boolean,
): [number, number, number] | null {
  const { data, width, height } = sampler;
  const outer = excludeOuterBackground ? (data[0] << 16) | (data[1] << 8) | data[2] : -1;
  const stepX = Math.max(1, Math.floor(width / 512));
  const stepY = Math.max(1, Math.floor(height / 512));
  const counts = new Map<number, number>();
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 128) continue;
      if (assignments.has(quantizedHex(data[index], data[index + 1], data[index + 2]))) continue;
      const key = (data[index] << 16) | (data[index + 1] << 8) | data[index + 2];
      if (key === outer) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let bestKey = -1;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  if (bestKey < 0) return null;
  return [((bestKey >> 16) & 255) / 255, ((bestKey >> 8) & 255) / 255, (bestKey & 255) / 255];
}

function samePixel(data: Uint8ClampedArray, index: number, target: number[], tolerance = 12) {
  return (
    Math.abs(data[index] - target[0]) <= tolerance &&
    Math.abs(data[index + 1] - target[1]) <= tolerance &&
    Math.abs(data[index + 2] - target[2]) <= tolerance
  );
}

/** 투영 경계에 그려진 검은 윤곽선 두께. 8픽셀 이상은 지형으로 보고 멈춘다. */
const MAX_OUTLINE_PX = 8;

function isOutline(data: Uint8ClampedArray, index: number) {
  return data[index] + data[index + 1] + data[index + 2] <= 96;
}

/**
 * 타원형 투영 이미지는 지도 밖이 배경색으로 채워져 있다. 적도(중앙 가로줄)와
 * 본초자오선(중앙 세로줄)은 투영 경계에 정확히 맞닿으므로, 두 줄에서 배경이 끝나는
 * 지점을 찾아 지도 본체의 실제 사각형을 측정한다. 범례 같은 장식은 중앙 십자선을
 * 건드리지 않으므로 영향을 주지 않는다.
 *
 * 이 영역은 경위도의 기준이므로 윤곽선 회피용 여백을 빼면 안 된다.
 * 윤곽선은 extendMapEdges에서 색을 연장해 처리하고 좌표 범위는 그대로 유지한다.
 */
export function detectMapBounds(sampler: Sampler) {
  const { data, width, height } = sampler;
  const background = [data[0], data[1], data[2]];
  const midY = Math.floor(height / 2);
  const midX = Math.floor(width / 2);
  const rowIndex = (x: number) => (midY * width + x) * 4;
  const columnIndex = (y: number) => (y * width + midX) * 4;

  let left = 0;
  while (left < width - 1 && samePixel(data, rowIndex(left), background)) left += 1;
  let right = width - 1;
  while (right > left && samePixel(data, rowIndex(right), background)) right -= 1;
  let top = 0;
  while (top < height - 1 && samePixel(data, columnIndex(top), background)) top += 1;
  let bottom = height - 1;
  while (bottom > top && samePixel(data, columnIndex(bottom), background)) bottom -= 1;

  const usable = right - left + 1 >= width * 0.5 && bottom - top + 1 >= height * 0.5;
  if (!usable) return null;

  return { left, right, top, bottom };
}

/** 경계 밖으로 늘려둘 폭. 이 지도의 타원은 표준식과 최대 13픽셀 어긋난다. */
const EDGE_EXTENSION_PX = 28;

/**
 * 투영 공식으로 계산한 타원 경계와 이미지에 그려진 실제 경계는 완전히 일치하지 않는다.
 * 어긋난 만큼 경도 ±180 근처에서 배경색과 검은 윤곽선이 자오선 틈처럼 보이므로,
 * 각 행의 가장자리 색을 지도 밖으로 늘려 그 오차를 흡수한다. 지도는 중앙 경선을 축으로
 * 좌우 대칭이므로, 범례 같은 장식이 없는 오른쪽 경계를 재서 왼쪽은 대칭으로 구한다.
 */
export function extendMapEdges(sampler: Sampler, bounds: { left: number; right: number }) {
  const { data, width, height } = sampler;
  const background = [data[0], data[1], data[2]];
  const centerX = (bounds.left + bounds.right) / 2;
  const index = (x: number, y: number) => (y * width + x) * 4;
  const paint = (from: number, to: number, y: number, source: number) => {
    for (let x = Math.max(0, from); x <= Math.min(width - 1, to); x += 1) {
      const target = index(x, y);
      data[target] = data[source];
      data[target + 1] = data[source + 1];
      data[target + 2] = data[source + 2];
    }
  };

  for (let y = 0; y < height; y += 1) {
    let edge = width - 1;
    while (edge > centerX && samePixel(data, index(edge, y), background)) edge -= 1;
    if (edge <= centerX) continue;

    let clean = edge;
    while (clean > centerX && edge - clean < MAX_OUTLINE_PX && isOutline(data, index(clean, y)))
      clean -= 1;
    paint(clean + 1, edge + EDGE_EXTENSION_PX, y, index(clean, y));

    // 왼쪽 경계는 대칭으로 잡고, 확실히 안쪽인 지점부터 되짚어 깨끗한 첫 픽셀을 찾는다.
    const mirrored = Math.round(2 * centerX - edge);
    let leftClean = Math.max(0, Math.min(width - 1, mirrored + MAX_OUTLINE_PX));
    const limit = Math.max(0, mirrored - MAX_OUTLINE_PX);
    while (leftClean > limit) {
      const previous = index(leftClean - 1, y);
      if (isOutline(data, previous) || samePixel(data, previous, background)) break;
      leftClean -= 1;
    }
    paint(mirrored - EDGE_EXTENSION_PX, leftClean - 1, y, index(leftClean, y));
  }
}

/** 1도 격자를 훑어 국가별 중심 좌표를 구한다. 목록에서 국가를 고르면 그 지점으로 회전한다. */
export function buildCentroids(
  sampler: Sampler,
  projection: MapProjection,
  fit: ProjectionFit,
  assignments: Map<string, string>,
) {
  const accumulator = new Map<string, { x: number; y: number; z: number; weight: number }>();
  for (let lat = -89; lat <= 89; lat += 1) {
    const weight = Math.cos((lat * Math.PI) / 180);
    for (let lon = -180; lon < 180; lon += 1) {
      const countryId = sampleCountry(sampler, projection, fit, assignments, lon, lat);
      if (!countryId) continue;
      const latRad = (lat * Math.PI) / 180;
      const lonRad = (lon * Math.PI) / 180;
      const entry = accumulator.get(countryId) ?? { x: 0, y: 0, z: 0, weight: 0 };
      entry.x += Math.cos(latRad) * Math.cos(lonRad) * weight;
      entry.y += Math.cos(latRad) * Math.sin(lonRad) * weight;
      entry.z += Math.sin(latRad) * weight;
      entry.weight += weight;
      accumulator.set(countryId, entry);
    }
  }
  const centroids = new Map<string, { lon: number; lat: number }>();
  for (const [countryId, entry] of accumulator) {
    if (entry.weight <= 0) continue;
    const length = Math.hypot(entry.x, entry.y, entry.z);
    if (length < 1e-9) continue;
    centroids.set(countryId, {
      lon: (Math.atan2(entry.y, entry.x) * 180) / Math.PI,
      lat: (Math.asin(entry.z / length) * 180) / Math.PI,
    });
  }
  return centroids;
}
