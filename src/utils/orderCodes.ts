const STORAGE_KEY = 'ff14_submarine_my_order_codes';
const MAX_CODES = 10;

/** Returns the user's recently used order codes, newest first. */
export function getRecentOrderCodes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/** Adds an order code to the front of the recent list (deduplicated, capped). */
export function addRecentOrderCode(code: string): void {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  const list = getRecentOrderCodes().filter((c) => c !== normalized);
  list.unshift(normalized);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_CODES)));
  } catch {
    /* storage full — non-critical */
  }
}

/** Removes an order code from the recent list. */
export function removeRecentOrderCode(code: string): void {
  const normalized = code.trim().toUpperCase();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(getRecentOrderCodes().filter((c) => c !== normalized))
    );
  } catch {
    /* non-critical */
  }
}
