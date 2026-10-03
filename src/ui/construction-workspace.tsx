"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type {
  ConstructionBuilding,
  ConstructionCity,
  ConstructionProject,
} from "@/src/db/queries/construction";
import {
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_FACILITIES,
  CONSTRUCTION_FACILITY_BY_ID,
  type ConstructionCategoryId,
  type ConstructionFacility,
} from "@/src/domain/construction/catalog";

export type ConstructionWorkspaceProps = {
  cities: ConstructionCity[];
  buildings: ConstructionBuilding[];
  projects: ConstructionProject[];
  turnOpen: boolean;
  compact?: boolean;
  selectedCityId?: string;
  onSelectCity?: (cityId: string) => void;
};

const populationFormatter = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function FacilityIcon({ facility }: { facility: ConstructionFacility }) {
  const artwork = (() => {
    switch (facility.icon) {
      case "campus":
        return <><path d="M4 20V9l8-5 8 5v11M8 20v-6h8v6M2 20h20" /><path d="M12 4v5" /></>;
      case "university":
        return <><path d="m3 9 9-5 9 5-9 5zM6 12v6M10 14v4M14 14v4M18 12v6M4 20h16" /></>;
      case "institute":
        return <><path d="M5 20V7h14v13M9 7V4h6v3M8 11h2M14 11h2M8 15h2M14 15h2M11 20v-4h2v4" /></>;
      case "accelerator":
        return <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M4 12h6M14 12h6M12 4v6M12 14v6" /></>;
      case "telescope":
        return <><path d="m6 6 10-3 2 5-10 3zM9 11l3 4M14 9l-2 6M12 15 7 21M12 15l5 6M7 21h10" /></>;
      case "fusion":
        return <><ellipse cx="12" cy="12" rx="9" ry="3.5" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" /><circle cx="12" cy="12" r="1.5" /></>;
      case "biology":
        return <><path d="M8 3c8 4 0 14 8 18M16 3C8 7 16 17 8 21M9 7h6M8 12h8M9 17h6" /></>;
      case "utilities":
        return <><path d="M7 4v6a5 5 0 0 0 10 0V4M5 7h4M15 7h4M12 15v6" /><path d="M9 21h6" /></>;
      case "transport":
        return <><rect x="5" y="3" width="14" height="16" rx="3" /><path d="M8 7h8M8 12h8M8 16h.1M16 16h.1M8 21l2-2M16 21l-2-2" /></>;
      case "logistics":
        return <><path d="M3 7h12v11H3zM15 11h4l2 3v4h-6zM6 7V4h6v3" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>;
      case "airport":
        return <><path d="m3 14 8-2V5c0-1 .5-2 1-2s1 1 1 2v7l8 2v2l-8-1v4l3 2v1l-4-1-4 1v-1l3-2v-4l-8 1z" /></>;
      case "harbor":
        return <><path d="M12 3v15M8 7h8M5 12H2c0 5 4 9 10 9s10-4 10-9h-3M8 17l4 4 4-4" /><circle cx="12" cy="5" r="2" /></>;
      case "nuclear":
        return <><circle cx="12" cy="12" r="2" /><path d="M12 10c-2-4-4-6-6-5-2 1-1 5 2 8M10 13c-4 0-7 1-7 4 1 3 5 3 9 1M14 13c2 4 5 6 7 4 2-2 0-5-4-7" /></>;
      case "renewable":
        return <><circle cx="12" cy="12" r="2" /><path d="M12 10c0-5 2-7 4-7 2 1 2 4-2 8M14 13c4 2 5 5 4 7-2 1-5 0-6-5M10 13c-4 3-7 2-8 0 0-2 3-4 8-2M12 15v7" /></>;
      case "dam":
        return <><path d="M5 4h14l-2 16H7zM3 20h18M8 8h8M8 12h8M9 16h6" /></>;
    }
  })();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {artwork}
    </svg>
  );
}

function usedSlots(buildings: ConstructionBuilding[]) {
  return buildings.reduce(
    (sum, building) =>
      sum +
      building.level * (CONSTRUCTION_FACILITY_BY_ID.get(building.buildingType)?.slotCostPerLevel ?? 0),
    0,
  );
}

function reservedSlots(projects: ConstructionProject[]) {
  return projects.reduce(
    (sum, project) =>
      sum + (CONSTRUCTION_FACILITY_BY_ID.get(project.buildingType)?.slotCostPerLevel ?? 0),
    0,
  );
}

