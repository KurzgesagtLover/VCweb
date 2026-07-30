import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";

export const runtime = "nodejs";

const AUDIO_EXTENSIONS = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/webm", "webm"],
]);

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.status !== "ACTIVE" || session.user.role !== "ADMIN") {
    return Response.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const context = await getViewerContext(session.user.id);
  if (!context.campaign)
    return Response.json({ error: "활성 캠페인이 없습니다." }, { status: 404 });

  const formData = await request.formData();
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (kind !== "image" && kind !== "audio") {
    return Response.json({ error: "업로드 종류가 올바르지 않습니다." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "파일을 선택해 주세요." }, { status: 400 });
  }

  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "superevents");
  await mkdir(uploadDirectory, { recursive: true });

  if (kind === "audio") {
    const extension = AUDIO_EXTENSIONS.get(file.type);
    if (!extension) {
      return Response.json({ error: "MP3, OGG, WAV, WebM만 사용할 수 있습니다." }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return Response.json({ error: "오디오는 20MB 이하여야 합니다." }, { status: 400 });
    }
    const fileName = `${randomUUID()}.${extension}`;
    await writeFile(path.join(uploadDirectory, fileName), Buffer.from(await file.arrayBuffer()), {
      flag: "wx",
    });
    const url = `/uploads/superevents/${fileName}`;
    await db.insert(auditLogs).values({
      campaignId: context.campaign.id,
      actorId: session.user.id,
      action: "UPLOAD_SUPER_EVENT_AUDIO",
      targetType: "SUPER_EVENT_MEDIA",
      targetId: fileName,
      afterSummary: { url, bytes: file.size },
      reason: "슈퍼이벤트 오디오 업로드",
    });
    return Response.json({ url });
  }

  if (!IMAGE_TYPES.has(file.type)) {
    return Response.json({ error: "JPG, PNG, WebP, GIF만 사용할 수 있습니다." }, { status: 400 });
  }
  if (file.size > 12 * 1024 * 1024) {
    return Response.json({ error: "이미지는 12MB 이하여야 합니다." }, { status: 400 });
  }
  try {
    const image = sharp(await file.arrayBuffer(), { animated: true, limitInputPixels: 50_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("INVALID_IMAGE");
    const output = await image
      .rotate()
      .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const fileName = `${randomUUID()}.webp`;
    await writeFile(path.join(uploadDirectory, fileName), output, { flag: "wx" });
    const url = `/uploads/superevents/${fileName}`;
    await db.insert(auditLogs).values({
      campaignId: context.campaign.id,
      actorId: session.user.id,
      action: "UPLOAD_SUPER_EVENT_IMAGE",
      targetType: "SUPER_EVENT_MEDIA",
      targetId: fileName,
      afterSummary: { url, width: metadata.width, height: metadata.height },
      reason: "슈퍼이벤트 이미지 업로드",
    });
    return Response.json({ url });
  } catch {
    return Response.json({ error: "올바른 이미지 파일이 아닙니다." }, { status: 400 });
  }
}
