"use client";

import { useEffect, useState } from "react";
import { currentGameInstant, formatGameInstant } from "@/src/domain/turn/schedule";

type Props = {
  gameDateStart: string | null;
  gameDateEnd: string | null;
  deadlineAt: string | null;
  intervalRealDays: number;
  initialNow: string;
};

function resolveLabel(
  { gameDateStart, gameDateEnd, deadlineAt, intervalRealDays }: Props,
  now = new Date(),
) {
  if (!gameDateStart || !gameDateEnd) return "—";
  const instant = currentGameInstant({
    gameDateStart,
    gameDateEnd,
    deadlineAt: deadlineAt ? new Date(deadlineAt) : null,
    intervalRealDays,
    now,
  });
  return instant ? formatGameInstant(instant) : gameDateEnd.slice(0, 10).replaceAll("-", ".");
}

export function ShellClock({
  gameDateStart,
  gameDateEnd,
  deadlineAt,
  intervalRealDays,
  initialNow,
}: Props) {
  const [label, setLabel] = useState(() =>
    resolveLabel(
      { gameDateStart, gameDateEnd, deadlineAt, intervalRealDays, initialNow },
      new Date(initialNow),
    ),
  );

  useEffect(() => {
    const tick = () =>
      setLabel(
        resolveLabel({ gameDateStart, gameDateEnd, deadlineAt, intervalRealDays, initialNow }),
      );
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [gameDateStart, gameDateEnd, deadlineAt, intervalRealDays, initialNow]);

  return (
    <div className="shell-clock" aria-live="polite" title="게임 시각">
      <time>{label}</time>
    </div>
  );
}
