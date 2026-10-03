"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

type Tone = "danger" | "warning" | "system" | "italic";

type Segment = {
  text: string;
  tone?: Tone;
};

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

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** 대사 JSX를 글자 단위로 펼칠 수 있게 조각낸다. Key·기울임·줄바꿈을 유지한다. */
function flatten(node: ReactNode): Segment[] {
  if (node == null || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [{ text: String(node) }];
  if (Array.isArray(node)) return node.flatMap(flatten);

  if (!isValidElement(node)) return [];

  const element = node as ReactElement<{
    children?: ReactNode;
    tone?: "danger" | "warning" | "system";
  }>;

  if (element.type === Key) {
    return [{ text: textOf(element.props.children), tone: element.props.tone ?? "warning" }];
  }
  if (element.type === "br") return [{ text: "\n" }];
  if (element.type === "i" || element.type === "em") {
    return [{ text: textOf(element.props.children), tone: "italic" }];
  }
  if (element.type === "p") {
    const inner = flatten(element.props.children);
    return inner.length ? [...inner, { text: "\n\n" }] : [];
  }
  return flatten(element.props.children);
}

function reveal(segments: Segment[], count: number): Segment[] {
  let left = count;
  const out: Segment[] = [];
  for (const segment of segments) {
    if (left <= 0) break;
    const take = Math.min(left, segment.text.length);
    out.push({ text: segment.text.slice(0, take), tone: segment.tone });
    left -= take;
  }
  return out;
}

function renderSegments(segments: Segment[]) {
  return segments.map((segment, index) => {
    const key = `${index}-${segment.text.slice(0, 8)}`;
    if (segment.tone === "italic") return <i key={key}>{segment.text}</i>;
    if (segment.tone === "danger" || segment.tone === "warning" || segment.tone === "system") {
      return (
        <b key={key} className={`gate-key is-${segment.tone}`}>
          {segment.text}
        </b>
      );
    }
    return (
      <span key={key}>
        {segment.text.split("\n").map((part, partIndex, parts) => (
          <span key={`${key}-${partIndex}`}>
            {part}
            {partIndex < parts.length - 1 && <br />}
          </span>
        ))}
      </span>
    );
  });
}

/**
 * 게이트 대사 상자용 타이핑. 클릭하거나 Enter/Space를 누르면 곧바로 끝까지 보여 준다.
 * 폼은 children 밖에 두고, 이 컴포넌트에는 대사만 넣는다.
 */
export function GateTypewriter({
  children,
  msPerChar = 28,
}: {
  children: ReactNode;
  msPerChar?: number;
}) {
  const segments = useMemo(
    () =>
      flatten(Children.count(children) === 1 ? children : <>{children}</>).filter(
        (segment) => segment.text.length > 0,
      ),
    [children],
  );
  const total = useMemo(
    () => segments.reduce((sum, segment) => sum + segment.text.length, 0),
    [segments],
  );
  const [count, setCount] = useState(0);
  const done = count >= total;

  useEffect(() => {
    setCount(0);
  }, [total]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(total);
      return;
    }
    if (count >= total) return;
    const timer = window.setTimeout(() => setCount((value) => value + 1), msPerChar);
    return () => window.clearTimeout(timer);
  }, [count, msPerChar, total]);

  useEffect(() => {
    if (done) return;
    const skip = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // 폼 입력 중에는 넘기지 않는다.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      setCount(total);
    };
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [done, total]);

  return (
    <p
      className={`gate-typewriter${done ? " is-done" : ""}`}
      onClick={() => {
        if (!done) setCount(total);
      }}
    >
      {renderSegments(reveal(segments, count))}
      {!done && (
        <span className="gate-type-caret" aria-hidden="true">
          ▍
        </span>
      )}
    </p>
  );
}
