export const CONSTRUCTION_PROJECT_STATUSES = [
  "QUEUED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ConstructionProjectStatus = (typeof CONSTRUCTION_PROJECT_STATUSES)[number];

export type CityBuildingDefinition = {
  id: string;
  maxLevel: number;
  slotCostPerLevel: number;
};

export type CityBuildingStack = {
  buildingType: string;
  level: number;
  damagedLevels: number;
};

export type CitySlotSummary = {
  capacity: number;
  used: number;
  available: number;
};

function nonNegativeInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${field} must be a non-negative integer`);
}

export function summarizeCitySlots(
  capacity: number,
  buildings: CityBuildingStack[],
  definitions: CityBuildingDefinition[],
): CitySlotSummary {
  nonNegativeInteger(capacity, "capacity");
  const definitionById = new Map(
    definitions.map((definition) => {
      if (!definition.id.trim()) throw new Error("building definition id is required");
      nonNegativeInteger(definition.maxLevel, `${definition.id}.maxLevel`);
      nonNegativeInteger(definition.slotCostPerLevel, `${definition.id}.slotCostPerLevel`);
      return [definition.id, definition] as const;
    }),
  );

  const used = buildings.reduce((total, building) => {
    nonNegativeInteger(building.level, `${building.buildingType}.level`);
    nonNegativeInteger(building.damagedLevels, `${building.buildingType}.damagedLevels`);
    if (building.damagedLevels > building.level) {
      throw new Error(`${building.buildingType}.damagedLevels cannot exceed level`);
    }
    const definition = definitionById.get(building.buildingType);
    if (!definition) throw new Error(`unknown building type: ${building.buildingType}`);
    if (building.level > definition.maxLevel) {
      throw new Error(`${building.buildingType}.level exceeds maxLevel`);
    }
    return total + building.level * definition.slotCostPerLevel;
  }, 0);

  return {
    capacity,
    used,
    available: Math.max(0, capacity - used),
  };
}
