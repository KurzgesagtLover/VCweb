"use client";

import { deleteCountryAction } from "@/src/actions/country";

export function DeleteCountryButton({
  countryId,
  countryName,
  compact = false,
}: {
  countryId: string;
  countryName: string;
  compact?: boolean;
}) {
  return (
    <form
      action={deleteCountryAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `「${countryName}」 국가를 삭제할까요?\n관련 외교·원장·배정·지도 배정 데이터도 함께 삭제됩니다.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="countryId" value={countryId} />
      <button type="submit" className={compact ? "danger" : "button danger"}>
        삭제
      </button>
    </form>
  );
}
