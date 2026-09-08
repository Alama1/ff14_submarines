import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
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
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const { Icon } = cfg;
  return (
    <span className={`op-status-badge op-status-${status}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function StatusStepper({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="op-cancelled-note">
        <XCircle size={14} />
        This order was cancelled. Contact @Alamai on Discord if you think this is a mistake.
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
              {cfg.label}
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
  return date.toLocaleString('en-GB', {
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
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: ApiOrder }) {
  const builds = useMemo(
    () => Array.from(new Set(order.items.map((it) => it.buildName || 'Build'))),
    [order.items]
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
              <Calendar size={11} /> Placed {formatDate(order.createdAt)}
            </span>
            <span className="op-card-meta-item">
              <Ship size={11} /> {totalParts} part{totalParts !== 1 ? 's' : ''} · {builds.length}{' '}
              build{builds.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="op-card-total-block">
          <span className="op-card-total-label">Order Total</span>
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
                      {item.partName}
                    </span>
                    <span className="op-item-qty" role="cell">
                      ×{item.quantity}
                    </span>
                    <span className="op-item-meta" role="cell">
                      <span className="op-item-type">
                        {item.partType === 'Materials' ? 'Extra' : item.partType}
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
          <span className="op-price-label is-muted">Subtotal</span>
          <span className="op-price-value">{formatGil(order.subtotal)}</span>
        </div>
        <div className="op-price-col">
          <span className="op-price-label is-success">Discount</span>
          <span className="op-price-value is-success">
            {discountPct > 0 ? `−${formatGil(order.discountAmt)} (${discountPct}%)` : '—'}
          </span>
        </div>
        <div className="op-price-col">
          <span className="op-price-label is-gold">Total</span>
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
            <Calendar size={10} /> Fulfillment
          </span>
          <span
            className={`op-meta-value ${
              order.fulfillmentDt && order.fulfillmentDt !== 'ASAP' ? 'is-warning' : ''
            }`}
          >
            {formatFulfillment(order.fulfillmentDt)}
          </span>
        </div>
        <div className="op-meta-col">
          <span className="op-meta-label">
            <CheckCircle size={10} /> Confirmed
          </span>
          <span className="op-meta-value">{formatDate(order.confirmedAt)}</span>
        </div>
        {order.notes && (
          <div className="op-meta-col op-meta-notes">
            <span className="op-meta-label">
              <FileText size={10} /> Notes
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
          <span className="op-queue-title">Current Build Queue</span>
          <span className="op-queue-count">
            {orders.length} order{orders.length !== 1 ? 's' : ''} · {formatNumber(totalParts)} part
            {totalParts !== 1 ? 's' : ''}
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
                <User size={11} /> Building for:
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
            <div className="op-queue-table" role="table" aria-label="Current build queue">
              <div className="op-queue-head" role="row">
                <span className="op-queue-th" role="columnheader">
                  Type
                </span>
                <span className="op-queue-th" role="columnheader">
                  Part
                </span>
                <span className="op-queue-th is-center" role="columnheader">
                  Crafted
                </span>
                <span className="op-queue-th is-center" role="columnheader">
                  Qty Needed
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
                      {item.partName}
                    </span>
                    <span className="op-queue-qty" role="cell">
                      ×{formatNumber(item.totalQty)}
                    </span>
                    <span className="op-queue-meta" role="cell">
                      <span className={`op-queue-type ${idx === 0 ? 'is-header' : ''}`}>
                        {idx === 0 ? (type === 'Materials' ? 'Extra' : type) : ''}
                      </span>
                      <span
                        className={`op-queue-crafted ${
                          item.readyStock >= item.totalQty ? 'is-complete' : ''
                        }`}
                        title={`${formatNumber(item.readyStock)} already crafted of ${formatNumber(item.totalQty)} needed`}
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
            <span>
              These orders are confirmed and currently being built. Your order appears here once
              @Alamai confirms your code.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Orders panel ────────────────────────────────────────────────────────

export default function OrdersPanel({ catalog, initialCode }: OrdersPanelProps) {
  const { inProgress, refresh } = catalog;

  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentCodes, setRecentCodes] = useState<string[]>(getRecentOrderCodes);

  const handleLookup = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
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
            ? `No order found with code "${code}". Double-check the code and try again.`
            : e.message
          : 'Failed to look up the order. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-lookup on mount when a code is passed from another tab (e.g. after
  // submitting an order). The component is keyed by the code in App, so this
  // runs exactly once per incoming code.
  const autoLookupDone = useRef(false);
  useEffect(() => {
    if (!initialCode || autoLookupDone.current) return;
    autoLookupDone.current = true;
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
              ? `No order found with code "${initialCode}". Double-check the code and try again.`
              : e.message
            : 'Failed to look up the order. Please try again.'
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [initialCode]);

  const handleRemoveRecent = (code: string) => {
    removeRecentOrderCode(code);
    setRecentCodes(getRecentOrderCodes());
  };

  const handleRefresh = () => {
    // Always hit the API — the refresh button must show fresh data
    refresh(true);
    if (order) handleLookup(order.orderCode);
  };

  return (
    <div className="fade-in op-page">
      {/* Header */}
      <div className="op-header">
        <div>
          <h2 className="op-header-title">
            <Ship size={22} /> Order Tracking
          </h2>
          <p className="op-header-sub">
            Enter the confirmation code you received when submitting your order to check its
            status.
          </p>
        </div>
        <button type="button" className="ff-btn-secondary op-refresh-btn" onClick={handleRefresh}>
          <RefreshCw size={14} className={catalog.loading ? 'spin' : ''} />
          Refresh
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
            <label className="form-label op-code-label">Confirmation Code</label>
            <input
              type="text"
              className="form-input op-code-input"
              placeholder="e.g. SUB-7K9P"
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
            {loading ? 'Searching…' : 'Track Order'}
          </button>
        </form>

        {/* Recent codes */}
        {recentCodes.length > 0 && (
          <div className="op-recent">
            <span className="op-recent-label">
              <History size={11} /> Your recent orders:
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
                    title="Forget this code"
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
          <p className="op-loading-text">Diving through the order ledger…</p>
        </div>
      )}

      {order && !loading && <OrderCard order={order} />}

      {/* Public build queue */}
      {inProgress.length > 0 && <BuildQueue orders={inProgress} />}

      {!order && !loading && !error && (
        <div className="op-empty">
          <Package size={32} className="op-empty-icon" />
          <div className="op-empty-title-block">
            <span className="op-empty-title">No order loaded yet</span>
            <span className="op-empty-sub">
              Submit an order from the Set Builder to receive a code, then track it here. Your
              recent codes are remembered on this device.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
