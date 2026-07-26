"use client";

import { useEffect, useRef } from "react";

export function RememberedDisclosure({
  storageKey,
  title,
  children,
}: {
  storageKey: string;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.open = localStorage.getItem(storageKey) === "open";
  }, [storageKey]);
  return (
    <details
      ref={ref}
      className="details-panel"
      onToggle={(event) =>
        localStorage.setItem(storageKey, event.currentTarget.open ? "open" : "closed")
      }
    >
      <summary>{title}</summary>
      <div className="details-body">{children}</div>
    </details>
  );
}
