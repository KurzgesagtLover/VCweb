"use client";

import { useActionState } from "react";
import type { FormState } from "@/src/actions/auth";
import { applyForCountryAction } from "@/src/actions/country";

export function LeaveCountryForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(applyForCountryAction, {});
  return (
    <form
      action={action}
      className="leave-country-form"
      onSubmit={(event) => {
        if (!window.confirm("담당 국가 반납을 신청할까요? 관리자 승인 후 처리됩니다.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="kind" value="RELEASE" />
      <input type="hidden" name="reason" value="담당 국가 반납 신청" />
      <button className="button danger" disabled={disabled || pending}>
        {pending ? "신청 중…" : "국가 반납 신청"}
      </button>
      {state.error && <small className="form-message">{state.error}</small>}
      {state.success && <small className="form-message success">{state.success}</small>}
    </form>
  );
}
