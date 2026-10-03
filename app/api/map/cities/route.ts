import { getSession } from "@/src/auth/session";
import { getWorldCitiesInViewport } from "@/src/db/queries/world-cities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberParameter(url: URL, name: string, fallback: number) {
  const value = url.searchParams.get(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(request.url);
  const north = numberParameter(url, "north", 90);
  const south = numberParameter(url, "south", -90);
  const west = numberParameter(url, "west", -180);
  const east = numberParameter(url, "east", 180);
  const minPopulation = Math.round(numberParameter(url, "minPopulation", 50_000));
  const limit = Math.round(numberParameter(url, "limit", 750));

  if (
    ![north, south, west, east, minPopulation, limit].every(Number.isFinite) ||
    north <= south ||
    north > 90 ||
    south < -90 ||
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    minPopulation < 0 ||
    limit < 1 ||
    limit > 20_000
  ) {
    return Response.json({ error: "INVALID_VIEWPORT" }, { status: 400 });
  }

  const cities = await getWorldCitiesInViewport({
    north,
    south,
    west,
    east,
    minPopulation,
    limit,
  });
  return Response.json(
    { cities },
    { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } },
  );
}
