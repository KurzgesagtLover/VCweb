"use client";

import { useState } from "react";
import { updateMapResolutionAction } from "@/src/actions/map";

export function MapResolutionForm({
  campaignId,
  mapId,
  expectedRevision,
  resolution: initialResolution,
  adaptiveResolution: initialAdaptiveResolution,
}: {
  campaignId: string;
  mapId: string;
  expectedRevision: number;
  resolution: number;
  adaptiveResolution: boolean;
}) {
  const [resolution, setResolution] = useState(initialResolution);
  const [adaptiveResolution, setAdaptiveResolution] = useState(initialAdaptiveResolution);

  return (
    <form
      action={updateMapResolutionAction}
      onSubmit={(event) => {
        if (
          !adaptiveResolution &&
          resolution >= 6 &&
          !window.confirm(
            `${resolution}단계 고정 해상도는 매우 많은 셀과 전역 요청을 생성할 수 있습니다. 계속하시겠습니까?`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="mapId" value={mapId} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      <label>
        헥사곤 해상도
        <select
          name="resolution"
          value={resolution}
          onChange={(event) => setResolution(Number(event.target.value))}
        >
          {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value}단계
            </option>
          ))}
        </select>
      </label>
      <label className="toggle-control">
        <input
          type="checkbox"
          name="adaptiveResolution"
          value="yes"
          checked={adaptiveResolution}
          onChange={(event) => setAdaptiveResolution(event.target.checked)}
        />
        <span>자동 해상도 조절</span>
      </label>
      <label className="toggle-control">
        <input type="checkbox" name="confirm" value="yes" required />
        <span>경계 재계산 확인</span>
      </label>
      <button type="submit">해상도 적용</button>
    </form>
  );
}
