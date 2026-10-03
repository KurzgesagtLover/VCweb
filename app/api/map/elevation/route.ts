import { createHash } from "node:crypto";
import { NetCDFReader } from "netcdfjs";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { packElevationSamples } from "@/src/domain/map/elevation-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOAA_NCSS =
  "https://www.ngdc.noaa.gov/thredds/ncss/grid/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc";
const CACHE_LIMIT = 24;
const MAX_TEXTURE_SIZE = 2048;
const SOURCE_EDGE = 179.991667;

type TextureResult = { body: Uint8Array; stride: number };
const textureCache = new Map<string, TextureResult>();
const pendingTextures = new Map<string, Promise<TextureResult>>();

type Window = {
  left: number;
  top: number;
  width: number;
  height: number;
  size: number;
  stride: number | null;
};
type ElevationGrid = { width: number; height: number; values: number[] };

function parseWindow(url: URL): Window | null {
  const left = Number(url.searchParams.get("left"));
  const top = Number(url.searchParams.get("top"));
  const width = Number(url.searchParams.get("width"));
  const height = Number(url.searchParams.get("height"));
  const requestedSize = Number(url.searchParams.get("size") ?? MAX_TEXTURE_SIZE);
  const requestedStride = url.searchParams.has("stride")
    ? Number(url.searchParams.get("stride"))
    : null;
  if (
    ![left, top, width, height, requestedSize].every(Number.isFinite) ||
    (requestedStride !== null &&
      (!Number.isInteger(requestedStride) || requestedStride < 1 || requestedStride > 64)) ||
    left < 0 ||
    left >= 1 ||
    top < 0 ||
    top >= 1 ||
    width <= 0 ||
    width > 0.51 ||
    height <= 0 ||
    top + height > 1.000001
  ) {
    return null;
  }
  return {
    left,
    top,
    width,
    height,
    size: Math.max(512, Math.min(MAX_TEXTURE_SIZE, Math.round(requestedSize))),
    stride: requestedStride,
  };
}

function coordinate(value: number) {
  return Number(value.toFixed(6));
}

async function fetchGrid(south: number, north: number, west: number, east: number, stride: number) {
  const query = new URLSearchParams({
    var: "z",
    north: String(coordinate(north)),
    west: String(coordinate(west)),
    east: String(coordinate(east)),
    south: String(coordinate(south)),
    horizStride: String(stride),
    accept: "netcdf",
  });
  const response = await fetch(`${NOAA_NCSS}?${query.toString()}`, {
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 604_800 },
  });
  if (!response.ok) throw new Error(`ETOPO ${response.status}`);
  const reader = new NetCDFReader(await response.arrayBuffer());
  const latitude = reader.getDataVariable("lat") as number[];
  const longitude = reader.getDataVariable("lon") as number[];
  const values = reader.getDataVariable("z") as number[];
  return { width: longitude.length, height: latitude.length, values } satisfies ElevationGrid;
}

function stitchGrids(grids: ElevationGrid[]): ElevationGrid {
  if (grids.length === 1) return grids[0];
  const height = Math.min(...grids.map((grid) => grid.height));
  const width = grids.reduce((sum, grid) => sum + grid.width, 0);
  const values = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    let outputX = 0;
    for (const grid of grids) {
      for (let x = 0; x < grid.width; x += 1) {
        values[y * width + outputX] = grid.values[y * grid.width + x];
        outputX += 1;
      }
    }
  }
  return { width, height, values };
}

function cacheTexture(key: string, texture: TextureResult) {
  textureCache.set(key, texture);
  while (textureCache.size > CACHE_LIMIT) {
    const oldest = textureCache.keys().next().value;
    if (oldest === undefined) break;
    textureCache.delete(oldest);
  }
}

async function renderTexture(window: Window): Promise<TextureResult> {
  const south = 90 - (window.top + window.height) * 180;
  const north = 90 - window.top * 180;
  const spanLongitude = window.width * 360;
  const west = window.left * 360 - 180;
  const rawWidth = spanLongitude * 60;
  const rawHeight = (north - south) * 60;
  const minimumStride = Math.max(1, Math.ceil(Math.max(rawWidth, rawHeight) / window.size));
  const stride = Math.max(minimumStride, window.stride ?? 1);
  const east = west + spanLongitude;

  const grids =
    east <= SOURCE_EDGE
      ? [await fetchGrid(south, north, west, east, stride)]
      : await Promise.all(
          [
            west <= SOURCE_EDGE ? fetchGrid(south, north, west, SOURCE_EDGE, stride) : null,
            fetchGrid(south, north, Math.max(-SOURCE_EDGE, west - 360), east - 360, stride),
          ].filter((request): request is Promise<ElevationGrid> => request !== null),
        );
  const grid = stitchGrids(grids);
  const png = await sharp(packElevationSamples(grid.values, grid.width, grid.height), {
    raw: { width: grid.width, height: grid.height, channels: 4 },
  })
    .png({ compressionLevel: 3 })
    .toBuffer();
  return { body: new Uint8Array(png), stride };
}

function responseHeaders(etag: string, stride?: number) {
  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "private, max-age=604800, stale-while-revalidate=2592000",
    ETag: etag,
  };
  if (stride) headers["X-Elevation-Stride"] = String(stride);
  return headers;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const window = parseWindow(new URL(request.url));
  if (!window) return Response.json({ error: "INVALID_WINDOW" }, { status: 400 });

  const cacheKey = [
    window.left,
    window.top,
    window.width,
    window.height,
    window.size,
    window.stride ?? 0,
  ]
    .map((value) => value.toFixed(6))
    .join(":");
  const cached = textureCache.get(cacheKey);
  const etag = `"etopo-detail-${createHash("sha1").update(cacheKey).digest("hex").slice(0, 16)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: responseHeaders(etag) });
  }
  if (cached) {
    textureCache.delete(cacheKey);
    textureCache.set(cacheKey, cached);
    return new Response(cached.body as BodyInit, {
      headers: responseHeaders(etag, cached.stride),
    });
  }

  try {
    let pending = pendingTextures.get(cacheKey);
    if (!pending) {
      pending = renderTexture(window).then((texture) => {
        cacheTexture(cacheKey, texture);
        return texture;
      });
      pendingTextures.set(cacheKey, pending);
      const clearPending = () => {
        if (pendingTextures.get(cacheKey) === pending) pendingTextures.delete(cacheKey);
      };
      void pending.then(clearPending, clearPending);
    }
    const texture = await pending;
    return new Response(texture.body as BodyInit, {
      headers: responseHeaders(etag, texture.stride),
    });
  } catch {
    return Response.json({ error: "ELEVATION_SOURCE_UNAVAILABLE" }, { status: 502 });
  }
}