export function ConstructionWorkspace({
  cities,
  buildings,
  projects,
  turnOpen,
  compact = false,
  selectedCityId: controlledCityId,
  onSelectCity,
}: ConstructionWorkspaceProps) {
  const router = useRouter();
  const [internalCityId, setInternalCityId] = useState(cities[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<ConstructionCategoryId>(
    CONSTRUCTION_CATEGORIES[0].id,
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCityId = controlledCityId ?? internalCityId;
  const selectedCity = cities.find((city) => city.id === selectedCityId) ?? cities[0] ?? null;
  const effectiveCityId = selectedCity?.id ?? "";
  const cityBuildings = buildings.filter((building) => building.campaignCityId === effectiveCityId);
  const cityProjects = projects
    .filter((project) => project.campaignCityId === effectiveCityId)
    .sort((left, right) => left.queuePosition - right.queuePosition);
  const occupied = usedSlots(cityBuildings);
  const reserved = reservedSlots(cityProjects);
  const available = Math.max(0, (selectedCity?.slotCapacity ?? 0) - occupied - reserved);
  const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
  const visibleCities = useMemo(
    () =>
      cities
        .filter((city) => !normalizedSearch || city.name.toLocaleLowerCase("ko-KR").includes(normalizedSearch))
        .slice(0, 160),
    [cities, normalizedSearch],
  );
  const category = CONSTRUCTION_CATEGORIES.find((item) => item.id === categoryId)!;
  const facilities = CONSTRUCTION_FACILITIES.filter((facility) => facility.categoryId === categoryId);

  function selectCity(cityId: string) {
    if (onSelectCity) onSelectCity(cityId);
    else setInternalCityId(cityId);
  }

  async function requestProject(buildingType: string) {
    if (!selectedCity || busy) return;
    setBusy(buildingType);
    setMessage(null);
    const response = await fetch("/api/construction/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignCityId: selectedCity.id, buildingType }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!response.ok) {
      setMessage(body.error ?? "건설 지시를 저장하지 못했습니다.");
      return;
    }
    setMessage("건설 대기열에 추가했습니다.");
    router.refresh();
  }

  async function cancelProject(projectId: string) {
    if (busy) return;
    setBusy(projectId);
    setMessage(null);
    const response = await fetch("/api/construction/projects", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!response.ok) {
      setMessage(body.error ?? "건설 지시를 취소하지 못했습니다.");
      return;
    }
    setMessage("건설 지시를 취소했습니다.");
    router.refresh();
  }

  return (
    <div
      className={`construction-workspace ${compact ? "construction-workspace-map" : ""}`}
      style={
        compact
          ? ({
              "--construction-edge": "#4f969b",
              "--construction-edge-strong": "#86e7e3",
              borderColor: "rgba(134, 231, 227, 0.72)",
            } as CSSProperties)
          : undefined
      }
    >
      <aside className="construction-city-panel">
        <header>
          <div>
            <span>도시</span>
            <strong>{cities.length}</strong>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="도시 검색"
            aria-label="건설 도시 검색"
          />
        </header>
        <div className="construction-city-list">
          {visibleCities.map((city) => {
            const cityQueue = projects.filter((project) => project.campaignCityId === city.id).length;
            const active = city.id === effectiveCityId;
            return (
              <button
                type="button"
                className={active ? "active" : ""}
                onClick={() => selectCity(city.id)}
                key={city.id}
              >
                <span className="construction-city-marker" aria-hidden="true">{city.isCapital ? "◆" : "■"}</span>
                <span>
                  <b>{city.name}</b>
                  <small>인구 {populationFormatter.format(city.population)}</small>
                </span>
                <em>{cityQueue ? `${cityQueue}건` : `${city.slotCapacity}칸`}</em>
              </button>
            );
          })}
          {!visibleCities.length && <p>검색 결과가 없습니다.</p>}
          {cities.length > visibleCities.length && !normalizedSearch && (
            <small className="construction-city-limit">상위 160개 도시 표시 · 검색으로 나머지 도시 선택</small>
          )}
        </div>
      </aside>

      <main className="construction-city-detail">
        {selectedCity ? (
          <>
            <header className="construction-city-heading">
              <div>
                <span>{selectedCity.isCapital ? "수도" : "도시"}</span>
                <h3>{selectedCity.name}</h3>
                <p>인구 {selectedCity.population.toLocaleString("ko-KR")}명 · {selectedCity.populationYear}년 기준</p>
                {compact && <small className="construction-map-hint">지도 위 청록색 도시 표식을 눌러 대상 변경</small>}
              </div>
              <div className="construction-slot-readout">
                <span>건설 슬롯</span>
                <strong>{occupied + reserved}/{selectedCity.slotCapacity}</strong>
                <div aria-label={`사용 또는 예약 ${occupied + reserved} / ${selectedCity.slotCapacity}`}>
                  <i style={{ width: `${Math.min(100, ((occupied + reserved) / Math.max(1, selectedCity.slotCapacity)) * 100)}%` }} />
                </div>
                <small>가동 {occupied} · 예약 {reserved} · 여유 {available}</small>
              </div>
            </header>

            <section className="construction-queue-panel">
              <div className="construction-section-title">
                <h4>건설 대기열</h4>
                <span>{cityProjects.length}건</span>
              </div>
              {cityProjects.length ? (
                <ol>
                  {cityProjects.map((project, index) => {
                    const facility = CONSTRUCTION_FACILITY_BY_ID.get(project.buildingType);
                    const progress = Math.min(100, (Number(project.progress) / Math.max(1, Number(project.requiredWork))) * 100);
                    return (
                      <li key={project.id}>
                        <span className="construction-queue-order">{String(index + 1).padStart(2, "0")}</span>
                        {facility && <span className="construction-mini-icon"><FacilityIcon facility={facility} /></span>}
                        <span className="construction-queue-name">
                          <b>{facility?.name ?? project.buildingType}</b>
                          <small>목표 {project.targetLevel}단계 · {project.status === "ACTIVE" ? "건설 중" : project.status === "PAUSED" ? "중지" : "대기"}</small>
                        </span>
                        <span className="construction-queue-progress"><i style={{ width: `${progress}%` }} /></span>
                        <button type="button" onClick={() => cancelProject(project.id)} disabled={!turnOpen || busy !== null} aria-label={`${facility?.name ?? project.buildingType} 건설 취소`}>×</button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="construction-empty">예약된 건설이 없습니다. 오른쪽 시설 목록에서 추가하십시오.</p>
              )}
            </section>

            <section className="construction-built-panel">
              <div className="construction-section-title">
                <h4>도시 시설</h4>
                <span>{cityBuildings.filter((building) => building.level > 0).length}종</span>
              </div>
              {cityBuildings.some((building) => building.level > 0) ? (
                <div className="construction-built-grid">
                  {cityBuildings.filter((building) => building.level > 0).map((building) => {
                    const facility = CONSTRUCTION_FACILITY_BY_ID.get(building.buildingType);
                    if (!facility) return null;
                    return (
                      <article key={building.id}>
                        <span><FacilityIcon facility={facility} /></span>
                        <b>{facility.name}</b>
                        <em>{building.level}/{facility.maxLevel}</em>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="construction-empty">등록된 도시 시설이 없습니다.</p>
              )}
            </section>
          </>
        ) : (
          <div className="construction-no-city">
            <strong>건설 가능한 도시가 없습니다.</strong>
            <p>현재 지도에서 통제 중인 도시가 배정되면 이곳에 표시됩니다.</p>
          </div>
        )}
      </main>

      <aside className="construction-catalog-panel">
        <nav aria-label="건설 시설 분류">
          {CONSTRUCTION_CATEGORIES.map((item) => (
            <button
              type="button"
              className={item.id === categoryId ? "active" : ""}
              onClick={() => setCategoryId(item.id)}
              key={item.id}
            >
              <span>{item.id === "BASIC_RESEARCH_EDUCATION" ? "▦" : item.id === "ADVANCED_RESEARCH" ? "⚛" : item.id === "INFRASTRUCTURE" ? "⌁" : "◆"}</span>
              {item.shortName}
            </button>
          ))}
        </nav>
        <header>
          <span>시설 분류</span>
          <h3>{category.name}</h3>
          <p>{category.description}</p>
        </header>
        <div className="construction-facility-list">
          {facilities.map((facility) => {
            const currentLevel = cityBuildings.find((building) => building.buildingType === facility.id)?.level ?? 0;
            const pending = cityProjects.filter((project) => project.buildingType === facility.id).length;
            const targetLevel = currentLevel + pending + 1;
            const maxed = targetLevel > facility.maxLevel;
            const noSlot = facility.slotCostPerLevel > available;
            return (
              <article key={facility.id} data-disabled={maxed || noSlot || !selectedCity || !turnOpen}>
                <span className="construction-facility-icon"><FacilityIcon facility={facility} /></span>
                <div>
                  <h4>{facility.name}</h4>
                  <p>{facility.description}</p>
                  <small>{facility.slotCostPerLevel ? `슬롯 ${facility.slotCostPerLevel}칸` : "도시 기반시설"} · 최대 {facility.maxLevel}단계</small>
                </div>
                <div className="construction-facility-action">
                  <em>{currentLevel}{pending ? ` + ${pending}` : ""}/{facility.maxLevel}</em>
                  <button type="button" onClick={() => requestProject(facility.id)} disabled={!selectedCity || !turnOpen || maxed || noSlot || busy !== null}>
                    {busy === facility.id ? "처리 중" : maxed ? "최고 단계" : noSlot ? "슬롯 부족" : `${targetLevel}단계 건설`}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <footer aria-live="polite">
          <span className={!turnOpen ? "bad" : ""}>{!turnOpen ? "현재 턴의 건설 지시가 마감되었습니다." : message ?? "도시를 고른 뒤 시설을 대기열에 추가하십시오."}</span>
        </footer>
      </aside>
    </div>
  );
}
