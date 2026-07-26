"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { sendDiplomaticProposalAction } from "@/src/actions/diplomacy";

export type DiplomacyDetail = {
  country: {
    id: string;
    name: string;
    code: string;
    color: string;
    isAi: boolean;
    economicSystem: string | null;
    flag: string;
    capital: string | null;
    largestCity: string | null;
    motto: string | null;
    nationalAnimal: string | null;
    nationalBird: string | null;
    nationalTree: string | null;
    nationalFlower: string | null;
    stateReligion: string | null;
    officialLanguages: string[];
    majorIndustries: string[];
    governmentForm: string | null;
    headOfState: string | null;
    headOfGovernment: string | null;
    rulingParty: string | null;
    oppositionParty: string | null;
    leaderTitle: string | null;
    leaderName: string | null;
    leaderPortrait: string | null;
    stability: number | null;
    approval: number | null;
    legitimacy: number | null;
    unrest: number | null;
    corruption: number | null;
    democracy: number | null;
    stateCapacity: number | null;
    policySupport: number | null;
    asOfDate: string | null;
    nominalGdp: string | null;
    gdpScale: string | null;
    currencyCode: string | null;
    creditRating: string | null;
    creditScore: number | null;
    realGdpGrowth: string | null;
    inflationRate: string | null;
    unemploymentRate: string | null;
    debtToGdp: string | null;
  };
  relation: { score: number; tags: string[]; lastInteraction: string | null };
  orientation: {
    publicPrinciples: string | null;
    interests: string[];
    goals: string[];
    riskTolerance: number | null;
  };
  parties: Array<{
    id: string;
    name: string;
    color: string;
    support: number;
    seats: number;
    isGovernment: boolean;
    economicAxis: number;
    socialAxis: number;
  }>;
  foreignRelations: Array<{
    id: string;
    name: string;
    code: string;
    color: string;
    score: number;
    tags: string[];
  }>;
  treaties: Array<{ id: string; title: string; status: string }>;
  pending: { outgoing: number; incoming: number };
};

type ProposalType = "STATEMENT" | "NEGOTIATION" | "TREATY" | "TRADE" | "AID" | "WARNING" | "OTHER";

type DiplomaticAction = {
  id: string;
  label: string;
  type: ProposalType;
  icon: string;
  minRelation?: number;
  maxRelation?: number;
  review?: boolean;
  danger?: boolean;
  brief: string;
};

const ACTIONS: DiplomaticAction[] = [
  {
    id: "statement",
    label: "공식 성명 발표",
    type: "STATEMENT",
    icon: "◈",
    brief: "자국 입장을 공개적으로 통보합니다.",
  },
  {
    id: "improve",
    label: "관계 개선 제안",
    type: "NEGOTIATION",
    icon: "◇",
    brief: "양국 관계 개선을 위한 실무 협의를 요청합니다.",
  },
  {
    id: "summit",
    label: "정상 회담 요청",
    type: "NEGOTIATION",
    icon: "◎",
    minRelation: -60,
    brief: "정상 간 직접 회담을 요청합니다.",
  },
  {
    id: "attache",
    label: "주재 무관 파견",
    type: "OTHER",
    icon: "⌗",
    minRelation: -25,
    brief: "상대국에 상주 무관을 파견합니다.",
  },
  {
    id: "trade",
    label: "무역 협정 교섭",
    type: "TRADE",
    icon: "↔",
    minRelation: -25,
    brief: "관세·교역량 조정을 위한 협정을 교섭합니다.",
  },
  {
    id: "intel",
    label: "정보 공유 요청",
    type: "OTHER",
    icon: "◉",
    minRelation: 25,
    brief: "정보기관 간 첩보 공유 통로를 요청합니다.",
  },
  {
    id: "aid",
    label: "경제 원조 제안",
    type: "AID",
    icon: "＋",
    minRelation: 0,
    review: true,
    brief: "재정·물자 원조를 제안합니다. 관리자 승인이 필요합니다.",
  },
  {
    id: "nonaggression",
    label: "불가침 조약",
    type: "TREATY",
    icon: "▤",
    minRelation: 25,
    review: true,
    brief: "상호 무력 사용 포기를 조약으로 명문화합니다.",
  },
  {
    id: "guarantee",
    label: "독립 보장",
    type: "TREATY",
    icon: "♜",
    minRelation: 40,
    review: true,
    brief: "상대국 주권 침해 시 개입을 공개 보장합니다.",
  },
  {
    id: "defense",
    label: "상호 방위 조약",
    type: "TREATY",
    icon: "⛨",
    minRelation: 50,
    review: true,
    brief: "제3국의 침공 시 공동 대응을 약속합니다.",
  },
  {
    id: "transit",
    label: "군사 통행권 요청",
    type: "OTHER",
    icon: "⇥",
    minRelation: 40,
    brief: "자국 병력의 영토 통과 허가를 요청합니다.",
  },
  {
    id: "warning",
    label: "경고 서한",
    type: "WARNING",
    icon: "!",
    danger: true,
    brief: "특정 행위 중단을 강하게 요구합니다.",
  },
  {
    id: "sanction",
    label: "제재 선언",
    type: "WARNING",
    icon: "⊘",
    maxRelation: 40,
    danger: true,
    brief: "교역·금융 제재를 통보합니다. 관계가 크게 악화됩니다.",
  },
  {
    id: "ultimatum",
    label: "최후통첩",
    type: "WARNING",
    icon: "☒",
    maxRelation: 0,
    danger: true,
    brief: "기한을 정해 요구를 수용하도록 압박합니다.",
  },
];

