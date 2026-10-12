"use client";

import { useEffect, useState } from "react";

export function PoliticalPowerTicker({
  balance,
  incomePerRealSecond,
  serverNow,
}: {
  balance: string;
  incomePerRealSecond: string;
  serverNow: string;
}) {
  const [value, setValue] = useState(Number(balance));

  useEffect(() => {
    const base = Number(balance);
    const rate = Number(incomePerRealSecond);
    const startedAt = Date.parse(serverNow);
    const update = () => {
      const elapsedSeconds = Math.max(0, Date.now() - startedAt) / 1000;
      setValue(Math.min(1000, Math.max(-250, base + rate * elapsedSeconds)));
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [balance, incomePerRealSecond, serverNow]);

  return <>{value.toFixed(2)}</>;
}
