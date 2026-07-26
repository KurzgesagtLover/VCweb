export default function Loading() {
  return (
    <div className="section-stack" aria-busy="true" aria-label="국가 기록을 불러오는 중">
      <div className="skeleton" />
      <div className="metric-grid">
        {Array.from({ length: 10 }, (_, i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    </div>
  );
}
