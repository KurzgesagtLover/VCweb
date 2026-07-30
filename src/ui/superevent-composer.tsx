"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { saveSuperEventAction } from "@/src/actions/superevents";
import {
  SUPER_EVENT_AUDIO_LIBRARY,
  SUPER_EVENT_LIMITS,
  SUPER_EVENT_TEMPLATE_DEFAULTS,
  type SuperEventView,
} from "@/src/domain/superevents/template";
import { SuperEventStage } from "./superevent-stage";

export type SuperEventDraft = {
  id: string;
  audience: "ALL" | "COUNTRY";
  targetCountryId: string | null;
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
};

export function SuperEventComposer({
  countries,
  initial,
}: {
  countries: Array<{ id: string; name: string }>;
  initial: SuperEventDraft | null;
}) {
  const [audience, setAudience] = useState<"ALL" | "COUNTRY">(initial?.audience ?? "ALL");
  const [targetCountryId, setTargetCountryId] = useState(initial?.targetCountryId ?? "");
  const [codeName, setCodeName] = useState(
    initial?.codeName ?? SUPER_EVENT_TEMPLATE_DEFAULTS.codeName,
  );
  const [sourceLabel, setSourceLabel] = useState(
    initial?.sourceLabel ?? SUPER_EVENT_TEMPLATE_DEFAULTS.sourceLabel,
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [footnote, setFootnote] = useState(
    initial?.footnote ?? SUPER_EVENT_TEMPLATE_DEFAULTS.footnote,
  );
  const [stampText, setStampText] = useState(
    initial?.stampText ?? SUPER_EVENT_TEMPLATE_DEFAULTS.stampText,
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageAlt, setImageAlt] = useState(initial?.imageAlt ?? "");
  const [audioUrl, setAudioUrl] = useState(initial?.audioUrl ?? "");
  const [audioVolume, setAudioVolume] = useState(
    initial?.audioVolume ?? SUPER_EVENT_TEMPLATE_DEFAULTS.audioVolume,
  );
  const [audioStartSeconds, setAudioStartSeconds] = useState(
    initial?.audioStartSeconds ?? SUPER_EVENT_TEMPLATE_DEFAULTS.audioStartSeconds,
  );
  const [audioIntroReduced, setAudioIntroReduced] = useState(
    initial?.audioIntroReduced ?? SUPER_EVENT_TEMPLATE_DEFAULTS.audioIntroReduced,
  );
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [dismissLabel, setDismissLabel] = useState(
    initial?.dismissLabel ?? SUPER_EVENT_TEMPLATE_DEFAULTS.dismissLabel,
  );
  const [holdSeconds, setHoldSeconds] = useState(
    initial?.holdSeconds ?? SUPER_EVENT_TEMPLATE_DEFAULTS.holdSeconds,
  );
  const [uploading, setUploading] = useState<"image" | "audio" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const previewRampRef = useRef<number | null>(null);

  const view: SuperEventView = {
    id: initial?.id ?? "compose",
    codeName,
    sourceLabel,
    title: title.trim() || SUPER_EVENT_TEMPLATE_DEFAULTS.title,
    subtitle,
    body,
    footnote,
    stampText,
    imageUrl: imageUrl || null,
    imageAlt,
    audioUrl: audioUrl || null,
    audioVolume,
    audioStartSeconds,
    audioIntroReduced,
    dismissLabel,
    holdSeconds,
    broadcastAt: null,
  };

  useEffect(
    () => () => {
      if (previewRampRef.current !== null) cancelAnimationFrame(previewRampRef.current);
    },
    [],
  );

  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    const targetVolume = Math.min(1, Math.max(0, audioVolume / 100));
    audio.volume = audioIntroReduced ? targetVolume * 0.35 : targetVolume;
  }, [audioIntroReduced, audioVolume]);

  function selectAudio(nextUrl: string) {
    if (previewRampRef.current !== null) cancelAnimationFrame(previewRampRef.current);
    audioPreviewRef.current?.pause();
    setAudioUrl(nextUrl);
    setAudioDuration(null);
    setAudioStartSeconds(0);
  }

  function previewAudioFromStart() {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    if (previewRampRef.current !== null) cancelAnimationFrame(previewRampRef.current);

    const duration = Number.isFinite(audio.duration) ? audio.duration : audioStartSeconds;
    audio.currentTime = Math.min(audioStartSeconds, Math.max(0, duration - 0.1));
    const targetVolume = Math.min(1, Math.max(0, audioVolume / 100));
    audio.volume = audioIntroReduced ? targetVolume * 0.35 : targetVolume;
    void audio.play().catch(() => undefined);

    if (!audioIntroReduced || targetVolume === 0) return;
    const startedAt = performance.now();
    const ramp = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 5000);
      audio.volume = targetVolume * (0.35 + progress * 0.65);
      if (progress < 1) previewRampRef.current = requestAnimationFrame(ramp);
      else previewRampRef.current = null;
    };
    previewRampRef.current = requestAnimationFrame(ramp);
  }

  async function upload(kind: "image" | "audio", file: File) {
    setUploading(kind);
    setMessage(null);
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("file", file);
    try {
      const response = await fetch("/api/admin/superevents/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        setMessage(payload.error ?? "업로드에 실패했습니다.");
        return;
      }
      if (kind === "image") setImageUrl(payload.url);
      else selectAudio(payload.url);
    } catch {
      setMessage("업로드 중 연결이 끊겼습니다.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <>
      <form className="se-compose" action={saveSuperEventAction}>
        {initial && <input type="hidden" name="id" value={initial.id} />}

        <div className="se-field-row">
          <label className="se-field">
            <span>송출 대상</span>
            <select
              name="audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value as "ALL" | "COUNTRY")}
            >
              <option value="ALL">전체 국가</option>
              <option value="COUNTRY">국가 지정</option>
            </select>
          </label>
          <label className="se-field">
            <span>대상 국가</span>
            <select
              name="targetCountryId"
              value={targetCountryId}
              disabled={audience === "ALL"}
              onChange={(event) => setTargetCountryId(event.target.value)}
            >
              <option value="">선택 없음</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="se-field-row">
          <label className="se-field">
            <span>송출 코드</span>
            <input
              name="codeName"
              value={codeName}
              maxLength={SUPER_EVENT_LIMITS.codeName}
              onChange={(event) => setCodeName(event.target.value)}
            />
          </label>
          <label className="se-field">
            <span>확인 버튼 문구</span>
            <input
              name="dismissLabel"
              value={dismissLabel}
              maxLength={SUPER_EVENT_LIMITS.dismissLabel}
              onChange={(event) => setDismissLabel(event.target.value)}
            />
          </label>
        </div>

        <label className="se-field">
          <span>송출 주체</span>
          <input
            name="sourceLabel"
            value={sourceLabel}
            maxLength={SUPER_EVENT_LIMITS.sourceLabel}
            onChange={(event) => setSourceLabel(event.target.value)}
          />
        </label>

        <label className="se-field">
          <span>제목</span>
          <input
            name="title"
            value={title}
            required
            maxLength={SUPER_EVENT_LIMITS.title}
            placeholder="전 국가에 뜨는 큰 글씨"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="se-field">
          <span>부제 · 사진 자막</span>
          <input
            name="subtitle"
            value={subtitle}
            maxLength={SUPER_EVENT_LIMITS.subtitle}
            placeholder="사진 아래 자막으로 깔린다"
            onChange={(event) => setSubtitle(event.target.value)}
          />
        </label>

        <label className="se-field">
          <span>본문 · 빈 줄로 단락을 나눈다</span>
          <textarea
            name="body"
            value={body}
            maxLength={SUPER_EVENT_LIMITS.body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

        <div className="se-media">
          <div className="se-media-head">
            <span>사진</span>
            <div className="se-desk-actions">
              <label className="button secondary se-upload">
                {uploading === "image" ? "올리는 중" : "이미지 올리기"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload("image", file);
                  }}
                />
              </label>
              {imageUrl && (
                <button type="button" className="button danger" onClick={() => setImageUrl("")}>
                  비우기
                </button>
              )}
            </div>
          </div>
          {imageUrl ? (
            <div className="se-media-thumb">
              <Image src={imageUrl} alt="" fill sizes="24rem" unoptimized />
            </div>
          ) : (
            <div className="se-media-empty">사진 없이도 송출할 수 있습니다</div>
          )}
          <input type="hidden" name="imageUrl" value={imageUrl} />
          <label className="se-field">
            <span>사진 대체 텍스트</span>
            <input
              name="imageAlt"
              value={imageAlt}
              maxLength={200}
              onChange={(event) => setImageAlt(event.target.value)}
            />
          </label>
        </div>

        <div className="se-media">
          <div className="se-media-head">
            <span>오디오</span>
            <div className="se-desk-actions">
              <label className="button secondary se-upload">
                {uploading === "audio" ? "올리는 중" : "음원 올리기"}
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload("audio", file);
                  }}
                />
              </label>
              {audioUrl && (
                <button type="button" className="button danger" onClick={() => selectAudio("")}>
                  비우기
                </button>
              )}
            </div>
          </div>
          <label className="se-field">
            <span>보유 음원에서 고르기</span>
            <select value={audioUrl} onChange={(event) => selectAudio(event.target.value)}>
              <option value="">음원 없음</option>
              {SUPER_EVENT_AUDIO_LIBRARY.map((track) => (
                <option key={track.url} value={track.url}>
                  {track.label}
                </option>
              ))}
              {audioUrl && !SUPER_EVENT_AUDIO_LIBRARY.some((track) => track.url === audioUrl) && (
                <option value={audioUrl}>업로드한 음원</option>
              )}
            </select>
          </label>
          <p className="se-media-note">{audioUrl || "송출 중 반복 재생하며 배경 음악은 멈춘다"}</p>
          <input type="hidden" name="audioUrl" value={audioUrl} />
          {audioUrl && (
            <div className="se-audio-preview">
              <audio
                key={audioUrl}
                ref={audioPreviewRef}
                src={audioUrl}
                controls
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  setAudioDuration(Number.isFinite(duration) ? duration : null);
                  if (Number.isFinite(duration)) {
                    setAudioStartSeconds((current) =>
                      Math.min(current, Math.max(0, Math.floor(duration))),
                    );
                  }
                  const targetVolume = Math.min(1, Math.max(0, audioVolume / 100));
                  event.currentTarget.volume = audioIntroReduced
                    ? targetVolume * 0.35
                    : targetVolume;
                }}
              />
              <button
                type="button"
                className="button secondary"
                disabled={audioDuration === null}
                onClick={previewAudioFromStart}
              >
                설정 지점부터 듣기
              </button>
            </div>
          )}
          <div className="se-field-row">
            <label className="se-field">
              <span>시작 지점 · 초</span>
              <input
                type="number"
                name="audioStartSeconds"
                min={0}
                max={
                  audioDuration === null
                    ? SUPER_EVENT_LIMITS.audioStartSecondsMax
                    : Math.max(0, Math.floor(audioDuration))
                }
                step={1}
                value={audioStartSeconds}
                onChange={(event) => setAudioStartSeconds(Number(event.target.value))}
              />
            </label>
            <label className="se-field">
              <span>음량 {audioVolume}</span>
              <input
                type="range"
                name="audioVolume"
                min={0}
                max={100}
                value={audioVolume}
                onChange={(event) => setAudioVolume(Number(event.target.value))}
              />
            </label>
          </div>
          <label className="se-check">
            <input
              type="checkbox"
              name="audioIntroReduced"
              checked={audioIntroReduced}
              onChange={(event) => setAudioIntroReduced(event.target.checked)}
            />
            <span>도입부 음량 낮추기</span>
          </label>
        </div>

        <div className="se-field-row">
          <label className="se-field">
            <span>각인 문구</span>
            <input
              name="stampText"
              value={stampText}
              maxLength={SUPER_EVENT_LIMITS.stampText}
              onChange={(event) => setStampText(event.target.value)}
            />
          </label>
          <label className="se-field">
            <span>확인 대기 초</span>
            <input
              type="number"
              name="holdSeconds"
              min={0}
              max={SUPER_EVENT_LIMITS.holdSecondsMax}
              value={holdSeconds}
              onChange={(event) => setHoldSeconds(Number(event.target.value))}
            />
          </label>
        </div>

        <label className="se-field">
          <span>각주</span>
          <input
            name="footnote"
            value={footnote}
            maxLength={SUPER_EVENT_LIMITS.footnote}
            onChange={(event) => setFootnote(event.target.value)}
          />
        </label>

        {message && <p className="form-message">{message}</p>}

        <div className="se-compose-actions">
          <button name="intent" value="SAVE" className="button secondary">
            초안 저장
          </button>
          <button name="intent" value="BROADCAST" className="button danger">
            저장 후 즉시 송출
          </button>
          <button type="button" className="button secondary" onClick={() => setFullscreen(true)}>
            전체 화면으로 확인
          </button>
        </div>
      </form>

      <div className="se-preview-panel">
        <div className="panel-head">
          <h2>송출 미리보기</h2>
          <span className="muted">플레이어 화면에 그대로 뜨는 모습입니다.</span>
        </div>
        <div className="se-monitor">
          <SuperEventStage view={view} mode="embed" />
        </div>
      </div>

      {fullscreen && (
        <SuperEventStage view={view} mode="preview" onDismiss={() => setFullscreen(false)} />
      )}
    </>
  );
}
