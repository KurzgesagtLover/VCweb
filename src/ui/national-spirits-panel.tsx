import { SPIRIT_CATEGORY_LABELS, SPIRIT_SOURCE_LABELS } from "@/src/domain/spirits/model";
import type { SpiritPanel } from "@/src/services/spirits";

function period(startsOn: string, endsOn: string | null) {
  return endsOn ? `${startsOn} ~ ${endsOn}` : `${startsOn} ~ 해제 시까지`;
}

export function NationalSpiritsPanel({ panel }: { panel: SpiritPanel }) {
  const items = [
    ...panel.world.map((spirit) => ({
      key: spirit.key,
      name: spirit.name,
      description: spirit.description,
      category: spirit.category,
      effects: spirit.effects,
      footer: `${SPIRIT_SOURCE_LABELS.WORLD} · ${spirit.sourceLabel}`,
      pending: false,
    })),
    ...panel.country.map((spirit) => ({
      key: spirit.key,
      name: spirit.name,
      description: spirit.description,
      category: spirit.category,
      effects: spirit.effects,
      footer: `${SPIRIT_SOURCE_LABELS[spirit.sourceType] ?? spirit.sourceType} · ${period(
        spirit.startsOn,
        spirit.endsOn,
      )}`,
      pending: spirit.pending,
    })),
  ];
  if (!items.length) return <p>붙어 있는 국가정신이 없습니다.</p>;
  return (
    <div className="spirit-grid">
      {items.map((spirit) => (
        <article className="spirit-card" key={spirit.key} data-category={spirit.category}>
          <header>
            <span>{SPIRIT_CATEGORY_LABELS[spirit.category] ?? spirit.category}</span>
            <strong>{spirit.name}</strong>
            {spirit.pending ? <em>다음 턴부터</em> : null}
          </header>
          {spirit.description ? <p>{spirit.description}</p> : null}
          <div className="tno-tag-row">
            {spirit.effects.length ? (
              spirit.effects.map((line) => <span key={line}>{line}</span>)
            ) : (
              <span>효과 없음</span>
            )}
          </div>
          <small>{spirit.footer}</small>
        </article>
      ))}
    </div>
  );
}
