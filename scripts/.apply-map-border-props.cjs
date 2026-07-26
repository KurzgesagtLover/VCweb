const fs = require("node:fs");

function edit(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one match, found ${count}`);
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

edit(
  "src/ui/world-map.tsx",
  `import { getMinimumSafeTileZoom } from "@/src/domain/map/grid";
import { PixelMapEditor } from "@/src/ui/pixel-map-editor";`,
  `import type { BorderClassification } from "@/src/domain/map/border-palette";
import { getMinimumSafeTileZoom } from "@/src/domain/map/grid";
import { PixelMapEditor } from "@/src/ui/pixel-map-editor";`,
);

edit(
  "src/ui/world-map.tsx",
  `  rasterRevision,
  hasRaster,
  countries,`,
  `  rasterRevision,
  hasRaster,
  borderRevision,
  borderClassifications,
  countries,`,
);

edit(
  "src/ui/world-map.tsx",
  `  rasterRevision: number;
  hasRaster: boolean;
  countries: Country[];`,
  `  rasterRevision: number;
  hasRaster: boolean;
  borderRevision: number;
  borderClassifications: BorderClassification[];
  countries: Country[];`,
);

edit(
  "src/ui/world-map.tsx",
  `              rasterRevision={rasterRevision}
              hasRaster={hasRaster}
              countries={countries}`,
  `              rasterRevision={rasterRevision}
              hasRaster={hasRaster}
              borderRevision={borderRevision}
              initialBorderClassifications={borderClassifications}
              countries={countries}`,
);

edit(
  "app/admin/map/page.tsx",
  `import { countries, mapChangeSets, mapRasters } from "@/src/db/schema";`,
  `import {
  countries,
  mapChangeSets,
  mapRasterBorderLayers,
  mapRasters,
} from "@/src/db/schema";`,
);

edit(
  "app/admin/map/page.tsx",
  `  const [countryRows, changes, raster] = await Promise.all([`,
  `  const [countryRows, changes, raster, borderLayer] = await Promise.all([`,
);

edit(
  "app/admin/map/page.tsx",
  `    db.query.mapRasters.findFirst({
      where: eq(mapRasters.mapId, selectedMap.id),
      columns: { revision: true },
    }),
  ]);`,
  `    db.query.mapRasters.findFirst({
      where: eq(mapRasters.mapId, selectedMap.id),
      columns: { revision: true },
    }),
    db.query.mapRasterBorderLayers.findFirst({
      where: eq(mapRasterBorderLayers.mapId, selectedMap.id),
      columns: { revision: true, classifications: true },
    }),
  ]);`,
);

edit(
  "app/admin/map/page.tsx",
  `        rasterRevision={raster?.revision ?? 0}
        hasRaster={Boolean(raster)}
        countries=`,
  `        rasterRevision={raster?.revision ?? 0}
        hasRaster={Boolean(raster)}
        borderRevision={borderLayer?.revision ?? 0}
        borderClassifications={borderLayer?.classifications ?? []}
        countries=`,
);

