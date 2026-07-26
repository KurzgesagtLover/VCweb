export function MetricCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  meta?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "danger"
          ? "var(--danger)"
          : undefined;
  return (
    <article className="metric-card">
      <span className="label">{label}</span>
      <strong className="value" style={{ color }}>
        {value ?? "—"}
      </strong>
      <span className="meta">{meta ?? "현재 공개 스냅샷"}</span>
    </article>
  );
}

export function DataList({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="data-list">
      {items
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([label, value]) => (
          <div className="data-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}
