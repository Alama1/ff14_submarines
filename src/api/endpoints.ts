import { apiGet, apiPost } from './client';
import {
  ApiDiscount,
  ApiMissingMaterial,
  ApiOrder,
  ApiPriceEntry,
  ApiPriceSettings,
  ApiSubmarinePart,
  CreateOrderDto,
  InProgressOrder,
} from './types';
import {
  getCache,
  setCache,
  CACHE_KEY_RECIPES,
  CACHE_KEY_DISCOUNTS,
  CACHE_KEY_MISSING,
  CACHE_KEY_PRICES,
  CACHE_KEY_PRICE_SETTINGS,
  CACHE_KEY_IN_PROGRESS,
  RECIPES_TTL,
  DISCOUNTS_TTL,
  MISSING_TTL,
  PRICES_TTL,
  PRICE_SETTINGS_TTL,
  IN_PROGRESS_TTL,
} from '../cache';

// ─── Recipes / parts ──────────────────────────────────────────────────────────

export async function fetchSubmarineParts(bypassCache = false): Promise<ApiSubmarinePart[]> {
  if (!bypassCache) {
    const cached = getCache<ApiSubmarinePart[]>(CACHE_KEY_RECIPES, RECIPES_TTL);
    if (cached) return cached;
  }
  const parts = await apiGet<ApiSubmarinePart[]>('/recipes');
  setCache(CACHE_KEY_RECIPES, parts);
  return parts;
}

// ─── Discounts ────────────────────────────────────────────────────────────────

export async function fetchDiscounts(bypassCache = false): Promise<ApiDiscount[]> {
  if (!bypassCache) {
    const cached = getCache<ApiDiscount[]>(CACHE_KEY_DISCOUNTS, DISCOUNTS_TTL);
    if (cached) return cached;
  }
  const discounts = await apiGet<ApiDiscount[]>('/discounts');
  setCache(CACHE_KEY_DISCOUNTS, discounts);
  return discounts;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/** Creates an order request and returns the created order incl. its confirmation code. */
export function submitOrder(dto: CreateOrderDto): Promise<ApiOrder> {
  return apiPost<ApiOrder>('/orders', dto);
}

/** Looks up an order by its public confirmation code, e.g. "SUB-7K9P". */
export function lookupOrder(code: string): Promise<ApiOrder> {
  const normalized = encodeURIComponent(code.trim().toUpperCase());
  return apiGet<ApiOrder>(`/orders/lookup/${normalized}`);
}

export async function fetchInProgressOrders(bypassCache = false): Promise<InProgressOrder[]> {
  if (!bypassCache) {
    const cached = getCache<InProgressOrder[]>(CACHE_KEY_IN_PROGRESS, IN_PROGRESS_TTL);
    if (cached) return cached;
  }
  const res = await apiGet<{ orders: InProgressOrder[] }>('/orders/in-progress');
  const orders = res.orders ?? [];
  setCache(CACHE_KEY_IN_PROGRESS, orders);
  return orders;
}

// ─── Inventory (missing materials feed) ───────────────────────────────────────

export async function fetchMissingMaterials(bypassCache = false): Promise<ApiMissingMaterial[]> {
  if (!bypassCache) {
    const cached = getCache<ApiMissingMaterial[]>(CACHE_KEY_MISSING, MISSING_TTL);
    if (cached) return cached;
  }
  const res = await apiGet<{ items: ApiMissingMaterial[]; total: number }>(
    '/inventory/missing?limit=200&page=1'
  );
  const items = res.items ?? [];
  setCache(CACHE_KEY_MISSING, items);
  return items;
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export async function fetchPrices(bypassCache = false): Promise<ApiPriceEntry[]> {
  if (!bypassCache) {
    const cached = getCache<ApiPriceEntry[]>(CACHE_KEY_PRICES, PRICES_TTL);
    if (cached) return cached;
  }
  const res = await apiGet<{ items: ApiPriceEntry[]; total: number }>('/prices?limit=500&page=1');
  const items = res.items ?? [];
  setCache(CACHE_KEY_PRICES, items);
  return items;
}

export async function fetchPriceSettings(bypassCache = false): Promise<ApiPriceSettings> {
  if (!bypassCache) {
    const cached = getCache<ApiPriceSettings>(CACHE_KEY_PRICE_SETTINGS, PRICE_SETTINGS_TTL);
    if (cached) return cached;
  }
  const settings = await apiGet<ApiPriceSettings>('/prices/settings');
  setCache(CACHE_KEY_PRICE_SETTINGS, settings);
  return settings;
}
