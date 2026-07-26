import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="public-page" id="main-content" tabIndex={-1}>
      <section className="auth-card panel">
        <span className="eyebrow">ACCESS DENIED</span>
        <h1>접근 권한이 없습니다</h1>
        <p className="muted">현재 역할이나 국가 배정 상태로는 이 정보를 볼 수 없습니다.</p>
        <Link className="button secondary" href="/dashboard">
          대시보드로 돌아가기
        </Link>
      </section>
    </main>
  );
}
