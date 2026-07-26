import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import { campaignMaps, campaigns, countries } from "../src/db/schema";
import { matchCountryColor, parseHexColor } from "../src/domain/map/image-colors";

async function verifyMapImport() {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.isActive, true) });
  if (!campaign) throw new Error("활성 캠페인이 없습니다.");
  const campaignMap = await db.query.campaignMaps.findFirst({
    where: eq(campaignMaps.campaignId, campaign.id),
  });
  if (!campaignMap) throw new Error("활성 지도가 없습니다.");
  const countryRows = await db.query.countries.findMany({
    where: eq(countries.campaignId, campaign.id),
  });
  const palette = countryRows.map((country) => {
    const rgb = parseHexColor(country.color);
    if (!rgb) throw new Error(`${country.name}의 색상이 올바르지 않습니다.`);
    return rgb;
  });
  if (palette.length < 2) throw new Error("검증할 국가 색상이 부족합니다.");

  const width = 360;
  const height = 180;
  const pixels = Buffer.alloc(width * height * 3);
  const patchColor = palette[(campaignMap.revision % (palette.length - 1)) + 1];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sector = Math.min(palette.length - 1, Math.floor((x / width) * palette.length));
      const onBorder = Array.from({ length: palette.length - 1 }, (_, index) =>
        Math.abs(x - Math.round(((index + 1) * width) / palette.length)),
      ).some((distance) => distance <= 1);
      const color = onBorder
        ? ([0, 0, 0] as const)
        : x >= 20 && x < 30
          ? patchColor
          : palette[sector];
      const offset = (y * width + x) * 3;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
  const png = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  const login = await fetch("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ email: "admin@virtual.local", password: "Demo-password-2087" }),
  });
  if (!login.ok) throw new Error(`관리자 로그인 실패: ${login.status}`);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  const image = new Blob([png], { type: "image/png" });
  const analysisForm = new FormData();
  analysisForm.set("campaignId", campaign.id);
  analysisForm.set("mapId", campaignMap.id);
  analysisForm.set("expectedRevision", String(campaignMap.revision));
  analysisForm.set("mode", "analyze");
  analysisForm.set("file", image, "map-import-verification.png");
  const analysisResponse = await fetch("http://localhost:3000/api/admin/map/import", {
    method: "POST",
    headers: { Cookie: cookie, Origin: "http://localhost:3000" },
    body: analysisForm,
  });
  const analysis = (await analysisResponse.json()) as {
    error?: string;
    colors?: Array<{ hex: string }>;
  };
  if (!analysisResponse.ok) {
    throw new Error(analysis.error ?? `이미지 색상 분석 실패: ${analysisResponse.status}`);
  }
  const assignments = (analysis.colors ?? []).flatMap(({ hex }) => {
    const rgb = parseHexColor(hex);
    if (!rgb) return [];
    const match = matchCountryColor(
      [rgb[0], rgb[1], rgb[2], 255],
      countryRows.map((country, index) => ({ value: country, rgb: palette[index] })),
    );
    return match.kind === "country" ? [{ hex, countryId: match.value.id }] : [];
  });

  const form = new FormData();
  form.set("campaignId", campaign.id);
  form.set("mapId", campaignMap.id);
  form.set("expectedRevision", String(campaignMap.revision));
  form.set("mode", "apply");
  form.set("confirm", "yes");
  form.set("assignments", JSON.stringify(assignments));
  form.set("file", image, "map-import-verification.png");
  const response = await fetch("http://localhost:3000/api/admin/map/import", {
    method: "POST",
    headers: { Cookie: cookie, Origin: "http://localhost:3000" },
    body: form,
  });
  const result = (await response.json()) as {
    error?: string;
    changed?: number;
    blackBorders?: number;
    unmatched?: number;
    revision?: number;
  };
  if (!response.ok) throw new Error(result.error ?? `이미지 가져오기 실패: ${response.status}`);
  if (!result.changed || !result.blackBorders || result.revision !== campaignMap.revision + 1) {
    throw new Error(`이미지 가져오기 검증 실패: ${JSON.stringify(result)}`);
  }
  console.log(
    `Map import verified: ${result.changed.toLocaleString()} changed, ${result.blackBorders.toLocaleString()} black-border cells ignored, revision ${result.revision}.`,
  );
}

verifyMapImport().finally(() => sqlClient.end());
