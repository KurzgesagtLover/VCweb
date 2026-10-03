import {
  addEconomicBlocMemberAction,
  addDiplomaticBlocMemberAction,
  createEconomicBlocAction,
  createDiplomaticBlocAction,
  removeEconomicBlocMemberAction,
  removeDiplomaticBlocMemberAction,
  reviewAiDiplomaticResponseAction,
  setDiplomaticStatusAction,
} from "@/src/actions/diplomacy";
import { requireRole } from "@/src/auth/session";
import { getAiDiplomacyReview, getDiplomacyAdministration } from "@/src/db/queries/diplomacy";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  DIPLOMATIC_STATUS_LABELS,
  type DiplomaticRelationStatus,
} from "@/src/domain/diplomacy/status";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "외교 관리" };

const STATUS_OPTIONS: DiplomaticRelationStatus[] = [
  "NORMAL",
  "WAR",
  "CIVIL_WAR",
  "TRUCE",
  "MUTUAL_DEFENSE",
  "INDEPENDENCE_GUARANTEE",
  "NO_RELATIONS",
  "STALEMATE",
  "GUERRILLA",
];

export default async function AdminDiplomacyPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const [queue, administration] = await Promise.all([
    getAiDiplomacyReview(context.campaign.id),
    getDiplomacyAdministration(context.campaign.id),
  ]);
  const countryById = new Map(administration.countries.map((country) => [country.id, country]));
  const blocEligibleCountries = administration.countries.filter(
    (country) => country.entityType !== "GUERRILLA_GROUP",
  );
  const assignedCountryIds = new Set(
    administration.blocs.flatMap(({ members }) => members.map(({ member }) => member.countryId)),
  );
  const economicAssignedCountryIds = new Set(
    administration.economicBlocs.flatMap(({ members }) =>
      members.map(({ member }) => member.countryId),
    ),
  );
  const visibleRelations = administration.relations.filter(
    (relation) =>
      relation.status === "INDEPENDENCE_GUARANTEE" ||
      relation.fromCountryId.localeCompare(relation.toCountryId) < 0,
  );

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="DIPLOMACY CONTROL"
        title="외교 관리"
        description="국가 간 외교 상태와 세력권·경제권을 관리합니다."
        aside={<span className="status-pill">AI 검토 {queue.length}건</span>}
      />

      <div className="admin-diplomacy-grid">
        <section className="panel form-stack">
          <div className="panel-head">
            <h2>외교 상태 지정</h2>
          </div>
          <form action={setDiplomaticStatusAction} className="form-stack">
            <div className="form-grid">
              <label>
                국가 A
                <select name="fromCountryId" required>
                  {administration.countries.map((country) => (
                    <option value={country.id} key={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                국가 B
                <select name="toCountryId" required>
                  {administration.countries.map((country) => (
                    <option value={country.id} key={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              상태
              <select name="status" defaultValue="NORMAL">
                {STATUS_OPTIONS.map((status) => (
                  <option value={status} key={status}>
                    {DIPLOMATIC_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              사유
              <input name="reason" required minLength={3} maxLength={300} />
            </label>
            <button type="submit">상태 적용</button>
          </form>
          <div className="diplomatic-status-list">
            {visibleRelations.length ? (
              visibleRelations.map((relation) => (
                <div key={relation.id}>
                  <span>{countryById.get(relation.fromCountryId)?.name ?? "미상"}</span>
                  <strong>{DIPLOMATIC_STATUS_LABELS[relation.status]}</strong>
                  <span>{countryById.get(relation.toCountryId)?.name ?? "미상"}</span>
                </div>
              ))
            ) : (
              <p className="muted">지정된 특수 외교 상태가 없습니다.</p>
            )}
          </div>
        </section>

        <section className="panel form-stack">
          <div className="panel-head">
            <h2>세력권 창설</h2>
          </div>
          <form action={createDiplomaticBlocAction} className="form-stack">
            <div className="form-grid">
              <label>
                명칭
                <input name="name" required minLength={2} maxLength={80} />
              </label>
              <label>
                약칭
                <input name="acronym" required minLength={2} maxLength={12} />
              </label>
            </div>
            <label>
              주도국
              <select name="leaderCountryId" required>
                {blocEligibleCountries
                  .filter((country) => !assignedCountryIds.has(country.id))
                  .map((country) => (
                    <option value={country.id} key={country.id}>
                      {country.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              색상
              <input name="color" type="color" defaultValue="#5D7388" />
            </label>
            <label>
              설명
              <textarea name="description" maxLength={500} rows={3} />
            </label>
            <fieldset className="diplomatic-member-picker">
              <legend>초기 회원국</legend>
              {blocEligibleCountries
                .filter((country) => !assignedCountryIds.has(country.id))
                .map((country) => (
                  <label key={country.id}>
                    <input type="checkbox" name="memberCountryIds" value={country.id} />
                    {country.name}
                  </label>
                ))}
            </fieldset>
            <button type="submit">세력 창설</button>
          </form>
        </section>

        <section className="panel form-stack">
          <div className="panel-head">
            <h2>경제권 창설</h2>
          </div>
          <form action={createEconomicBlocAction} className="form-stack">
            <div className="form-grid">
              <label>
                명칭
                <input name="name" required minLength={2} maxLength={80} />
              </label>
              <label>
                약칭
                <input name="acronym" required minLength={2} maxLength={12} />
              </label>
            </div>
            <label>
              주도국
              <select name="leaderCountryId" required>
                {blocEligibleCountries
                  .filter((country) => !economicAssignedCountryIds.has(country.id))
                  .map((country) => (
                    <option value={country.id} key={country.id}>
                      {country.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              색상
              <input name="color" type="color" defaultValue="#8C7A52" />
            </label>
            <label>
              설명
              <textarea name="description" maxLength={500} rows={3} />
            </label>
            <fieldset className="diplomatic-member-picker">
              <legend>초기 회원국</legend>
              {blocEligibleCountries
                .filter((country) => !economicAssignedCountryIds.has(country.id))
                .map((country) => (
                  <label key={country.id}>
                    <input type="checkbox" name="memberCountryIds" value={country.id} />
                    {country.name}
                  </label>
                ))}
            </fieldset>
            <button type="submit">경제권 창설</button>
          </form>
        </section>
      </div>

      <section className="section-stack">
        <div className="panel-head">
          <h2>활성 세력권</h2>
          <span className="status-pill">{administration.blocs.length}개</span>
        </div>
        <div className="diplomatic-bloc-grid">
          {administration.blocs.map(({ bloc, members }) => {
            const available = blocEligibleCountries.filter(
              (country) => !assignedCountryIds.has(country.id),
            );
            return (
              <article className="panel diplomatic-bloc-card" key={bloc.id}>
                <header style={{ borderColor: bloc.color }}>
                  <div>
                    <span>{bloc.acronym}</span>
                    <h3>{bloc.name}</h3>
                  </div>
                  <i style={{ background: bloc.color }} />
                </header>
                {bloc.description && <p>{bloc.description}</p>}
                <div className="diplomatic-bloc-members">
                  {members.map(({ member, country }) => (
                    <div key={member.id}>
                      <span>{country.name}</span>
                      <em>{member.role === "LEADER" ? "주도국" : "회원국"}</em>
                      {member.role !== "LEADER" && (
                        <form action={removeDiplomaticBlocMemberAction}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <button type="submit" className="button danger">
                            제외
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
                {available.length > 0 && (
                  <form action={addDiplomaticBlocMemberAction} className="inline-actions">
                    <input type="hidden" name="blocId" value={bloc.id} />
                    <select name="countryId" required>
                      {available.map((country) => (
                        <option value={country.id} key={country.id}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit">회원국 추가</button>
                  </form>
                )}
              </article>
            );
          })}
          {administration.blocs.length === 0 && (
            <div className="empty-state">창설된 세력권이 없습니다.</div>
          )}
        </div>
      </section>

      <section className="section-stack">
        <div className="panel-head">
          <h2>활성 경제권</h2>
          <span className="status-pill">{administration.economicBlocs.length}개</span>
        </div>
        <div className="diplomatic-bloc-grid">
          {administration.economicBlocs.map(({ bloc, members }) => {
            const available = blocEligibleCountries.filter(
              (country) => !economicAssignedCountryIds.has(country.id),
            );
            return (
              <article className="panel diplomatic-bloc-card" key={bloc.id}>
                <header style={{ borderColor: bloc.color }}>
                  <div>
                    <span>{bloc.acronym}</span>
                    <h3>{bloc.name}</h3>
                  </div>
                  <i style={{ background: bloc.color }} />
                </header>
                {bloc.description && <p>{bloc.description}</p>}
                <div className="diplomatic-bloc-members">
                  {members.map(({ member, country }) => (
                    <div key={member.id}>
                      <span>{country.name}</span>
                      <em>{member.role === "LEADER" ? "주도국" : "회원국"}</em>
                      {member.role !== "LEADER" && (
                        <form action={removeEconomicBlocMemberAction}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <button type="submit" className="button danger">
                            제외
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
                {available.length > 0 && (
                  <form action={addEconomicBlocMemberAction} className="inline-actions">
                    <input type="hidden" name="blocId" value={bloc.id} />
                    <select name="countryId" required>
                      {available.map((country) => (
                        <option value={country.id} key={country.id}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit">회원국 추가</button>
                  </form>
                )}
              </article>
            );
          })}
          {administration.economicBlocs.length === 0 && (
            <div className="empty-state">창설된 경제권이 없습니다.</div>
          )}
        </div>
      </section>

      <section className="section-stack">
        <div className="panel-head">
          <h2>AI 국가 외교 답변</h2>
          <span className="status-pill">{queue.length}건</span>
        </div>
        {queue.length === 0 ? (
          <div className="empty-state">검토할 AI 외교 답변이 없습니다.</div>
        ) : (
          queue.map(({ message, proposal, target }) => (
            <article className="panel" key={message.id}>
              <div className="panel-head">
                <div>
                  <span className="eyebrow">
                    {target.name} · {proposal.type}
                  </span>
                  <h2>{proposal.title}</h2>
                </div>
                <span className="status-pill">DRAFT</span>
              </div>
              <div className="diff">
                <span className="diff-before">원 제안: {proposal.body}</span>
                <span>→</span>
                <span className="diff-after">AI 응답 초안</span>
              </div>
              <form action={reviewAiDiplomaticResponseAction} className="form-stack">
                <input type="hidden" name="messageId" value={message.id} />
                <label>
                  공식 답변문
                  <textarea
                    name="body"
                    defaultValue={message.body}
                    required
                    minLength={5}
                    maxLength={4000}
                  />
                </label>
                <div className="inline-actions">
                  <button name="decision" value="APPROVED">
                    수정값으로 발송 승인
                  </button>
                  <button name="decision" value="REJECTED" className="button danger">
                    초안 반려
                  </button>
                </div>
              </form>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
