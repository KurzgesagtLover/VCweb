import { getSession } from "@/src/auth/session";
import { getActiveCampaign } from "@/src/db/queries/viewer";
import { getCountryMapLabels } from "@/src/services/country-map-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type GlobeLabelPayload = {
  labels: Array<{
    countryId: string;
    name: string;
    /** 글자 앵커. 래스터 이미지 기준 0..1 UV. */
    glyphs: Array<{ char: string; u: number; v: number }>;
    /**
     * 글자 크기를 화면에서 재기 위한 자. 라벨 중앙에서 글자 진행 방향으로
     * 글자 크기만큼 벌린 두 점이며, 화면에 투영한 두 점 사이 거리가 곧 글자 크기다.
     */
    ruler: [{ u: number; v: number }, { u: number; v: number }];
  }>;
};

/**
 * 라벨을 평면 텍스처에 구워 구체에 감으면 극지방 글자가 뭉개진다.
 * 좌표만 넘기고 글자는 지표면 바로 위의 접평면 객체로 투영해 그리도록 한다.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "NO_ACTIVE_CAMPAIGN" }, { status: 404 });

  const mapId = new URL(request.url).searchParams.get("mapId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }

  const layout = await getCountryMapLabels(campaign.id, mapId);
  if (!layout.width || !layout.height) {
    return Response.json({ labels: [] } satisfies GlobeLabelPayload);
  }

  const payload: GlobeLabelPayload = {
    labels: layout.labels.flatMap((label) => {
      if (!label.glyphs.length) return [];
      const middle = label.glyphs[Math.floor(label.glyphs.length / 2)];
      const radians = (middle.angle * Math.PI) / 180;
      const halfX = (Math.cos(radians) * label.fontSize) / 2;
      const halfY = (Math.sin(radians) * label.fontSize) / 2;
      return [
        {
          countryId: label.countryId,
          name: label.name,
          glyphs: label.glyphs.map((glyph) => ({
            char: glyph.char,
            u: glyph.x / layout.width,
            v: glyph.y / layout.height,
          })),
          ruler: [
            { u: (middle.x - halfX) / layout.width, v: (middle.y - halfY) / layout.height },
            { u: (middle.x + halfX) / layout.width, v: (middle.y + halfY) / layout.height },
          ] as [{ u: number; v: number }, { u: number; v: number }],
        },
      ];
    }),
  };
  return Response.json(payload, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
