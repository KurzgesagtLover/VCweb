import Link from "next/link";

export default function NotFound() {
  return (
    <main className="public-page" id="main-content" tabIndex={-1}>
      <section className="auth-card panel">
        <span className="eyebrow">404 / LOST RECORD</span>
        <h1>기록을 찾을 수 없습니다</h1>
        <p className="muted">요청한 페이지가 없거나 공개되지 않은 기록입니다.</p>
        <Link className="button secondary" href="/">
          첫 화면으로
        </Link>
      </section>
    </main>
  );
}
