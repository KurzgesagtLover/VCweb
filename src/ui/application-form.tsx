"use client";

import { useActionState } from "react";
import { applyForCountryAction } from "@/src/actions/country";
import type { FormState } from "@/src/actions/auth";

export function ApplicationForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(applyForCountryAction, {});
  return (
    <form action={action} className="form-stack">
      <label>
        희망 국명
        <input name="requestedCountryName" minLength={2} maxLength={80} required />
      </label>
      <label>
        운영 계획과 신청 사유
        <textarea name="reason" minLength={10} maxLength={1000} required />
      </label>
      {state.error && (
        <p className="form-message" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-message success" role="status">
          {state.success}
        </p>
      )}
      <button disabled={pending}>{pending ? "신청 전송 중…" : "국가 배정 신청"}</button>
    </form>
  );
}
