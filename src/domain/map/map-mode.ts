export const MAP_MODES = ["GDP", "GDP_PER_CAPITA", "POPULATION", "BLOC", "ECONOMIC_BLOC"] as const;

export type MapMode = (typeof MAP_MODES)[number];

export function parseMapMode(value: string | null): MapMode | null {
  return MAP_MODES.find((mode) => mode === value) ?? null;
}

function channel(start: number, end: number, ratio: number) {
  return Math.round(start + (end - start) * ratio)
    .toString(16)
    .padStart(2, "0");
}

export function quantitativeMapColors(values: Array<{ countryId: string; value: number | null }>) {
  const positive = values
    .map(({ value }) => value)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .map(Math.log10);
  if (!positive.length) return new Map<string, string>();
  const minimum = Math.min(...positive);
  const maximum = Math.max(...positive);
  const span = Math.max(maximum - minimum, 1);

  return new Map(
    values.map(({ countryId, value }) => {
      if (value === null || !Number.isFinite(value) || value <= 0) return [countryId, "#343A40"];
      const ratio = Math.max(0, Math.min(1, (Math.log10(value) - minimum) / span));
      const eased = Math.pow(ratio, 0.72);
      return [
        countryId,
        `#${channel(28, 239, eased)}${channel(62, 196, eased)}${channel(83, 74, eased)}`,
      ];
    }),
  );
}
