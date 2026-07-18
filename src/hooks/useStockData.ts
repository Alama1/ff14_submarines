import { useState, useEffect, useCallback } from 'react';
import { getEnv } from '../firebase';
import { getCache, setCache, CRAFTERS_TTL, CACHE_KEY_CRAFTERS_SHEET } from '../cache';
import { StockApiResponse, CrafterItem } from '../types';

interface UseStockDataResult {
  stockItems: CrafterItem[];
  loading: boolean;
  error: string;
  updatedAt: string;
  refresh: () => void;
}

/**
 * Fetches live ingredient stock from the Google Apps Script API in the background.
 *
 * Shares the same localStorage cache as ForCrafters so there is no duplicate
 * network request when the user has already visited that tab.
 */
export function useStockData(): UseStockDataResult {
  const [stockItems, setStockItems] = useState<CrafterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  const fetch = useCallback(async (bypassCache = false) => {
    const url = getEnv('VITE_CRAFTERS_SHEET_URL');
    if (!url) return; // no URL configured — silently skip

    if (!bypassCache) {
      const cached = getCache<StockApiResponse>(CACHE_KEY_CRAFTERS_SHEET, CRAFTERS_TTL);
      if (cached) {
        setStockItems(cached.items ?? []);
        if (cached.updatedAt) setUpdatedAt(cached.updatedAt);
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const res = await window.fetch(url);
      const json = (await res.json()) as StockApiResponse;
      if (json.error) throw new Error(json.error);

      setCache(CACHE_KEY_CRAFTERS_SHEET, json);
      setStockItems(json.items ?? []);
      if (json.updatedAt) setUpdatedAt(json.updatedAt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch stock data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { stockItems, loading, error, updatedAt, refresh: () => fetch(true) };
}
