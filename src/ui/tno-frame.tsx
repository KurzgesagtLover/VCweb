import Link from "next/link";
import type { ReactNode } from "react";

export type TnoWindowTab = { label: string; href: string; active: boolean };

export function TnoWindow({
  title,
  readout,
  tabs,
  children,
}: {
  title: string;
  readout?: ReactNode;
  tabs?: TnoWindowTab[];
  children: ReactNode;
}) {
  return (
    <section className="tno-page-window">
      <header className="tno-titlebar">
        <h2>{title}</h2>
        {readout ? <div className="tno-title-readout">{readout}</div> : <div />}
      </header>
      {tabs?.length ? (
        <nav className="tno-tabs tno-window-tabs" aria-label={`${title} 메뉴`}>
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={tab.active ? "active" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="tno-window-body">{children}</div>
    </section>
  );
}

export function TnoReadout({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="tno-title-metric">
      <em>{label}</em>
      {value ?? "—"}
    </span>
  );
}

export function TnoBanner({
  flag,
  name,
  lines,
  emblem,
  color,
}: {
  flag: string;
  name: string;
  lines: Array<string | null | undefined>;
  emblem?: string | null;
  color?: string;
}) {
  return (
    <div className="tno-nation-banner">
      <span className="tno-banner-flag" style={{ borderColor: color ?? "#4a5862" }}>
        {flag}
      </span>
      <div className="tno-banner-text">
        <strong>{name}</strong>
        {lines
          .filter((line): line is string => Boolean(line))
          .map((line) => (
            <span key={line}>{line}</span>
          ))}
      </div>
      {emblem && (
        <span className="tno-banner-emblem" title="국가 상징">
          {emblem}
        </span>
      )}
    </div>
  );
}

export function TnoPlate({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`tno-plate ${wide ? "tno-plate-wide" : ""}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function TnoStats({
  items,
  columns = 4,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: "good" | "bad" }>;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className={`tno-stat-grid tno-stat-grid-${columns}`}>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong className={item.tone ?? ""}>{item.value ?? "—"}</strong>
        </div>
      ))}
    </div>
  );
}

export function TnoGauges({
  items,
}: {
  items: Array<{ label: string; value: number | null; invert?: boolean; suffix?: string }>;
}) {
  return (
    <div className="tno-gauge-list">
      {items.map((item) => {
        const value = item.value ?? 0;
        const effective = item.invert ? 100 - value : value;
        const tone = effective >= 60 ? "good" : effective >= 35 ? "fair" : "bad";
        return (
          <div className="tno-gauge" key={item.label}>
            <span>{item.label}</span>
            <div className="tno-bar">
              <i className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
            </div>
            <b>
              {item.value === null ? "—" : value}
              {item.suffix ?? ""}
            </b>
          </div>
        );
      })}
    </div>
  );
}

export function TnoHeadline({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <div className="tno-headline">
      <em>{label}</em>
      <strong className={tone ?? ""}>{value ?? "—"}</strong>
      {meta && <small>{meta}</small>}
    </div>
  );
}

export function TnoTrend({
  rows,
  suffix = "",
}: {
  rows: Array<{ label: string; value: number }>;
  suffix?: string;
}) {
  if (!rows.length) return <p>표시할 추세가 없습니다.</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="tno-trend-strip">
      {rows.map((row) => (
        <div className="tno-trend-column" key={row.label}>
          <b>
            {row.value}
            {suffix}
          </b>
          <div className="tno-trend-track">
            <i style={{ height: `${Math.max(3, (row.value / max) * 100)}%` }} />
          </div>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export function TnoChips({ items, empty = "정보 없음" }: { items: string[]; empty?: string }) {
  return (
    <div className="tno-tag-row">
      {items.length ? items.map((item) => <span key={item}>{item}</span>) : <span>{empty}</span>}
    </div>
  );
}

export function TnoKeyValues({ items }: { items: Array<[string, ReactNode]> }) {
  const visible = items.filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (!visible.length) return <p>등록된 정보가 없습니다.</p>;
  return (
    <dl className="tno-descriptions">
      {visible.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
