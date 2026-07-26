"use client";
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="panel auth-card">
      <span className="eyebrow">ADMIN DATA ERROR</span>
      <h1>관리 기록을 불러오지 못했습니다</h1>
      <p className="muted">변경은 적용되지 않았습니다. 데이터를 다시 불러온 뒤 재시도해 주세요.</p>
      <button onClick={reset}>다시 불러오기</button>
    </section>
  );
}
