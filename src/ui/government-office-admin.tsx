import { saveGovernmentOfficeAction } from "@/src/actions/government";
import type { getGovernmentStructure } from "@/src/db/queries/government";
import { governmentBranchLabel } from "@/src/domain/display-labels";

type Structure = Awaited<ReturnType<typeof getGovernmentStructure>>;

const branchOptions = [
  ["EXECUTIVE", "행정부"],
  ["JUDICIAL", "사법부"],
  ["LEGISLATIVE", "입법부"],
] as const;

function OfficeFields({
  countryId,
  office,
}: {
  countryId: string;
  office?: Structure["offices"][number]["office"];
}) {
  return (
    <form action={saveGovernmentOfficeAction} className="office-config-form">
      <input type="hidden" name="countryId" value={countryId} />
      <input type="hidden" name="officeId" value={office?.id ?? ""} />
      <label>
        기관
        <select name="branch" defaultValue={office?.branch ?? "EXECUTIVE"} required>
          {branchOptions.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        직책명
        <input
          name="title"
          defaultValue={office?.title ?? ""}
          minLength={2}
          maxLength={80}
          required
        />
      </label>
      <label>
        인원
        <input
          name="seatCount"
          type="number"
          min={1}
          max={12}
          defaultValue={office?.seatCount ?? 1}
          required
        />
      </label>
      <label>
        표시 순서
        <input
          name="displayOrder"
          type="number"
          min={0}
          max={999}
          defaultValue={office?.displayOrder ?? 0}
          required
        />
      </label>
      <label>
        상태
        <select name="isActive" defaultValue={office?.isActive === false ? "no" : "yes"}>
          <option value="yes">표시</option>
          <option value="no">숨김</option>
        </select>
      </label>
      <button type="submit">{office ? "설정 저장" : "직책 추가"}</button>
    </form>
  );
}

export function GovernmentOfficeAdmin({
  countryId,
  countryName,
  structure,
}: {
  countryId: string;
  countryName: string;
  structure: Structure;
}) {
  return (
    <section className="panel" id="office-structure">
      <div className="panel-head">
        <div>
          <span className="eyebrow">GOVERNMENT STRUCTURE</span>
          <h2>{countryName} 직책 구조</h2>
        </div>
        <span className="status-pill">{structure.offices.length}개 직책</span>
      </div>
      <div className="office-admin-list">
        {structure.offices.map(({ office, holders }) => (
          <article className="details-panel" key={office.id}>
            <div className="office-admin-heading">
              <strong>
                {governmentBranchLabel(office.branch)} · {office.title}
              </strong>
              <span>{office.seatCount}인</span>
            </div>
            <OfficeFields countryId={countryId} office={office} />
            <div className="office-slot-summary">
              {Array.from({ length: office.seatCount }, (_, index) => {
                const holder = holders.find((item) => item.slotNumber === index + 1);
                return (
                  <span key={index}>
                    {index + 1}석 · {holder?.holderName ?? "공석"}
                  </span>
                );
              })}
            </div>
          </article>
        ))}
        <article className="details-panel office-new-form">
          <h3>새 직책</h3>
          <OfficeFields countryId={countryId} />
        </article>
      </div>
    </section>
  );
}
