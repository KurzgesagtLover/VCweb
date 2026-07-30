"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { loginAction, registerAction, type FormState } from "@/src/actions/auth";
import { OST_START_EVENT, OST_STOP_EVENT } from "@/src/ui/background-ost";

const initialState: FormState = {};

/** card: 기존 패널형 화면, gate: 비로그인 진입 화면의 대사 상자 안에 놓이는 단말기형 */
type Variant = "card" | "gate";

function shell(variant: Variant) {
  return variant === "gate" ? "gate-form" : "form-stack";
}

function startOst() {
  window.dispatchEvent(new Event(OST_START_EVENT));
}

function useStopOstOnError(state: FormState) {
  useEffect(() => {
    if (state.error) window.dispatchEvent(new Event(OST_STOP_EVENT));
  }, [state]);
}

export function LoginForm({ variant = "card" }: { variant?: Variant }) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  useStopOstOnError(state);
  return (
    <form action={action} className={shell(variant)} onSubmit={startOst}>
      <label>
        이메일
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={10}
          required
        />
      </label>
      {state.error && (
        <p className="form-message" role="alert">
          {state.error}
        </p>
      )}
      <button disabled={pending}>
        {pending ? "세션 확인 중…" : variant === "gate" ? "접속" : "로그인"}
      </button>
      {variant === "card" && (
        <p className="muted">
          아직 계정이 없나요? <Link href="/register">신규 등록</Link>
        </p>
      )}
    </form>
  );
}

export function RegisterForm({ variant = "card" }: { variant?: Variant }) {
  const [state, action, pending] = useActionState(registerAction, initialState);
  useStopOstOnError(state);
  return (
    <form action={action} className={shell(variant)} onSubmit={startOst}>
      <label>
        호칭
        <input name="name" autoComplete="name" minLength={2} maxLength={50} required />
      </label>
      <label>
        이메일
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
        <small>10자 이상, 128자 이하</small>
      </label>
      {state.error && (
        <p className="form-message" role="alert">
          {state.error}
        </p>
      )}
      <button disabled={pending}>
        {pending ? "계정 생성 중…" : variant === "gate" ? "등록 개시" : "계정 만들기"}
      </button>
      {variant === "card" && (
        <p className="muted">
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      )}
    </form>
  );
}
