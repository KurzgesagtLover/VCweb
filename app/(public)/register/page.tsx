import Link from "next/link";
import { RegisterForm } from "@/src/ui/auth-form";

export const metadata = { title: "신규 등록" };

export default function RegisterPage() {
  return (
    <main className="public-page" id="main-content" tabIndex={-1}>
      <section className="auth-card panel">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          NEXUS
        </Link>
        <div>
          <span className="eyebrow">NEW OPERATOR</span>
          <h1>신규 사용자 등록</h1>
        </div>
        <p className="muted">가입 후 활성 캠페인의 국가 배정을 신청할 수 있습니다.</p>
        <RegisterForm />
      </section>
    </main>
  );
}
