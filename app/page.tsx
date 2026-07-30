import Link from "next/link";
import { GateFrame } from "@/src/ui/gate-frame";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <GateFrame
      focus={1}
      choices={
        <>
          <Link className="gate-choice" href="/register">
            국가 신청
          </Link>
          <Link className="gate-choice" href="/login">
            로그인
          </Link>
          <Link className="gate-choice is-quiet" href="/diplomacy">
            계속하기
          </Link>
        </>
      }
    />
  );
}
