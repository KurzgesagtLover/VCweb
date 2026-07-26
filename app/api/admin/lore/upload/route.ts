import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.status !== "ACTIVE" || session.user.role !== "ADMIN") {
    return Response.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const context = await getViewerContext(session.user.id);
  if (!context.campaign)
    return Response.json({ error: "활성 캠페인이 없습니다." }, { status: 404 });
  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "이미지 파일을 선택해 주세요." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return Response.json({ error: "이미지는 8MB 이하여야 합니다." }, { status: 400 });
  }
  if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(file.type)) {
    return Response.json({ error: "JPG, PNG, WebP, GIF만 사용할 수 있습니다." }, { status: 400 });
  }

  try {
    const image = sharp(await file.arrayBuffer(), { animated: true, limitInputPixels: 50_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("INVALID_IMAGE");
    const output = await image
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const fileName = `${randomUUID()}.webp`;
    const uploadDirectory = path.join(process.cwd(), "public", "uploads", "lore");
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, fileName), output, { flag: "wx" });
    const url = `/uploads/lore/${fileName}`;
    await db.insert(auditLogs).values({
      campaignId: context.campaign.id,
      actorId: session.user.id,
      action: "UPLOAD_CAMPAIGN_LORE_IMAGE",
      targetType: "CAMPAIGN_LORE_IMAGE",
      targetId: fileName,
      afterSummary: { url, width: metadata.width, height: metadata.height },
      reason: "세계관 이미지 업로드",
    });
    return Response.json({ url });
  } catch {
    return Response.json({ error: "올바른 이미지 파일이 아닙니다." }, { status: 400 });
  }
}
