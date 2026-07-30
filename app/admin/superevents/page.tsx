import Image from "next/image";
import Link from "next/link";
import {
  archiveSuperEventAction,
  broadcastSuperEventAction,
  deleteSuperEventAction,
  rebroadcastSuperEventAction,
} from "@/src/actions/superevents";
import { requireRole } from "@/src/auth/session";
import { getCampaignCountryOptions, getSuperEventDesk } from "@/src/db/queries/superevents";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";
import { SuperEventComposer, type SuperEventDraft } from "@/src/ui/superevent-composer";

export const metadata = { title: "슈퍼이벤트 편성" };

const STATUS_LABELS = {
  DRAFT: "초안",
  BROADCAST: "송출 중",
  ARCHIVED: "종료",
} as const;

export default async function AdminSuperEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const { edit } = await searchParams;
  const [rows, countries] = await Promise.all([
    getSuperEventDesk(context.campaign.id),
    getCampaignCountryOptions(context.campaign.id),
  ]);

  const editing = rows.find((row) => row.id === edit && row.status !== "BROADCAST");
  const initial: SuperEventDraft | null = editing
    ? {
        id: editing.id,
        audience: editing.audience,
        targetCountryId: editing.targetCountryId,
        codeName: editing.codeName,
        sourceLabel: editing.sourceLabel,
        title: editing.title,
        subtitle: editing.subtitle,
        body: editing.body,
        footnote: editing.footnote,
        stampText: editing.stampText,
        imageUrl: editing.imageUrl,
        imageAlt: editing.imageAlt,
        audioUrl: editing.audioUrl,
        audioVolume: editing.audioVolume,
        audioStartSeconds: editing.audioStartSeconds,
        audioIntroReduced: editing.audioIntroReduced,
        dismissLabel: editing.dismissLabel,
        holdSeconds: editing.holdSeconds,
      }
    : null;
  const live = rows.filter((row) => row.status === "BROADCAST");

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="TOTAL BROADCAST"
        title="슈퍼이벤트 편성"
        description="사진·음원·문구를 하나의 송출 템플릿에 끼워 전 국가 화면에 강제로 띄웁니다."
        aside={<span className="status-pill">송출 중 {live.length}건</span>}
      />

      <div className="se-desk">
        <SuperEventComposer key={initial?.id ?? "new"} countries={countries} initial={initial} />
      </div>

      {editing && (
        <p className="muted">
          초안 “{editing.title}”을 고치고 있습니다. <Link href="/admin/superevents">새로 작성</Link>
        </p>
      )}

      <section className="section-stack">
        <div className="panel-head">
          <h2>편성 목록</h2>
          <span className="muted">최근 40건</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">아직 편성한 슈퍼이벤트가 없습니다.</div>
        ) : (
          <div className="se-desk-list">
            {rows.map((row) => (
              <article className="se-desk-row" key={row.id}>
                {row.imageUrl ? (
                  <div className="se-desk-thumb">
                    <Image src={row.imageUrl} alt="" fill sizes="6rem" unoptimized />
                  </div>
                ) : (
                  <div className="se-desk-thumb" />
                )}
                <div className="se-desk-meta">
                  <strong>{row.title}</strong>
                  <span>{row.subtitle || row.sourceLabel || "부제 없음"}</span>
                  <div className="se-desk-tags">
                    <span
                      className={
                        row.status === "BROADCAST"
                          ? "is-broadcast"
                          : row.status === "DRAFT"
                            ? "is-draft"
                            : undefined
                      }
                    >
                      {STATUS_LABELS[row.status]}
                    </span>
                    <span>
                      {row.audience === "ALL" ? "전체" : (row.targetCountryName ?? "국가 미지정")}
                    </span>
                    <span>
                      확인 {row.acknowledged}/{row.audienceSize}
                    </span>
                    {row.audioUrl && <span>음원</span>}
                    <span>{row.codeName || "SE-000"}</span>
                  </div>
                </div>
                <div className="se-desk-actions">
                  {row.status === "DRAFT" && (
                    <>
                      <Link className="button secondary" href={`/admin/superevents?edit=${row.id}`}>
                        편집
                      </Link>
                      <form action={broadcastSuperEventAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="button danger">송출</button>
                      </form>
                      <form action={deleteSuperEventAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="button secondary">삭제</button>
                      </form>
                    </>
                  )}
                  {row.status === "BROADCAST" && (
                    <>
                      <form action={rebroadcastSuperEventAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="button secondary">재송출</button>
                      </form>
                      <form action={archiveSuperEventAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="button danger">송출 종료</button>
                      </form>
                    </>
                  )}
                  {row.status === "ARCHIVED" && (
                    <form action={rebroadcastSuperEventAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <button className="button secondary">다시 송출</button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
