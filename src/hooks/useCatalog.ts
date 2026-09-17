import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchDiscounts,
  fetchInProgressOrders,
  fetchMissingMaterials,
  fetchSubmarineParts,
} from '../api/endpoints';
import {
  ApiDiscount,
  ApiMissingMaterial,
  ApiSubmarinePart,
  InProgressOrder,
} from '../api/types';
import { sortParts } from '../utils/format';

export interface CatalogData {
  parts: ApiSubmarinePart[];
  partsById: Record<string, ApiSubmarinePart>;
  discounts: ApiDiscount[];
  inProgress: InProgressOrder[];
  missing: ApiMissingMaterial[];
}

export interface UseCatalogResult extends CatalogData {
  loading: boolean;
  error: string;
  refresh: (bypassCache?: boolean) => Promise<void>;
}

/**
 * Loads the shared catalog data (parts, discounts, in-progress orders, live
 * material stock) once and caches it in localStorage, so all tabs share the
 * same snapshot without duplicate network requests.
 */
export function useCatalog(): UseCatalogResult {
  const [parts, setParts] = useState<ApiSubmarinePart[]>([]);
  const [discounts, setDiscounts] = useState<ApiDiscount[]>([]);
  const [inProgress, setInProgress] = useState<InProgressOrder[]>([]);
  const [missing, setMissing] = useState<ApiMissingMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const didFetch = useRef(false);

  const fetchData = useCallback(async (bypassCache = false) => {
    setLoading(true);
    setError('');
    try {
      const [partsData, discountsData, inProgressData, missingData] = await Promise.all([
        fetchSubmarineParts(bypassCache),
        fetchDiscounts(bypassCache),
        fetchInProgressOrders(bypassCache),
        fetchMissingMaterials(bypassCache),
      ]);
      setParts(sortParts(partsData));
      setDiscounts([...discountsData].sort((a, b) => a.threshold - b.threshold));
      setInProgress(inProgressData);
      setMissing(missingData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load catalog data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    fetchData();
  }, [fetchData]);

  const partsById = useMemo(
    () => Object.fromEntries(parts.map((p) => [p.id, p])),
    [parts]
  );

  return {
    parts,
    partsById,
    discounts,
    inProgress,
    missing,
    loading,
    error,
    refresh: fetchData,
  };
}