function relationLabel(score: number) {
  if (score >= 60) return "동맹적";
  if (score >= 25) return "우호";
  if (score > -25) return "중립";
  if (score > -60) return "긴장";
  return "적대";
}

function relationTone(score: number) {
  if (score >= 25) return "warm";
  if (score > -25) return "neutral";
  return "cold";
}

function relationGlyph(score: number) {
  if (score >= 60) return "⚔";
  if (score >= 25) return "🤝";
  if (score > -25) return "·";
  if (score > -60) return "!";
  return "✕";
}

function percent(value: string | null, digits = 1) {
  if (value === null) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${(parsed * 100).toFixed(digits)}%`;
}

function compactMoney(value: string | null, scale: string | null) {
  if (!value) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  const suffix = scale === "million" ? "백만" : scale === "billion" ? "십억" : "";
  if (parsed >= 1_000_000) return `${(parsed / 1_000_000).toFixed(2)}조 ${suffix}`;
  if (parsed >= 1_000) return `${(parsed / 1_000).toFixed(1)}천 ${suffix}`;
  return `${parsed.toFixed(0)} ${suffix}`;
}

const SPIRIT_GLYPHS = ["✶", "⚙", "☗", "⚑", "☼", "✦"];

export function TnoDiplomacyPanel({
  selected,
  own,
  detail,
  loading,
  turnOpen,
  inboxHref,
  onClose,
}: {
  selected: { id: string; name: string; code: string; color: string; isAi: boolean };
  own: { name: string; code: string; color: string; flag: string; stability: number | null };
  detail: DiplomacyDetail | null;
  loading: boolean;
  turnOpen: boolean;
  inboxHref: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"DIPLOMACY" | "DETAIL">("DIPLOMACY");
  const [action, setAction] = useState<DiplomaticAction | null>(null);

  const score = detail?.relation.score ?? 0;
  const parties = useMemo(() => detail?.parties ?? [], [detail]);
  const pieGradient = useMemo(() => {
    const usable = parties.filter((party) => party.support > 0);
    if (!usable.length) return null;
    const total = usable.reduce((sum, party) => sum + party.support, 0) || 1;
    let cursor = 0;
    const stops = usable.map((party) => {
      const start = (cursor / total) * 100;
      cursor += party.support;
      const end = (cursor / total) * 100;
      return `${party.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `conic-gradient(from -90deg, ${stops.join(", ")})`;
  }, [parties]);

  const rulingParty = parties.find((party) => party.isGovernment) ?? parties[0] ?? null;
  const spirits = (detail?.orientation.interests ?? []).slice(0, 5);

  function availability(item: DiplomaticAction) {
    if (!turnOpen) return { ok: false, reason: "제출 기간이 아닙니다." };
    if (item.minRelation !== undefined && score < item.minRelation) {
      return { ok: false, reason: `관계도 ${item.minRelation} 이상 필요` };
    }
    if (item.maxRelation !== undefined && score > item.maxRelation) {
      return { ok: false, reason: `관계도 ${item.maxRelation} 이하에서만 가능` };
    }
    return { ok: true, reason: item.brief };
  }

  return (
    <aside className="tno-window" aria-label={`${selected.name} 외교창`}>
      <header className="tno-titlebar">
        <h2>외교</h2>
        <div className="tno-title-readout">
          <span className={`tno-opinion ${relationTone(score)}`}>
            {score > 0 ? `+${score}` : score}
          </span>
          <span className="tno-title-flags">
            <i style={{ borderColor: own.color }}>{own.flag}</i>
            <b>→</b>
            <i style={{ borderColor: selected.color }}>{detail?.country.flag ?? "⚑"}</i>
          </span>
          <span className="tno-title-metric" title="상대국 안정도">
            <em>안정</em>
            {detail?.country.stability ?? "—"}%
          </span>
          <span className="tno-title-metric" title="상대국 정권 지지도">
            <em>지지</em>
            {detail?.country.approval ?? "—"}%
          </span>
        </div>
        <button type="button" className="tno-close" onClick={onClose} aria-label="외교창 닫기">
          ✕
        </button>
      </header>

      <nav className="tno-tabs">
        <button
          type="button"
          className={tab === "DIPLOMACY" ? "active" : ""}
          onClick={() => setTab("DIPLOMACY")}
        >
          외교
        </button>
        <button
          type="button"
          className={tab === "DETAIL" ? "active" : ""}
          onClick={() => setTab("DETAIL")}
        >
          자세히
        </button>
      </nav>

      <div className="tno-nation-banner">
        <span className="tno-banner-flag" style={{ borderColor: selected.color }}>
          {detail?.country.flag ?? "⚑"}
        </span>
        <div className="tno-banner-text">
          <strong>{selected.name}</strong>
          <span>{detail?.country.governmentForm ?? "정부 형태 미상"}</span>
          <span>{detail?.country.leaderName ?? detail?.country.headOfState ?? "지도자 미상"}</span>
        </div>
        <span className="tno-banner-emblem" title="국가 상징">
          {detail?.country.nationalAnimal?.slice(0, 2) ?? selected.code}
        </span>
      </div>

      {loading ? (
        <div className="tno-loading">국가 정보 수신 중…</div>
      ) : tab === "DETAIL" ? (
        <div className="tno-detail">
          <section className="tno-plate">
            <h3>공개 외교 원칙</h3>
            <p>{detail?.orientation.publicPrinciples ?? "공개된 외교 원칙이 없습니다."}</p>
          </section>
          <section className="tno-plate">
            <h3>정치 지표</h3>
            <div className="tno-stat-grid">
              <div>
                <span>안정도</span>
                <strong>{detail?.country.stability ?? "—"}</strong>
              </div>
              <div>
                <span>정통성</span>
                <strong>{detail?.country.legitimacy ?? "—"}</strong>
              </div>
              <div>
                <span>정권 지지</span>
                <strong>{detail?.country.approval ?? "—"}</strong>
              </div>
              <div>
                <span>정책 지지</span>
                <strong>{detail?.country.policySupport ?? "—"}</strong>
              </div>
              <div>
                <span>불안</span>
                <strong>{detail?.country.unrest ?? "—"}</strong>
              </div>
              <div>
                <span>부패</span>
                <strong>{detail?.country.corruption ?? "—"}</strong>
              </div>
              <div>
                <span>민주주의</span>
                <strong>{detail?.country.democracy ?? "—"}</strong>
              </div>
              <div>
                <span>행정 역량</span>
                <strong>{detail?.country.stateCapacity ?? "—"}</strong>
              </div>
            </div>
          </section>
          <section className="tno-plate">
            <h3>경제 지표</h3>
            <div className="tno-stat-grid">
              <div>
                <span>명목 GDP</span>
                <strong>
                  {compactMoney(
                    detail?.country.nominalGdp ?? null,
                    detail?.country.gdpScale ?? null,
                  )}
                </strong>
              </div>
              <div>
                <span>성장률</span>
                <strong>{percent(detail?.country.realGdpGrowth ?? null)}</strong>
              </div>
              <div>
                <span>물가</span>
                <strong>{percent(detail?.country.inflationRate ?? null)}</strong>
              </div>
              <div>
                <span>실업</span>
                <strong>{percent(detail?.country.unemploymentRate ?? null)}</strong>
              </div>
              <div>
                <span>부채/GDP</span>
                <strong>{percent(detail?.country.debtToGdp ?? null, 0)}</strong>
              </div>
              <div>
                <span>신용</span>
                <strong>{detail?.country.creditRating ?? "—"}</strong>
              </div>
            </div>
          </section>
          <section className="tno-plate">
            <h3>국가 개요</h3>
            <dl className="tno-descriptions">
              <div>
                <dt>수도</dt>
                <dd>{detail?.country.capital ?? "미상"}</dd>
              </div>
              <div>
                <dt>최대 도시</dt>
                <dd>{detail?.country.largestCity ?? "미상"}</dd>
              </div>
              <div>
                <dt>공용어</dt>
                <dd>{detail?.country.officialLanguages.join(", ") || "미상"}</dd>
              </div>
              <div>
                <dt>국교</dt>
                <dd>{detail?.country.stateReligion ?? "없음"}</dd>
              </div>
              <div>
                <dt>주요 산업</dt>
                <dd>{detail?.country.majorIndustries.join(", ") || "미상"}</dd>
              </div>
              <div>
                <dt>표어</dt>
                <dd>{detail?.country.motto ?? "미상"}</dd>
              </div>
            </dl>
          </section>
          <section className="tno-plate">
            <h3>양국 조약</h3>
            {detail?.treaties.length ? (
              <ul className="tno-treaty-list">
                {detail.treaties.map((treaty) => (
                  <li key={treaty.id}>
                    <span>{treaty.title}</span>
                    <em>{treaty.status}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p>발효 중인 양국 조약이 없습니다.</p>
            )}
          </section>
          <section className="tno-plate">
            <h3>최근 접촉</h3>
            <p>{detail?.relation.lastInteraction ?? "기록된 접촉이 없습니다."}</p>
          </section>
        </div>
      ) : (
        <div className="tno-diplomacy">
          <section className="tno-leader-row">
            <div className="tno-portrait">
              {detail?.country.leaderPortrait ? (
                <Image
                  src={detail.country.leaderPortrait}
                  alt={detail.country.leaderName ?? "국가 지도자"}
                  width={200}
                  height={250}
                  unoptimized
                />
              ) : (
                <span>{(detail?.country.leaderName ?? selected.name).slice(0, 1)}</span>
              )}
            </div>
            <div className="tno-leader-side">
              <div
                className="tno-pie"
                style={pieGradient ? { background: pieGradient } : undefined}
                title="의회 지지 분포"
              >
                {!pieGradient && <span>의석 정보 없음</span>}
              </div>
              <div className="tno-rank-badge">
                <em>신용</em>
                <strong>{detail?.country.creditRating ?? "N/R"}</strong>
              </div>
            </div>
            <div className="tno-leader-info">
              <strong>
                {rulingParty?.name ?? detail?.country.rulingParty ?? "집권 세력 미상"}
              </strong>
              <span>
                {detail?.country.leaderTitle ?? "국가 지도자"} ·{" "}
                {detail?.country.leaderName ?? "미상"}
              </span>
              <span>
                야당 {detail?.country.oppositionParty ?? "미상"} · 기준{" "}
                {detail?.country.asOfDate?.slice(0, 10) ?? "—"}
              </span>
              <div className="tno-focus-box">
                <em>국가 중점</em>
                <p>{detail?.orientation.goals[0] ?? "알려지지 않은 중점"}</p>
              </div>
            </div>
          </section>

          <section className="tno-section">
            <h3 className="tno-section-tab">국가 정신</h3>
            <div className="tno-spirit-row">
              {spirits.length ? (
                spirits.map((spirit, index) => (
                  <span key={spirit} title={spirit}>
                    <i>{SPIRIT_GLYPHS[index % SPIRIT_GLYPHS.length]}</i>
                    {spirit}
                  </span>
                ))
              ) : (
                <span className="empty">
                  <i>?</i>
                  공개된 국가 정신 없음
                </span>
              )}
            </div>
          </section>

          <div className="tno-columns">
            <div className="tno-left-column">
              <section className="tno-section">
                <h3 className="tno-section-tab">경제</h3>
                <div className="tno-econ-row">
                  <span>
                    <em>체제</em>
                    {detail?.country.economicSystem === "PLANNED" ? "계획 경제" : "자유 시장"}
                  </span>
                  <span>
                    <em>통화</em>
                    {detail?.country.currencyCode ?? "—"}
                  </span>
                  <span>
                    <em>성장</em>
                    {percent(detail?.country.realGdpGrowth ?? null)}
                  </span>
                  <span>
                    <em>실업</em>
                    {percent(detail?.country.unemploymentRate ?? null)}
                  </span>
                </div>
              </section>

              <section className="tno-section tno-relations">
                <h3 className="tno-section-tab">대외 관계</h3>
                <div className="tno-relation-list">
                  {detail?.foreignRelations.length ? (
                    detail.foreignRelations.map((row) => (
                      <div className={`tno-relation-row ${relationTone(row.score)}`} key={row.id}>
                        <i>{relationGlyph(row.score)}</i>
                        <span className="tno-relation-chip" style={{ background: row.color }}>
                          {row.code}
                        </span>
                        <span className="tno-relation-name">{row.name}</span>
                        <b>{row.score > 0 ? `+${row.score}` : row.score}</b>
                      </div>
                    ))
                  ) : (
                    <p className="tno-empty-line">공개된 대외 관계 정보가 없습니다.</p>
                  )}
                </div>
              </section>

              <div className="tno-relation-summary">
                <span>
                  <em>양국 관계</em>
                  {relationLabel(score)}
                </span>
                <div className="tno-tag-row">
                  {detail?.relation.tags.length ? (
                    detail.relation.tags.map((tag) => <span key={tag}>{tag}</span>)
                  ) : (
                    <span>태그 없음</span>
                  )}
                </div>
              </div>

              <a className="tno-footer-button" href={inboxHref}>
                제안함 열기
                {detail && detail.pending.incoming + detail.pending.outgoing > 0 && (
                  <b>{detail.pending.incoming + detail.pending.outgoing}</b>
                )}
              </a>
            </div>

            <div className="tno-action-list">
              {ACTIONS.map((item) => {
                const state = availability(item);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`tno-action ${item.danger ? "danger" : ""}`}
                    disabled={!state.ok}
                    title={state.reason}
                    onClick={() => setAction(item)}
                  >
                    <i className="tno-action-icon">{item.icon}</i>
                    <span>{item.label}</span>
                    {!state.ok ? (
                      <em className="tno-action-block">✕</em>
                    ) : item.review ? (
                      <em className="tno-action-review">⚖</em>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {action && (
        <div className="tno-compose-layer" role="dialog" aria-label={`${action.label} 작성`}>
          <form action={sendDiplomaticProposalAction} className="tno-compose">
            <header>
              <span>
                <i>{action.icon}</i>
                {action.label}
              </span>
              <button type="button" onClick={() => setAction(null)} aria-label="작성 취소">
                ✕
              </button>
            </header>
            <p className="tno-compose-brief">{action.brief}</p>
            <input type="hidden" name="toCountryId" value={selected.id} />
            <input type="hidden" name="type" value={action.type} />
            <label>
              문서 제목
              <input
                name="title"
                required
                minLength={4}
                maxLength={160}
                defaultValue={`${selected.name} 대상 ${action.label}`}
              />
            </label>
            <label>
              공식 문서 본문
              <textarea name="body" required minLength={20} maxLength={6000} rows={7} />
            </label>
            <label>
              공개 범위
              <select name="visibility" defaultValue="PRIVATE">
                <option value="PRIVATE">비공개 (양국 채널)</option>
                <option value="PUBLIC">공개 (국제 사회 열람)</option>
              </select>
            </label>
            <footer>
              {action.review && <span className="tno-compose-note">⚖ 관리자 검토 후 발효</span>}
              <button type="submit" disabled={!turnOpen}>
                발송
              </button>
            </footer>
          </form>
        </div>
      )}
    </aside>
  );
}
