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
    console.warn("Cache write failed (storage full?):", e);
  }
}

export function clearCache(key: string): void {
  localStorage.removeItem(key);
}

export const CRAFTERS_TTL = 5 * 60 * 1000;

export const ADMIN_SHEET_INGREDIENTS_TTL = 24 * 60 * 60 * 1000;

export const CACHE_KEY_CRAFTERS_SHEET = "ff14_cache_crafters_sheet";
export const CACHE_KEY_CRAFTERS_ACTIVE = "ff14_cache_crafters_active";
export const CACHE_KEY_ADMIN_SHEET_INGREDIENTS =
  "ff14_cache_admin_sheet_ingredients";
