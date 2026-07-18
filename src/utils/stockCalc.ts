import { CrafterItem, PartIngredient, Order } from '../types';

/**
 * Returns true if an order should be considered "active demand"
 * — i.e. it counts against available stock.
 *
 * Rules:
 *  - Status must be 'pending' or 'in_progress' (not completed / cancelled).
 *  - Fulfillment date is 'ASAP' OR falls within the next 7 days.
 */
export function isOrderActiveDeadline(order: Order): boolean {
  if (order.status === 'completed' || order.status === 'cancelled') return false;

  const fulfillment = order.fulfillmentDate ?? 'ASAP';
  if (fulfillment === 'ASAP') return true;

  const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  try {
    const d = new Date(fulfillment).getTime();
    return d <= sevenDaysFromNow;
  } catch {
    return false;
  }
}

/**
 * Builds a map of { ingredientNameLower → qty } representing all ingredients
 * already committed to active orders.
 */
export function computeCommittedIngredients(
  orders: Order[],
  partIngredients: PartIngredient[]
): Record<string, number> {
  const committed: Record<string, number> = {};

  const recipeByPartId: Record<string, PartIngredient> = {};
  partIngredients.forEach((r) => { recipeByPartId[r.partId] = r; });

  orders.filter(isOrderActiveDeadline).forEach((order) => {
    order.items.forEach((item) => {
      const recipe = recipeByPartId[item.partId];
      if (!recipe) return; // no recipe defined — skip

      recipe.ingredients.forEach((ing) => {
        const key = ing.name.toLowerCase();
        committed[key] = (committed[key] ?? 0) + ing.quantity * item.quantity;
      });
    });
  });

  return committed;
}

/**
 * Builds a map of { ingredientNameLower → availableQty } from the live API stock
 * minus committed ingredient demand.
 */
export function computeAvailableStock(
  stockItems: CrafterItem[],
  orders: Order[],
  partIngredients: PartIngredient[]
): Record<string, number> {
  // Build base stock map from API
  const stockMap: Record<string, number> = {};
  stockItems.forEach((item) => {
    stockMap[item.ingredient.toLowerCase()] = item.stock;
  });

  const committed = computeCommittedIngredients(orders, partIngredients);

  // Subtract committed
  const available: Record<string, number> = { ...stockMap };
  Object.entries(committed).forEach(([key, qty]) => {
    available[key] = (available[key] ?? 0) - qty;
  });

  return available;
}

interface SelectedPart {
  partId: string;
  quantity: number;
}

/**
 * Computes how many sets (i.e. full copies of the user's current selection) can
 * be crafted given the available ingredient stock.
 *
 * Returns an object with:
 *  - craftable: number of complete sets that can be made
 *  - bottlenecks: which ingredients are the limiting factor
 *  - ingredientDemand: total ingredients needed for 1 set
 */
export function computeCraftableCount(
  selectedParts: SelectedPart[],
  availableStock: Record<string, number>,
  partIngredients: PartIngredient[]
): {
  craftable: number;
  bottlenecks: { name: string; available: number; needed: number }[];
  ingredientDemand: Record<string, number>;
  hasRecipes: boolean;
} {
  const recipeByPartId: Record<string, PartIngredient> = {};
  partIngredients.forEach((r) => { recipeByPartId[r.partId] = r; });

  // Total ingredient demand per one full user selection
  const demand: Record<string, number> = {};
  let hasRecipes = false;

  selectedParts.forEach(({ partId, quantity }) => {
    if (!partId || quantity <= 0) return;
    const recipe = recipeByPartId[partId];
    if (!recipe) return;
    hasRecipes = true;
    recipe.ingredients.forEach((ing) => {
      const key = ing.name.toLowerCase();
      demand[key] = (demand[key] ?? 0) + ing.quantity * quantity;
    });
  });

  if (!hasRecipes || Object.keys(demand).length === 0) {
    return { craftable: 0, bottlenecks: [], ingredientDemand: demand, hasRecipes: false };
  }

  let craftable = Infinity;
  const bottlenecks: { name: string; available: number; needed: number }[] = [];

  Object.entries(demand).forEach(([key, needed]) => {
    const available = availableStock[key] ?? 0;
    const canMake = needed > 0 ? Math.floor(available / needed) : Infinity;
    if (canMake < craftable) craftable = canMake;
    if (available < needed) {
      bottlenecks.push({ name: key, available: Math.max(0, available), needed });
    }
  });

  return {
    craftable: craftable === Infinity ? 0 : Math.max(0, craftable),
    bottlenecks,
    ingredientDemand: demand,
    hasRecipes: true,
  };
}
