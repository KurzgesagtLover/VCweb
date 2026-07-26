"use client";

import { useActionState, useMemo, useState } from "react";
import Decimal from "decimal.js";
import type { FormState } from "@/src/actions/auth";
import { submitCountrySetupAction } from "@/src/actions/country";

export function QuickSetupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitCountrySetupAction,
    {},
  );
  const [population, setPopulation] = useState("");
  const [area, setArea] = useState("");
  const [gdp, setGdp] = useState("");
  const derived = useMemo(() => {
    try {
      const p = new Decimal(population);
      const a = new Decimal(area);
      const g = new Decimal(gdp);
      if (!p.gt(0) || !a.gt(0) || !g.gt(0)) return null;
      return { density: p.div(a).toFixed(2), perCapita: g.mul(1_000_000).div(p).toFixed(0) };
    } catch {
      return null;
    }
  }, [population, area, gdp]);
  return (
    <form action={action} className="form-grid">
      <label>
        국명
        <input name="countryName" minLength={2} maxLength={80} required />
      </label>
      <label>
        국기 표식
        <input name="flag" maxLength={32} placeholder="예: ⚑ 또는 🇰🇷" required />
      </label>
      <label>
        수도
        <input name="capital" required />
      </label>
      <label>
        정치체제
        <input name="governmentForm" placeholder="예: 연방 공화국" required />
      </label>
      <label>
        국가원수
        <input name="headOfState" required />
      </label>
      <label>
        총인구 (명)
        <input
          name="population"
          inputMode="decimal"
          value={population}
          onChange={(e) => setPopulation(e.target.value)}
          required
        />
      </label>
      <label>
        총면적 (km²)
        <input
          name="totalAreaKm2"
          inputMode="decimal"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          required
        />
      </label>
      <label>
        실질 GDP (백만 기준화폐)
        <input
          name="realGdp"
          inputMode="decimal"
          value={gdp}
          onChange={(e) => setGdp(e.target.value)}
          required
        />
      </label>
      <label>
        공식 화폐 코드
        <input name="currencyCode" pattern="[A-Za-z]{3,5}" placeholder="ARC" required />
      </label>
      <label>
        기준 화폐가치
        <input name="currencyValue" inputMode="decimal" placeholder="1.0000" required />
      </label>
      <label className="wide">
        주요 산업 (쉼표로 구분)
        <input name="majorIndustries" placeholder="정밀기계, 해운, 바이오" required />
      </label>
      {derived && (
        <div className="wide panel">
          <div className="data-list">
            <div className="data-row">
              <dt>파생 인구밀도</dt>
              <dd>{derived.density} 명/km²</dd>
            </div>
            <div className="data-row">
              <dt>파생 1인당 GDP</dt>
              <dd>{Number(derived.perCapita).toLocaleString("ko-KR")} 기준화폐</dd>
            </div>
          </div>
        </div>
      )}
      {state.error && (
        <p className="form-message wide" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-message success wide" role="status">
          {state.success}
        </p>
      )}
      <div className="wide">
        <button disabled={pending}>{pending ? "설정 검증 중…" : "관리자 검토 요청"}</button>
      </div>
    </form>
  );
}
