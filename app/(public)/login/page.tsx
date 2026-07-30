import Link from "next/link";
import { LoginForm } from "@/src/ui/auth-form";
import { GateFrame, Key } from "@/src/ui/gate-frame";

export const metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <GateFrame
      speaker="SECURITY // TERMINAL"
      meta="AUTHORIZED PERSONNEL ONLY"
      focus={0}
      choices={
        <>
          <Link className="gate-choice" href="/register">
            국가 신청
          </Link>
          <Link className="gate-choice is-quiet" href="/">
            처음으로
          </Link>
        </>
      }
    >
      <p>
        &ldquo;<Key tone="danger">주권적인 것</Key>은 아무것도 존재할 수 없다. 그것으로 끝이다.{" "}
        <Key tone="danger">주권의 시대</Key>는 끝났다. <Key>민족 국가</Key>란 과거의 산물일 뿐이며,
        그것들은 쓰레기다. 국제법 따위는 폐기해라. 이제 아무도 그것을 존중하지 않는다.&rdquo;
        <br /> <br />
        <i> - Алекса́ндр Ге́льевич Ду́гин </i>
      </p>
      <LoginForm variant="gate" />
    </GateFrame>
  );
}
