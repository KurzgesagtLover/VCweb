import Link from "next/link";
import { RegisterForm } from "@/src/ui/auth-form";
import { GateFrame } from "@/src/ui/gate-frame";

export const metadata = { title: "신규 등록" };

export default function RegisterPage() {
  return (
    <GateFrame
      speaker="REGISTRY // NEW OPERATOR"
      meta="등록 후 국가 배정 신청"
      focus={2}
      choices={
        <>
          <Link className="gate-choice" href="/login">
            로그인
          </Link>
          <Link className="gate-choice is-quiet" href="/">
            처음으로
          </Link>
        </>
      }
    >
      <p>
      주권적인 것은 아무것도 존재할 수 없다. 그것으로 끝이다. 주권의 시대는 끝났다. 
      민족 국가란 과거의 산물일 뿐이며, 그것들은 쓰레기다. 국제법 따위는 폐기해라. 이제 아무도 그것을 존중하지 않는다.
      </p>
      <RegisterForm variant="gate" />
    </GateFrame>
  );
}
