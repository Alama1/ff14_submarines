import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { itemName } from '../itemNames';
import {
  Search,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Hammer,
  PackageCheck,
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  History,
  Trash2,
  Ship,
  FileText,
  Calendar,
  User,
  Layers,
} from 'lucide-react';
import { lookupOrder } from '../api/endpoints';
import { ApiError } from '../api/client';
import { ApiOrder, InProgressOrder, OrderStatus } from '../api/types';
import { formatGil, formatNumber, ALL_PART_TYPES } from '../utils/format';
import {
  addRecentOrderCode,
  getRecentOrderCodes,
  removeRecentOrderCode,
} from '../utils/orderCodes';
import { useCatalog } from '../hooks/useCatalog';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import './OrdersPanel.css';

interface OrdersPanelProps {
  catalog: ReturnType<typeof useCatalog>;
  initialCode?: string;
}

// ─── Status configuration ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { label: string; Icon: ElementType }> = {
  pending: { label: 'Pending Confirmation', Icon: Clock },
  confirmed: { label: 'Confirmed', Icon: CheckCircle },
  in_progress: { label: 'In Progress', Icon: Hammer },
  finished: { label: 'Finished', Icon: PackageCheck },
  fulfilled: { label: 'Fulfilled', Icon: CheckCircle },
  cancelled: { label: 'Cancelled', Icon: XCircle },
};

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'in_progress', 'finished', 'fulfilled'];

function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const { Icon } = cfg;
  return (
    <span className={`op-status-badge op-status-${status}`}>
      <Icon size={11} />
      {t(`orderStatus.${status}`, { defaultValue: cfg.label })}
    </span>
  );
}

