"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

export type PersonnelPerson = {
  key: string;
  officeTitle: string;
  holderName: string | null;
  portraitPath: string | null;
};

export type PersonnelBranch = {
  id: "EXECUTIVE" | "JUDICIAL" | "LEGISLATIVE";
  label: string;
  people: PersonnelPerson[];
};

const featureOrder = ["lead", "second", "third"] as const;

export function GovernmentPersonnelCarousel({ branches }: { branches: PersonnelBranch[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ id: number; x: number } | null>(null);

  function move(direction: -1 | 1) {
    setActiveIndex((current) => (current + direction + branches.length) % branches.length);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = { id: event.pointerId, x: event.clientX };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current || pointerStart.current.id !== event.pointerId) return;
    setDragX(event.clientX - pointerStart.current.x);
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current || pointerStart.current.id !== event.pointerId) return;
    const threshold = Math.min(120, (viewportRef.current?.clientWidth ?? 600) * 0.12);
    const delta = event.clientX - pointerStart.current.x;
    if (delta <= -threshold) move(1);
    if (delta >= threshold) move(-1);
    pointerStart.current = null;
    setDragging(false);
    setDragX(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelPointer(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = null;
    setDragging(false);
    setDragX(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="branch-carousel" aria-label="권력기관 인사">
      <div className="branch-carousel-topline">
        <div>
          <span className="eyebrow">POWER STRUCTURE</span>
          <h2>권력기관 인사</h2>
        </div>
        <nav aria-label="권력기관 선택">
          {branches.map((branch, index) => (
            <button
              className={index === activeIndex ? "active" : ""}
              type="button"
              key={branch.id}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
            >
              {branch.label}
            </button>
          ))}
        </nav>
      </div>

      <div
        className={`branch-carousel-viewport ${dragging ? "dragging" : ""}`}
        ref={viewportRef}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={cancelPointer}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") move(-1);
          if (event.key === "ArrowRight") move(1);
        }}
      >
        <div
          className="branch-track"
          style={
            {
              "--branch-index": activeIndex,
              "--branch-drag": `${dragX}px`,
            } as CSSProperties
          }
        >
          {branches.map((branch, index) => {
            const featured = branch.people.slice(0, 3);
            const others = branch.people.slice(3);
            return (
              <article
                className="branch-slide"
                key={branch.id}
                aria-hidden={index === activeIndex ? undefined : true}
                aria-label={`${branch.label} 인사 ${branch.people.length}명`}
              >
                <header className="branch-slide-heading">
                  <span>
                    BRANCH {String(index + 1).padStart(2, "0")} /{" "}
                    {String(branches.length).padStart(2, "0")}
                  </span>
                  <strong>{branch.label}</strong>
                  <small>{branch.people.length}명 재직</small>
                </header>

                {featured.length ? (
                  <div className="branch-featured" data-count={featured.length}>
                    {featured.map((person, rank) => (
                      <figure
                        className={`branch-featured-card ${featureOrder[rank]}`}
                        key={person.key}
                      >
                        <figcaption>
                          <span>{person.officeTitle}</span>
                          <strong>{person.holderName ?? "공석"}</strong>
                        </figcaption>
                        <div className="branch-featured-frame">
                          {person.portraitPath ? (
                            <Image
                              src={person.portraitPath}
                              alt={`${person.holderName ?? person.officeTitle} 초상화`}
                              width={480}
                              height={640}
                              sizes="(max-width: 700px) 60vw, 30vw"
                              draggable={false}
                              priority={index === activeIndex && rank === 0}
                            />
                          ) : (
                            <span aria-label="초상화 없음">
                              {person.holderName?.slice(0, 1) ?? "?"}
                            </span>
                          )}
                        </div>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="branch-slide-empty">등록된 직책이 없습니다.</div>
                )}

                {others.length > 0 && (
                  <div className="branch-roster" aria-label={`${branch.label} 기타 직책`}>
                    {others.map((person) => (
                      <span key={person.key}>
                        <em>{person.officeTitle}</em>
                        {person.holderName ?? "공석"}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className="branch-carousel-footer">
        <button type="button" aria-label="이전 권력기관" onClick={() => move(-1)}>
          ←
        </button>
        <span>DRAG / SWIPE TO SWITCH</span>
        <button type="button" aria-label="다음 권력기관" onClick={() => move(1)}>
          →
        </button>
      </div>
    </section>
  );
}
