import { and, desc, eq, ilike } from "drizzle-orm";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, users } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "감사 로그" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const q = (await searchParams).q?.trim().slice(0, 60) ?? "";
  const rows = await db
    .select({ log: auditLogs, actor: users })
    .from(auditLogs)
    .innerJoin(users, eq(auditLogs.actorId, users.id))
    .where(
      and(
        eq(auditLogs.campaignId, context.campaign.id),
        q ? ilike(auditLogs.action, `%${q}%`) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / AUDIT"
        title="감사 로그"
        description="관리자 변경과 제재 기록을 시간순으로 확인합니다."
      />
      <section className="panel">
        <form className="inline-actions" method="get">
          <label>
            작업 검색
            <input name="q" defaultValue={q} placeholder="예: MAP, USER, JUDGMENT" />
          </label>
          <button>검색</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>기록</h2>
          <span className="status-pill">최근 200건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>작업자</th>
                <th>작업</th>
                <th>대상</th>
                <th>사유</th>
                <th>변경</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ log, actor }) => (
                <tr key={log.id}>
                  <td>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(log.createdAt)}
                  </td>
                  <td>{actor.name}</td>
                  <td>{log.action}</td>
                  <td>{log.targetType}</td>
                  <td>{log.reason ?? "—"}</td>
                  <td>
                    <details>
                      <summary>보기</summary>
                      <pre className="audit-json">
                        {JSON.stringify(
                          { before: log.beforeSummary, after: log.afterSummary },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
