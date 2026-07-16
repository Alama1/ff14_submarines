import { useState, useEffect, useCallback } from 'react';
import { Wrench, RefreshCw, Hammer, AlertTriangle, ExternalLink, MessageSquare, Clock, Info, Zap } from 'lucide-react';
import { loadActiveCrafts } from '../SubmarineData';
import { ActiveCraft } from '../types';
import { getEnv } from '../firebase';
import {
  getCache, setCache,
  CRAFTERS_TTL,
  CACHE_KEY_CRAFTERS_SHEET,
  CACHE_KEY_CRAFTERS_ACTIVE,
} from '../cache';

interface CrafterItem {
  ingredient: string;
  totalQty: number;
  stock: number;
  missing: number;
  whereToBuy: 'Market' | 'Crafting' | string;
  pricePerUnit: number;
  totalPrice: number;
}

interface ApiResponse {
  items: CrafterItem[];
  grandTotal: number;
  updatedAt: string;
  error?: string;
}

const getAppsScriptUrl = () => getEnv('VITE_CRAFTERS_SHEET_URL');
// ─────────────────────────────────────────────────────────────────────────────

function formatGil(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function formatPrice(n: number): string {
  if (n === 0) return '—';
  return `${formatGil(n)} G`;
}

type SortField = 'ingredient' | 'missing' | 'pricePerUnit' | 'totalPrice';
type SortDir   = 'asc' | 'desc';

export default function ForCrafters() {
  const [data,        setData]       = useState<ApiResponse | null>(null);
  const [activeCrafts, setActiveCrafts] = useState<ActiveCraft[]>([]);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState<string>('');
  const [filter,      setFilter]     = useState<'all' | 'needs_crafting'>('all');
  const [sortField,   setSortField]  = useState<SortField>('ingredient');
  const [sortDir,     setSortDir]    = useState<SortDir>('asc');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchData = useCallback(async (bypassCache = false) => {
    const url = getAppsScriptUrl();
    if (!url) {
      setError('No API URL configured. Set VITE_CRAFTERS_SHEET_URL in your env config.');
      return;
    }

    // Try serving from cache first (unless the user explicitly refreshed)
    if (!bypassCache) {
      const cachedSheet = getCache<ApiResponse>(CACHE_KEY_CRAFTERS_SHEET, CRAFTERS_TTL);
      const cachedCrafts = getCache<ActiveCraft[]>(CACHE_KEY_CRAFTERS_ACTIVE, CRAFTERS_TTL);
      if (cachedSheet && cachedCrafts) {
        setData(cachedSheet);
        setActiveCrafts(cachedCrafts);
        if (cachedSheet.updatedAt) {
          setLastUpdated(new Date(cachedSheet.updatedAt).toLocaleString());
        }
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const [res, craftsData] = await Promise.all([
        fetch(url),
        loadActiveCrafts()
      ]);
      const json = await res.json() as ApiResponse;
      if (json.error) throw new Error(json.error);

      // Persist to cache
      setCache(CACHE_KEY_CRAFTERS_SHEET, json);
      setCache(CACHE_KEY_CRAFTERS_ACTIVE, craftsData);

      setData(json);
      setActiveCrafts(craftsData);
      if (json.updatedAt) {
        setLastUpdated(new Date(json.updatedAt).toLocaleString());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error fetching data.');
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Group all claims by ingredient name for display
  const craftsByIngredient = activeCrafts.reduce<Record<string, { totalQty: number; claimers: string[] }>>(
    (acc, c) => {
      if (!acc[c.ingredient]) acc[c.ingredient] = { totalQty: 0, claimers: [] };
      acc[c.ingredient].totalQty += c.quantity;
      if (c.claimedBy) acc[c.ingredient].claimers.push(c.claimedBy);
      return acc;
    },
    {}
  );

  const sortedItems = (): CrafterItem[] => {
    if (!data) return [];
    let items = [...data.items];
    if (filter === 'needs_crafting') {
      items = items.filter(i => {
        const agg = craftsByIngredient[i.ingredient];
        const fullyClaimedQty = agg ? agg.totalQty : 0;
        return i.missing > 0 && fullyClaimedQty < i.missing;
      });
    }
    items.sort((a, b) => {
      let va: string | number = a[sortField];
      let vb: string | number = b[sortField];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return items;
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '0.25rem' }}>↕</span>;
    return <span style={{ color: 'var(--color-gold)', marginLeft: '0.25rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const items        = sortedItems();
  const filteredGrandTotal = items.reduce((s, i) => s + i.totalPrice, 0);

  if (!getAppsScriptUrl()) {
    return (
      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', padding: '2rem', textAlign: 'center' }}>
        <div className="ff-card-framed" style={{ padding: '3rem', maxWidth: '520px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(135deg, rgba(197,160,89,0.05) 0%, rgba(21,31,51,0.4) 100%)' }}>
          <AlertTriangle size={48} style={{ color: 'var(--color-warning)', filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.3))' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.4rem' }}>API URL Not Configured</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', lineHeight: '1.6' }}>
              Set <code style={{ background: 'rgba(197,160,89,0.1)', padding: '0.1rem 0.35rem', borderRadius: '3px', color: 'var(--color-gold)' }}>VITE_CRAFTERS_SHEET_URL</code> in your env variables to your deployed Google Apps Script URL.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Wrench style={{ color: 'var(--color-gold)' }} size={22} /> Crafters Shopping List
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
            Ingredients needed from Market Board or by Crafting — filtered from live spreadsheet data.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          {lastUpdated && (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              Updated: {lastUpdated}
            </span>
          )}
          <button
            type="button"
            className="ff-btn-secondary"
            onClick={() => fetchData(true)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Update cadence notice */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.6rem 1rem',
        background: 'rgba(197,160,89,0.06)',
        border: '1px solid rgba(197,160,89,0.18)',
        borderRadius: '4px',
        fontSize: '0.82rem',
        color: 'var(--color-text-muted)',
        lineHeight: '1.4',
      }}>
        <Clock size={14} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
        <span>
          This list is updated every <strong style={{ color: 'var(--color-gold-light)' }}>30 minutes</strong>.
          {' '}Some positions can increase or decrease depending on my current stock.
        </span>
      </div>

      {/* NQ / Quick Synthesis notice */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.85rem 1.1rem',
        background: 'rgba(16,185,129,0.06)',
        border: '1px solid rgba(16,185,129,0.22)',
        borderRadius: '4px',
        fontSize: '0.83rem',
        color: 'var(--color-text-muted)',
        lineHeight: '1.55',
      }}>
        <Zap size={15} style={{ color: '#10b981', flexShrink: 0, marginTop: '0.1rem' }} />
        <span>
          <strong style={{ color: '#10b981' }}>NQ materials only</strong> — no HQ quality is required for any of these ingredients.
          {' '}Feel free to use <strong style={{ color: 'var(--color-text-title)' }}>Quick Synthesis</strong> to fill the quantities faster!
        </span>
      </div>

      {/* Discord CTA Banner */}
      <div className="ff-card-framed" style={{
        padding: '1.25rem 1.5rem',
        background: 'linear-gradient(135deg, rgba(197,160,89,0.06) 0%, rgba(21,31,51,0.4) 100%)',
        borderLeft: '4px solid var(--color-gold)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        borderRadius: '4px',
        textAlign: 'left'
      }}>

        {/* Craft claim row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              background: 'rgba(197, 160, 89, 0.12)',
              padding: '0.6rem',
              borderRadius: '50%',
              color: 'var(--color-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <MessageSquare size={20} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text-title)', fontWeight: '600' }}>
                Want to take a craft?
              </h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                Let me know what you want to craft and the amount, and I will claim it for you!
              </p>
            </div>
          </div>
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            padding: '0.5rem 1.1rem',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.06)',
            fontSize: '0.85rem',
            fontWeight: '600',
            color: 'var(--color-gold-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            flexShrink: 0
          }}>
            <span>DM me in discord!</span>
            <span style={{ color: 'var(--color-text-title)', background: 'rgba(197, 160, 89, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '3px', fontFamily: 'monospace' }}>@Alamai</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="ff-alert ff-alert-warning" style={{ margin: 0 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
          <RefreshCw size={36} className="spin" style={{ color: 'var(--color-gold)' }} />
          <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-title)', letterSpacing: '0.05em', fontStyle: 'italic' }}>
            Fetching Ingredient List…
          </p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Active Crafting Banner */}
          {activeCrafts.length > 0 && (
            <div className="ff-card-framed" style={{
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(197,160,89,0.02) 0%, rgba(21,31,51,0.3) 100%)',
              borderLeft: '4px solid var(--color-gold)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              textAlign: 'left'
            }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-gold-light)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Hammer size={12} /> Claimed Crafting Tasks
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {Object.entries(craftsByIngredient).map(([ingredient, agg]) => (
                  <div key={ingredient} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: 'rgba(197,160,89,0.03)',
                    padding: '0.3rem 0.7rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(197,160,89,0.12)',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-title)',
                  }}>
                    <span style={{ fontWeight: '700', color: 'var(--color-gold)' }}>{agg.totalQty}x</span>
                    <span>{ingredient}</span>
                  </div>
                ))}
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                marginTop: '0.1rem',
              }}>
                <Info size={11} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
                <span>
                  You can claim <strong style={{ color: 'var(--color-text-title)' }}>more than the stated quantity needed</strong> — a little overstock is always welcome!
                  Claimed amounts may appear higher than needed as the live stock updates.
                </span>
              </div>
            </div>
          )}

          {/* Filter + table */}
          <div className="ff-card-framed" style={{ padding: 0, overflow: 'hidden' }}>

            {/* Table toolbar */}
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid rgba(197,160,89,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', background: 'rgba(197,160,89,0.02)' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={filter === 'all' ? 'ff-btn' : 'ff-btn-secondary'}
                  onClick={() => setFilter('all')}
                  style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', height: '32px' }}
                >
                  All
                </button>
                <button
                  type="button"
                  className={filter === 'needs_crafting' ? 'ff-btn' : 'ff-btn-secondary'}
                  onClick={() => setFilter('needs_crafting')}
                  style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', height: '32px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Hammer size={12} /> Needs Crafting
                </button>
              </div>
              {filter !== 'all' && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Showing {items.length} item{items.length !== 1 ? 's' : ''} · Total: <strong style={{ color: 'var(--color-gold)' }}>{formatGil(filteredGrandTotal)} G</strong>
                </span>
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(197,160,89,0.2)', background: 'rgba(197,160,89,0.04)' }}>
                    {([
                      ['ingredient',  'Ingredient'],
                      ['missing',     'Current Stock / Max'],
                      ['missing',     'Missing'],
                      ['pricePerUnit','Price / Unit'],
                      ['totalPrice',  'Total Price'],
                    ] as [SortField, string][]).map(([field, label], i) => (
                      <th
                        key={`${field}-${i}`}
                        onClick={() => handleSort(field)}
                        style={{
                          padding: '0.7rem 1rem',
                          textAlign: field === 'ingredient' ? 'left' : 'right',
                          color: 'var(--color-gold-light)',
                          fontSize: '0.72rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          cursor: label === 'Current Stock / Max' ? 'default' : 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}{label !== 'Current Stock / Max' && <SortIndicator field={field} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        No ingredients found for this filter.
                      </td>
                    </tr>
                  )}
                  {items.map((item, idx) => {
                    return (
                      <tr
                        key={`${item.ingredient}-${idx}`}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(197,160,89,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Ingredient name */}
                        <td style={{ padding: '0.65rem 1rem', color: 'var(--color-text-title)', fontWeight: '500' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <span>{item.ingredient}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {(() => {
                              const agg = craftsByIngredient[item.ingredient];
                              if (!agg) return null;
                              const isFull = agg.totalQty >= item.missing;
                              return (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '3px',
                                  fontSize: '0.7rem',
                                  fontWeight: '600',
                                  background: isFull ? 'rgba(16,185,129,0.12)' : 'rgba(197,160,89,0.12)',
                                  color:      isFull ? 'var(--color-success)'  : 'var(--color-gold)',
                                  border:     `1px solid ${isFull ? 'rgba(16,185,129,0.25)' : 'rgba(197,160,89,0.25)'}`,
                                }}>
                                  <Hammer size={10} />
                                  {isFull
                                    ? `Fully Claimed (${agg.totalQty})`
                                    : `${agg.totalQty} / ${item.missing} claimed`}
                                </span>
                              );
                            })()}
                          </div>
                          </div>
                        </td>

                        {/* Stock (current / total) */}
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {formatGil(item.stock)}
                          </span>
                          <span style={{ color: 'rgba(197,160,89,0.35)', margin: '0 0.15rem' }}>/</span>
                          <span style={{ color: 'var(--color-text-title)' }}>
                            {formatGil(item.totalQty)}
                          </span>
                        </td>

                        {/* Missing */}
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '600', color: item.missing > 0 ? 'var(--color-warning, #f59e0b)' : 'var(--color-success, #10b981)', fontVariantNumeric: 'tabular-nums' }}>
                          {item.missing > 0 ? formatGil(item.missing) : '✓'}
                        </td>

                        {/* Price per unit */}
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>
                          {formatPrice(item.pricePerUnit)}
                        </td>

                        {/* Total price */}
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {item.totalPrice > 0 ? (
                            <span className="gil-price" style={{ fontSize: '0.88rem' }}>
                              <span style={{ color: 'var(--color-gold-light)' }}>{formatGil(item.totalPrice)}</span>
                              <span className="gil-coin" style={{ width: '13px', height: '13px', fontSize: '8px' }}>G</span>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer totals row */}
                {items.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '1px solid rgba(197,160,89,0.2)', background: 'rgba(197,160,89,0.04)' }}>
                      <td colSpan={4} style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gold-light)', fontWeight: '600' }}>
                        {filter === 'all' ? 'Grand Total' : `${filter} Total`}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <span className="gil-price" style={{ fontSize: '1rem' }}>
                          <span style={{ color: 'var(--color-gold-light)', fontWeight: '700' }}>{formatGil(filteredGrandTotal)}</span>
                          <span className="gil-coin" style={{ width: '15px', height: '15px', fontSize: '9px' }}>G</span>
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Footer note */}
            <div style={{ padding: '0.6rem 1.25rem', borderTop: '1px solid rgba(197,160,89,0.08)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
              <ExternalLink size={11} />
              <span>Data sourced live from a Google Spreadsheet. Prices are per-unit estimates from the spreadsheet.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
