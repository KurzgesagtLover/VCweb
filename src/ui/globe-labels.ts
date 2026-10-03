import { unprojectUv, type MapProjection, type ProjectionFit } from "@/src/domain/map/projection";

export type GlobeLabelSource = {
  countryId: string;
  name: string;
  glyphs: Array<{ char: string; u: number; v: number }>;
  ruler: [{ u: number; v: number }, { u: number; v: number }];
};

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_FONT_PX = 9;
const MAX_FONT_PX = 74;
const LABEL_OPACITY = 0.6;
/** 지표면과 겹쳐 깜빡이지 않도록 국명을 지구 반지름보다 아주 조금 위에 띄운다. */
const LABEL_ALTITUDE = 1.004;
const LIMB_CUTOFF = 0.01;
const SPACE_SIDE_WEIGHT = 0.65;

type Point = { lon: number; sinLat: number; cosLat: number };
type ViewPoint = { x: number; y: number; z: number; screenX: number; screenY: number };
type PreparedLabel = {
  name: string;
  chars: string[];
  points: Point[];
  ruler: [Point, Point];
  nodes: SVGTextElement[];
};

function toPoint(lon: number, lat: number): Point {
  const radians = (lat * Math.PI) / 180;
  return { lon: (lon * Math.PI) / 180, sinLat: Math.sin(radians), cosLat: Math.cos(radians) };
}

function pointDot(a: Point, b: Point) {
  return a.sinLat * b.sinLat + a.cosLat * b.cosLat * Math.cos(a.lon - b.lon);
}

function pointDistance(a: Point, b: Point) {
  return Math.acos(Math.max(-1, Math.min(1, pointDot(a, b))));
}

function interpolateOnSphere(a: Point, b: Point, ratio: number): Point {
  const angle = pointDistance(a, b);
  if (angle < 1e-7) return a;

  const sinAngle = Math.sin(angle);
  const aWeight = Math.sin((1 - ratio) * angle) / sinAngle;
  const bWeight = Math.sin(ratio * angle) / sinAngle;
  const x = aWeight * a.cosLat * Math.cos(a.lon) + bWeight * b.cosLat * Math.cos(b.lon);
  const y = aWeight * a.sinLat + bWeight * b.sinLat;
  const z = aWeight * a.cosLat * Math.sin(a.lon) + bWeight * b.cosLat * Math.sin(b.lon);
  const length = Math.hypot(x, y, z) || 1;
  const normalizedY = y / length;
  return {
    lon: Math.atan2(z / length, x / length),
    sinLat: normalizedY,
    cosLat: Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY)),
  };
}

/** 원래 라벨 경로를 유지하면서 글자 중심 사이의 구면 거리를 동일하게 만든다. */
function evenlySpaceOnSphere(points: Point[], chars: string[]) {
  if (points.length <= 2) return points;
  const segmentLengths = points.slice(1).map((point, index) => pointDistance(points[index], point));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (totalLength < 1e-7) return points;

  const spacingWeights = segmentLengths.map((_, index) =>
    chars[index] === " " || chars[index + 1] === " " ? SPACE_SIDE_WEIGHT : 1,
  );
  const totalWeight = spacingWeights.reduce((sum, weight) => sum + weight, 0);

  const result: Point[] = [points[0]];
  let segmentIndex = 0;
  let segmentStart = 0;
  let passedWeight = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    passedWeight += spacingWeights[index - 1];
    const target = (totalLength * passedWeight) / totalWeight;
    while (
      segmentIndex < segmentLengths.length - 1 &&
      segmentStart + segmentLengths[segmentIndex] < target
    ) {
      segmentStart += segmentLengths[segmentIndex];
      segmentIndex += 1;
    }
    const segmentLength = segmentLengths[segmentIndex];
    const ratio = segmentLength < 1e-7 ? 0 : (target - segmentStart) / segmentLength;
    result.push(interpolateOnSphere(points[segmentIndex], points[segmentIndex + 1], ratio));
  }
  result.push(points.at(-1) ?? points[0]);
  return result;
}

/**
 * 구체 위 국명 라벨. 글자를 지표면 바로 위의 작은 접평면 객체로 취급해
 * 위치뿐 아니라 가로·세로축도 정사도법으로 투영한다.
 */
