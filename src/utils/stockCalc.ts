import { ApiPartMaterial, ApiSubmarinePart, InProgressOrder } from '../api/types';

/**
 * Materials purchasable from an NPC vendor are treated as infinitely available —
 * they can always be bought for gil, so they never bottleneck a craft.
 */
export function isNpcAvailable(material: ApiPartMaterial['material']): boolean {
  return material.npcPrice !== null && material.npcPrice !== undefined;
}

/**
 * Builds a map of { materialId → qty } representing all ingredients already
 * committed to in-progress orders (the only orders that are actively being built).
 */
export function computeCommittedMaterials(
  inProgressOrders: InProgressOrder[],
  partsById: Record<string, ApiSubmarinePart>
): Record<string, number> {
  const committed: Record<string, number> = {};

  inProgressOrders.forEach((order) => {
    order.items.forEach((item) => {
      const recipe = partsById[item.partId];
      if (!recipe?.materials?.length) return;

      recipe.materials.forEach((mat) => {
        committed[mat.material.id] =
          (committed[mat.material.id] ?? 0) + mat.quantity * item.quantity;
      });
    });
  });

  return committed;
}

/**
 * Builds a map of { materialId → availableQty }: live inventory stock minus
 * everything already committed to in-progress orders.
 */
export function computeAvailableMaterials(
  parts: ApiSubmarinePart[],
  committed: Record<string, number>
): Record<string, number> {
  const available: Record<string, number> = {};

  parts.forEach((part) => {
    (part.materials ?? []).forEach((mat) => {
      if (!(mat.material.id in available)) {
        available[mat.material.id] = isNpcAvailable(mat.material)
          ? Number.POSITIVE_INFINITY
          : mat.material.currentStock;
      }
    });
  });

  Object.entries(committed).forEach(([id, qty]) => {
    if (available[id] !== Number.POSITIVE_INFINITY) {
      available[id] = (available[id] ?? 0) - qty;
    }
  });

  return available;
}

export interface CraftabilityResult {
  /** How many units can be made with available materials (0 when no recipe). */
  craftable: number;
  /** True when the selection has a material recipe at all. */
  hasRecipe: boolean;
  /** Ingredients that fall short, with resolved material names. */
  bottlenecks: { name: string; available: number; needed: number }[];
}

/**
 * Solves the min-craftable count over a demand map of
 * { materialId → { name, needed } } against the available stock map.
 */
function solveCraftable(
  demand: Map<string, { name: string; needed: number }>,
  availableMaterials: Record<string, number>
): CraftabilityResult {
  if (demand.size === 0) {
    return { craftable: 0, hasRecipe: false, bottlenecks: [] };
  }

  let craftable = Number.POSITIVE_INFINITY;
  const bottlenecks: { name: string; available: number; needed: number }[] = [];

  demand.forEach(({ name, needed }, materialId) => {
    const available = availableMaterials[materialId] ?? 0;
    if (available === Number.POSITIVE_INFINITY) return;

    const canMake = needed > 0 ? Math.floor(available / needed) : Number.POSITIVE_INFINITY;
    if (canMake < craftable) craftable = canMake;
    if (available < needed) {
      bottlenecks.push({ name, available: Math.max(0, available), needed });
    }
  });

  return {
    craftable: craftable === Number.POSITIVE_INFINITY ? 0 : Math.max(0, craftable),
    hasRecipe: true,
    bottlenecks,
  };
}

/** How many units of a single part can be crafted given available materials. */
export function computePartCraftable(
  part: ApiSubmarinePart | null,
  availableMaterials: Record<string, number>
): CraftabilityResult {
  const demand = new Map<string, { name: string; needed: number }>();
  (part?.materials ?? []).forEach((mat) => {
    demand.set(mat.material.id, { name: mat.material.name, needed: mat.quantity });
  });
  return solveCraftable(demand, availableMaterials);
}

/**
 * How many complete copies of the given selection (one unit of each part) can be
 * crafted with the available materials.
 */
export function computeSetCraftable(
  selectedParts: ApiSubmarinePart[],
  availableMaterials: Record<string, number>
): CraftabilityResult {
  const demand = new Map<string, { name: string; needed: number }>();
  selectedParts.forEach((part) => {
    (part.materials ?? []).forEach((mat) => {
      const existing = demand.get(mat.material.id);
      if (existing) {
        existing.needed += mat.quantity;
      } else {
        demand.set(mat.material.id, { name: mat.material.name, needed: mat.quantity });
      }
    });
  });
  return solveCraftable(demand, availableMaterials);
}
