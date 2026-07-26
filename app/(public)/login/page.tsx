import Link from "next/link";
import { LoginForm } from "@/src/ui/auth-form";

export const metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <main className="public-page" id="main-content" tabIndex={-1}>
      <section className="auth-card panel">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          NEXUS
        </Link>
        <div>
          <span className="eyebrow">SECURE ACCESS</span>
          <h1>작전실 로그인</h1>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
