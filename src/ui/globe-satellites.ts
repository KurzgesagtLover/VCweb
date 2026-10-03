const EARTH_RADIUS_KM = 6_371;
const EARTH_GRAVITY_KM3_S2 = 398_600.4418;
const ORBIT_SEGMENTS = 96;
const FLOATS_PER_VERTEX = 10;

type SatellitePlane = {
  inclination: number;
  ascendingNode: number;
  count: number;
  phase: number;
  altitude: number;
  speed: number;
};

type SatelliteNetwork = {
  id: "starlink" | "europe" | "china";
  color: string;
  orbitOpacity: number;
  pointOpacity: number;
  pointSize: number;
  planes: SatellitePlane[];
};

function orbitalAngularSpeed(altitudeKm: number) {
  const radius = EARTH_RADIUS_KM + altitudeKm;
  return Math.sqrt(EARTH_GRAVITY_KM3_S2 / radius ** 3);
}

function planes(
  planeCount: number,
  inclination: number,
  satellitesPerPlane: number,
  altitudeKm: number,
  phaseFactor: number,
  nodeOffset = 0,
) {
  return Array.from({ length: planeCount }, (_, index) => ({
    inclination,
    ascendingNode: nodeOffset + (360 * index) / planeCount,
    count: satellitesPerPlane,
    phase: (360 * phaseFactor * index) / (planeCount * satellitesPerPlane),
    altitude: 1 + altitudeKm / EARTH_RADIUS_KM,
    speed: orbitalAngularSpeed(altitudeKm),
  }));
}

export const SATELLITE_NETWORKS: SatelliteNetwork[] = [
  {
    id: "starlink",
    color: "#7DDCFF",
    orbitOpacity: 0.038,
    pointOpacity: 0.66,
    pointSize: 1,
    planes: [
      ...planes(180, 43, 8, 350, 1),
      ...planes(160, 53, 8, 530, 5, 0.7),
      ...planes(120, 70, 8, 570, 7, 1.4),
      ...planes(80, 97.6, 7, 600, 11, 2.1),
    ],
  },
  {
    id: "europe",
    color: "#FFD86A",
    orbitOpacity: 0.14,
    pointOpacity: 0.88,
    pointSize: 1.45,
    planes: [...planes(12, 55, 7, 1_200, 1, 8), ...planes(8, 70, 6, 8_000, 2, 28)],
  },
  {
    id: "china",
    color: "#FF756B",
    orbitOpacity: 0.05,
    pointOpacity: 0.68,
    pointSize: 1.12,
    planes: [
      ...planes(120, 50, 8, 600, 3, 4),
      ...planes(72, 70, 8, 800, 5, 11),
      ...planes(32, 86.5, 7, 1_100, 7, 19),
    ],
  },
];

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec4 aOrbit;
layout(location = 1) in vec2 aMotion;
layout(location = 2) in vec4 aColor;

uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uLon0;
uniform float uLat0;
uniform float uTime;
uniform float uPixelRatio;

out vec4 vColor;
out float vVisible;

