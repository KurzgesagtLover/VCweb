"use client";

import { useEffect, useState } from "react";
import { currentGameInstant, formatGameInstant } from "@/src/domain/turn/schedule";

type Props = {
  gameDateStart: string | null;
  gameDateEnd: string | null;
  deadlineAt: string | null;
  intervalRealDays: number;
  initialNow: string;
  /** 캠페인 일시정지 시각. 있으면 시계가 그 시각에 멈춘다. */
  pausedAt: string | null;
};

function resolveLabel(
  { gameDateStart, gameDateEnd, deadlineAt, intervalRealDays, pausedAt }: Props,
  now = new Date(),
) {
  if (!gameDateStart || !gameDateEnd) return "—";
  const instant = currentGameInstant({
    gameDateStart,
    gameDateEnd,
    deadlineAt: deadlineAt ? new Date(deadlineAt) : null,
    intervalRealDays,
    now,
    pausedAt: pausedAt ? new Date(pausedAt) : null,
  });
  return instant ? formatGameInstant(instant) : gameDateEnd.slice(0, 10).replaceAll("-", ".");
}

export function ShellClock({
  gameDateStart,
  gameDateEnd,
  deadlineAt,
  intervalRealDays,
  initialNow,
  pausedAt,
}: Props) {
  const [label, setLabel] = useState(() =>
    resolveLabel(
      { gameDateStart, gameDateEnd, deadlineAt, intervalRealDays, initialNow, pausedAt },
      new Date(initialNow),
    ),
  );

  useEffect(() => {
    const tick = () =>
      setLabel(
        resolveLabel({
          gameDateStart,
          gameDateEnd,
          deadlineAt,
          intervalRealDays,
          initialNow,
          pausedAt,
        }),
      );
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [gameDateStart, gameDateEnd, deadlineAt, intervalRealDays, initialNow, pausedAt]);

  return (
    <div
      className="shell-clock"
      aria-live="polite"
      title={pausedAt ? "게임 시각 (일시정지)" : "게임 시각"}
    >
      <time>{label}</time>
      {pausedAt ? <span className="shell-clock-paused">일시정지</span> : null}
    </div>
  );
}
