import { cancelWorldActionAction, orderWorldActionAction } from "@/src/actions/world-mechanics";
import { formatMonthlyDrift } from "@/src/domain/politics/drift";
import type { WorldMechanicStage } from "@/src/domain/world/mechanics";
import type { WorldMechanicBoard } from "@/src/services/world-mechanics";
import { TnoPlate, TnoTrend } from "./tno-frame";

function stageEffects(stage: WorldMechanicStage) {
  const percentPoint = (value: string | undefined, label: string) => {
    const number = Number(value ?? 0);
    return number ? [`${label} ${number > 0 ? "+" : ""}${(number * 100).toFixed(2)}%p`] : [];
  };
  return [
    ...formatMonthlyDrift(stage.drift),
    ...percentPoint(stage.potentialGrowth, "잠재성장률"),
    ...percentPoint(stage.naturalUnemployment, "균형 실업률"),
    ...percentPoint(stage.inflationPressure, "물가 압력"),
    ...percentPoint(stage.revenueEfficiency, "세수 효율"),
  ];
}

export function WorldMechanicsView({
  board,
  canAct,
}: {
  board: WorldMechanicBoard;
  canAct: boolean;
}) {
  return (
    <>
      {board.mechanics.map((mechanic) => {
        const { definition, stage } = mechanic;
        const effects = stageEffects(stage);
        const span = definition.max - definition.min || 1;
        return (
          <TnoPlate
            key={definition.key}
            title={`${definition.label} · 국가정신 ‘${definition.spiritLabel}’`}
            wide
          >
            <p className="world-mechanic-description">{definition.description}</p>
            <div
              className="world-mechanic-meter"
              aria-label={`진행도 ${mechanic.progress.toFixed(1)}`}
            >
              <i style={{ width: `${((mechanic.progress - definition.min) / span) * 100}%` }} />
              {definition.stages.map((item) => (
                <b
                  key={item.key}
                  style={{ left: `${((item.from - definition.min) / span) * 100}%` }}
                  title={`${item.label} (${item.from}~)`}
                />
              ))}
            </div>
            <div className="world-mechanic-status">
              <strong>
                {mechanic.progress.toFixed(1)} / {definition.max}
              </strong>
              <span>{stage.label}</span>
              <small>
                다음 턴 자연 증가 +{mechanic.nextTurnNatural.toFixed(2)} · 1년 뒤 예상{" "}
                {mechanic.nextYearProgress.toFixed(1)}
                {mechanic.pendingOrdersThisTurn
                  ? ` · 이번 턴 대응 ${mechanic.pendingOrdersThisTurn}건 −${mechanic.pendingReductionThisTurn.toFixed(1)}`
                  : ""}
              </small>
            </div>
            <p className="world-mechanic-stage">{stage.description}</p>
            <div className="tno-tag-row">
              {effects.length ? (
                effects.map((line) => <span key={line}>모든 국가 · {line}</span>)
              ) : (
                <span>현재 단계는 추가 효과 없음</span>
              )}
            </div>
            {definition.provisional ? (
              <small className="world-mechanic-note">단계 효과와 행동 수치는 임시값입니다.</small>
            ) : null}
            {mechanic.history.length ? (
              <TnoTrend
                rows={mechanic.history.map((row) => ({
                  label: `T${row.sequence}`,
                  value: Math.round(row.after * 10) / 10,
                }))}
              />
            ) : null}
            <ul className="world-mechanic-actions">
              {mechanic.actions.map(({ action, allowed, reason, pending, requiredTechNames }) => (
                <li key={action.key}>
                  <div>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                    <small>
                      정치력 {action.politicalPowerCost} · 특별 지출 $
                      {action.budgetCost.toLocaleString("ko-KR")}M · 진행도 −{action.reduction} ·
                      재사용 {action.cooldownMonths}개월
                      {requiredTechNames.length ? ` · 기술: ${requiredTechNames.join(", ")}` : ""}
                    </small>
                  </div>
                  {pending ? (
                    <form action={cancelWorldActionAction}>
                      <input type="hidden" name="actionId" value={pending.id} />
                      <button type="submit" disabled={!canAct || !pending.cancellable}>
                        다음 공개 때 시행 · 취소
                      </button>
                    </form>
                  ) : (
                    <form action={orderWorldActionAction}>
                      <input type="hidden" name="mechanicKey" value={definition.key} />
                      <input type="hidden" name="actionKey" value={action.key} />
                      <button
                        type="submit"
                        disabled={!canAct || !allowed}
                        title={reason ?? undefined}
                      >
                        시행
                      </button>
                      {!allowed && reason ? <small>{reason}</small> : null}
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </TnoPlate>
        );
      })}
    </>
  );
}
