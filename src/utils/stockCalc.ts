import { ApiMaterial, ApiSubmarinePart, InProgressOrder } from '../api/types';

/**
 * Materials purchasable from an NPC vendor are treated as infinitely available —
 * they can always be bought for gil, so they never bottleneck a craft.
 */
export function isNpcAvailable(material: ApiMaterial): boolean {
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
 *
 * Stock is taken from the /inventory/missing feed when available (it is the
 * authoritative "what do I have right now" source) and falls back to the
 * currentStock embedded in the recipes payload.
 */
export function computeAvailableMaterials(
  parts: ApiSubmarinePart[],
  committed: Record<string, number>,
  stockOverrides?: Record<string, number>
): Record<string, number> {
  const available: Record<string, number> = {};

  parts.forEach((part) => {
    (part.materials ?? []).forEach((mat) => {
      if (!(mat.material.id in available)) {
        const override = stockOverrides?.[mat.material.id];
        available[mat.material.id] = isNpcAvailable(mat.material)
          ? Number.POSITIVE_INFINITY
          : override !== undefined && override >= 0
            ? override
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

export interface MaterialShortfall {
  name: string;
  /** Stock on hand (clamped at 0), NPC materials are never short. */
  available: number;
  /** Total quantity required. */
  needed: number;
  /** needed − available. */
  missing: number;
}

function buildShortfall(
  name: string,
  needed: number,
  available: number
): MaterialShortfall {
  const stock = Math.max(0, Math.floor(available));
  return {
    name,
    available: stock,
    needed,
    missing: Math.max(0, needed - stock),
  };
}

export interface CraftabilityResult {
  /** How many units can be made with available materials (0 when no recipe). */
  craftable: number;
  /** True when the selection has a material recipe at all. */
  hasRecipe: boolean;
  /** Ingredients that fall short for the requested quantity. */
  bottlenecks: MaterialShortfall[];
}

/**
 * Solves the min-craftable count over a demand map of
 * { materialId → { name, unitNeed } } against the available stock map.
 * Bottlenecks are reported for `quantity` requested units.
 */
function solveCraftable(
  demand: Map<string, { name: string; unitNeed: number }>,
  availableMaterials: Record<string, number>,
  quantity: number
): CraftabilityResult {
  if (demand.size === 0) {
    return { craftable: 0, hasRecipe: false, bottlenecks: [] };
  }

  let craftable = Number.POSITIVE_INFINITY;
  const bottlenecks: MaterialShortfall[] = [];

  demand.forEach(({ name, unitNeed }, materialId) => {
    const available = availableMaterials[materialId] ?? 0;
    if (available === Number.POSITIVE_INFINITY) return;

    const canMake = unitNeed > 0 ? Math.floor(Math.max(0, available) / unitNeed) : Number.POSITIVE_INFINITY;
    if (canMake < craftable) craftable = canMake;
    if (available < unitNeed * quantity) {
      bottlenecks.push(buildShortfall(name, unitNeed * quantity, available));
    }
  });

  return {
    craftable: craftable === Number.POSITIVE_INFINITY ? 0 : Math.max(0, craftable),
    hasRecipe: true,
    bottlenecks,
  };
}

/**
 * How many units of a single part can be crafted given available materials.
 * `quantity` (default 1) scales the bottleneck report to the requested amount.
 */
export function computePartCraftable(
  part: ApiSubmarinePart | null,
  availableMaterials: Record<string, number>,
  quantity = 1
): CraftabilityResult {
  const demand = new Map<string, { name: string; unitNeed: number }>();
  (part?.materials ?? []).forEach((mat) => {
    demand.set(mat.material.id, { name: mat.material.name, unitNeed: mat.quantity });
  });
  return solveCraftable(demand, availableMaterials, Math.max(1, quantity));
}

export interface OrderAvailabilityResult {
  /** Total part units requested across all builds. */
  totalUnits: number;
  /** Part units fully covered by finished part stock. */
  readyUnits: number;
  /** Part units the current materials could cover (whole-order scale). */
  coveredUnits: number;
  /** coveredUnits / totalUnits as a 0–100 integer percentage. */
  coveragePct: number;
  /** True when no material falls short for the whole order. */
  complete: boolean;
  /** Materials the order is short on, sorted by missing amount (desc). */
  shortfalls: MaterialShortfall[];
  /** Spare part units the leftover materials could additionally cover. */
  surplusUnits: number;
}

/**
 * Checks the entire order (every part, at its requested quantity, across all
 * builds) against available materials:
 *  - aggregates per-material demand,
 *  - keeps NPC materials out of the equation,
 *  - reports the exact shortfalls ("just missing a couple components"),
 *  - scales coverage across the order ("materials for ~8 of 10 parts").
 */
export function computeOrderAvailability(
  requests: { part: ApiSubmarinePart; quantity: number }[],
  availableMaterials: Record<string, number>
): OrderAvailabilityResult {
  const empty: OrderAvailabilityResult = {
    totalUnits: 0,
    readyUnits: 0,
    coveredUnits: 0,
    coveragePct: 100,
    complete: true,
    shortfalls: [],
    surplusUnits: 0,
  };

  if (requests.length === 0) return empty;

  const demand = new Map<string, string>(); // materialId → name
  const needed = new Map<string, number>(); // materialId → total qty
  let totalUnits = 0;
  let readyUnits = 0;
  let craftUnits = 0;

  requests.forEach(({ part, quantity }) => {
    if (quantity <= 0) return;
    totalUnits += quantity;
    const ready = Math.min(quantity, Math.max(0, part.stock));
    readyUnits += ready;
    // Only units beyond finished stock actually consume crafting materials
    const toCraft = quantity - ready;
    if (toCraft <= 0) return;
    craftUnits += toCraft;
    (part.materials ?? []).forEach((mat) => {
      if (isNpcAvailable(mat.material)) return;
      needed.set(mat.material.id, (needed.get(mat.material.id) ?? 0) + mat.quantity * toCraft);
      demand.set(mat.material.id, mat.material.name);
    });
  });

  if (totalUnits === 0) return empty;

  let minRatio = Number.POSITIVE_INFINITY;
  const shortfalls: MaterialShortfall[] = [];

  needed.forEach((qty, materialId) => {
    const available = availableMaterials[materialId] ?? 0;
    if (available === Number.POSITIVE_INFINITY) return; // NPC — never a bottleneck
    const ratio = qty > 0 ? Math.max(0, available) / qty : Number.POSITIVE_INFINITY;
    if (ratio < minRatio) minRatio = ratio;
    if (available < qty) {
      shortfalls.push(buildShortfall(demand.get(materialId) ?? materialId, qty, available));
    }
  });

  // Nothing needs crafting (or only NPC materials are involved)
  if (craftUnits === 0 || !Number.isFinite(minRatio)) {
    return { ...empty, totalUnits, readyUnits, coveredUnits: totalUnits };
  }

  const coveredCraftUnits = Math.floor(craftUnits * minRatio);
  const coveredUnits = Math.min(totalUnits, readyUnits + coveredCraftUnits);
  const surplusUnits = Math.max(0, Math.floor(craftUnits * minRatio) - craftUnits);
  shortfalls.sort((a, b) => b.missing - a.missing);

  return {
    totalUnits,
    readyUnits,
    coveredUnits,
    coveragePct: Math.min(100, Math.round((coveredUnits / totalUnits) * 100)),
    complete: shortfalls.length === 0,
    shortfalls,
    surplusUnits,
  };
}