function StatusStepper({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  if (status === 'cancelled') {
    return (
      <div className="op-cancelled-note">
        <XCircle size={14} />
        {t('orders.cancelledNote')}
      </div>
    );
  }

  const currentIndex = STATUS_FLOW.indexOf(status);

  return (
    <div className="op-stepper">
      {STATUS_FLOW.map((step, idx) => {
        const cfg = STATUS_CONFIG[step];
        const isDone = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        return (
          <div key={step} className="op-step">
            {idx > 0 && (
              <div className={`op-step-connector ${idx <= currentIndex ? 'is-active' : ''}`} />
            )}
            <div
              className={`op-step-pill op-status-${step} ${isDone ? 'is-done' : ''} ${
                isCurrent ? 'is-current' : ''
              }`}
            >
              {isDone ? <CheckCircle size={11} /> : isCurrent ? <cfg.Icon size={11} /> : null}
              {t(`orderStatus.${step}`, { defaultValue: cfg.label })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString(i18n.language, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFulfillment(dateStr: string | null): string {
  if (!dateStr || dateStr === 'ASAP') return 'ASAP';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: ApiOrder }) {
  const { t } = useTranslation();
  const builds = useMemo(
    () => Array.from(new Set(order.items.map((it) => it.buildName || t('common.build')))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order.items, t]
  );
  const totalParts = order.items.reduce((s, it) => s + it.quantity, 0);
  const discountPct = Number(order.discountPct) || 0;

  return (
    <div className="ff-card-framed fade-in op-card">
      {/* Header */}
      <div className="op-card-header">
        <div className="op-card-id-block">
          <div className="op-card-code-row">
            <span className="op-card-code">{order.orderCode}</span>
            <StatusBadge status={order.status} />
          </div>
          <div className="op-card-meta">
            <span className="op-card-meta-item">
              <User size={11} /> {order.clientName}
            </span>
            <span className="op-card-meta-item">
              <Calendar size={11} /> {t('orders.placed')} {formatDate(order.createdAt)}
            </span>
            <span className="op-card-meta-item">
              <Ship size={11} />{' '}
              {t('orders.partsBuildsMeta', {
                parts: t('units.part', { count: totalParts, n: totalParts }),
                builds: t('units.build', { count: builds.length, n: builds.length }),
              })}
            </span>
          </div>
        </div>

        <div className="op-card-total-block">
          <span className="op-card-total-label">{t('orders.orderTotal')}</span>
          <div className="gil-price op-card-total">
            <span>{formatNumber(order.total)}</span>
            <span className="gil-coin op-coin-lg">G</span>
          </div>
        </div>
      </div>

      {/* Status flow */}
      <StatusStepper status={order.status} />

      {/* Items grouped by build */}
      {builds.map((build) => (
        <div key={build}>
          <div className="op-build-label">{build}</div>
          <div className="op-table-box">
            <div className="op-items" role="table" aria-label={`${build} items`}>
              {order.items
                .filter((it) => (it.buildName || 'Build') === build)
                .map((item) => (
                  <div key={item.id} className="op-item-row" role="row">
                    <span className="op-item-name" role="cell">
                      {itemName(item.partName)}
                    </span>
                    <span className="op-item-qty" role="cell">
                      ×{item.quantity}
                    </span>
                    <span className="op-item-meta" role="cell">
                      <span className="op-item-type">
                        {item.partType === 'Materials'
                          ? t('common.extra')
                          : t(`parts.${item.partType}`, { defaultValue: item.partType })}
                      </span>
                      <span className="op-item-unit">{formatGil(item.unitPrice)}</span>
                    </span>
                    <span className="op-item-line" role="cell">
                      {formatGil(item.lineTotal)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ))}

      {/* Pricing summary */}
      <div className="op-pricing">
        <div className="op-price-col">
          <span className="op-price-label is-muted">{t('common.subtotal')}</span>
          <span className="op-price-value">{formatGil(order.subtotal)}</span>
        </div>
        <div className="op-price-col">
          <span className="op-price-label is-success">
            {order.discountSource === 'promo' && order.promoCode
              ? t('orders.promoLabel', { code: order.promoCode })
              : t('orders.discount')}
          </span>
          <span className="op-price-value is-success">
            {order.discountAmt > 0
              ? `−${formatGil(order.discountAmt)}${
                  discountPct > 0 && order.discountSource !== 'promo'
                    ? ` (${discountPct}%)`
                    : ''
                }`
              : '—'}
          </span>
        </div>
        <div className="op-price-col">
          <span className="op-price-label is-gold">{t('common.total')}</span>
          <div className="gil-price op-price-total">
            <span>{formatNumber(order.total)}</span>
            <span className="gil-coin op-coin-sm">G</span>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="op-meta">
        <div className="op-meta-col">
          <span className="op-meta-label">
            <Calendar size={10} /> {t('orders.fulfillment')}
          </span>
          <span
            className={`op-meta-value ${
              order.fulfillmentDt && order.fulfillmentDt !== 'ASAP' ? 'is-warning' : ''
            }`}
          >
            {formatFulfillment(order.fulfillmentDt) === 'ASAP'
              ? t('orders.asap')
              : formatFulfillment(order.fulfillmentDt)}
          </span>
        </div>
        <div className="op-meta-col">
          <span className="op-meta-label">
            <CheckCircle size={10} /> {t('orders.confirmedAt')}
          </span>
          <span className="op-meta-value">{formatDate(order.confirmedAt)}</span>
        </div>
        {order.notes && (
          <div className="op-meta-col op-meta-notes">
            <span className="op-meta-label">
              <FileText size={10} /> {t('orders.notes')}
            </span>
            <span className="op-meta-notes-text">{order.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Build queue (public in-progress orders) ──────────────────────────────────

function BuildQueue({ orders }: { orders: InProgressOrder[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { partName: string; partType: string; totalQty: number; readyStock: number }
    >();
    for (const order of orders) {
      for (const item of order.items) {
        const existing = map.get(item.partName);
        if (existing) {
          existing.totalQty += item.quantity;
          // Stock is the part's total ready count (same value on every order
          // item referencing the part) — never sum it, take the max.
          existing.readyStock = Math.max(existing.readyStock, item.stock);
        } else {
          map.set(item.partName, {
            partName: item.partName,
            partType: item.partType ?? 'Materials',
            totalQty: item.quantity,
            readyStock: item.stock,
          });
        }
      }
    }
    const grouped: Record<
      string,
      { partName: string; totalQty: number; readyStock: number }[]
    > = {};
    for (const entry of map.values()) {
      if (!grouped[entry.partType]) grouped[entry.partType] = [];
      grouped[entry.partType].push({
        partName: entry.partName,
        totalQty: entry.totalQty,
        readyStock: entry.readyStock,
      });
    }
    for (const type of Object.keys(grouped)) {
      grouped[type].sort((a, b) => a.partName.localeCompare(b.partName));
    }
    return grouped;
  }, [orders]);

  // Clients the current queue is being built for (deduplicated)
  const clients = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const order of orders) {
      const name = (order.clientName ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(name);
      }
    }
    return list;
  }, [orders]);

  const totalParts = orders.reduce(
    (sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0),
    0
  );

  return (
    <div className={`op-queue ${open ? 'is-open' : ''}`}>
      <div className="op-queue-header" onClick={() => setOpen((v) => !v)}>
        <div className="op-queue-title-row">
          <Layers size={16} className="op-queue-icon" />
          <span className="op-queue-title">{t('queue.title')}</span>
          <span className="op-queue-count">
            {t('queue.count', {
              orders: t('units.order', { count: orders.length, n: orders.length }),
              parts: t('units.part', { count: totalParts, n: formatNumber(totalParts) }),
            })}
          </span>
        </div>
        <div className="op-queue-chevron">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
      </div>

      {open && (
        <div className="op-queue-body">
          {/* Clients being built for */}
          {clients.length > 0 && (
            <div className="op-queue-clients">
              <span className="op-queue-clients-label">
                <User size={11} /> {t('queue.buildingFor')}
              </span>
              {clients.map((name) => (
                <span key={name} className="op-queue-client-chip">
                  <User size={10} />
                  {name}
                </span>
              ))}
            </div>
          )}

          <div className="op-table-box">
            <div className="op-queue-table" role="table" aria-label={t('queue.title')}>
              <div className="op-queue-head" role="row">
                <span className="op-queue-th" role="columnheader">
                  {t('queue.thType')}
                </span>
                <span className="op-queue-th" role="columnheader">
                  {t('queue.thPart')}
                </span>
                <span className="op-queue-th is-center" role="columnheader">
                  {t('queue.thCrafted')}
                </span>
                <span className="op-queue-th is-center" role="columnheader">
                  {t('queue.thNeeded')}
                </span>
              </div>
              {ALL_PART_TYPES.map((type) => {
                const items = grouped[type];
                if (!items || items.length === 0) return null;
                return items.map((item, idx) => (
                  <div
                    key={`${type}-${item.partName}`}
                    className={`op-queue-tr ${type === 'Materials' ? 'is-materials' : ''}`}
                    role="row"
                  >
                    <span className="op-queue-part" role="cell">
                      {itemName(item.partName)}
                    </span>
                    <span className="op-queue-qty" role="cell">
                      ×{formatNumber(item.totalQty)}
                    </span>
                    <span className="op-queue-meta" role="cell">
                      <span className={`op-queue-type ${idx === 0 ? 'is-header' : ''}`}>
                        {idx === 0
                          ? type === 'Materials'
                            ? t('common.extra')
                            : t(`parts.${type}`, { defaultValue: type })
                          : ''}
                      </span>
                      <span
                        className={`op-queue-crafted ${
                          item.readyStock >= item.totalQty ? 'is-complete' : ''
                        }`}
                        title={t('queue.craftedTip', {
                          ready: formatNumber(item.readyStock),
                          total: formatNumber(item.totalQty),
                        })}
                      >
                        {formatNumber(item.readyStock)}
                      </span>
                    </span>
                  </div>
                ));
              })}
            </div>
          </div>
          <div className="op-queue-note">
            <Hammer size={11} />
            <span>{t('queue.note')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Orders panel ────────────────────────────────────────────────────────

export default function OrdersPanel({ catalog, initialCode }: OrdersPanelProps) {
  const { t } = useTranslation();
  const { inProgress, refresh } = catalog;

  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentCodes, setRecentCodes] = useState<string[]>(getRecentOrderCodes);

  // Sequence guard: invalidates in-flight background order lookups so a slow
  // poll can never overwrite a newer manual lookup.
  const lookupSeq = useRef(0);

  const handleLookup = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    lookupSeq.current += 1;
    setLoading(true);
    setError('');
    try {
      const result = await lookupOrder(code);
      setOrder(result);
      addRecentOrderCode(code);
      setRecentCodes(getRecentOrderCodes());
    } catch (e: unknown) {
      setOrder(null);
      setError(
        e instanceof ApiError
          ? e.status === 404
            ? t('orders.notFound', { code })
            : e.message
          : t('orders.lookupFailed')
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Auto-lookup on mount when a code is passed from another tab (e.g. after
  // submitting an order). The component is keyed by the code in App, so this
  // runs exactly once per incoming code.
  const autoLookupDone = useRef(false);
  useEffect(() => {
    if (!initialCode || autoLookupDone.current) return;
    autoLookupDone.current = true;
    lookupSeq.current += 1;
    setLoading(true);
    lookupOrder(initialCode)
      .then((result) => {
        setOrder(result);
        addRecentOrderCode(initialCode);
        setRecentCodes(getRecentOrderCodes());
      })
      .catch((e: unknown) => {
        setOrder(null);
        setError(
          e instanceof ApiError
            ? e.status === 404
              ? t('orders.notFound', { code: initialCode })
              : e.message
            : t('orders.lookupFailed')
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [initialCode, t]);

  const handleRemoveRecent = (code: string) => {
    removeRecentOrderCode(code);
    setRecentCodes(getRecentOrderCodes());
  };

  const handleRefresh = () => {
    // Always hit the API — the refresh button must show fresh data
    refresh(true);
    if (order) handleLookup(order.orderCode);
  };

  // Auto-refresh while the tab stays open: silently update the build queue
  // (no loading toggle, so the page never flashes or loses state) and re-check
  // the currently loaded order's status. Errors are ignored — the last known
  // data simply stays on screen until the next poll.
  useAutoRefresh(
    () => {
      refresh(false, true);
      if (order) {
        const seq = ++lookupSeq.current;
        const code = order.orderCode;
        lookupOrder(code)
          .then((result) => {
            if (lookupSeq.current === seq) setOrder(result);
          })
          .catch(() => {
            // Keep showing the last known order state on transient failures.
          });
      }
    },
    catalog.loading || loading
  );

  return (
    <div className="fade-in op-page">
      {/* Header */}
      <div className="op-header">
        <div>
          <h2 className="op-header-title">
            <Ship size={22} /> {t('orders.title')}
          </h2>
          <p className="op-header-sub">{t('orders.sub')}</p>
        </div>
        <button type="button" className="ff-btn-secondary op-refresh-btn" onClick={handleRefresh}>
          <RefreshCw size={14} className={catalog.loading ? 'spin' : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {/* Lookup form */}
      <div className="ff-card-framed op-lookup-card">
        <form
          className="op-lookup-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup(codeInput);
          }}
        >
          <div className="form-group op-code-group">
            <label className="form-label op-code-label">{t('orders.codeLabel')}</label>
            <input
              type="text"
              className="form-input op-code-input"
              placeholder={t('orders.codePlaceholder')}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
          <button
            type="submit"
            className="ff-btn op-track-btn"
            disabled={loading || !codeInput.trim()}
          >
            {loading ? <RefreshCw size={15} className="spin" /> : <Search size={15} />}
            {loading ? t('common.searching') : t('orders.track')}
          </button>
        </form>

        {/* Recent codes */}
        {recentCodes.length > 0 && (
          <div className="op-recent">
            <span className="op-recent-label">
              <History size={11} /> {t('orders.recentLabel')}
            </span>
            <div className="op-recent-grid">
              {recentCodes.slice(0, 4).map((code) => (
                <span
                  key={code}
                  className={`op-recent-chip ${order?.orderCode === code ? 'is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="op-recent-code-btn"
                    onClick={() => {
                      setCodeInput(code);
                      handleLookup(code);
                    }}
                  >
                    {code}
                  </button>
                  <button
                    type="button"
                    className="op-recent-remove-btn"
                    title={t('common.forgetTip')}
                    onClick={() => handleRemoveRecent(code)}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="ff-alert ff-alert-warning op-alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading && !order && (
        <div className="op-loading">
          <RefreshCw size={30} className="spin op-loading-spinner" />
          <p className="op-loading-text">{t('orders.loadingText')}</p>
        </div>
      )}

      {order && !loading && <OrderCard order={order} />}

      {/* Public build queue */}
      {inProgress.length > 0 && <BuildQueue orders={inProgress} />}

      {!order && !loading && !error && (
        <div className="op-empty">
          <Package size={32} className="op-empty-icon" />
          <div className="op-empty-title-block">
            <span className="op-empty-title">{t('orders.emptyTitle')}</span>
            <span className="op-empty-sub">{t('orders.emptySub')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
