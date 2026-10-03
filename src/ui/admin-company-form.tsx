import type { majorCompanies } from "@/src/db/schema";
import { saveMajorCompanyAction } from "@/src/actions/company";

type Company = typeof majorCompanies.$inferSelect;

const textValue = (value: string | null | undefined) => value ?? "";
const listValue = (value: string[] | null | undefined) => value?.join("\n") ?? "";
const percentValue = (value: string | null | undefined) =>
  value === null || value === undefined ? "" : Number(value) * 100;

export function AdminCompanyForm({
  countryId,
  company,
}: {
  countryId: string;
  company?: Company | null;
}) {
  return (
    <form action={saveMajorCompanyAction} className="company-admin-form">
      <input type="hidden" name="countryId" value={countryId} />
      <input type="hidden" name="companyId" value={company?.id ?? ""} />

      <fieldset>
        <legend>기업 상징·역사</legend>
        <div className="form-grid">
          <label>
            기업명
            <input name="name" defaultValue={company?.name} required maxLength={200} />
          </label>
          <label>
            약칭
            <input name="abbreviation" defaultValue={textValue(company?.abbreviation)} />
          </label>
          <label>
            로고 경로 또는 URL
            <input name="logo" defaultValue={company?.logo} required maxLength={2000} />
          </label>
          <label>
            표어
            <input name="slogan" defaultValue={company?.slogan} required maxLength={500} />
          </label>
          <label>
            설립
            <input name="founded" defaultValue={company?.founded} required maxLength={100} />
          </label>
          <label className="form-span-full">
            역사
            <textarea name="history" defaultValue={company?.history} rows={5} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>기본정보</legend>
        <div className="form-grid">
          <label>
            기업형태
            <input name="legalForm" defaultValue={company?.legalForm} required />
          </label>
          <label>
            본사
            <input name="headquarters" defaultValue={company?.headquarters} required />
          </label>
          <label>
            설립지
            <input name="placeOfFoundation" defaultValue={textValue(company?.placeOfFoundation)} />
          </label>
          <label>
            최고경영자
            <input
              name="chiefExecutiveOfficer"
              defaultValue={company?.chiefExecutiveOfficer}
              required
            />
          </label>
          <label>
            이사회 의장
            <input name="boardChair" defaultValue={textValue(company?.boardChair)} />
          </label>
          <label>
            모기업
            <input name="parentCompany" defaultValue={company?.parentCompany ?? "없음"} required />
          </label>
          <label>
            최대주주
            <input
              name="largestShareholder"
              defaultValue={textValue(company?.largestShareholder)}
            />
          </label>
          <label>
            주요주주
            <textarea
              name="majorShareholders"
              defaultValue={listValue(company?.majorShareholders)}
            />
          </label>
          <label>
            주요 자회사
            <textarea name="subsidiaries" defaultValue={listValue(company?.subsidiaries)} />
          </label>
          <label>
            주요 계열사
            <textarea name="affiliates" defaultValue={listValue(company?.affiliates)} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>인적환경</legend>
        <div className="form-grid">
          <label>
            직원 수
            <input
              name="employeeCount"
              type="number"
              min="0"
              defaultValue={company?.employeeCount}
              required
            />
          </label>
          <label>
            간접고용 인구
            <input
              name="indirectEmployment"
              type="number"
              min="0"
              defaultValue={textValue(company?.indirectEmployment)}
            />
          </label>
          <label>
            해외근무 인원
            <input
              name="overseasEmployees"
              type="number"
              min="0"
              defaultValue={textValue(company?.overseasEmployees)}
            />
          </label>
          <label>
            평균 연봉 (USD)
            <input
              name="averageSalary"
              type="number"
              min="0"
              step="0.01"
              defaultValue={textValue(company?.averageSalary)}
            />
          </label>
          <label>
            노조 가입률
            <input
              name="unionMembershipRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={percentValue(company?.unionMembershipRate)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>경제 (백만 USD)</legend>
        <div className="form-grid">
          <label>
            매출액
            <input
              name="revenue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={company?.revenue}
              required
            />
          </label>
          <label>
            매출총이익
            <input
              name="grossProfit"
              type="number"
              step="0.01"
              defaultValue={company?.grossProfit}
              required
            />
          </label>
          <label>
            영업이익
            <input
              name="operatingProfit"
              type="number"
              step="0.01"
              defaultValue={company?.operatingProfit}
              required
            />
          </label>
          <label>
            순이익
            <input
              name="netIncome"
              type="number"
              step="0.01"
              defaultValue={company?.netIncome}
              required
            />
          </label>
          <label>
            총자산
            <input
              name="totalAssets"
              type="number"
              min="0"
              step="0.01"
              defaultValue={company?.totalAssets}
              required
            />
          </label>
          <label>
            총부채
            <input
              name="totalDebt"
              type="number"
              min="0"
              step="0.01"
              defaultValue={textValue(company?.totalDebt)}
            />
          </label>
          <label>
            기업가치
            <input
              name="enterpriseValue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={company?.enterpriseValue}
              required
            />
          </label>
          <label>
            시가총액
            <input
              name="marketCapitalization"
              type="number"
              min="0"
              step="0.01"
              defaultValue={textValue(company?.marketCapitalization)}
            />
          </label>
          <label>
            신용등급
            <input name="creditRating" defaultValue={textValue(company?.creditRating)} />
          </label>
          <label>
            연구개발비
            <input
              name="researchAndDevelopmentExpense"
              type="number"
              min="0"
              step="0.01"
              defaultValue={textValue(company?.researchAndDevelopmentExpense)}
            />
          </label>
          <label>
            설비투자액
            <input
              name="capitalExpenditure"
              type="number"
              min="0"
              step="0.01"
              defaultValue={textValue(company?.capitalExpenditure)}
            />
          </label>
          <label>
            현금성자산
            <input
              name="cashAndEquivalents"
              type="number"
              min="0"
              step="0.01"
              defaultValue={textValue(company?.cashAndEquivalents)}
            />
          </label>
          <label>
            배당액
            <input
              name="dividendsPaid"
              type="number"
              min="0"
              step="0.01"
              defaultValue={textValue(company?.dividendsPaid)}
            />
          </label>
          <label>
            부채비율
            <input
              name="debtRatio"
              type="number"
              min="0"
              step="0.1"
              defaultValue={percentValue(company?.debtRatio)}
            />
          </label>
          <label>
            영업이익률
            <input
              name="operatingMargin"
              type="number"
              step="0.1"
              defaultValue={percentValue(company?.operatingMargin)}
            />
          </label>
          <label>
            자동화 생산성 증가율
            <input
              name="automationProductivityGrowthRate"
              type="number"
              min="-100"
              max="100"
              step="0.1"
              defaultValue={percentValue(company?.automationProductivityGrowthRate) || 0}
              required
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>사업</legend>
        <div className="form-grid">
          <label>
            주요 산업
            <input name="industry" defaultValue={company?.industry} required />
          </label>
          <label>
            주요 제품·서비스
            <textarea
              name="productsAndServices"
              defaultValue={listValue(company?.productsAndServices)}
              required
            />
          </label>
          <label>
            주요 브랜드
            <textarea name="brands" defaultValue={listValue(company?.brands)} />
          </label>
          <label>
            주요 생산시설
            <textarea
              name="productionFacilities"
              defaultValue={listValue(company?.productionFacilities)}
            />
          </label>
          <label>
            주요 연구시설
            <textarea
              name="researchFacilities"
              defaultValue={listValue(company?.researchFacilities)}
            />
          </label>
          <label>
            주요 해외거점
            <textarea name="overseasBases" defaultValue={listValue(company?.overseasBases)} />
          </label>
          <label>
            주요 시장
            <textarea name="majorMarkets" defaultValue={listValue(company?.majorMarkets)} />
          </label>
          <label>
            주요 경쟁사
            <textarea name="competitors" defaultValue={listValue(company?.competitors)} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>주식</legend>
        <div className="form-grid">
          <label>
            상장 여부
            <select name="isListed" defaultValue={company?.isListed ? "true" : "false"} required>
              <option value="false">비상장</option>
              <option value="true">상장</option>
            </select>
          </label>
          <label>
            상장 거래소
            <input name="stockExchange" defaultValue={textValue(company?.stockExchange)} />
          </label>
          <label>
            종목코드
            <input name="tickerSymbol" defaultValue={textValue(company?.tickerSymbol)} />
          </label>
          <label>
            발행주식수
            <input
              name="sharesOutstanding"
              type="number"
              min="0"
              defaultValue={textValue(company?.sharesOutstanding)}
            />
          </label>
          <label>
            주가 (USD)
            <input
              name="sharePrice"
              type="number"
              min="0"
              step="0.0001"
              defaultValue={textValue(company?.sharePrice)}
            />
          </label>
          <label>
            배당수익률
            <input
              name="dividendYield"
              type="number"
              min="0"
              step="0.1"
              defaultValue={percentValue(company?.dividendYield)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>운영 지표</legend>
        <div className="form-grid">
          <label>
            소유 형태
            <select name="stateOwned" defaultValue={company?.stateOwned ? "true" : "false"}>
              <option value="false">민간</option>
              <option value="true">국영</option>
            </select>
          </label>
          <label>
            규모 지수
            <input
              name="sizeIndex"
              type="number"
              min="0"
              max="100"
              defaultValue={company?.sizeIndex ?? 50}
              required
            />
          </label>
          <label>
            경제 중요도
            <input
              name="systemicImportance"
              type="number"
              min="0"
              max="100"
              defaultValue={company?.systemicImportance ?? 50}
              required
            />
          </label>
          <label>
            건전성
            <input
              name="health"
              type="number"
              min="0"
              max="100"
              defaultValue={company?.health ?? 60}
              required
            />
          </label>
        </div>
      </fieldset>

      <div className="inline-actions company-form-actions">
        <button type="submit">{company ? "기업 정보 저장" : "주요 기업 등록"}</button>
      </div>
    </form>
  );
}
