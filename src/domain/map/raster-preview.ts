import sharp from "sharp";

export const MAX_RASTER_PREVIEW_DIMENSION = 2048;

function previewSize(width: number, height: number) {
  const scale = Math.min(1, MAX_RASTER_PREVIEW_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function createRasterPreview(input: Buffer) {
  const image = sharp(input, { sequentialRead: true });
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("INVALID_RASTER_SIZE");
  const size = previewSize(width, height);
  const data = await image
    .resize(size.width, size.height, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .png()
    .toBuffer();
  return { data, ...size };
}

export async function createRasterPreviewFromRaw(input: Buffer, width: number, height: number) {
  const size = previewSize(width, height);
  const data = await sharp(input, {
    raw: { width, height, channels: 4 },
  })
    .resize(size.width, size.height, { fit: "fill", kernel: "nearest" })
    .png()
    .toBuffer();
  return { data, ...size };
}

function parseColor(value: string) {
  const normalized = value.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) & 0xf8,
    green: Number.parseInt(normalized.slice(2, 4), 16) & 0xf8,
    blue: Number.parseInt(normalized.slice(4, 6), 16) & 0xf8,
  };
}

export async function extractTerritoryPreview(
  input: Buffer,
  colorHex: string,
  showBorders: boolean,
) {
  const target = parseColor(colorHex);
  if (!target) return null;
  const { data: source, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const mask = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let territoryPixels = 0;
  let territoryXSum = 0;
  let territoryYSum = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const sourceIndex = pixelIndex * 4;
      const matches =
        (source[sourceIndex] & 0xf8) === target.red &&
        (source[sourceIndex + 1] & 0xf8) === target.green &&
        (source[sourceIndex + 2] & 0xf8) === target.blue &&
        source[sourceIndex + 3] > 0;
      if (!matches) continue;
      mask[pixelIndex] = 1;
      territoryPixels += 1;
      territoryXSum += x;
      territoryYSum += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const visibleMask = showBorders ? new Uint8Array(mask) : mask;
  if (showBorders) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (!mask[index]) continue;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const nextY = y + offsetY;
          if (nextY < 0 || nextY >= height) continue;
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = x + offsetX;
            if (nextX < 0 || nextX >= width) continue;
            visibleMask[nextY * width + nextX] = 1;
          }
        }
      }
    }
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(width - 1, maxX + 1);
    maxY = Math.min(height - 1, maxY + 1);
  }

  const territoryCenterX = territoryXSum / territoryPixels;
  const territoryCenterY = territoryYSum / territoryPixels;
  const horizontalRadius = Math.max(territoryCenterX - minX, maxX - territoryCenterX);
  const verticalRadius = Math.max(territoryCenterY - minY, maxY - territoryCenterY);
  const outputWidth = Math.max(1, Math.ceil(horizontalRadius * 2) + 1);
  const outputHeight = Math.max(1, Math.ceil(verticalRadius * 2) + 1);
  const originX = Math.floor(territoryCenterX - (outputWidth - 1) / 2);
  const originY = Math.floor(territoryCenterY - (outputHeight - 1) / 2);
  const output = Buffer.alloc(outputWidth * outputHeight * 4);

  for (let outputY = 0; outputY < outputHeight; outputY += 1) {
    const sourceY = originY + outputY;
    if (sourceY < 0 || sourceY >= height) continue;
    for (let outputX = 0; outputX < outputWidth; outputX += 1) {
      const sourceX = originX + outputX;
      if (sourceX < 0 || sourceX >= width) continue;
      const sourcePixelIndex = sourceY * width + sourceX;
      const sourceIndex = sourcePixelIndex * 4;
      const outputIndex = (outputY * outputWidth + outputX) * 4;
      if (mask[sourcePixelIndex]) {
        output[outputIndex] = source[sourceIndex];
        output[outputIndex + 1] = source[sourceIndex + 1];
        output[outputIndex + 2] = source[sourceIndex + 2];
        output[outputIndex + 3] = source[sourceIndex + 3];
      } else if (showBorders && visibleMask[sourcePixelIndex]) {
        output[outputIndex] = 5;
        output[outputIndex + 1] = 5;
        output[outputIndex + 2] = 7;
        output[outputIndex + 3] = 255;
      }
    }
  }

  return {
    data: await sharp(output, {
      raw: { width: outputWidth, height: outputHeight, channels: 4 },
    })
      .png()
      .toBuffer(),
    width: outputWidth,
    height: outputHeight,
  };
}
