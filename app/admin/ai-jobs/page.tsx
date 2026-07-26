import { desc, eq } from "drizzle-orm";
import { updateEconomicMultiplierAutomationAction } from "@/src/actions/campaign";
import { saveAiProviderCredentialAction, saveAiTaskConfigAction } from "@/src/actions/ai-settings";
import {
  AI_PROVIDER_CATALOG,
  AI_PROVIDERS,
  AI_TASK_LABELS,
  AI_TASK_TYPES,
  DEFAULT_AI_TASKS,
  isAiProvider,
} from "@/src/ai/catalog";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { aiProviderCredentials, aiTaskConfigs, jobs, judgmentRuns } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "AI 설정 및 작업" };

const jobStatusLabels = {
  QUEUED: "대기",
  RUNNING: "실행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
} as const;

const jobTypeLabels: Record<string, string> = {
  CALCULATE_COUNTRY_ECONOMY: "국가 경제 계산",
  CALCULATE_COUNTRY_RESEARCH: "국가 연구 계산",
  FINALIZE_TURN_REVIEW_DATA: "턴 판정 자료 정리",
  ...AI_TASK_LABELS,
};

export default async function AiJobsPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const [jobRows, runRows, credentialRows, taskConfigRows] = await Promise.all([
    db.query.jobs.findMany({
      where: eq(jobs.campaignId, context.campaign.id),
      orderBy: [desc(jobs.createdAt)],
      limit: 200,
    }),
    db.query.judgmentRuns.findMany({
      where: eq(judgmentRuns.campaignId, context.campaign.id),
      orderBy: [desc(judgmentRuns.createdAt)],
      limit: 100,
    }),
    db.query.aiProviderCredentials.findMany({
      where: eq(aiProviderCredentials.campaignId, context.campaign.id),
    }),
    db.query.aiTaskConfigs.findMany({
      where: eq(aiTaskConfigs.campaignId, context.campaign.id),
    }),
  ]);
  const credentials = new Map(credentialRows.map((row) => [row.provider, row]));
  const taskConfigs = new Map(taskConfigRows.map((row) => [row.taskType, row]));
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / JOBS"
        title="AI 설정 및 작업"
        description="공급자와 모델을 연결하고 작업별 판정 프롬프트를 관리합니다."
      />
      <section className="panel">
        <div className="panel-head">
          <h2>API 키</h2>
        </div>
        <div className="form-grid">
          {AI_PROVIDERS.map((provider) => {
            const credential = credentials.get(provider);
            return (
              <form action={saveAiProviderCredentialAction} className="form-stack" key={provider}>
                <input type="hidden" name="provider" value={provider} />
                <div className="panel-head">
                  <h3>{AI_PROVIDER_CATALOG[provider].label}</h3>
                  <span className="status-pill">
                    {credential?.isActive ? credential.keyHint : "미연결"}
                  </span>
                </div>
                <label>
                  API 키
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    required
                    minLength={8}
                    placeholder={credential ? "새 키로 교체" : "API 키 입력"}
                  />
                </label>
                <button type="submit">키 저장</button>
              </form>
            );
          })}
        </div>
      </section>
      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">AUTOMATION</span>
            <h2>경제 승수 자동 확정</h2>
          </div>
          <span className="status-pill">
            {context.campaign.autoApproveEconomicMultipliers ? "사용 중" : "꺼짐"}
          </span>
        </div>
        <form action={updateEconomicMultiplierAutomationAction} className="toggle-setting-form">
          <label className="toggle-control">
            <input
              type="checkbox"
              name="enabled"
              value="yes"
              defaultChecked={context.campaign.autoApproveEconomicMultipliers}
            />
            <span>검증을 통과한 경제 승수 판정을 AI가 자동 확정</span>
          </label>
          <button type="submit">자동화 설정 저장</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>작업별 모델과 프롬프트</h2>
        </div>
        <div className="section-stack">
          {AI_TASK_TYPES.map((taskType) => {
            const saved = taskConfigs.get(taskType);
            const selected = saved ?? DEFAULT_AI_TASKS[taskType];
            return (
              <article className="details-panel" key={taskType}>
                <div className="details-body">
                  <form action={saveAiTaskConfigAction} className="form-stack">
                    <input type="hidden" name="taskType" value={taskType} />
                    <div className="panel-head">
                      <h3>{AI_TASK_LABELS[taskType]}</h3>
                      <span className="status-pill">{saved ? "적용 중" : "저장 필요"}</span>
                    </div>
                    <label>
                      공급자 · 모델
                      <select name="route" defaultValue={`${selected.provider}:${selected.model}`}>
                        {AI_PROVIDERS.map((provider) => (
                          <optgroup label={AI_PROVIDER_CATALOG[provider].label} key={provider}>
                            {AI_PROVIDER_CATALOG[provider].models.map((model) => (
                              <option value={`${provider}:${model.id}`} key={model.id}>
                                {AI_PROVIDER_CATALOG[provider].label} · {model.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label>
                      시스템 프롬프트
                      <textarea
                        name="systemPrompt"
                        required
                        minLength={30}
                        maxLength={20_000}
                        rows={7}
                        defaultValue={selected.systemPrompt}
                      />
                    </label>
                    <div className="inline-actions">
                      <button type="submit">설정 저장</button>
                    </div>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section className="metric-grid">
        {(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const).map((status) => (
          <MetricCard
            key={status}
            label={jobStatusLabels[status]}
            value={jobRows.filter((job) => job.status === status).length}
            tone={status === "FAILED" ? "warning" : undefined}
          />
        ))}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>작업 큐</h2>
          <span className="status-pill">최근 200건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>생성</th>
                <th>유형</th>
                <th>상태</th>
                <th>시도</th>
                <th>완료</th>
                <th>오류</th>
              </tr>
            </thead>
            <tbody>
              {jobRows.map((job) => (
                <tr key={job.id}>
                  <td>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(job.createdAt)}
                  </td>
                  <td>{jobTypeLabels[job.type] ?? "기타 작업"}</td>
                  <td>{jobStatusLabels[job.status]}</td>
                  <td>
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td>
                    {job.completedAt
                      ? new Intl.DateTimeFormat("ko-KR", { timeStyle: "medium" }).format(
                          job.completedAt,
                        )
                      : "—"}
                  </td>
                  <td title={job.errorMessage ?? undefined}>{job.errorCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>판정 공급자 실행</h2>
          <span className="status-pill">최근 100건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>공급자</th>
                <th>모델</th>
                <th>상태</th>
                <th>지연</th>
                <th>토큰</th>
                <th>오류</th>
              </tr>
            </thead>
            <tbody>
              {runRows.map((run) => (
                <tr key={run.id}>
                  <td>
                    {isAiProvider(run.provider)
                      ? AI_PROVIDER_CATALOG[run.provider].label
                      : "내장 대체 모델"}
                  </td>
                  <td>{run.model}</td>
                  <td>{jobStatusLabels[run.status]}</td>
                  <td>{run.latencyMs ? `${run.latencyMs.toLocaleString()} ms` : "—"}</td>
                  <td>
                    {(run.inputTokens ?? 0).toLocaleString()} /{" "}
                    {(run.outputTokens ?? 0).toLocaleString()}
                  </td>
                  <td title={run.errorMessage ?? undefined}>{run.errorCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
