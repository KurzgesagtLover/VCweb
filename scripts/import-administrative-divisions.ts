import { sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";

const SOURCE = "geoBoundaries";
const API_ROOT = "https://www.geoboundaries.org/api/current/gbOpen";
const CHUNK_SIZE = 250;

type BoundaryLevel = 1 | 2;
type BoundaryMetadata = {
  boundaryID: string;
  boundaryISO: string;
  boundaryLicense: string;
  boundaryYearRepresented?: string;
  simplifiedGeometryGeoJSON: string;
};
type BoundaryFeature = {
  id: string;
  sourceId: string;
  sourceBoundaryId: string;
  sourceLicense: string;
  boundaryYear: string | null;
  countryIso3: string;
  level: BoundaryLevel;
  name: string;
  geometryJson: string;
};
type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties?: { shapeID?: unknown; shapeName?: unknown };
    geometry?: { type?: unknown; coordinates?: unknown } | null;
  }>;
};

function readIsoArgument(flag = "--iso") {
  const inline = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  const flagIndex = process.argv.indexOf(flag);
  const raw =
    inline?.slice(flag.length + 1) ?? (flagIndex >= 0 ? process.argv[flagIndex + 1] : null);
  if (!raw) return null;
  const values = raw
    .split(/[\s,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!values.length || values.some((value) => !/^[A-Z]{3}$/.test(value))) {
    throw new Error(`${flag}에는 ISO 3166-1 alpha-3 코드를 입력하세요.`);
  }
  return new Set(values);
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "NEXUS administrative-boundary importer" },
      });
      if (!response.ok) throw new Error(`${url} 요청 실패: ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

function normalizeFeatures(
  payload: GeoJsonFeatureCollection,
  metadata: BoundaryMetadata,
  level: BoundaryLevel,
) {
  if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error(`${metadata.boundaryISO} ADM${level} GeoJSON 형식이 올바르지 않습니다.`);
  }
  return payload.features.flatMap((feature, index): BoundaryFeature[] => {
    const sourceId = feature.properties?.shapeID;
    const name = feature.properties?.shapeName;
    const geometryType = feature.geometry?.type;
    if (
      feature.type !== "Feature" ||
      typeof sourceId !== "string" ||
      !sourceId ||
      (geometryType !== "Polygon" && geometryType !== "MultiPolygon")
    ) {
      throw new Error(`${metadata.boundaryISO} ADM${level} ${index + 1}번 피처가 잘못됐습니다.`);
    }
    const normalizedName =
      typeof name === "string" && name.trim()
        ? name.trim()
        : `미지정 ADM${level} (${sourceId.slice(-6)})`;
    if (typeof name !== "string" || !name.trim()) {
      console.warn(`${metadata.boundaryISO} ADM${level} ${sourceId}: 대체 이름을 적용합니다.`);
    }
    return [
      {
        id: `${SOURCE}:${sourceId}`,
        sourceId,
        sourceBoundaryId: metadata.boundaryID,
        sourceLicense: metadata.boundaryLicense,
        boundaryYear: metadata.boundaryYearRepresented || null,
        countryIso3: metadata.boundaryISO,
        level,
        name: normalizedName,
        geometryJson: JSON.stringify(feature.geometry),
      },
    ];
  });
}

async function downloadLevel(isoAlpha3: string, level: BoundaryLevel) {
  const metadata = await fetchJson<BoundaryMetadata>(`${API_ROOT}/${isoAlpha3}/ADM${level}/`);
  return downloadLevelFromMetadata(metadata, isoAlpha3, level);
}

async function downloadLevelFromMetadata(
  metadata: BoundaryMetadata,
  isoAlpha3: string,
  level: BoundaryLevel,
) {
  if (
    metadata.boundaryISO !== isoAlpha3 ||
    !metadata.boundaryID ||
    !metadata.simplifiedGeometryGeoJSON
  ) {
    throw new Error(`${isoAlpha3} ADM${level} 메타데이터가 올바르지 않습니다.`);
  }
  const collection = await fetchJson<GeoJsonFeatureCollection>(metadata.simplifiedGeometryGeoJSON);
  return { metadata, features: normalizeFeatures(collection, metadata, level) };
}

async function downloadCountry(isoAlpha3: string) {
  const [adm1, adm2] = await Promise.all([
    downloadLevel(isoAlpha3, 1),
    downloadLevel(isoAlpha3, 2),
  ]);
  return { adm1, adm2, features: [...adm1.features, ...adm2.features] };
}

async function importAllReferenceData() {
  const [adm1Metadata, adm2Metadata] = await Promise.all([
    fetchJson<BoundaryMetadata[]>(`${API_ROOT}/ALL/ADM1/`),
    fetchJson<BoundaryMetadata[]>(`${API_ROOT}/ALL/ADM2/`),
  ]);
  const adm1ByIso = new Map(adm1Metadata.map((metadata) => [metadata.boundaryISO, metadata]));
  const countries = [...adm1ByIso.values()];
  const adm2ByIso = new Map(adm2Metadata.map((metadata) => [metadata.boundaryISO, metadata]));
  const failures: Array<{ isoAlpha3: string; error: unknown }> = [];
  let cursor = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < countries.length) {
      const metadata1 = countries[cursor];
      cursor += 1;
      const isoAlpha3 = metadata1.boundaryISO;
      const metadata2 = adm2ByIso.get(isoAlpha3);
      try {
        const [adm1, adm2] = await Promise.all([
          downloadLevelFromMetadata(metadata1, isoAlpha3, 1),
          metadata2 ? downloadLevelFromMetadata(metadata2, isoAlpha3, 2) : Promise.resolve(null),
        ]);
        const features = [...adm1.features, ...(adm2?.features ?? [])];
        await importReferenceData(isoAlpha3, { features });
        console.log(
          `${isoAlpha3} 적재 · ADM1 ${adm1.features.length}개 · ADM2 ${adm2?.features.length ?? 0}개`,
        );
      } catch (error) {
        failures.push({ isoAlpha3, error });
        console.error(`${isoAlpha3} 적재 실패`, error);
      }
    }
  });
  await Promise.all(workers);
  if (failures.length) {
    throw new Error(
      `적재 실패 국가·지역: ${failures.map(({ isoAlpha3 }) => isoAlpha3).join(", ")}`,
    );
  }
  console.log(`전 세계 ${countries.length}개 국가·지역 경계 적재 완료`);
}

async function insertReferenceStage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  features: BoundaryFeature[],
) {
  for (let offset = 0; offset < features.length; offset += CHUNK_SIZE) {
    const rowsJson = JSON.stringify(features.slice(offset, offset + CHUNK_SIZE));
    await tx.execute(sql`
      INSERT INTO world_administrative_division_stage (
        id, source_id, source_boundary_id, source_license, boundary_year,
        country_iso3, level, name, geometry
      )
      SELECT
        record.id,
        record."sourceId",
        record."sourceBoundaryId",
        record."sourceLicense",
        record."boundaryYear",
        record."countryIso3",
        record.level,
        record.name,
        ST_Multi(
          ST_CollectionExtract(
        ST_MakeValid(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(record."geometryJson"), 4326))),
            3
          )
        )
      FROM jsonb_to_recordset(${rowsJson}::text::jsonb) AS record(
        id text, "sourceId" text, "sourceBoundaryId" text, "sourceLicense" text,
        "boundaryYear" text, "countryIso3" text, level integer, name text, "geometryJson" text
      )
    `);
  }
}

async function importReferenceData(isoAlpha3: string, downloaded: { features: BoundaryFeature[] }) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      CREATE TEMP TABLE world_administrative_division_stage (
        id text PRIMARY KEY,
        source_id text NOT NULL,
        source_boundary_id text NOT NULL,
        source_license text NOT NULL,
        boundary_year text,
        country_iso3 text NOT NULL,
        level integer NOT NULL,
        name text NOT NULL,
        geometry geometry(MultiPolygon, 4326) NOT NULL
      ) ON COMMIT DROP
    `);
    await insertReferenceStage(tx, downloaded.features);
    await tx.execute(sql`
      CREATE INDEX world_administrative_division_stage_geometry_idx
      ON world_administrative_division_stage USING GIST (geometry)
    `);
    await tx.execute(sql`
      INSERT INTO world_administrative_divisions (
        id, source, source_id, source_boundary_id, source_license,
        boundary_year, country_iso3, level, name, geometry
      )
      SELECT
        stage.id, ${SOURCE}, stage.source_id, stage.source_boundary_id, stage.source_license,
        stage.boundary_year, stage.country_iso3, stage.level, stage.name, stage.geometry
      FROM world_administrative_division_stage AS stage
      ON CONFLICT (id) DO UPDATE SET
        source_boundary_id = EXCLUDED.source_boundary_id,
        source_license = EXCLUDED.source_license,
        boundary_year = EXCLUDED.boundary_year,
        country_iso3 = EXCLUDED.country_iso3,
        level = EXCLUDED.level,
        name = EXCLUDED.name,
        geometry = EXCLUDED.geometry,
        updated_at = NOW()
    `);
    await tx.execute(sql`
      UPDATE world_administrative_divisions AS child
      SET parent_id = NULL,
          updated_at = NOW()
      FROM world_administrative_division_stage AS child_shape
      WHERE child.id = child_shape.id
        AND child_shape.level = 2
    `);
    await tx.execute(sql`
      UPDATE world_administrative_divisions AS child
      SET parent_id = matched.id,
          updated_at = NOW()
      FROM world_administrative_division_stage AS child_shape
      CROSS JOIN LATERAL (
        SELECT parent_shape.id
        FROM world_administrative_division_stage AS parent_shape
        WHERE parent_shape.level = 1
          AND parent_shape.geometry && ST_PointOnSurface(child_shape.geometry)
          AND ST_Covers(parent_shape.geometry, ST_PointOnSurface(child_shape.geometry))
        ORDER BY ST_Area(parent_shape.geometry) ASC
        LIMIT 1
      ) AS matched
      WHERE child.id = child_shape.id
        AND child.level = 2
        AND child_shape.level = 2
    `);
    await tx.execute(sql`
      UPDATE world_administrative_divisions AS child
      SET parent_id = matched.id,
          updated_at = NOW()
      FROM world_administrative_division_stage AS child_shape
      CROSS JOIN LATERAL (
        SELECT parent_shape.id
        FROM world_administrative_division_stage AS parent_shape
        WHERE parent_shape.level = 1
        ORDER BY parent_shape.geometry <-> ST_PointOnSurface(child_shape.geometry)
        LIMIT 1
      ) AS matched
      WHERE child.id = child_shape.id
        AND child.level = 2
        AND child.parent_id IS NULL
        AND child_shape.level = 2
    `);
    await tx.execute(sql`
      DELETE FROM world_administrative_divisions AS existing
      WHERE existing.source = ${SOURCE}
        AND existing.country_iso3 = ${isoAlpha3}
        AND NOT EXISTS (
          SELECT 1 FROM world_administrative_division_stage AS stage WHERE stage.id = existing.id
        )
    `);
  });
}

async function run() {
  if (process.argv.includes("--all")) {
    await importAllReferenceData();
    return;
  }
  const checkIso = readIsoArgument("--check-source");
  const isoCodes = checkIso ?? readIsoArgument();
  if (!isoCodes?.size) throw new Error("가져올 ISO 국가 코드를 지정하세요.");

  for (const isoAlpha3 of isoCodes) {
    const downloaded = await downloadCountry(isoAlpha3);
    console.log(
      `${isoAlpha3} 원본 · ADM1 ${downloaded.adm1.features.length}개 · ADM2 ${downloaded.adm2.features.length}개`,
    );
    if (!checkIso) await importReferenceData(isoAlpha3, downloaded);
  }
}

run().finally(() => sqlClient.end());
