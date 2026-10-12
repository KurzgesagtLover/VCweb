import { cancelLawChangeAction, changeLawAction } from "@/src/actions/laws";
import {
  CULTURAL_EROSION_LIMIT,
  describeLawStageEffects,
  LAW_CATEGORY_LABELS,
  POLITICAL_POWER_RESUME_THRESHOLD,
  type LawCategory,
} from "@/src/domain/politics/laws";
import type { getLawBoard, LawBoardEntry } from "@/src/services/laws";
import { PoliticalPowerTicker } from "./political-power-ticker";
import { TnoHeadline, TnoPlate } from "./tno-frame";

type LawBoard = Awaited<ReturnType<typeof getLawBoard>>;

const CATEGORY_ORDER: LawCategory[] = ["SOCIETY", "MILITARY", "ECONOMY"];
const STATE_LABELS: Record<string, string> = {
  NORMAL: "정상",
  HOLD: "회복 대기",
  DEFICIT: "적자",
};

function signed(value: string | number, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const fixed = number.toFixed(digits);
  return number > 0 ? `+${fixed}` : fixed;
}

function percent(value: string | number) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "—";
}

function LawCard({ entry }: { entry: LawBoardEntry }) {
  const { definition, stage } = entry;
  const current = definition.stages[stage - 1];
  const effects = describeLawStageEffects(definition, stage);
  const blockedReason = entry.options.find((option) => !option.allowed)?.reason ?? null;
  const allBlocked = entry.options.length > 0 && entry.options.every((option) => !option.allowed);
  return (
    <article className="law-card">
      <header>
        <span>{definition.label}</span>
        <strong>
          {stage}/{definition.stages.length}단계
        </strong>
      </header>
      <ol className="law-ladder" aria-label={`${definition.label} 단계`}>
        {definition.stages.map((item, index) => {
          const stageNumber = index + 1;
          const className =
            stageNumber === stage
              ? "current"
              : stageNumber === entry.pending?.toStage
                ? "pending"
                : undefined;
          return (
            <li key={item.label} className={className} title={item.description || item.label}>
              {item.label}
            </li>
          );
        })}
      </ol>
      {current?.description ? <p className="law-description">{current.description}</p> : null}
      {effects.length ? (
        <div className="tno-tag-row law-effects">
          {effects.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
      {entry.commitment ? (
        <div className="law-adaptation">
          <div>
            <span>사회 적응 {percent(entry.commitment.adaptation)}</span>
            <b>유지비 연 {signed(-Number(entry.commitment.upkeep))}</b>
          </div>
          <div className="law-adaptation-meter" aria-hidden="true">
            <i style={{ width: percent(entry.commitment.adaptation) }} />
          </div>
          {Number(entry.commitment.erosion) > 0 ? (
            <small className="law-erosion">
              정치력 적자로 이전 단계 쪽으로{" "}
              {percent(Number(entry.commitment.erosion) / CULTURAL_EROSION_LIMIT)} 밀림 · 잔고{" "}
              {POLITICAL_POWER_RESUME_THRESHOLD} 이상에서 다시 진행
            </small>
          ) : null}
        </div>
      ) : null}
      {entry.pending ? (
        <form action={cancelLawChangeAction} className="law-pending">
          <input type="hidden" name="changeId" value={entry.pending.id} />
          <span>
            다음 공개 때 시행: {definition.stages[entry.pending.toStage - 1]?.label} · 정치력{" "}
            {Number(entry.pending.cost).toFixed(0)} 지불
          </span>
          <button type="submit">취소·환불</button>
        </form>
      ) : (
        <div className="law-actions">
          {entry.options.map((option) => (
            <form action={changeLawAction} key={option.direction}>
              <input type="hidden" name="lawKey" value={definition.key} />
              <input type="hidden" name="targetStage" value={option.targetStage} />
              <button
                type="submit"
                disabled={!option.allowed}
                title={option.reason ?? undefined}
                className={option.direction === "UP" ? "law-up" : "law-down"}
              >
                <span>
                  {option.direction === "DOWN" ? "◀ " : ""}
                  {definition.stages[option.targetStage - 1]?.label}
                  {option.direction === "UP" ? " ▶" : ""}
                </span>
                {option.cost ? <small>정치력 {Number(option.cost).toFixed(0)}</small> : null}
              </button>
            </form>
          ))}
          {allBlocked && blockedReason ? (
            <small className="law-blocked">{blockedReason}</small>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function PoliticalLawsView({ board }: { board: LawBoard }) {
  const balance = Number(board.power.balance);
  const net = Number(board.netPerYear);
  const preview = board.preview;
  return (
    <>
      <div className="tno-headline-row">
        <TnoHeadline
          label="정치력"
          value={<PoliticalPowerTicker {...board.power} />}
          meta={`하한 -250 · 상한 ${board.maxBalance}`}
          tone={balance < 0 ? "bad" : "good"}
        />
        <TnoHeadline
          label="연 순증 (적용 중)"
          value={signed(net)}
          meta="수입 − 유지비, 실시간으로 반영"
          tone={net < 0 ? "bad" : "good"}
        />
        <TnoHeadline
          label="연 수입 (다음 정산 예상)"
          value={preview ? signed(preview.income) : "—"}
          meta="정통성·안정도·지지·역량·부패"
        />
        <TnoHeadline
          label="연 유지비 (다음 정산 예상)"
          value={preview ? signed(-Number(preview.upkeep)) : "—"}
          meta={preview ? `${preview.upkeepItems.length}개 항목` : undefined}
          tone={preview && Number(preview.upkeep) > Number(preview.income) ? "bad" : undefined}
        />
      </div>

      <div className="tno-two-column">
        <TnoPlate title="정치력 수입">
          {preview ? (
            <dl className="law-breakdown">
              {preview.incomeComponents.map((component) => (
                <div key={component.key}>
                  <dt>{component.label}</dt>
                  <dd>{signed(component.value)}</dd>
                </div>
              ))}
              {preview.budgetIncomeItems.map((item) => (
                <div key={item.key}>
                  <dt>예산 · {item.label}</dt>
                  <dd>{signed(item.income, 0)} 반영</dd>
                </div>
              ))}
              {preview.spiritIncomeItems.map((item) => (
                <div key={`spirit-${item.key}`}>
                  <dt>국가정신 · {item.label}</dt>
                  <dd>{signed(item.income, 0)} 반영</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>정치 스냅샷이 공개된 뒤 계산됩니다.</p>
          )}
        </TnoPlate>
        <TnoPlate title="연간 유지비">
          {preview?.upkeepItems.length ? (
            <dl className="law-breakdown">
              {preview.upkeepItems.map((item) => (
                <div key={item.key}>
                  <dt>
                    {item.label} · {item.detail}
                    <small>{item.mode === "ADAPTIVE" ? " 적응형" : " 고정"}</small>
                  </dt>
                  <dd>{signed(-Number(item.upkeep))}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>유지비가 드는 법·제도가 없습니다.</p>
          )}
          <p className="law-note">
            정치력이 0 아래로 내려가면 적응 중인 사회·문화 변경부터 이전 단계 쪽으로 밀리며 유지비가
            줄어듭니다. 잔고가 {POLITICAL_POWER_RESUME_THRESHOLD} 이상으로 회복되면 다시 진행합니다.
          </p>
        </TnoPlate>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const entries = board.entries.filter((entry) => entry.definition.category === category);
        if (!entries.length) return null;
        return (
          <TnoPlate key={category} title={LAW_CATEGORY_LABELS[category]} wide>
            {category === "MILITARY" && !board.atWar ? (
              <p className="law-note">대규모 동원과 총동원은 전쟁 중에만 시행할 수 있습니다.</p>
            ) : null}
            <div className="law-grid">
              {entries.map((entry) => (
                <LawCard key={entry.definition.key} entry={entry} />
              ))}
            </div>
          </TnoPlate>
        );
      })}

      <TnoPlate title="최근 정치력 정산" wide>
        {board.ledger.length ? (
          <div className="law-ledger">
            {board.ledger.map((row) => (
              <div key={row.id}>
                <b>T{row.sequence}</b>
                <span>수입 {signed(row.grossIncome)}</span>
                <span>유지비 {signed(-Number(row.upkeep))}</span>
                <span className={Number(row.net) < 0 ? "bad" : "good"}>순증 {signed(row.net)}</span>
                <span>잔고 {Number(row.balanceAfter).toFixed(1)}</span>
                <em>{STATE_LABELS[row.state] ?? row.state}</em>
              </div>
            ))}
          </div>
        ) : (
          <p>아직 정산된 턴이 없습니다. 다음 턴 공개 때부터 기록됩니다.</p>
        )}
      </TnoPlate>
    </>
  );
}
