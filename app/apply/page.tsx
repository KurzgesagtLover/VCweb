import { and, desc, eq } from "drizzle-orm";
import { logoutAction } from "@/src/actions/auth";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { countryApplications } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { ApplicationForm } from "@/src/ui/application-form";
import { redirect } from "next/navigation";

export const metadata = { title: "국가 배정 신청" };

export default async function ApplyPage() {
  const session = await requireSession();
  if (session.user.role === "ADMIN") redirect("/admin");
  if (session.user.role === "MODERATOR") redirect("/admin/moderation");
  const context = await getViewerContext(session.user.id);
  if (context.assignment) redirect("/diplomacy");
  const application = context.campaign
    ? await db.query.countryApplications.findFirst({
        where: and(
          eq(countryApplications.campaignId, context.campaign.id),
          eq(countryApplications.userId, session.user.id),
        ),
        orderBy: [desc(countryApplications.createdAt)],
      })
    : null;
  return (
    <main className="public-page" id="main-content" tabIndex={-1}>
      <section className="auth-card panel">
        <span className="eyebrow">COUNTRY ASSIGNMENT</span>
        <h1>국가 배정 신청</h1>
        <p className="muted">
          {context.campaign?.name ?? "활성 캠페인 없음"} · {session.user.name}
        </p>
        {application?.status === "PENDING" ? (
          <div className="empty-state">
            <strong>신청 검토 중</strong>
            <p>{application.requestedCountryName}</p>
            <small>관리자가 국가를 배정하면 빠른 국가 설정을 시작할 수 있습니다.</small>
          </div>
        ) : (
          <ApplicationForm />
        )}
        <form action={logoutAction}>
          <button className="button secondary">로그아웃</button>
        </form>
      </section>
    </main>
  );
}