void main() {
  float inclination = aOrbit.x;
  float ascendingNode = aOrbit.y;
  float angle = aOrbit.z + uTime * aMotion.x;
  float altitude = aOrbit.w;

  float cosAngle = cos(angle);
  float sinAngle = sin(angle);
  float cosNode = cos(ascendingNode);
  float sinNode = sin(ascendingNode);
  float cosInclination = cos(inclination);

  vec3 orbitPoint = vec3(
    cosNode * cosAngle - sinNode * sinAngle * cosInclination,
    sinNode * cosAngle + cosNode * sinAngle * cosInclination,
    sinAngle * sin(inclination)
  );

  float cosLon = cos(uLon0);
  float sinLon = sin(uLon0);
  float forward = orbitPoint.x * cosLon + orbitPoint.y * sinLon;
  float side = orbitPoint.y * cosLon - orbitPoint.x * sinLon;
  float cosLat = cos(uLat0);
  float sinLat = sin(uLat0);
  float up = cosLat * orbitPoint.z - sinLat * forward;
  float depth = sinLat * orbitPoint.z + cosLat * forward;
  vec2 projected = vec2(side, up);

  vec2 pixel = uCenter + projected * uRadius * altitude;
  vec2 clip = pixel / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = max(1.0, aMotion.y * uPixelRatio);

  float clearsLimb = step(1.001, length(projected) * altitude);
  vVisible = max(step(0.0, depth), clearsLimb);
  float limbFade = depth >= 0.0 ? clamp(0.45 + depth * 0.9, 0.45, 1.0) : 0.38;
  vColor = vec4(aColor.rgb, aColor.a * limbFade);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec4 vColor;
in float vVisible;
uniform int uPointPass;
out vec4 outColor;

void main() {
  if (vVisible < 0.5) discard;
  float alpha = vColor.a;
  if (uPointPass == 1) {
    float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
    alpha *= 1.0 - smoothstep(0.36, 0.5, distanceFromCenter);
  }
  if (alpha <= 0.001) discard;
  outColor = vec4(vColor.rgb, alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("위성 셰이더를 만들지 못했습니다.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "위성 셰이더 컴파일 실패";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("위성 렌더러를 만들지 못했습니다.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "위성 렌더러 연결 실패";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function rgb(color: string) {
  const value = Number.parseInt(color.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function writeVertex(
  vertices: Float32Array,
  offset: number,
  plane: SatellitePlane,
  phase: number,
  altitude: number,
  speed: number,
  size: number,
  color: readonly number[],
  opacity: number,
) {
  vertices[offset] = (plane.inclination * Math.PI) / 180;
  vertices[offset + 1] = (plane.ascendingNode * Math.PI) / 180;
  vertices[offset + 2] = phase;
  vertices[offset + 3] = altitude;
  vertices[offset + 4] = speed;
  vertices[offset + 5] = size;
  vertices[offset + 6] = color[0];
  vertices[offset + 7] = color[1];
  vertices[offset + 8] = color[2];
  vertices[offset + 9] = opacity;
}

function buildPointVertices() {
  const count = SATELLITE_NETWORKS.reduce(
    (networkTotal, network) =>
      networkTotal + network.planes.reduce((planeTotal, plane) => planeTotal + plane.count, 0),
    0,
  );
  const vertices = new Float32Array(count * FLOATS_PER_VERTEX);
  let offset = 0;
  for (const network of SATELLITE_NETWORKS) {
    const color = rgb(network.color);
    for (const plane of network.planes) {
      for (let index = 0; index < plane.count; index += 1) {
        const phase = (plane.phase * Math.PI) / 180 + (Math.PI * 2 * index) / plane.count;
        writeVertex(
          vertices,
          offset,
          plane,
          phase,
          plane.altitude,
          plane.speed,
          network.pointSize,
          color,
          network.pointOpacity,
        );
        offset += FLOATS_PER_VERTEX;
      }
    }
  }
  return vertices;
}

function buildOrbitVertices() {
  const planeCount = SATELLITE_NETWORKS.reduce(
    (total, network) => total + network.planes.length,
    0,
  );
  const vertices = new Float32Array(planeCount * ORBIT_SEGMENTS * 2 * FLOATS_PER_VERTEX);
  let offset = 0;
  for (const network of SATELLITE_NETWORKS) {
    const color = rgb(network.color);
    for (const plane of network.planes) {
      for (let segment = 0; segment < ORBIT_SEGMENTS; segment += 1) {
        const start = (Math.PI * 2 * segment) / ORBIT_SEGMENTS;
        const end = (Math.PI * 2 * (segment + 1)) / ORBIT_SEGMENTS;
        writeVertex(
          vertices,
          offset,
          plane,
          start,
          plane.altitude,
          0,
          1,
          color,
          network.orbitOpacity,
        );
        offset += FLOATS_PER_VERTEX;
        writeVertex(
          vertices,
          offset,
          plane,
          end,
          plane.altitude,
          0,
          1,
          color,
          network.orbitOpacity,
        );
        offset += FLOATS_PER_VERTEX;
      }
    }
  }
  return vertices;
}

function upload(gl: WebGL2RenderingContext, vertices: Float32Array) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("위성 버퍼를 만들지 못했습니다.");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  return buffer;
}

function bindVertices(gl: WebGL2RenderingContext, buffer: WebGLBuffer) {
  const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
}

export function createSatelliteConstellationLayer(gl: WebGL2RenderingContext) {
  const program = createProgram(gl);
  const pointVertices = buildPointVertices();
  const orbitVertices = buildOrbitVertices();
  const pointBuffer = upload(gl, pointVertices);
  const orbitBuffer = upload(gl, orbitVertices);
  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    center: gl.getUniformLocation(program, "uCenter"),
    radius: gl.getUniformLocation(program, "uRadius"),
    lon0: gl.getUniformLocation(program, "uLon0"),
    lat0: gl.getUniformLocation(program, "uLat0"),
    time: gl.getUniformLocation(program, "uTime"),
    pixelRatio: gl.getUniformLocation(program, "uPixelRatio"),
    pointPass: gl.getUniformLocation(program, "uPointPass"),
  };

  return {
    clear() {
      gl.deleteBuffer(pointBuffer);
      gl.deleteBuffer(orbitBuffer);
      gl.deleteProgram(program);
    },

    draw(params: {
      width: number;
      height: number;
      panelInset: number;
      pixelRatio: number;
      view: { lon: number; lat: number; zoom: number };
      visible: boolean;
      time: number;
    }) {
      gl.viewport(0, 0, params.width, params.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!params.visible) return;

      gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, params.width, params.height);
      gl.uniform2f(uniforms.center, (params.width - params.panelInset) / 2, params.height / 2);
      gl.uniform1f(uniforms.radius, (Math.min(params.width, params.height) / 2) * params.view.zoom);
      gl.uniform1f(uniforms.lon0, (params.view.lon * Math.PI) / 180);
      gl.uniform1f(uniforms.lat0, (params.view.lat * Math.PI) / 180);
      gl.uniform1f(uniforms.time, params.time / 1_000);
      gl.uniform1f(uniforms.pixelRatio, params.pixelRatio);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      bindVertices(gl, orbitBuffer);
      gl.uniform1i(uniforms.pointPass, 0);
      gl.drawArrays(gl.LINES, 0, orbitVertices.length / FLOATS_PER_VERTEX);

      bindVertices(gl, pointBuffer);
      gl.uniform1i(uniforms.pointPass, 1);
      gl.drawArrays(gl.POINTS, 0, pointVertices.length / FLOATS_PER_VERTEX);
      gl.disable(gl.BLEND);
    },
  };
}

export type SatelliteConstellationLayer = ReturnType<typeof createSatelliteConstellationLayer>;
