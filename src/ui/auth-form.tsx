"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type FormState } from "@/src/actions/auth";

const initialState: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="form-stack">
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
      <button disabled={pending}>{pending ? "세션 확인 중…" : "로그인"}</button>
      <p className="muted">
        아직 계정이 없나요? <Link href="/register">신규 등록</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);
  return (
    <form action={action} className="form-stack">
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
      <button disabled={pending}>{pending ? "계정 생성 중…" : "계정 만들기"}</button>
      <p className="muted">
        이미 계정이 있나요? <Link href="/login">로그인</Link>
      </p>
    </form>
  );
}
