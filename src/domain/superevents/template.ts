/**
 * 송출은 두 겹으로 이뤄진다. 앞에 붙는 호외(일반 이벤트)는 신문 지면 한 장이고,
 * 뒤에 오는 슈퍼이벤트는 화면 전체를 덮는 전대역 송출이다.
 * 둘 다 골격은 하나뿐이며, 관리자는 사진·영상·음원·문구만 끼워 넣는다.
 */
export type SuperEventBulletinView = {
  outlet: string;
  section: string;
  headline: string;
  byline: string;
  body: string;
  imageUrl: string | null;
  imageCaption: string;
  kicker: string;
};

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
  videoUrl: string | null;
  videoSound: boolean;
  audioUrl: string | null;
  audioVolume: number;
  audioStartSeconds: number;
  audioIntroReduced: boolean;
  dismissLabel: string;
  holdSeconds: number;
  broadcastAt: string | null;
  /** 호외 없이 곧바로 전대역 송출만 띄우는 경우 null. */
  bulletin: SuperEventBulletinView | null;
  /** 호외만 내보내고 끝내는 경우 false. */
  superEnabled: boolean;
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
  videoSound: false,
} as const;

export const SUPER_EVENT_BULLETIN_DEFAULTS = {
  outlet: "GLOBAL WIRE",
  section: "세계 | 체제 | 경제 | 기술 | 기록",
  headline: "",
  byline: "글로벌 와이어 편집부",
  body: "",
  imageCaption: "",
  kicker: "계속 읽기",
} as const;

/** 편성 화면에서 곧바로 고를 수 있는 기존 OST. 별도 업로드 없이 재사용한다. */
export const SUPER_EVENT_AUDIO_LIBRARY = [
  { url: "/ost/general-05.mp3", label: "총력 (general-05)" },
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
  bulletinOutlet: 40,
  bulletinSection: 120,
  bulletinHeadline: 120,
  bulletinByline: 60,
  bulletinBody: 6000,
  bulletinImageCaption: 200,
  bulletinKicker: 60,
} as const;

/** 빈 줄로 나뉜 단락을 화면 단락으로 끊는다. 폼 전송은 줄바꿈을 CRLF로 바꿔 보낸다. */
export function splitSuperEventBody(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** 섹션 바는 세로줄이나 쉼표로 끊어 적는다. */
export function splitBulletinSections(section: string): string[] {
  return section
    .split(/[|,·]/)
    .map((item) => item.trim())
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

export function formatBulletinDate(broadcastAt: string | null): string {
  const moment = broadcastAt ? new Date(broadcastAt) : new Date();
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(moment);
}
