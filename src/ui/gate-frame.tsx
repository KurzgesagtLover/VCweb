import Image from "next/image";
import type { ReactNode } from "react";

const SCENES = [
  {
    src: "/gate/bureau.webp",
    alt: "서류 더미에 둘러싸여 집무 중인 관료",
    tag: "REC.01 행정",
  },
  {
    src: "/gate/assembly.webp",
    alt: "대의원이 가득 들어찬 의사당 전경",
    tag: "REC.02 의회",
  },
  {
    src: "/gate/portrait.webp",
    alt: "집무실 벽에 지도자 초상을 거는 인물",
    tag: "REC.03 체제",
  },
] as const;

/**
 * 비로그인 진입 화면 공통 골격. 화면 중앙에 창 하나를 띄우고,
 * 그 안에 흑백 장면 3분할·대사 상자·선택지를 담는다.
 */
export function GateFrame({
  speaker,
  meta,
  children,
  choices,
  focus = 1,
}: {
  /** 화자 표기. 생략하면 머리글 없이 대사만 보여 준다. */
  speaker?: string;
  meta?: string;
  /** 대사 내용. 생략하면 대사 상자 없이 장면과 선택지만 남는다. */
  children?: ReactNode;
  choices: ReactNode;
  /** 강조할 패널 인덱스(0~2). 해당 패널만 밝게 남기고 나머지는 어둡게 눌러 둔다. */
  focus?: 0 | 1 | 2;
}) {
  return (
    <main className="gate" id="main-content" tabIndex={-1}>
      <Image
        className="gate-backdrop"
        src="/gate/voyager.jpg"
        alt=""
        aria-hidden="true"
        width={1200}
        height={750}
        unoptimized
        priority
      />
      <Image
        className="gate-logo"
        src="/gate/logo.png"
        alt="MIDNIGHT VOYAGER — THE DEATH OF POSSIBILITY"
        width={1024}
        height={1024}
        unoptimized
        priority
      />

      <div className="gate-window">
        <div className="gate-scenes" aria-hidden="true">
          {SCENES.map((scene, index) => (
            <figure className={`gate-scene${index === focus ? " is-focus" : ""}`} key={scene.src}>
              {/* 이미 흑백 WebP로 굽혀 둔 정적 자산이라 서버 최적화(sharp)를 거치지 않는다. */}
              <Image
                src={scene.src}
                alt={scene.alt}
                width={1000}
                height={1500}
                priority
                unoptimized
                sizes="(max-width: 720px) 90vw, 24rem"
              />
              <figcaption>{scene.tag}</figcaption>
            </figure>
          ))}
          <span className="gate-badge">S</span>
        </div>

        <div className="gate-overlay" aria-hidden="true" />

        {children && (
          <section className="gate-dialogue" aria-label="내레이션">
            {(speaker || meta) && (
              <header className="gate-speaker">
                <span>{speaker}</span>
                {meta && <em>{meta}</em>}
              </header>
            )}
            <div className="gate-lines">{children}</div>
            <span className="gate-cursor" aria-hidden="true">
              ▼
            </span>
          </section>
        )}

        <nav className="gate-choices" aria-label="진입 선택">
          {choices}
        </nav>
      </div>
    </main>
  );
}

/** 대사 안에서 특정 낱말을 강조한다. 붉은색은 위기, 노란색은 의지, 보라색은 체제를 가리킨다. */
export function Key({
  tone = "warning",
  children,
}: {
  tone?: "danger" | "warning" | "system";
  children: ReactNode;
}) {
  return <b className={`gate-key is-${tone}`}>{children}</b>;
}
