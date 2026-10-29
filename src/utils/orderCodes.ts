function makeCodeStore(storageKey: string) {
  const MAX_CODES = 10;

  const get = (): string[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : [];
    } catch {
      return [];
    }
  };

  const add = (code: string): void => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    const list = get().filter((c) => c !== normalized);
    list.unshift(normalized);
    try {
      localStorage.setItem(storageKey, JSON.stringify(list.slice(0, MAX_CODES)));
    } catch {
      /* storage full — non-critical */
    }
  };

  const remove = (code: string): void => {
    const normalized = code.trim().toUpperCase();
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(get().filter((c) => c !== normalized))
      );
    } catch {
      /* non-critical */
    }
  };

  return { get, add, remove };
}

const orderStore = makeCodeStore('ff14_submarine_my_order_codes');

/** Returns the user's recently used order codes, newest first. */
export function getRecentOrderCodes(): string[] {
  return orderStore.get();
}

/** Adds an order code to the front of the recent list (deduplicated, capped). */
export function addRecentOrderCode(code: string): void {
  orderStore.add(code);
}

/** Removes an order code from the recent list. */
export function removeRecentOrderCode(code: string): void {
  orderStore.remove(code);
}

const claimStore = makeCodeStore('ff14_submarine_my_claim_codes');

/** Returns the user's recently used claim codes, newest first. */
export function getRecentClaimCodes(): string[] {
  return claimStore.get();
}

/** Adds a claim code to the front of the recent list (deduplicated, capped). */
export function addRecentClaimCode(code: string): void {
  claimStore.add(code);
}

/** Removes a claim code from the recent list. */
export function removeRecentClaimCode(code: string): void {
  claimStore.remove(code);
}
