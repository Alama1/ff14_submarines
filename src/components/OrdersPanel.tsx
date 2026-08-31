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

interface OrdersPanelProps {
  catalog: ReturnType<typeof useCatalog>;
  initialCode?: string;
}

// ─── Status configuration ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; border: string; Icon: ElementType }
> = {
  pending: {
    label: 'Pending Confirmation',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
    Icon: Clock,
  },
  confirmed: {
    label: 'Confirmed',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.1)',
    border: 'rgba(96,165,250,0.3)',
    Icon: CheckCircle,
  },
  in_progress: {
    label: 'In Progress',
    color: 'var(--color-gold)',
    bg: 'rgba(197,160,89,0.12)',
    border: 'rgba(197,160,89,0.3)',
    Icon: Hammer,
  },
  finished: {
    label: 'Finished',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.1)',
    border: 'rgba(167,139,250,0.3)',
    Icon: PackageCheck,
  },
  fulfilled: {
    label: 'Fulfilled',
    color: 'var(--color-success)',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
    Icon: CheckCircle,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'var(--color-error)',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    Icon: XCircle,
  },
};

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'in_progress', 'finished', 'fulfilled'];

function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const { Icon } = cfg;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.2rem 0.6rem',
        borderRadius: '99px',
        fontSize: '0.72rem',
        fontWeight: '700',
        letterSpacing: '0.04em',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function StatusStepper({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 0.9rem',
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '4px',
          color: 'var(--color-error)',
          fontSize: '0.82rem',
        }}
      >
        <XCircle size={14} />
        This order was cancelled. Contact @Alamai on Discord if you think this is a mistake.
      </div>
    );
  }

  const currentIndex = STATUS_FLOW.indexOf(status);

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
      {STATUS_FLOW.map((step, idx) => {
        const cfg = STATUS_CONFIG[step];
        const isDone = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const color = isDone || isCurrent ? cfg.color : 'var(--color-text-muted)';
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {idx > 0 && (
              <div
                style={{
                  width: '18px',
                  height: '1px',
                  background: idx <= currentIndex ? 'var(--color-gold)' : 'rgba(255,255,255,0.12)',
                }}
              />
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: isCurrent ? '0.25rem 0.55rem' : '0.25rem 0.3rem',
                borderRadius: '99px',
                background: isCurrent ? cfg.bg : 'transparent',
                border: isCurrent ? `1px solid ${cfg.border}` : '1px solid transparent',
                color,
                fontSize: '0.7rem',
                fontWeight: isCurrent ? '700' : '500',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
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
    <div
      className="ff-card-framed fade-in"
      style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
          paddingBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '1.4rem',
                fontWeight: '700',
                letterSpacing: '0.12em',
                color: 'var(--color-gold-light)',
                textShadow: '0 0 10px var(--color-gold-glow)',
              }}
            >
              {order.orderCode}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <User size={11} /> {order.clientName}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Calendar size={11} /> Placed {formatDate(order.createdAt)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Ship size={11} /> {totalParts} part{totalParts !== 1 ? 's' : ''} · {builds.length}{' '}
              build{builds.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text-muted)',
              display: 'block',
            }}
          >
            Order Total
          </span>
          <div className="gil-price" style={{ fontSize: '1.4rem' }}>
            <span>{formatNumber(order.total)}</span>
            <span className="gil-coin" style={{ width: '18px', height: '18px', fontSize: '10px' }}>G</span>
          </div>
        </div>
      </div>

      {/* Status flow */}
      <StatusStepper status={order.status} />

      {/* Items grouped by build */}
      {builds.map((build) => (
        <div key={build}>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              color: 'var(--color-gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '0.4rem',
            }}
          >
            {build}
          </div>
          <div
            style={{
              background: 'var(--bg-input)',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.05)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <tbody>
                {order.items
                  .filter((it) => (it.buildName || 'Build') === build)
                  .map((item) => (
                    <tr
                      key={item.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                    >
                      <td
                        style={{
                          padding: '0.5rem 0.75rem',
                          color: 'var(--color-text-muted)',
                          width: '70px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {item.partType === 'Materials' ? 'Extra' : item.partType}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-title)' }}>
                        {item.partName}
                      </td>
                      <td
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: 'var(--color-gold)',
                          width: '60px',
                        }}
                      >
                        ×{item.quantity}
                      </td>
                      <td
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'right',
                          color: 'var(--color-text-muted)',
                          width: '120px',
                        }}
                      >
                        {formatGil(item.unitPrice)}
                      </td>
                      <td
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: 'var(--color-gold-light)',
                          width: '130px',
                        }}
                      >
                        {formatGil(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Pricing summary */}
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          background: 'rgba(197,160,89,0.03)',
          border: '1px solid rgba(197,160,89,0.1)',
          borderRadius: '4px',
          padding: '0.75rem 1rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <span
            style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Subtotal
          </span>
          <span style={{ fontSize: '0.88rem', color: 'var(--color-text-title)', fontWeight: '600' }}>
            {formatGil(order.subtotal)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <span
            style={{ fontSize: '0.68rem', color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Discount
          </span>
          <span style={{ fontSize: '0.88rem', color: 'var(--color-success)', fontWeight: '600' }}>
            {discountPct > 0 ? `−${formatGil(order.discountAmt)} (${discountPct}%)` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <span
            style={{ fontSize: '0.68rem', color: 'var(--color-gold-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Total
          </span>
          <div className="gil-price" style={{ fontSize: '1.05rem' }}>
            <span>{formatNumber(order.total)}</span>
            <span className="gil-coin" style={{ width: '14px', height: '14px', fontSize: '8px' }}>G</span>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span
            style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Calendar size={10} /> Fulfillment
          </span>
          <span style={{ color: order.fulfillmentDt && order.fulfillmentDt !== 'ASAP' ? 'var(--color-warning)' : 'var(--color-text-main)' }}>
            {formatFulfillment(order.fulfillmentDt)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span
            style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <CheckCircle size={10} /> Confirmed
          </span>
          <span style={{ color: 'var(--color-text-main)' }}>{formatDate(order.confirmedAt)}</span>
        </div>
        {order.notes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: '200px' }}>
            <span
              style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <FileText size={10} /> Notes
            </span>
            <span style={{ color: 'var(--color-text-main)', fontStyle: 'italic' }}>{order.notes}</span>
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
    <div
      style={{
        border: `1px solid ${open ? 'rgba(96,165,250,0.35)' : 'rgba(96,165,250,0.15)'}`,
        borderRadius: '6px',
        background: open
          ? 'linear-gradient(135deg, rgba(96,165,250,0.06) 0%, rgba(18,24,36,0.85) 100%)'
          : 'rgba(96,165,250,0.03)',
        transition: 'all 0.25s ease',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Layers size={16} style={{ color: '#60a5fa' }} />
          <span style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--color-text-title)' }}>
            Current Build Queue
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              color: '#60a5fa',
              background: 'rgba(96,165,250,0.12)',
              border: '1px solid rgba(96,165,250,0.25)',
              borderRadius: '99px',
              padding: '0.1rem 0.55rem',
              fontWeight: '600',
            }}
          >
            {orders.length} order{orders.length !== 1 ? 's' : ''} · {formatNumber(totalParts)} part
            {totalParts !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid rgba(96,165,250,0.12)', padding: '0.75rem 1rem 1rem' }}>
          {/* Clients being built for */}
          {clients.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginBottom: '0.85rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <User size={11} /> Building for:
              </span>
              {clients.map((name) => (
                <span
                  key={name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    background: 'rgba(96,165,250,0.12)',
                    border: '1px solid rgba(96,165,250,0.25)',
                    borderRadius: '99px',
                    padding: '0.15rem 0.55rem',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    color: '#60a5fa',
                  }}
                >
                  <User size={10} />
                  {name}
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              background: 'var(--bg-input)',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.05)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr
                  style={{
                    background: 'rgba(96,165,250,0.06)',
                    borderBottom: '1px solid rgba(96,165,250,0.15)',
                  }}
                >
                  <th style={{ padding: '0.5rem 0.75rem', color: '#60a5fa', textAlign: 'left', width: '110px' }}>
                    Type
                  </th>
                  <th style={{ padding: '0.5rem 0.75rem', color: '#60a5fa', textAlign: 'left' }}>Part</th>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      color: '#60a5fa',
                      textAlign: 'center',
                      width: '90px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Crafted
                  </th>
                  <th style={{ padding: '0.5rem 0.75rem', color: '#60a5fa', textAlign: 'center', width: '90px' }}>
                    Qty Needed
                  </th>
                </tr>
              </thead>
              <tbody>
                {ALL_PART_TYPES.map((type) => {
                  const items = grouped[type];
                  if (!items || items.length === 0) return null;
                  return items.map((item, idx) => (
                    <tr
                      key={`${type}-${item.partName}`}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        background: type === 'Materials' ? 'rgba(197,160,89,0.02)' : 'transparent',
                      }}
                    >
                      <td
                        style={{
                          padding: '0.45rem 0.75rem',
                          color: 'var(--color-text-muted)',
                          fontWeight: idx === 0 ? '600' : '400',
                          fontSize: '0.78rem',
                        }}
                      >
                        {idx === 0 ? (type === 'Materials' ? 'Extra' : type) : ''}
                      </td>
                      <td style={{ padding: '0.45rem 0.75rem', color: 'var(--color-text-title)' }}>
                        {item.partName}
                      </td>
                      <td
                        style={{
                          padding: '0.45rem 0.75rem',
                          textAlign: 'center',
                          fontWeight: '600',
                          color:
                            item.readyStock >= item.totalQty
                              ? 'var(--color-success)'
                              : 'var(--color-text-muted)',
                        }}
                        title={`${formatNumber(item.readyStock)} already crafted of ${formatNumber(item.totalQty)} needed`}
                      >
                        {formatNumber(item.readyStock)}
                      </td>
                      <td
                        style={{
                          padding: '0.45rem 0.75rem',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: '#60a5fa',
                        }}
                      >
                        ×{formatNumber(item.totalQty)}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.72rem',
              color: 'var(--color-text-muted)',
              marginTop: '0.6rem',
            }}
          >
            <Hammer size={11} style={{ color: '#60a5fa', flexShrink: 0 }} />
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
    refresh();
    if (order) handleLookup(order.orderCode);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Ship style={{ color: 'var(--color-gold)' }} size={22} /> Order Tracking
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
            Enter the confirmation code you received when submitting your order to check its
            status.
          </p>
        </div>
        <button
          type="button"
          className="ff-btn-secondary"
          onClick={handleRefresh}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} className={catalog.loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Lookup form */}
      <div className="ff-card-framed" style={{ padding: '1.25rem' }}>
        <form
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup(codeInput);
          }}
        >
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '220px' }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>
              Confirmation Code
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. SUB-7K9P"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              style={{ fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              maxLength={20}
            />
          </div>
          <button
            type="submit"
            className="ff-btn"
            style={{ height: '42px' }}
            disabled={loading || !codeInput.trim()}
          >
            {loading ? <RefreshCw size={15} className="spin" /> : <Search size={15} />}
            {loading ? 'Searching…' : 'Track Order'}
          </button>
        </form>

        {/* Recent codes */}
        {recentCodes.length > 0 && (
          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <History size={11} /> Your recent orders:
            </span>
            {recentCodes.map((code) => (
              <span
                key={code}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  background: order?.orderCode === code ? 'rgba(197,160,89,0.15)' : 'rgba(197,160,89,0.05)',
                  border: `1px solid ${order?.orderCode === code ? 'var(--color-gold)' : 'rgba(197,160,89,0.2)'}`,
                  borderRadius: '4px',
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  color: 'var(--color-gold-light)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCodeInput(code);
                    handleLookup(code);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    font: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {code}
                </button>
                <button
                  type="button"
                  title="Forget this code"
                  onClick={() => handleRemoveRecent(code)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="ff-alert ff-alert-warning" style={{ margin: 0 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {loading && !order && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '160px',
            gap: '1rem',
          }}
        >
          <RefreshCw size={30} className="spin" style={{ color: 'var(--color-gold)' }} />
          <p
            style={{
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-title)',
              letterSpacing: '0.05em',
              fontStyle: 'italic',
            }}
          >
            Diving through the order ledger…
          </p>
        </div>
      )}

      {order && !loading && <OrderCard order={order} />}

      {/* Public build queue */}
      {inProgress.length > 0 && <BuildQueue orders={inProgress} />}

      {!order && !loading && !error && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            gap: '0.75rem',
            border: '1px dashed rgba(197,160,89,0.25)',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.015)',
          }}
        >
          <Package size={32} style={{ color: 'var(--color-gold-dark)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: '600', color: 'var(--color-text-title)' }}>
              No order loaded yet
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', maxWidth: '420px' }}>
              Submit an order from the Set Builder to receive a code, then track it here. Your
              recent codes are remembered on this device.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
