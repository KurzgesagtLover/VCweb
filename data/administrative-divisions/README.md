# Administrative division data

ADM1 and ADM2 boundaries are imported on demand from the geoBoundaries `gbOpen` API. The
repository does not keep downloaded GeoJSON copies.

- Source: https://www.geoboundaries.org/
- API: https://www.geoboundaries.org/api.html
- Default release channel: `current/gbOpen`
- Geometry: simplified GeoJSON in EPSG:4326
- Project license: CC BY 4.0; individual source licenses are returned by the API

The importer preserves each feature's `shapeID`, builds the ADM1-to-ADM2 hierarchy spatially, and
assigns both levels to owned H3 cells when H3 territory exists. Reference polygons remain separate
from city data and campaign-specific administrative divisions. On the globe, both levels stay
hidden until a map location is left-clicked. Only that ADM2 and its parent ADM1 are shown;
locations without ADM2 fall back to a single ADM1. Country search and zoom do not select boundaries.

Set `countries.iso_alpha3` for every real-world country that should be imported, migrate the
database, and run:

```powershell
pnpm db:admin-divisions
```

To import only selected configured countries:

```powershell
pnpm db:admin-divisions -- --iso=CHN,USA
```

To import the complete ADM1 catalog and every available ADM2 catalog:

```powershell
pnpm db:admin-divisions -- --all
```

Use `--replace` to replace a country's existing campaign divisions. Without it, manually created
divisions and same-level cell assignments are preserved.

To validate source availability without a database:

```powershell
pnpm db:admin-divisions -- --check-source=CHN
```

Attribution: Runfola, D. et al. (2020), geoBoundaries: A global database of political
administrative boundaries, PLOS ONE 15(4): e0231866.
