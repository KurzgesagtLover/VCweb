"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="panel auth-card">
      <span className="eyebrow">DATA LINK ERROR</span>
      <h1>국가 기록을 불러오지 못했습니다</h1>
      <p className="muted">잠시 후 다시 시도해 주세요. 문제가 계속되면 운영자에게 알려 주세요.</p>
      <button onClick={reset}>다시 시도</button>
    </section>
  );
}
