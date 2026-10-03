import { DEVELOPMENT_PROGRESS_BOUNDARY } from "@/src/domain/development/tracks";

type DevelopmentTrackView = {
  key: string;
  label: string;
  higherIsBetter: boolean;
  maxStage: number;
  stage: number;
  stageLabel: string;
  progress: string;
};

export function DevelopmentTrackGrid({ tracks }: { tracks: DevelopmentTrackView[] }) {
  return (
    <div className="development-track-grid">
      {tracks.map((track) => {
        const progress = Number(track.progress);
        const offset = (Math.min(DEVELOPMENT_PROGRESS_BOUNDARY, Math.abs(progress)) / 300) * 100;
        const left = progress < 0 ? 50 - offset : 50;
        const favorable = track.higherIsBetter ? progress >= 0 : progress <= 0;
        return (
          <article className="development-track" key={track.key}>
            <header>
              <span>{track.label}</span>
              <strong>
                {track.stage}/{track.maxStage}단계
              </strong>
            </header>
            <em className="development-track-stage-label">{track.stageLabel}</em>
            <div
              className="development-track-meter"
              aria-label={`${track.label} ${track.stage}단계, 진척도 ${progress}`}
            >
              <i
                className={favorable ? "good" : "bad"}
                style={{ left: `${left}%`, width: `${offset}%` }}
              />
            </div>
            <footer>
              <small>-150</small>
              <b>{progress > 0 ? `+${progress}` : progress}</b>
              <small>+150</small>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
