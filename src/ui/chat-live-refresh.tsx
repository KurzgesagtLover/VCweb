"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ChatLiveRefresh() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const stream = new EventSource("/api/chat/stream");
    stream.addEventListener("ready", () => setConnected(true));
    stream.addEventListener("message", () => router.refresh());
    stream.onerror = () => setConnected(false);
    return () => stream.close();
  }, [router]);

  return (
    <span className={connected ? "live-status connected" : "live-status"} role="status">
      {connected ? "실시간" : "연결 중"}
    </span>
  );
}
