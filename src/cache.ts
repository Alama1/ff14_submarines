interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Read a cached value if it exists and hasn't expired.
 * @param key        localStorage key
 * @param ttlMs      time-to-live in milliseconds
 * @returns          the cached data, or null if missing / expired
 */
export function getCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn('Cache write failed (storage full?):', e);
  }
}

export function clearCache(key: string): void {
  localStorage.removeItem(key);
}

// ─── Cache keys & TTLs ────────────────────────────────────────────────────────

export const RECIPES_TTL = 20 * 1000;
export const DISCOUNTS_TTL = 20 * 1000;
export const MISSING_TTL = 20 * 1000;
export const PRICES_TTL = 20 * 1000;
export const PRICE_SETTINGS_TTL = 20 * 1000;
export const IN_PROGRESS_TTL = 20 * 1000;

export const CACHE_KEY_RECIPES = 'ff14_cache_recipes';
export const CACHE_KEY_DISCOUNTS = 'ff14_cache_discounts';
export const CACHE_KEY_MISSING = 'ff14_cache_missing_materials';
export const CACHE_KEY_PRICES = 'ff14_cache_prices';
export const CACHE_KEY_PRICE_SETTINGS = 'ff14_cache_price_settings';
export const CACHE_KEY_IN_PROGRESS = 'ff14_cache_in_progress_orders';
