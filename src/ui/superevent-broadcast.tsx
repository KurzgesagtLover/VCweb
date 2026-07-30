"use client";

import { useEffect, useState } from "react";
import { acknowledgeSuperEventAction } from "@/src/actions/superevents";
import type { SuperEventView } from "@/src/domain/superevents/template";
import { SuperEventBulletin } from "./superevent-bulletin";
import { SuperEventStage } from "./superevent-stage";

/**
 * 로그인한 화면 어디에서든 송출을 받아 띄운다. 확인하지 않은 송출이 여러 건이면
 * 오래된 것부터 한 건씩 차례로 보여 준다.
 */
export function SuperEventBroadcast({ initialItems }: { initialItems: SuperEventView[] }) {
  const [streamed, setStreamed] = useState<SuperEventView[] | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const items = streamed ?? initialItems;
  const current = items.find((item) => !acknowledged.includes(item.id));

  useEffect(() => {
    const reload = async () => {
      try {
        const response = await fetch("/api/superevents/pending", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { items?: SuperEventView[] };
        setStreamed(payload.items ?? []);
      } catch {
        // 놓친 송출은 다음 알림이나 다음 접속 때 서버에서 다시 받아 온다.
      }
    };
    const stream = new EventSource("/api/superevents/stream");
    stream.addEventListener("superevent", () => void reload());
    return () => stream.close();
  }, []);

  if (!current) return null;

  return (
    <SuperEventPlayback
      key={current.id}
      item={current}
      onFinish={async () => {
        setAcknowledged((ids) => [...ids, current.id]);
        await acknowledgeSuperEventAction(current.id);
      }}
    />
  );
}

/** 호외가 붙은 송출은 지면 → 전대역 순서로 두 겹을 차례로 넘긴다. */
function SuperEventPlayback({
  item,
  onFinish,
}: {
  item: SuperEventView;
  onFinish: () => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<"bulletin" | "super">(item.bulletin ? "bulletin" : "super");

  if (phase === "bulletin" && item.bulletin) {
    return (
      <SuperEventBulletin
        bulletin={item.bulletin}
        broadcastAt={item.broadcastAt}
        codeName={item.codeName}
        onContinue={() => {
          if (item.superEnabled) setPhase("super");
          else void onFinish();
        }}
      />
    );
  }

  return <SuperEventStage view={item} onDismiss={() => void onFinish()} />;
}
