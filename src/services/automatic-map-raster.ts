import sharp from "sharp";
import type { CountryEntityType } from "@/src/domain/country/entity-type";
import type { DiplomaticRelationStatus } from "@/src/domain/diplomacy/status";
import {
  detectRasterBackgroundColors,
  drawAutomaticBorders,
} from "@/src/domain/map/automatic-borders";
import {
  applyBorderClassificationsInPlace,
  automaticBorderClassifications,
  borderSourceRgbs,
  type BorderClassification,
  type BorderLayerKind,
} from "@/src/domain/map/border-palette";
import { applyGuerrillaTerritoryOverlay } from "@/src/domain/map/guerrilla-territory";
import { removeRasterBorders } from "@/src/domain/map/raster-territory";
import { createRasterPreview } from "@/src/domain/map/raster-preview";

function mergeClassifications(
  current: BorderClassification[],
  colors: Record<BorderLayerKind, string>,
) {
  const automatic = automaticBorderClassifications(colors);
  const bySource = new Map(current.map((row) => [row.sourceColor.toUpperCase(), row]));
  for (const row of automatic) bySource.set(row.sourceColor.toUpperCase(), row);
  return [...bySource.values()];
}

export async function buildAutomaticMapRaster(input: {
  sourceImage: Buffer;
  assignments: Array<{ colorHex: string; countryId: string }>;
  countries: Array<{ id: string; entityType: CountryEntityType }>;
  relations: Array<{
    fromCountryId: string;
    toCountryId: string;
    status: DiplomaticRelationStatus;
  }>;
  classifications: BorderClassification[];
  layerColors: Record<BorderLayerKind, string>;
}) {
  const source = await sharp(input.sourceImage)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sourceWidth = source.info.width;
  const sourceHeight = source.info.height;
  const backgrounds = detectRasterBackgroundColors(source.data, sourceWidth, sourceHeight);
  const bordered = drawAutomaticBorders({
    data: source.data,
    width: sourceWidth,
    height: sourceHeight,
    assignments: input.assignments,
    countries: input.countries,
    relations: input.relations,
    backgroundColors: backgrounds,
  });
  const withGuerrilla = applyGuerrillaTerritoryOverlay({
    data: bordered.data,
    width: sourceWidth,
    height: sourceHeight,
    assignments: input.assignments,
    countries: input.countries,
    relations: input.relations,
    protectedColors: backgrounds,
  });
  const width = sourceWidth * 2;
  const height = sourceHeight * 2;
  const imageData = await sharp(withGuerrilla.data, {
    raw: { width: sourceWidth, height: sourceHeight, channels: 4 },
  })
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const decoded = await sharp(imageData).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const classifications = mergeClassifications(input.classifications, input.layerColors);
  const borderlessRaw = removeRasterBorders(
    decoded.data,
    width,
    height,
    borderSourceRgbs(classifications),
  );
  const borderlessImageData = await sharp(borderlessRaw, {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
  applyBorderClassificationsInPlace(decoded.data, borderlessRaw, classifications);
  const renderedData = await sharp(decoded.data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const sourceImageData = await sharp(input.sourceImage)
    .ensureAlpha()
    .png({ compressionLevel: 6 })
    .toBuffer();
  const preview = await createRasterPreview(imageData);
  return {
    sourceImageData,
    sourceWidth,
    sourceHeight,
    imageData,
    borderlessImageData,
    renderedData,
    preview,
    width,
    height,
    classifications,
    generatedBorderCounts: bordered.counts,
  };
}
