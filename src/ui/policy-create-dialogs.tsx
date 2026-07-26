"use client";

import { useRef, useState } from "react";
import { createPolicyGoalAction } from "@/src/actions/submission";
import { POLICY_METRICS } from "@/src/domain/policy/metrics";
import { SubmissionEditor } from "./submission-editor";

type GoalOption = { id: string; name: string };

export function PolicyCreateDialogs({
  economicSystem,
  goals,
}: {
  economicSystem: string;
  goals: GoalOption[];
}) {
  const policyDialog = useRef<HTMLDialogElement>(null);
  const seriesDialog = useRef<HTMLDialogElement>(null);
  const [goalRows, setGoalRows] = useState([0]);
  const goalTypeLabel = economicSystem === "PLANNED" ? "국가계획" : "정책";
  const maxGoalRows = Math.max(1, 5 - goals.length);
  const policyLimitReached = goals.length >= 5;

  return (
    <>
      <button
        className="button secondary policy-create-button"
        type="button"
        disabled={policyLimitReached}
        {...({
          command: "show-modal",
          commandfor: "policy-create-dialog",
        } as Record<string, string>)}
        onClick={() => policyDialog.current?.showModal()}
      >
        + 정책 작성
      </button>
      <button
        className="policy-create-button"
        type="button"
        {...({
          command: "show-modal",
          commandfor: "series-create-dialog",
        } as Record<string, string>)}
        onClick={() => seriesDialog.current?.showModal()}
      >
        + 연재 작성
      </button>

      <dialog
        id="policy-create-dialog"
        className="policy-dialog"
        ref={policyDialog}
        aria-labelledby="policy-dialog-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) policyDialog.current?.close();
        }}
      >
        <div className="policy-dialog-shell">
          <header className="policy-dialog-head">
            <div>
              <span className="eyebrow">
                {economicSystem === "PLANNED" ? "PLANNED ECONOMY" : "FREE MARKET"}
              </span>
              <h2 id="policy-dialog-title">{goalTypeLabel} 작성</h2>
              <p>하나의 정책에 포함할 목표 지표와 수치를 함께 설정합니다.</p>
            </div>
            <button
              className="policy-dialog-close"
              type="button"
              {...({
                command: "close",
                commandfor: "policy-create-dialog",
              } as Record<string, string>)}
              aria-label="정책 작성 창 닫기"
              onClick={() => policyDialog.current?.close()}
            >
              ×
            </button>
          </header>
          <form
            action={async (formData) => {
              await createPolicyGoalAction(formData);
              policyDialog.current?.close();
            }}
            className="form-grid policy-dialog-form"
          >
            <label className="wide">
              정책명
              <input
                name="name"
                maxLength={120}
                placeholder="비워 두면 목표별로 자동 생성됩니다."
              />
            </label>
            <div className="wide policy-target-list">
              <div className="policy-target-list-head">
                <div>
                  <strong>정책 목표</strong>
                  <small>한 정책에 최대 {maxGoalRows}개의 목표를 추가할 수 있습니다.</small>
                </div>
                <button
                  className="button secondary policy-create-button"
                  type="button"
                  disabled={goalRows.length >= maxGoalRows}
                  onClick={() => setGoalRows((rows) => [...rows, Math.max(...rows, -1) + 1])}
                >
                  + 목표 추가
                </button>
              </div>
              {goalRows.map((row, index) => (
                <div className="policy-target-row" key={row}>
                  <label>
                    목표 {index + 1} 지표
                    <select name="metrics">
                      {Object.entries(POLICY_METRICS).map(([metric, definition]) => (
                        <option value={metric} key={metric}>
                          {definition.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    목표 수치
                    <input name="targetValues" type="number" step="any" required />
                  </label>
                  {goalRows.length > 1 && (
                    <button
                      className="button secondary policy-target-remove"
                      type="button"
                      aria-label={`목표 ${index + 1} 제거`}
                      onClick={() =>
                        setGoalRows((rows) => rows.filter((candidate) => candidate !== row))
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <label>
              기한
              <span className="input-with-suffix">
                <input name="durationYears" type="number" min={1} max={20} defaultValue={4} />
                <span>년</span>
              </span>
            </label>
            <div className="wide policy-dialog-actions">
              <button
                className="button secondary"
                type="button"
                {...({
                  command: "close",
                  commandfor: "policy-create-dialog",
                } as Record<string, string>)}
                onClick={() => policyDialog.current?.close()}
              >
                취소
              </button>
              <button type="submit">{goalTypeLabel} 설정</button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog
        id="series-create-dialog"
        className="policy-dialog policy-dialog-wide"
        ref={seriesDialog}
        aria-labelledby="series-dialog-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) seriesDialog.current?.close();
        }}
      >
        <div className="policy-dialog-shell">
          <header className="policy-dialog-head">
            <div>
              <span className="eyebrow">NEW SERIES</span>
              <h2 id="series-dialog-title">새 연재 작성</h2>
              <p>선택한 정책 목표를 달성하기 위한 세부 실행사항을 작성합니다.</p>
            </div>
            <button
              className="policy-dialog-close"
              type="button"
              {...({
                command: "close",
                commandfor: "series-create-dialog",
              } as Record<string, string>)}
              aria-label="연재 작성 창 닫기"
              onClick={() => seriesDialog.current?.close()}
            >
              ×
            </button>
          </header>
          <SubmissionEditor goals={goals} onSaved={() => seriesDialog.current?.close()} />
        </div>
      </dialog>
    </>
  );
}
