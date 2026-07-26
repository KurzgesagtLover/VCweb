import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { countrySetupSubmissions } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";
import { QuickSetupForm } from "@/src/ui/quick-setup-form";

export const metadata = { title: "빠른 국가 설정" };

export default async function CountrySetupPage() {
  const session = await requireRole("PLAYER");
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const latest = await db.query.countrySetupSubmissions.findFirst({
    where: eq(countrySetupSubmissions.countryId, context.country.id),
    orderBy: [desc(countrySetupSubmissions.createdAt)],
  });
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="INITIAL LEDGER"
        title="빠른 국가 설정"
        description="핵심 10개 입력과 주요 산업을 검증한 뒤 관리자 승인을 요청합니다."
        aside={<span className="status-pill">{context.country.setupStatus}</span>}
      />
      {context.country.setupStatus === "APPROVED" ? (
        <div className="empty-state">
          <strong>초기 설정 승인 완료</strong>
          <p>이제 국가 원장과 시뮬레이션 지표를 확인할 수 있습니다.</p>
        </div>
      ) : latest?.status === "SUBMITTED" ? (
        <div className="empty-state">
          <strong>관리자 검토 중</strong>
          <p>승인 전까지 입력값은 시뮬레이션에 반영되지 않습니다.</p>
        </div>
      ) : (
        <>
          <section className="panel">
            <QuickSetupForm />
          </section>
          {latest?.status === "CHANGES_REQUESTED" && (
            <p className="form-message">수정 요청: {latest.reviewComment}</p>
          )}
        </>
      )}
    </div>
  );
}
