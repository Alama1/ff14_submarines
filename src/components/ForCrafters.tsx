import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wrench,
  RefreshCw,
  Hammer,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Clock,
  Zap,
  CheckCircle,
  Calculator,
} from 'lucide-react';
import { fetchMissingMaterials, fetchPrices, fetchPriceSettings } from '../api/endpoints';
import { ApiMissingMaterial, ApiPriceEntry, ApiPriceSettings } from '../api/types';
import MaterialsCalculator, { CalculatorItem } from './MaterialsCalculator';
import './ForCrafters.css';

function formatGil(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return '—';
  return `${formatGil(n)} G`;
}

type SortField = 'name' | 'remaining' | 'pricePerUnit' | 'totalPrice';
type SortDir = 'asc' | 'desc';

function SortIndicator({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
}) {
  if (sortField !== field) return <span className="fc-sort-idle">↕</span>;
  return (
    <span className="fc-sort-active">{sortDir === 'asc' ? '↑' : '↓'}</span>
  );
}

interface RowData extends ApiMissingMaterial {
  pricePerUnit: number | null;
  totalPrice: number;
}

export default function ForCrafters() {
  const [missing, setMissing] = useState<ApiMissingMaterial[]>([]);
  const [prices, setPrices] = useState<ApiPriceEntry[]>([]);
  const [settings, setSettings] = useState<ApiPriceSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'needs_crafting'>('all');
  const [sortField, setSortField] = useState<SortField>('remaining');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showCalculator, setShowCalculator] = useState(false);

  const fetchData = useCallback(async (bypassCache = false) => {
    setLoading(true);
    setError('');
    try {
      const [missingData, pricesData, settingsData] = await Promise.all([
        fetchMissingMaterials(bypassCache),
        fetchPrices(bypassCache),
        fetchPriceSettings(bypassCache),
      ]);
      setMissing(missingData);
      setPrices(pricesData);
      setSettings(settingsData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error fetching data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const didFetch = useRef(false);
  useEffect(() => {
    if (!didFetch.current) {
      didFetch.current = true;
      fetchData();
    }
  }, [fetchData]);

  const priceById = useMemo(
    () => new Map(prices.map((p) => [p.id, p.effectivePrice])),
    [prices]
  );

  const rows = useMemo<RowData[]>(
    () =>
      missing.map((m) => {
        const pricePerUnit = priceById.get(m.id) ?? null;
        return {
          ...m,
          pricePerUnit,
          totalPrice: pricePerUnit ? Math.round(m.remaining * pricePerUnit) : 0,
        };
      }),
    [missing, priceById]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleSortFieldChange = (field: SortField) => {
    setSortField(field);
    setSortDir(field === 'name' ? 'asc' : 'desc');
  };

  const toggleSortDir = () => {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  };

  const sortedItems = useMemo(() => {
    let items = [...rows];
    if (filter === 'needs_crafting') {
      items = items.filter((i) => i.remaining > 0);
    }
    items.sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      switch (sortField) {
        case 'name':
          va = a.name.toLowerCase();
          vb = b.name.toLowerCase();
          break;
        case 'remaining':
          va = a.remaining;
          vb = b.remaining;
          break;
        case 'pricePerUnit':
          va = a.pricePerUnit ?? 0;
          vb = b.pricePerUnit ?? 0;
          break;
        case 'totalPrice':
          va = a.totalPrice;
          vb = b.totalPrice;
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [rows, filter, sortField, sortDir]);

  const filteredGrandTotal = sortedItems.reduce((s, i) => s + i.totalPrice, 0);
  const fullyClaimedCount = rows.filter((r) => r.remaining <= 0).length;

  // Feed for the payout calculator — every known material with its live price
  const calculatorItems = useMemo<CalculatorItem[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        unitPrice: r.pricePerUnit,
        remaining: Math.max(0, r.remaining),
      })),
    [rows]
  );

  return (
    <div className="fade-in fc-page">
      {/* Header */}
      <div className="fc-header">
        <div>
          <h2 className="fc-header-title">
            <Wrench size={22} /> Crafters Shopping List
          </h2>
          <p className="fc-header-sub">
            Materials the workshop needs from the Market Board or from crafting — live from the
            Alamai stock system.
            {settings?.world && (
              <>
                {' '}
                Prices tracked on <strong>{settings.world}</strong>.
              </>
            )}
          </p>
        </div>
        <div className="fc-header-actions">
          <button
            type="button"
            className={`ff-btn fc-calc-btn glow-active ${showCalculator ? 'is-open' : ''}`}
            onClick={() => setShowCalculator((v) => !v)}
          >
            <Calculator size={14} />
            {showCalculator ? 'Hide Calculator' : 'Calculate Payout'}
          </button>
          <button
            type="button"
            className="ff-btn-secondary fc-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Update cadence notice */}
      <div className="fc-notice fc-notice-cadence">
        <Clock size={14} />
        <span>
          This list is updated automatically as stock changes. Some positions can increase or
          decrease depending on current workshop inventory and active orders.
        </span>
      </div>

      {/* NQ / Quick Synthesis notice */}
      <div className="fc-notice fc-notice-nq">
        <Zap size={15} />
        <span>
          <strong className="fc-notice-strong-accent">NQ materials only</strong> — no HQ quality is
          required for any of these ingredients. Feel free to use{' '}
          <strong>Quick Synthesis</strong> to fill the quantities faster!
        </span>
      </div>

      {/* 1-week deadline banner */}
      <div className="fc-notice fc-notice-deadline">
        <AlertTriangle size={15} />
        <span>
          <strong className="fc-notice-strong-accent">1-week deadline</strong> — all claimed orders
          should be completed within <strong>one week</strong>. Otherwise, I cannot guarantee that I
          will buy them immediately. Please plan your crafts wisely!
        </span>
      </div>

      {/* Discord CTA Banner */}
      <div className="ff-card-framed fc-cta">
        <div className="fc-cta-row">
          <div className="fc-cta-lead">
            <div className="fc-cta-icon">
              <MessageSquare size={20} />
            </div>
            <div>
              <h4 className="fc-cta-title">Want to take a craft?</h4>
              <p className="fc-cta-sub">
                Let me know what you want to craft and the amount, and I will claim it for you!
              </p>
            </div>
          </div>
          <div className="fc-cta-handle">
            <span>DM me in discord!</span>
            <span className="fc-cta-handle-name">@Alamai</span>
          </div>
        </div>
      </div>

      {showCalculator && (
        <MaterialsCalculator items={calculatorItems} onClose={() => setShowCalculator(false)} />
      )}

      {error && (
        <div className="ff-alert ff-alert-warning fc-alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && rows.length === 0 && (
        <div className="fc-loading">
          <RefreshCw size={36} className="spin fc-loading-spinner" />
          <p className="fc-loading-text">Fetching Ingredient List…</p>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="fc-empty">
          <CheckCircle size={36} />
          <span className="fc-empty-title">The workshop is fully stocked!</span>
          <span className="fc-empty-sub">No materials are currently needed. Check back later!</span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Claimed summary */}
          {fullyClaimedCount > 0 && (
            <div className="fc-claimed-note">
              <Hammer size={12} />
              <span>
                <strong className="fc-claimed-count">{fullyClaimedCount}</strong> material
                {fullyClaimedCount !== 1 ? 's' : ''} already fully claimed by crafters — thank you!
              </span>
            </div>
          )}

          {/* Filter + table */}
          <div className="ff-card-framed fc-table-card">
            {/* Table toolbar */}
            <div className="fc-toolbar">
              <div className="fc-toolbar-filters">
                <button
                  type="button"
                  className={`${filter === 'all' ? 'ff-btn' : 'ff-btn-secondary'} fc-filter-btn`}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`${filter === 'needs_crafting' ? 'ff-btn' : 'ff-btn-secondary'} fc-filter-btn is-crafting`}
                  onClick={() => setFilter('needs_crafting')}
                >
                  <Hammer size={12} /> Needs Crafting
                </button>
              </div>
              {filter !== 'all' && (
                <span className="fc-toolbar-meta">
                  Showing {sortedItems.length} item{sortedItems.length !== 1 ? 's' : ''} · Total:{' '}
                  <strong className="fc-toolbar-total">{formatGil(filteredGrandTotal)} G</strong>
                </span>
              )}
              {/* Mobile-only sort controls (desktop uses the sortable headers) */}
              <div className="fc-mobile-sort">
                <label className="fc-sort-label" htmlFor="fc-sort-field">
                  Sort by
                </label>
                <select
                  id="fc-sort-field"
                  className="form-select fc-sort-select"
                  value={sortField}
                  onChange={(e) => handleSortFieldChange(e.target.value as SortField)}
                >
                  <option value="remaining">Needed</option>
                  <option value="name">Ingredient</option>
                  <option value="pricePerUnit">Price / Unit</option>
                  <option value="totalPrice">Total Price</option>
                </select>
                <button
                  type="button"
                  className="ff-btn-secondary fc-sort-dir-btn"
                  onClick={toggleSortDir}
                  title={sortDir === 'asc' ? 'Ascending — tap to flip' : 'Descending — tap to flip'}
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="fc-table" role="table" aria-label="Crafters shopping list">
              <div className="fc-thead-row" role="row">
                <button
                  type="button"
                  className="fc-th is-sortable"
                  role="columnheader"
                  aria-sort={sortField === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('name')}
                >
                  Ingredient
                  <SortIndicator field="name" sortField={sortField} sortDir={sortDir} />
                </button>
                <span className="fc-th is-right" role="columnheader">
                  Current / Target
                </span>
                <button
                  type="button"
                  className="fc-th is-sortable is-right"
                  role="columnheader"
                  aria-sort={sortField === 'remaining' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('remaining')}
                >
                  Needed
                  <SortIndicator field="remaining" sortField={sortField} sortDir={sortDir} />
                </button>
                <button
                  type="button"
                  className="fc-th is-sortable is-right"
                  role="columnheader"
                  aria-sort={sortField === 'pricePerUnit' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('pricePerUnit')}
                >
                  Price / Unit
                  <SortIndicator field="pricePerUnit" sortField={sortField} sortDir={sortDir} />
                </button>
                <button
                  type="button"
                  className="fc-th is-sortable is-right"
                  role="columnheader"
                  aria-sort={sortField === 'totalPrice' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('totalPrice')}
                >
                  Total Price
                  <SortIndicator field="totalPrice" sortField={sortField} sortDir={sortDir} />
                </button>
              </div>

              <div role="rowgroup">
                {sortedItems.length === 0 && (
                  <div className="fc-empty-row" role="row">
                    <div className="fc-empty-cell" role="cell">
                      No ingredients found for this filter.
                    </div>
                  </div>
                )}
                {sortedItems.map((item) => {
                  const isFullyClaimed = item.remaining <= 0;
                  const claimProgress = item.deficit > 0 ? Math.min(1, item.claimed / item.deficit) : 1;
                  const claimerNames = item.claims.map((c) => `${c.claimedFor} (${c.quantity})`).join(', ');

                  return (
                    <div key={item.id} className={`fc-body-row ${isFullyClaimed ? 'is-claimed' : ''}`} role="row">
                      {/* Ingredient name */}
                      <div className="fc-cell fc-cell-name" role="cell">
                        <div className="fc-name-wrap">
                          <div className="fc-name-row">
                            <span>{item.name}</span>
                            {item.claimed > 0 && (
                              <span
                                title={claimerNames ? `Claimed by: ${claimerNames}` : undefined}
                                className={`fc-claim-chip ${isFullyClaimed ? 'is-full' : ''}`}
                              >
                                <Hammer size={10} />
                                {isFullyClaimed
                                  ? `Fully Claimed (${formatGil(item.claimed)})`
                                  : `${formatGil(item.claimed)} / ${formatGil(item.deficit)} claimed`}
                              </span>
                            )}
                          </div>
                          {item.claimed > 0 && !isFullyClaimed && (
                            <div className="fc-progress">
                              <div
                                className="fc-progress-fill"
                                style={{ width: `${Math.round(claimProgress * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Stock (current / target) */}
                      <div className="fc-cell is-right fc-cell-stock" role="cell">
                        <span className="fc-stat-label">Current / Target</span>
                        <span className="fc-stock-muted">{formatGil(item.currentStock)}</span>
                        <span className="fc-stock-sep">/</span>
                        <span className="fc-stock-target">{formatGil(item.desiredQuantity)}</span>
                      </div>

                      {/* Needed (remaining) */}
                      <div
                        className={`fc-cell is-right fc-cell-needed ${
                          item.remaining > 0 ? 'is-warning' : 'is-success'
                        }`}
                        role="cell"
                      >
                        <span className="fc-stat-label">Needed</span>
                        <span className="fc-needed-value">
                          {item.remaining > 0 ? formatGil(item.remaining) : '✓'}
                        </span>
                      </div>

                      {/* Price per unit */}
                      <div className="fc-cell is-right fc-cell-price" role="cell">
                        <span className="fc-stat-label">Price / Unit</span>
                        <span className="fc-price-value">{formatPrice(item.pricePerUnit)}</span>
                      </div>

                      {/* Total price */}
                      <div className="fc-cell is-right fc-cell-total" role="cell">
                        <span className="fc-stat-label">Total</span>
                        {item.totalPrice > 0 ? (
                          <span className="gil-price fc-total-price">
                            <span className="fc-total-amount">{formatGil(item.totalPrice)}</span>
                            <span className="gil-coin fc-coin-sm">G</span>
                          </span>
                        ) : (
                          <span className="fc-total-none">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer totals row */}
              {sortedItems.length > 0 && (
                <div className="fc-tfoot-row" role="row">
                  <div className="fc-tfoot-label" role="cell">
                    {filter === 'all' ? 'Grand Total' : 'Needs Crafting Total'}
                  </div>
                  <div className="fc-tfoot-total" role="cell">
                    <span className="gil-price fc-tfoot-price">
                      <span className="fc-tfoot-amount">{formatGil(filteredGrandTotal)}</span>
                      <span className="gil-coin fc-coin-md">G</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer note */}
            <div className="fc-footer-note">
              <ExternalLink size={11} />
              <span>
                Live data from the Alamai stock system. Prices are per-unit estimates synced from
                the Market Board{settings?.world ? ` on ${settings.world}` : ''}.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
