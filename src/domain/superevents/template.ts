/**
 * 슈퍼이벤트 템플릿은 한 종류뿐이다. 관리자는 이 골격에 사진·오디오·문구만 끼워 넣고,
 * 전 국가에 같은 화면이 강제로 뜬다.
 */
export type SuperEventView = {
  id: string;
  codeName: string;
  sourceLabel: string;
  title: string;
  subtitle: string;
  body: string;
  footnote: string;
  stampText: string;
  imageUrl: string | null;
  imageAlt: string;
  audioUrl: string | null;
  audioVolume: number;
  audioStartSeconds: number;
  audioIntroReduced: boolean;
  dismissLabel: string;
  holdSeconds: number;
  broadcastAt: string | null;
};

export const SUPER_EVENT_TEMPLATE_DEFAULTS = {
  codeName: "SE-000",
  sourceLabel: "중앙방송위원회 // 전대역 송출",
  title: "제목 없는 송출",
  subtitle: "",
  body: "",
  footnote: "이 송출은 기록되며, 열람 사실은 보고됩니다.",
  stampText: "체제 승인",
  dismissLabel: "확인했습니다",
  holdSeconds: 4,
  audioVolume: 70,
  audioStartSeconds: 0,
  audioIntroReduced: false,
} as const;

/** 편성 화면에서 곧바로 고를 수 있는 기존 OST. 별도 업로드 없이 재사용한다. */
export const SUPER_EVENT_AUDIO_LIBRARY = [
  { url: "/ost/general-05.mp3", label: "총력 (general-05)" },
  { url: "/ost/general-02.mp3", label: "장송 (general-02)" },
  { url: "/ost/general-06.mp3", label: "경보 (general-06)" },
  { url: "/ost/general-08.mp3", label: "정적 (general-08)" },
  { url: "/ost/general-11.mp3", label: "행진 (general-11)" },
] as const;

export const SUPER_EVENT_LIMITS = {
  title: 90,
  subtitle: 140,
  body: 4000,
  footnote: 200,
  codeName: 24,
  sourceLabel: 60,
  stampText: 24,
  dismissLabel: 24,
  audioStartSecondsMax: 7200,
  holdSecondsMax: 30,
} as const;

/** 빈 줄로 나뉜 단락을 화면 단락으로 끊는다. */
export function splitSuperEventBody(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function formatSuperEventStamp(broadcastAt: string | null): string {
  const moment = broadcastAt ? new Date(broadcastAt) : new Date();
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(moment);
}