export function createGlobeLabelLayer(host: SVGGElement) {
  let labels: PreparedLabel[] = [];

  const toViewPoint = (
    point: Point,
    sinLat0: number,
    cosLat0: number,
    lon0: number,
    centerX: number,
    centerY: number,
    radius: number,
  ): ViewPoint => {
    const delta = point.lon - lon0;
    const cosDelta = Math.cos(delta);
    const cosC = sinLat0 * point.sinLat + cosLat0 * point.cosLat * cosDelta;
    const x = point.cosLat * Math.sin(delta);
    const y = cosLat0 * point.sinLat - sinLat0 * point.cosLat * cosDelta;
    return {
      x,
      y,
      z: cosC,
      screenX: centerX + x * radius * LABEL_ALTITUDE,
      screenY: centerY - y * radius * LABEL_ALTITUDE,
    };
  };

  const dot = (a: ViewPoint, b: ViewPoint) => a.x * b.x + a.y * b.y + a.z * b.z;
  const surfaceDistance = (a: ViewPoint, b: ViewPoint) =>
    Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  const tangentAt = (point: ViewPoint, previous: ViewPoint, next: ViewPoint) => {
    let x = next.x - previous.x;
    let y = next.y - previous.y;
    let z = next.z - previous.z;
    const normalPart = x * point.x + y * point.y + z * point.z;
    x -= normalPart * point.x;
    y -= normalPart * point.y;
    z -= normalPart * point.z;
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) return null;
    return { x: x / length, y: y / length, z: z / length };
  };
  const smoothstep = (edge0: number, edge1: number, value: number) => {
    const ratio = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return ratio * ratio * (3 - 2 * ratio);
  };

  return {
    clear() {
      host.replaceChildren();
      labels = [];
    },

    setLabels(source: GlobeLabelSource[], projection: MapProjection, fit: ProjectionFit) {
      host.replaceChildren();
      labels = source.flatMap((label) => {
        const chars = label.glyphs.map((glyph) => glyph.char);
        if (!chars.length) return [];
        const points = evenlySpaceOnSphere(
          label.glyphs.map((glyph) => {
            const location = unprojectUv(projection, glyph.u, glyph.v, fit);
            return toPoint(location.lon, location.lat);
          }),
          chars,
        );
        const ruler = label.ruler.map((mark) => {
          const location = unprojectUv(projection, mark.u, mark.v, fit);
          return toPoint(location.lon, location.lat);
        }) as [Point, Point];
        const nodes = chars.map((char) => {
          const node = document.createElementNS(SVG_NS, "text");
          node.setAttribute("class", "globe-label");
          node.setAttribute("text-anchor", "middle");
          node.setAttribute("dominant-baseline", "central");
          node.textContent = char;
          host.append(node);
          return node;
        });
        return [{ name: label.name, chars, points, ruler, nodes }];
      });
    },

    draw(params: {
      width: number;
      height: number;
      panelInset: number;
      view: { lon: number; lat: number; zoom: number };
    }) {
      const { width, height, panelInset, view } = params;
      const radius = (Math.min(width, height) / 2) * view.zoom;
      const centerX = (width - panelInset) / 2;
      const centerY = height / 2;
      const lon0 = (view.lon * Math.PI) / 180;
      const lat0 = (view.lat * Math.PI) / 180;
      const sinLat0 = Math.sin(lat0);
      const cosLat0 = Math.cos(lat0);

      for (const label of labels) {
        const project = (point: Point) =>
          toViewPoint(point, sinLat0, cosLat0, lon0, centerX, centerY, radius);
        const rulerStart = project(label.ruler[0]);
        const rulerEnd = project(label.ruler[1]);
        const fontSize = surfaceDistance(rulerStart, rulerEnd) * radius * LABEL_ALTITUDE;
        const visible = fontSize >= MIN_FONT_PX && fontSize <= MAX_FONT_PX;
        if (!visible) {
          for (const node of label.nodes) node.setAttribute("visibility", "hidden");
          continue;
        }

        const screen = label.points.map(project);
        for (let index = 0; index < label.nodes.length; index += 1) {
          const node = label.nodes[index];
          const point = screen[index];
          if (point.z <= LIMB_CUTOFF) {
            node.setAttribute("visibility", "hidden");
            continue;
          }
          const onlyGlyph = screen.length === 1;
          const previous = onlyGlyph ? rulerStart : index > 0 ? screen[index - 1] : point;
          const next = onlyGlyph ? rulerEnd : index + 1 < screen.length ? screen[index + 1] : point;
          const tangent = tangentAt(point, previous, next);
          if (!tangent) {
            node.setAttribute("visibility", "hidden");
            continue;
          }
          // 글자의 세로축도 지구 접평면 위에 둔다. 따라서 가장자리에서는 위치만
          // 이동하는 화면 글자가 아니라 지구 표면과 같은 비율로 납작해진다.
          const vertical = {
            x: tangent.y * point.z - tangent.z * point.y,
            y: tangent.z * point.x - tangent.x * point.z,
          };
          const fade = smoothstep(LIMB_CUTOFF, 0.16, point.z) * LABEL_OPACITY;
          node.setAttribute("visibility", "visible");
          node.setAttribute("font-size", fontSize.toFixed(2));
          node.setAttribute("opacity", fade.toFixed(3));
          node.setAttribute(
            "transform",
            `matrix(${tangent.x.toFixed(5)} ${(-tangent.y).toFixed(5)} ${vertical.x.toFixed(5)} ${(-vertical.y).toFixed(5)} ${point.screenX.toFixed(1)} ${point.screenY.toFixed(1)})`,
          );
        }
      }
    },
  };
}

export type GlobeLabelLayer = ReturnType<typeof createGlobeLabelLayer>;
