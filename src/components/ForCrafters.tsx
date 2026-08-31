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
} from 'lucide-react';
import { fetchMissingMaterials, fetchPrices, fetchPriceSettings } from '../api/endpoints';
import { ApiMissingMaterial, ApiPriceEntry, ApiPriceSettings } from '../api/types';

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
  if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '0.25rem' }}>↕</span>;
  return (
    <span style={{ color: 'var(--color-gold)', marginLeft: '0.25rem' }}>
      {sortDir === 'asc' ? '↑' : '↓'}
    </span>
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

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Wrench style={{ color: 'var(--color-gold)' }} size={22} /> Crafters Shopping List
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
            Materials the workshop needs from the Market Board or from crafting — live from the
            Alamai stock system.
            {settings?.world && (
              <>
                {' '}
                Prices tracked on{' '}
                <strong style={{ color: 'var(--color-gold)' }}>{settings.world}</strong>.
              </>
            )}
          </p>
        </div>
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

      {/* Update cadence notice */}
      <div
        style={{
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
        }}
      >
        <Clock size={14} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
        <span>
          This list is updated automatically as stock changes. Some positions can increase or
          decrease depending on current workshop inventory and active orders.
        </span>
      </div>

      {/* NQ / Quick Synthesis notice */}
      <div
        style={{
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
        }}
      >
        <Zap size={15} style={{ color: '#10b981', flexShrink: 0, marginTop: '0.1rem' }} />
        <span>
          <strong style={{ color: '#10b981' }}>NQ materials only</strong> — no HQ quality is
          required for any of these ingredients. Feel free to use{' '}
          <strong style={{ color: 'var(--color-text-title)' }}>Quick Synthesis</strong> to fill the
          quantities faster!
        </span>
      </div>

      {/* 1-week deadline banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          padding: '0.85rem 1.1rem',
          background: 'rgba(245,158,11,0.07)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: '4px',
          fontSize: '0.83rem',
          color: 'var(--color-text-muted)',
          lineHeight: '1.55',
        }}
      >
        <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.1rem' }} />
        <span>
          <strong style={{ color: '#f59e0b' }}>1-week deadline</strong> — all claimed orders should
          be completed within <strong style={{ color: 'var(--color-text-title)' }}>one week</strong>
          . Otherwise, I cannot guarantee that I will buy them immediately. Please plan your crafts
          wisely!
        </span>
      </div>

      {/* Discord CTA Banner */}
      <div
        className="ff-card-framed"
        style={{
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(135deg, rgba(197,160,89,0.06) 0%, rgba(21,31,51,0.4) 100%)',
          borderLeft: '4px solid var(--color-gold)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          borderRadius: '4px',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                background: 'rgba(197, 160, 89, 0.12)',
                padding: '0.6rem',
                borderRadius: '50%',
                color: 'var(--color-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
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
          <div
            style={{
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
              flexShrink: 0,
            }}
          >
            <span>DM me in discord!</span>
            <span
              style={{
                color: 'var(--color-text-title)',
                background: 'rgba(197, 160, 89, 0.1)',
                padding: '0.15rem 0.5rem',
                borderRadius: '3px',
                fontFamily: 'monospace',
              }}
            >
              @Alamai
            </span>
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
      {loading && rows.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            gap: '1rem',
          }}
        >
          <RefreshCw size={36} className="spin" style={{ color: 'var(--color-gold)' }} />
          <p
            style={{
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-title)',
              letterSpacing: '0.05em',
              fontStyle: 'italic',
            }}
          >
            Fetching Ingredient List…
          </p>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1.5rem',
            gap: '0.75rem',
            border: '1px dashed rgba(16,185,129,0.3)',
            borderRadius: '6px',
            background: 'rgba(16,185,129,0.03)',
          }}
        >
          <CheckCircle size={36} style={{ color: 'var(--color-success)' }} />
          <span style={{ fontWeight: '600', color: 'var(--color-text-title)' }}>
            The workshop is fully stocked!
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            No materials are currently needed. Check back later!
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Claimed summary */}
          {fullyClaimedCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.78rem',
                color: 'var(--color-text-muted)',
              }}
            >
              <Hammer size={12} style={{ color: 'var(--color-gold)' }} />
              <span>
                <strong style={{ color: 'var(--color-gold)' }}>{fullyClaimedCount}</strong>{' '}
                material{fullyClaimedCount !== 1 ? 's' : ''} already fully claimed by crafters —
                thank you!
              </span>
            </div>
          )}

          {/* Filter + table */}
          <div className="ff-card-framed" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Table toolbar */}
            <div
              style={{
                padding: '0.9rem 1.25rem',
                borderBottom: '1px solid rgba(197,160,89,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                background: 'rgba(197,160,89,0.02)',
              }}
            >
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
                  style={{
                    padding: '0.3rem 0.8rem',
                    fontSize: '0.8rem',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <Hammer size={12} /> Needs Crafting
                </button>
              </div>
              {filter !== 'all' && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Showing {sortedItems.length} item{sortedItems.length !== 1 ? 's' : ''} · Total:{' '}
                  <strong style={{ color: 'var(--color-gold)' }}>{formatGil(filteredGrandTotal)} G</strong>
                </span>
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(197,160,89,0.2)', background: 'rgba(197,160,89,0.04)' }}>
                    <th
                      onClick={() => handleSort('name')}
                      style={{
                        padding: '0.7rem 1rem',
                        textAlign: 'left',
                        color: 'var(--color-gold-light)',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Ingredient
                      <SortIndicator field="name" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      style={{
                        padding: '0.7rem 1rem',
                        textAlign: 'right',
                        color: 'var(--color-gold-light)',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Current / Target
                    </th>
                    <th
                      onClick={() => handleSort('remaining')}
                      style={{
                        padding: '0.7rem 1rem',
                        textAlign: 'right',
                        color: 'var(--color-gold-light)',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Needed
                      <SortIndicator field="remaining" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      onClick={() => handleSort('pricePerUnit')}
                      style={{
                        padding: '0.7rem 1rem',
                        textAlign: 'right',
                        color: 'var(--color-gold-light)',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Price / Unit
                      <SortIndicator field="pricePerUnit" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      onClick={() => handleSort('totalPrice')}
                      style={{
                        padding: '0.7rem 1rem',
                        textAlign: 'right',
                        color: 'var(--color-gold-light)',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Total Price
                      <SortIndicator field="totalPrice" sortField={sortField} sortDir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        No ingredients found for this filter.
                      </td>
                    </tr>
                  )}
                  {sortedItems.map((item) => {
                    const isFullyClaimed = item.remaining <= 0;
                    const claimProgress = item.deficit > 0 ? Math.min(1, item.claimed / item.deficit) : 1;
                    const claimerNames = item.claims.map((c) => `${c.claimedFor} (${c.quantity})`).join(', ');

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          transition: 'background 0.15s',
                          opacity: isFullyClaimed ? 0.55 : 1,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(197,160,89,0.04)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Ingredient name */}
                        <td style={{ padding: '0.65rem 1rem', color: 'var(--color-text-title)', fontWeight: '500' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span>{item.name}</span>
                              {item.claimed > 0 && (
                                <span
                                  title={claimerNames ? `Claimed by: ${claimerNames}` : undefined}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '3px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    background: isFullyClaimed ? 'rgba(16,185,129,0.12)' : 'rgba(197,160,89,0.12)',
                                    color: isFullyClaimed ? 'var(--color-success)' : 'var(--color-gold)',
                                    border: `1px solid ${isFullyClaimed ? 'rgba(16,185,129,0.25)' : 'rgba(197,160,89,0.25)'}`,
                                  }}
                                >
                                  <Hammer size={10} />
                                  {isFullyClaimed
                                    ? `Fully Claimed (${formatGil(item.claimed)})`
                                    : `${formatGil(item.claimed)} / ${formatGil(item.deficit)} claimed`}
                                </span>
                              )}
                            </div>
                            {item.claimed > 0 && !isFullyClaimed && (
                              <div
                                style={{
                                  width: '160px',
                                  height: '3px',
                                  background: 'rgba(255,255,255,0.06)',
                                  borderRadius: '2px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.round(claimProgress * 100)}%`,
                                    height: '100%',
                                    background: 'var(--color-gold)',
                                    borderRadius: '2px',
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Stock (current / target) */}
                        <td
                          style={{
                            padding: '0.65rem 1rem',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ color: 'var(--color-text-muted)' }}>{formatGil(item.currentStock)}</span>
                          <span style={{ color: 'rgba(197,160,89,0.35)', margin: '0 0.15rem' }}>/</span>
                          <span style={{ color: 'var(--color-text-title)' }}>{formatGil(item.desiredQuantity)}</span>
                        </td>

                        {/* Needed (remaining) */}
                        <td
                          style={{
                            padding: '0.65rem 1rem',
                            textAlign: 'right',
                            fontWeight: '600',
                            color: item.remaining > 0 ? 'var(--color-warning)' : 'var(--color-success)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {item.remaining > 0 ? formatGil(item.remaining) : '✓'}
                        </td>

                        {/* Price per unit */}
                        <td
                          style={{
                            padding: '0.65rem 1rem',
                            textAlign: 'right',
                            color: 'var(--color-text-muted)',
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.8rem',
                          }}
                        >
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
                {sortedItems.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '1px solid rgba(197,160,89,0.2)', background: 'rgba(197,160,89,0.04)' }}>
                      <td
                        colSpan={4}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontSize: '0.8rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--color-gold-light)',
                          fontWeight: '600',
                        }}
                      >
                        {filter === 'all' ? 'Grand Total' : 'Needs Crafting Total'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <span className="gil-price" style={{ fontSize: '1rem' }}>
                          <span style={{ color: 'var(--color-gold-light)', fontWeight: '700' }}>
                            {formatGil(filteredGrandTotal)}
                          </span>
                          <span className="gil-coin" style={{ width: '15px', height: '15px', fontSize: '9px' }}>G</span>
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Footer note */}
            <div
              style={{
                padding: '0.6rem 1.25rem',
                borderTop: '1px solid rgba(197,160,89,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.7rem',
                color: 'var(--color-text-muted)',
              }}
            >
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
