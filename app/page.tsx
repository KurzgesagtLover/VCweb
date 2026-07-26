import Image from "next/image";
import Link from "next/link";
import { getActiveCampaign } from "@/src/db/queries/viewer";

export const dynamic = "force-dynamic";

const epochs = [
  {
    id: "01",
    era: "GENESIS",
    title: "문명의 여명",
    caption: "첫 불꽃 곁에서 별을 올려다보다",
    image: "/intro/intro-dawn.png",
  },
  {
    id: "02",
    era: "MACHINA",
    title: "증기와 강철",
    caption: "기계가 시간의 속도를 바꾸다",
    image: "/intro/intro-industrial.png",
  },
  {
    id: "03",
    era: "NETWORK",
    title: "정보의 시대",
    caption: "모든 도시가 하나의 신경망이 되다",
    image: "/intro/intro-modern.png",
  },
  {
    id: "04",
    era: "BEYOND",
    title: "미지의 내일",
    caption: "다음 장은 아직 기록되지 않았다",
    image: "/intro/intro-future.png",
  },
] as const;

export default async function HomePage() {
  const campaign = await getActiveCampaign();
  return (
    <main className="epoch-landing" id="main-content" tabIndex={-1}>
      <div className="epoch-backdrop" aria-hidden="true" />
      <div className="epoch-vignette" aria-hidden="true" />

      <nav className="epoch-nav" aria-label="공개 메뉴">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          NEXUS
        </Link>
        <span className="epoch-nav-meta">EPOCH ARCHIVE // REC ●</span>
      </nav>

      <header className="epoch-title">
        <span className="eyebrow">HUMANITY — CHAPTER 000000 TO ∞</span>
        <h1>
          불꽃에서 별까지,
          <br />
          인류의 기록은 아직 끝나지 않았다.
        </h1>
      </header>

      <section className="epoch-strip" aria-label="인류 연대기">
        {epochs.map((epoch) => (
          <figure className="epoch-card" key={epoch.id}>
            <Image
              src={epoch.image}
              alt={`${epoch.title} — ${epoch.caption}`}
              width={1024}
              height={683}
              sizes="(max-width: 520px) 100vw, (max-width: 900px) 50vw, 25vw"
            />
            <figcaption>
              <span className="epoch-card-era">
                CH.{epoch.id} {epoch.era}
              </span>
              <strong>{epoch.title}</strong>
              <small>{epoch.caption}</small>
            </figcaption>
          </figure>
        ))}
      </section>

      <section className="epoch-dialogue" aria-label="내레이션">
        <div className="epoch-dialogue-box">
          <div className="epoch-speaker">
            <span>ARCHIVE // NARRATOR</span>
            <em>{campaign?.name ?? "가상국가 캠페인"}</em>
          </div>
          <p>
            첫 모닥불 곁에서 별을 올려다본 순간부터, 인류는 스스로의 연대기를 써 내려왔습니다.
            제국은 세워지고 무너졌으며, 기계는 시간을 접었고, 도시는 빛의 신경망이 되었습니다.
            <br />
            …그리고 지금, 다음 장의 펜이 당신에게 넘어옵니다. 당신의 한 문장이 한 국가의 경제와
            정치, 그리고 다음 시대의 지표가 됩니다.
          </p>
          <span className="epoch-cursor" aria-hidden="true">
            ▼
          </span>
          <div className="epoch-choices">
            <Link className="epoch-choice" href="/login">
              <b>▸</b>
              <span>
                기록을 이어 쓴다
                <small>작전실 입장</small>
              </span>
            </Link>
            <Link className="epoch-choice alt" href="/register">
              <b>▹</b>
              <span>
                새로운 서사를 시작한다
                <small>신규 등록</small>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
