"use client";

import { useMemo, useState } from "react";
import { saveSubmissionAction } from "@/src/actions/submission";
import {
  CATEGORY_TARGET_METRICS,
  POLICY_METRICS,
  SERIAL_CATEGORIES,
  SERIAL_CATEGORY_LABELS,
  type PolicyMetric,
  type SerialCategory,
} from "@/src/domain/policy/metrics";

type GoalOption = { id: string; name: string };

type InitialSubmission = {
  id: string;
  policyGoalId: string | null;
  title: string;
  category: string;
  body: string;
  goal: string;
  targetMetrics: string[];
  expectedDurationTurns: number;
  budget: string | null;
};

export function SubmissionEditor({
  goals,
  initial,
  onSaved,
}: {
  goals: GoalOption[];
  initial?: InitialSubmission;
  onSaved?: () => void;
}) {
  const initialCategory = SERIAL_CATEGORIES.includes(initial?.category as SerialCategory)
    ? (initial?.category as SerialCategory)
    : "ECONOMY";
  const [category, setCategory] = useState<SerialCategory>(initialCategory);
  const [body, setBody] = useState(initial?.body ?? "");
  const [targets, setTargets] = useState<string[]>(initial?.targetMetrics ?? []);
  const visibleMetrics = useMemo(() => CATEGORY_TARGET_METRICS[category], [category]);

  function toggleMetric(metric: PolicyMetric) {
    setTargets((current) =>
      current.includes(metric)
        ? current.filter((candidate) => candidate !== metric)
        : current.length < 6
          ? [...current, metric]
          : current,
    );
  }

  return (
    <form
      action={async (formData) => {
        await saveSubmissionAction(formData);
        onSaved?.();
      }}
      className="details-body form-stack"
    >
      {initial && <input type="hidden" name="submissionId" value={initial.id} />}
      <div className="form-grid">
        <label className="wide">
          제목
          <input
            name="title"
            required
            minLength={4}
            maxLength={160}
            defaultValue={initial?.title}
          />
        </label>
        <label>
          분야
          <select
            name="category"
            value={category}
            onChange={(event) => {
              const next = event.target.value as SerialCategory;
              setCategory(next);
              const allowed = new Set(CATEGORY_TARGET_METRICS[next]);
              setTargets((current) => current.filter((metric) => allowed.has(metric as never)));
            }}
          >
            {SERIAL_CATEGORIES.map((value) => (
              <option value={value} key={value}>
                {SERIAL_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          연재 지속 기간
          <span className="input-with-suffix">
            <input
              name="expectedDurationTurns"
              type="number"
              min={1}
              max={12}
              required
              defaultValue={initial?.expectedDurationTurns ?? 1}
            />
            <span>턴</span>
          </span>
        </label>
        <label className="wide">
          실행 목표
          <textarea
            name="goal"
            required
            minLength={10}
            maxLength={1000}
            defaultValue={initial?.goal}
            placeholder="이 연재로 실행할 사항과 달성 기준을 적으세요."
          />
        </label>
        <fieldset className="wide target-metric-fieldset">
          <legend>
            AI 판정 목표 지표 <span>{targets.length}/6</span>
          </legend>
          <div className="target-metric-grid">
            {visibleMetrics.map((metric) => (
              <label className={targets.includes(metric) ? "selected" : ""} key={metric}>
                <input
                  type="checkbox"
                  name="targetMetrics"
                  value={metric}
                  checked={targets.includes(metric)}
                  onChange={() => toggleMetric(metric)}
                />
                <span>{POLICY_METRICS[metric].label}</span>
              </label>
            ))}
          </div>
          {targets.length < 2 && <small>서로 연결된 지표를 2개 이상 선택하세요.</small>}
        </fieldset>
        <label>
          연결 정책
          <select name="policyGoalId" defaultValue={initial?.policyGoalId ?? ""}>
            <option value="">정책을 연결하지 않음</option>
            {goals.map((goal) => (
              <option value={goal.id} key={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          연재 예산
          <input name="budget" inputMode="decimal" defaultValue={initial?.budget ?? ""} />
        </label>
        <label className="wide">
          세부 실행사항
          <textarea
            name="body"
            required
            minLength={200}
            maxLength={12000}
            rows={16}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="집행 주체, 예산 사용처, 대상, 일정, 지원 조건, 사후 점검 방식을 구체적으로 적으세요."
          />
          <span className={`character-counter ${body.length < 200 ? "short" : ""}`}>
            {body.length.toLocaleString("ko-KR")} / 12,000자
          </span>
        </label>
      </div>
      <button type="submit" disabled={body.length < 200 || targets.length < 2}>
        {initial ? "연재 수정 저장" : "연재 초안 저장"}
      </button>
    </form>
  );
}
