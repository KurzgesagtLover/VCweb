import Decimal from "decimal.js";

export function TrendBars({
  rows,
  format = "percent",
}: {
  rows: Array<{ label: string; value: string }>;
  format?: "percent" | "number";
}) {
  if (rows.length === 0) return <div className="empty-state">표시할 추세 데이터가 없습니다.</div>;
  const values = rows.map((row) => new Decimal(row.value));
  const min = Decimal.min(...values);
  const max = Decimal.max(...values);
  const spread = max.minus(min);
  return (
    <div className="trend" aria-label="최근 턴 추세">
      {rows.map((row) => {
        const value = new Decimal(row.value);
        const width = spread.isZero()
          ? 75
          : value.minus(min).div(spread).mul(70).plus(20).toNumber();
        return (
          <div className="trend-row" key={row.label}>
            <span>{row.label}</span>
            <div className="trend-track">
              <span className="trend-fill" style={{ width: `${Math.max(4, width)}%` }} />
            </div>
            <span className="trend-value">
              {format === "percent" ? `${value.mul(100).toFixed(1)}%` : value.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
