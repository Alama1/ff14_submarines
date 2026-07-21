import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadOrders,
  saveOrder,
  updateOrder,
  deleteOrder,
  parseOrderText,
  formatGil,
} from '../SubmarineData';
import { Order, OrderItem, OrderStatus, SubmarinePart } from '../types';
import {
  ClipboardPaste,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Save,
  RefreshCw,
  Package,
  User,
  FileText,
  Plus,
  PencilLine,
  Minus,
  Calendar,
} from 'lucide-react';

function getTimestamp(): number { return Date.now(); }

interface OrderTrackerProps {
  parts: SubmarinePart[];
}

type InputMode = 'paste' | 'manual';

interface ManualItem {
  id: string;
  partId: string;
  quantity: number;
}

interface ManualBuild {
  id: string;
  buildName: string;
  items: ManualItem[];
}

function formatFulfillmentDate(dateStr: string): string {
  if (!dateStr || dateStr === 'ASAP') return 'ASAP';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; border: string; Icon: React.ElementType }
> = {
  pending: {
    label: 'Pending',
    color: 'var(--color-warning)',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
    Icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.1)',
    border: 'rgba(96,165,250,0.3)',
    Icon: AlertCircle,
  },
  completed: {
    label: 'Completed',
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

const ALL_STATUSES: OrderStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status];
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

function OrderItemsTable({ items }: { items: OrderItem[] }) {
  const builds = Array.from(new Set(items.map((it) => it.buildName)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.82rem',
          tableLayout: 'fixed',
        }}
      >
        <thead>
          <tr
            style={{
              background: 'rgba(197,160,89,0.04)',
              borderBottom: '1px solid rgba(197,160,89,0.18)',
            }}
          >
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-gold)', textAlign: 'left', width: '22%' }}>Build</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-gold)', textAlign: 'left', width: '12%' }}>Type</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-gold)', textAlign: 'left' }}>Part</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-gold)', textAlign: 'center', width: '60px' }}>Qty</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-gold)', textAlign: 'right', width: '130px' }}>Unit Price</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-gold)', textAlign: 'right', width: '130px' }}>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {builds.map((build) => {
            const buildItems = items.filter((it) => it.buildName === build);
            return buildItems.map((item, idx) => (
              <tr
                key={`${build}-${idx}`}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: item.partType === 'Materials' ? 'rgba(197,160,89,0.02)' : 'transparent',
                }}
              >
                <td style={{ padding: '0.45rem 0.75rem', color: 'var(--color-gold-light)', fontWeight: '600', fontSize: '0.78rem' }}>
                  {idx === 0 ? build : ''}
                </td>
                <td style={{ padding: '0.45rem 0.75rem', color: 'var(--color-text-muted)' }}>
                  {item.partType === 'Materials' ? 'Extra' : item.partType}
                </td>
                <td style={{ padding: '0.45rem 0.75rem', color: item.partId ? 'var(--color-text-title)' : 'var(--color-warning)' }}>
                  {item.partName}
                  {!item.partId && (
                    <span
                      title="Part not matched in current stock data"
                      style={{
                        marginLeft: '0.4rem',
                        fontSize: '0.65rem',
                        color: 'var(--color-warning)',
                        background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        borderRadius: '3px',
                        padding: '0 0.3rem',
                      }}
                    >
                      unmatched
                    </span>
                  )}
                </td>
                <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center', fontWeight: '700' }}>
                  ×{item.quantity}
                </td>
                <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                  {formatGil(item.unitPrice)}
                </td>
                <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: '600', color: 'var(--color-gold-light)' }}>
                  {formatGil(item.lineTotal)}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

interface OrderRowProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onNotesChange: (id: string, notes: string) => void;
  onFulfillmentChange: (id: string, date: string) => void;
  onDelete: (id: string) => void;
}

function OrderRow({ order, onStatusChange, onNotesChange, onFulfillmentChange, onDelete }: OrderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [localNotes, setLocalNotes] = useState(order.notes || '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const [localFulfillmentDate, setLocalFulfillmentDate] = useState(order.fulfillmentDate || 'ASAP');
  const [localFulfillmentType, setLocalFulfillmentType] = useState((order.fulfillmentDate || 'ASAP') === 'ASAP' ? 'asap' : 'date');
  const [fulfillmentDirty, setFulfillmentDirty] = useState(false);
  const [savingFulfillment, setSavingFulfillment] = useState(false);

    const handleSaveFulfillment = async () => {
    setSavingFulfillment(true);
    await onFulfillmentChange(order.id, localFulfillmentDate);
    setSavingFulfillment(false);
    setFulfillmentDirty(false);
  };

  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    await onNotesChange(order.id, localNotes);
    setSavingNotes(false);
    setNotesDirty(false);
  };

  const totalParts = order.items.reduce((s, it) => s + it.quantity, 0);
  const buildNames = Array.from(new Set(order.items.map((it) => it.buildName)));

  return (
    <div
      style={{
        border: `1px solid ${expanded ? cfg.border : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '6px',
        background: expanded
          ? 'linear-gradient(135deg, rgba(21,31,51,0.8) 0%, rgba(18,24,36,0.9) 100%)'
          : 'rgba(18,24,36,0.5)',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.9rem 1rem',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Client + meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <User size={13} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
            <span
              style={{
                fontWeight: '700',
                fontSize: '0.95rem',
                color: 'var(--color-text-title)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {order.clientName}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {new Date(order.createdAt).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {totalParts} part{totalParts !== 1 ? 's' : ''} · {buildNames.length} build{buildNames.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '0.72rem', color: (order.fulfillmentDate || 'ASAP') === 'ASAP' ? 'var(--color-text-muted)' : 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={11} /> {formatFulfillmentDate(order.fulfillmentDate || 'ASAP')}
            </span>
            {order.notes && (
              <span style={{ fontSize: '0.7rem', color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <FileText size={10} /> Notes
              </span>
            )}
          </div>
        </div>

        {/* Total price */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="gil-price" style={{ fontSize: '1.05rem' }}>
            <span>{new Intl.NumberFormat('en-US').format(order.total)}</span>
            <span className="gil-coin" style={{ width: '15px', height: '15px', fontSize: '9px' }}>G</span>
          </div>
          {order.discountPercent > 0 && (
            <div style={{ fontSize: '0.68rem', color: 'var(--color-success)' }}>
              −{order.discountPercent}% bulk
            </div>
          )}
        </div>

        {/* Status selector */}
        <select
          className="form-select"
          value={order.status}
          style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', height: '32px', minWidth: '120px' }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>

        {/* Expand + delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="ff-btn-danger"
            style={{ padding: '0.3rem 0.5rem', height: '32px', display: 'inline-flex', alignItems: 'center' }}
            title="Delete order"
            onClick={(e) => { e.stopPropagation(); onDelete(order.id); }}
          >
            <Trash2 size={13} />
          </button>
          <div style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Pricing summary */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              background: 'rgba(197,160,89,0.03)',
              border: '1px solid rgba(197,160,89,0.1)',
              borderRadius: '4px',
              padding: '0.75rem 1rem',
            }}
          >
            {order.discountPercent > 0 && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-text-title)', fontWeight: '600' }}>{formatGil(order.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Discount ({order.discountPercent}%)</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-success)', fontWeight: '600' }}>−{formatGil(order.discountAmount)}</span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-gold-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
              <div className="gil-price" style={{ fontSize: '1.1rem' }}>
                <span>{new Intl.NumberFormat('en-US').format(order.total)}</span>
                <span className="gil-coin" style={{ width: '15px', height: '15px', fontSize: '9px' }}>G</span>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div
            style={{
              background: 'var(--bg-input)',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.05)',
              overflow: 'hidden',
            }}
          >
            <OrderItemsTable items={order.items} />
          </div>

          {/* Fulfillment Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gold-light)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Calendar size={12} /> Fulfillment
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                style={{ width: '140px', height: '34px', padding: '0 0.5rem', fontSize: '0.82rem' }}
                value={localFulfillmentType}
                onChange={(e) => {
                  const type = e.target.value as 'asap' | 'date';
                  setLocalFulfillmentType(type);
                  if (type === 'asap') {
                    setLocalFulfillmentDate('ASAP');
                    setFulfillmentDirty(order.fulfillmentDate !== 'ASAP');
                  } else {
                    const today = new Date().toISOString().split('T')[0];
                    setLocalFulfillmentDate(today);
                    setFulfillmentDirty(order.fulfillmentDate !== today);
                  }
                }}
              >
                <option value="asap">ASAP</option>
                <option value="date">Pre-order Date</option>
              </select>
              {localFulfillmentType === 'date' && (
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '160px', height: '34px', fontSize: '0.82rem', padding: '0 0.5rem' }}
                  value={localFulfillmentDate === 'ASAP' ? '' : localFulfillmentDate}
                  onChange={(e) => {
                    setLocalFulfillmentDate(e.target.value);
                    setFulfillmentDirty(order.fulfillmentDate !== e.target.value);
                  }}
                />
              )}
              {fulfillmentDirty && (
                <button
                  type="button"
                  className="ff-btn"
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', height: '34px' }}
                  onClick={handleSaveFulfillment}
                  disabled={savingFulfillment}
                >
                  {savingFulfillment ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
                  Save
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gold-light)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <FileText size={12} /> Notes
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Add notes about this order…"
              value={localNotes}
              onChange={(e) => { setLocalNotes(e.target.value); setNotesDirty(true); }}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }}
            />
            {notesDirty && (
              <button
                type="button"
                className="ff-btn"
                style={{ alignSelf: 'flex-start', padding: '0.4rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={handleSaveNotes}
                disabled={savingNotes}
              >
                {savingNotes ? <RefreshCw size={12} className="spin" /> : <Save size={12} />}
                {savingNotes ? 'Saving…' : 'Save Notes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ManualOrderFormProps {
  parts: SubmarinePart[];
  clientName: string;
  orderNotes: string;
  fulfillmentDate: string;
  onSaved: () => void;
  onError: (msg: string) => void;
  onSuccess: () => void;
}

function ManualOrderForm({ parts, clientName, orderNotes, fulfillmentDate, onSaved, onError, onSuccess }: ManualOrderFormProps) {
  const [builds, setBuilds] = useState<ManualBuild[]>(() => [
    { id: '1', buildName: 'Build 1', items: [] },
  ]);
  const nextIdRef = useRef(2);
  const mkId = () => String(nextIdRef.current++);
  // Per-build "add item" row state
  const [newPartId, setNewPartId] = useState<Record<string, string>>({});
  const [newQty, setNewQty] = useState<Record<string, string>>({});
  const [discountInput, setDiscountInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  // Derive the first available part id for a build's add-row
  const getDefaultPartId = () => parts[0]?.id ?? '';

  const getPartById = (id: string) => parts.find((p) => p.id === id);

  const addBuild = () => {
    const newBuild: ManualBuild = { id: mkId(), buildName: `Build ${builds.length + 1}`, items: [] };
    setBuilds((prev) => [...prev, newBuild]);
  };

  const removeBuild = (buildId: string) => {
    if (builds.length <= 1) return;
    setBuilds((prev) => prev.filter((b) => b.id !== buildId));
  };

  const renameBuild = (buildId: string, name: string) => {
    setBuilds((prev) => prev.map((b) => (b.id === buildId ? { ...b, buildName: name } : b)));
  };

  const addItem = (buildId: string) => {
    const partId = newPartId[buildId] ?? getDefaultPartId();
    if (!partId) return;
    const qty = parseInt(newQty[buildId] ?? '1', 10);
    if (isNaN(qty) || qty <= 0) return;
    const newItem: ManualItem = { id: mkId(), partId, quantity: qty };
    setBuilds((prev) =>
      prev.map((b) => (b.id === buildId ? { ...b, items: [...b.items, newItem] } : b))
    );
    setNewQty((prev) => ({ ...prev, [buildId]: '1' }));
  };

  const removeItem = (buildId: string, itemId: string) => {
    setBuilds((prev) =>
      prev.map((b) =>
        b.id === buildId ? { ...b, items: b.items.filter((it) => it.id !== itemId) } : b
      )
    );
  };

  const updateItemQty = (buildId: string, itemId: string, qty: number) => {
    if (qty < 1) return;
    setBuilds((prev) =>
      prev.map((b) =>
        b.id === buildId
          ? { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, quantity: qty } : it)) }
          : b
      )
    );
  };

  const allItems: Array<{ build: ManualBuild; item: ManualItem; part: SubmarinePart }> = [];
  for (const build of builds) {
    for (const item of build.items) {
      const part = getPartById(item.partId);
      if (part) allItems.push({ build, item, part });
    }
  }

  const discountPct = parseFloat(discountInput) || 0;
  const subtotal = allItems.reduce((s, { item, part }) => s + part.price * item.quantity, 0);
  const discountableSubtotal = allItems
    .filter(({ part }) => part.partType !== 'Materials')
    .reduce((s, { item, part }) => s + part.price * item.quantity, 0);
  const discountAmount = discountPct > 0 ? Math.round(discountableSubtotal * (discountPct / 100)) : 0;
  const total = subtotal - discountAmount;

  const handleSave = async () => {
    setLocalError('');
    if (!clientName.trim()) {
      setLocalError('Please enter a client name.');
      onError('Please enter a client name.');
      return;
    }
    if (allItems.length === 0) {
      setLocalError('Add at least one item before saving.');
      return;
    }

    const orderItems: OrderItem[] = allItems.map(({ build, item, part }) => ({
      partId: part.id,
      partName: part.name,
      partType: part.partType,
      quantity: item.quantity,
      unitPrice: part.price,
      lineTotal: part.price * item.quantity,
      buildName: build.buildName,
    }));

    const now = getTimestamp();
    const newOrder: Omit<Order, 'id'> = {
      clientName: clientName.trim(),
      rawText: '[Manual Order]',
      items: orderItems,
      subtotal,
      discountPercent: discountPct,
      discountAmount,
      total,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      notes: orderNotes.trim(),
      fulfillmentDate,
    };

    setSaving(true);
    const id = await saveOrder(newOrder);
    setSaving(false);

    if (id) {
      onSuccess();
      onSaved();
      // Reset form
      setBuilds([{ id: mkId(), buildName: 'Build 1', items: [] }]);
      setDiscountInput('');
      setLocalError('');
    } else {
      setLocalError('Failed to save order. Please try again.');
    }
  };

  // Group parts by type for the select
  const partsByType: Record<string, SubmarinePart[]> = {};
  for (const p of parts) {
    if (!partsByType[p.partType]) partsByType[p.partType] = [];
    partsByType[p.partType].push(p);
  }
  const typeOrder = ['Hull', 'Stern', 'Bow', 'Bridge', 'Materials'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Builds */}
      {builds.map((build, buildIdx) => (
        <div
          key={build.id}
          style={{
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(197,160,89,0.15)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          {/* Build header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.6rem 0.75rem',
              background: 'rgba(197,160,89,0.04)',
              borderBottom: '1px solid rgba(197,160,89,0.1)',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: 'var(--color-gold)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              Build {buildIdx + 1}
            </span>
            <input
              type="text"
              value={build.buildName}
              onChange={(e) => renameBuild(build.id, e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--color-text-title)',
                fontWeight: '600',
                fontSize: '0.88rem',
                fontFamily: 'inherit',
              }}
              placeholder="Build name…"
            />
            {builds.length > 1 && (
              <button
                type="button"
                className="ff-btn-danger"
                style={{ padding: '0.2rem 0.4rem', height: '26px', display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem' }}
                onClick={() => removeBuild(build.id)}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>

          {/* Existing items */}
          {build.items.length > 0 && (
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {build.items.map((item) => {
                const part = getPartById(item.partId);
                if (!part) return null;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-text-title)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {part.name}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                        {part.partType} · {formatGil(part.price)} ea.
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="ff-btn-secondary"
                        style={{ padding: '0.15rem 0.35rem', height: '26px' }}
                        onClick={() => updateItemQty(build.id, item.id, item.quantity - 1)}
                      >
                        <Minus size={10} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1) updateItemQty(build.id, item.id, n); }}
                        style={{ width: '48px', textAlign: 'center', background: 'var(--bg-input)', border: '1px solid rgba(197,160,89,0.2)', borderRadius: '4px', color: 'var(--color-text-title)', padding: '0.15rem', height: '26px', boxSizing: 'border-box', fontSize: '0.82rem' }}
                      />
                      <button
                        type="button"
                        className="ff-btn-secondary"
                        style={{ padding: '0.15rem 0.35rem', height: '26px' }}
                        onClick={() => updateItemQty(build.id, item.id, item.quantity + 1)}
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--color-gold-light)', whiteSpace: 'nowrap', textAlign: 'right', minWidth: '90px' }}>
                      {formatGil(part.price * item.quantity)}
                    </span>
                    <button
                      type="button"
                      className="ff-btn-danger"
                      style={{ padding: '0.2rem 0.4rem', height: '26px', display: 'inline-flex', alignItems: 'center' }}
                      onClick={() => removeItem(build.id, item.id)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add item row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <select
              className="form-select"
              style={{ flex: 2, minWidth: '160px', fontSize: '0.8rem', height: '32px', padding: '0 0.5rem' }}
              value={newPartId[build.id] ?? getDefaultPartId()}
              onChange={(e) => setNewPartId((prev) => ({ ...prev, [build.id]: e.target.value }))}
            >
              {typeOrder.map((type) =>
                partsByType[type] ? (
                  <optgroup key={type} label={type}>
                    {partsByType[type].map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatGil(p.price)}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              )}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
              <button
                type="button"
                className="ff-btn-secondary"
                style={{ padding: '0.15rem 0.35rem', height: '32px' }}
                onClick={() => setNewQty((prev) => ({ ...prev, [build.id]: String(Math.max(1, parseInt(prev[build.id] ?? '1', 10) - 1)) }))}
              >
                <Minus size={10} />
              </button>
              <input
                type="number"
                min="1"
                value={newQty[build.id] ?? '1'}
                onChange={(e) => setNewQty((prev) => ({ ...prev, [build.id]: e.target.value }))}
                style={{ width: '48px', textAlign: 'center', background: 'var(--bg-input)', border: '1px solid rgba(197,160,89,0.2)', borderRadius: '4px', color: 'var(--color-text-title)', padding: '0.15rem', height: '32px', boxSizing: 'border-box', fontSize: '0.82rem' }}
              />
              <button
                type="button"
                className="ff-btn-secondary"
                style={{ padding: '0.15rem 0.35rem', height: '32px' }}
                onClick={() => setNewQty((prev) => ({ ...prev, [build.id]: String(parseInt(prev[build.id] ?? '1', 10) + 1) }))}
              >
                <Plus size={10} />
              </button>
            </div>
            <button
              type="button"
              className="ff-btn-secondary"
              style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}
              onClick={() => addItem(build.id)}
            >
              <Plus size={12} /> Add Part
            </button>
          </div>
        </div>
      ))}

      {/* Add build */}
      <button
        type="button"
        className="ff-btn-secondary"
        style={{ alignSelf: 'flex-start', padding: '0.4rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        onClick={addBuild}
      >
        <Plus size={13} /> Add Another Build
      </button>

      {/* Discount override */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Bulk Discount %</label>
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          placeholder="0"
          value={discountInput}
          onChange={(e) => setDiscountInput(e.target.value)}
          className="form-input"
          style={{ width: '80px', textAlign: 'center' }}
        />
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>(applies to parts only, not Materials)</span>
      </div>

      {/* Live total */}
      {allItems.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '1.25rem',
            flexWrap: 'wrap',
            background: 'rgba(197,160,89,0.04)',
            border: '1px solid rgba(197,160,89,0.12)',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
          }}
        >
          {discountPct > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Subtotal</span>
                <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--color-text-title)' }}>{formatGil(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--color-success)', textTransform: 'uppercase' }}>Discount ({discountPct}%)</span>
                <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--color-success)' }}>−{formatGil(discountAmount)}</span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-gold-light)', textTransform: 'uppercase' }}>Total</span>
            <div className="gil-price" style={{ fontSize: '1.1rem' }}>
              <span>{new Intl.NumberFormat('en-US').format(total)}</span>
              <span className="gil-coin" style={{ width: '15px', height: '15px', fontSize: '9px' }}>G</span>
            </div>
          </div>
        </div>
      )}

      {/* Local error */}
      {localError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-error)', fontSize: '0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '4px', padding: '0.6rem 0.75rem' }}>
          <XCircle size={14} style={{ flexShrink: 0 }} />
          {localError}
        </div>
      )}

      {/* Save */}
      <button
        type="button"
        className="ff-btn glow-active"
        style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', alignSelf: 'flex-start' }}
        onClick={handleSave}
        disabled={saving || allItems.length === 0}
      >
        {saving ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
        {saving ? 'Saving…' : 'Save Order'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse preview panel
// ─────────────────────────────────────────────────────────────────────────────

interface ParsePreviewProps {
  items: OrderItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
}

function ParsePreview({ items, subtotal, discountPercent, discountAmount, total }: ParsePreviewProps) {
  const builds = Array.from(new Set(items.map((it) => it.buildName)));
  const totalParts = items.reduce((s, it) => s + it.quantity, 0);
  const unmatchedCount = items.filter((it) => !it.partId).length;

  return (
    <div
      style={{
        background: 'rgba(16,185,129,0.04)',
        border: '1px solid rgba(16,185,129,0.2)',
        borderRadius: '6px',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)' }}>
          <CheckCircle size={16} />
          <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
            Parsed: {builds.length} build{builds.length !== 1 ? 's' : ''} · {totalParts} parts
          </span>
        </div>
        {unmatchedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-warning)', fontSize: '0.78rem' }}>
            <AlertCircle size={13} />
            {unmatchedCount} item{unmatchedCount !== 1 ? 's' : ''} not matched to stock
          </div>
        )}
      </div>

      {/* Items */}
      <div
        style={{
          background: 'var(--bg-input)',
          borderRadius: '4px',
          border: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden',
          maxHeight: '280px',
          overflowY: 'auto',
        }}
      >
        <OrderItemsTable items={items} />
      </div>

      {/* Pricing */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {discountPercent > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Subtotal</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--color-text-title)', fontWeight: '600' }}>{formatGil(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-success)', textTransform: 'uppercase' }}>Discount ({discountPercent}%)</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--color-success)', fontWeight: '600' }}>−{formatGil(discountAmount)}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--color-gold-light)', textTransform: 'uppercase' }}>Total</span>
          <div className="gil-price" style={{ fontSize: '1.1rem' }}>
            <span>{new Intl.NumberFormat('en-US').format(total)}</span>
            <span className="gil-coin" style={{ width: '15px', height: '15px', fontSize: '9px' }}>G</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderTracker({ parts }: OrderTrackerProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Mode
  const [inputMode, setInputMode] = useState<InputMode>('paste');

  const [pasteText, setPasteText] = useState('');
  const [clientName, setClientName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [parseResult, setParseResult] = useState<{
    items: OrderItem[];
    subtotal: number;
    discountPercent: number;
    discountAmount: number;
    total: number;
  } | null>(null);
  const [parseError, setParseError] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [fulfillmentType, setFulfillmentType] = useState<'asap' | 'date'>('asap');
  const [fulfillmentDate, setFulfillmentDate] = useState<string>('ASAP');

  // Filter
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await loadOrders();
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const ordersFetchedRef = useRef(false);
  useEffect(() => {
    if (!ordersFetchedRef.current) {
      ordersFetchedRef.current = true;
      fetchOrders();
    }
  }, [fetchOrders]);

  const handleParse = () => {
    setParseError('');
    setParseResult(null);
    setSaveSuccess(false);
    const result = parseOrderText(pasteText, parts);
    if (result.error) {
      setParseError(result.error);
      return;
    }
    setParseResult(result);
  };

  const handleSaveOrder = async () => {
    if (!parseResult) return;
    if (!clientName.trim()) {
      setParseError('Please enter a client name before saving.');
      return;
    }
    setSavingOrder(true);
    const now = getTimestamp();
    const newOrder: Omit<Order, 'id'> = {
      clientName: clientName.trim(),
      rawText: pasteText,
      items: parseResult.items,
      subtotal: parseResult.subtotal,
      discountPercent: parseResult.discountPercent,
      discountAmount: parseResult.discountAmount,
      total: parseResult.total,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      notes: orderNotes.trim(),
      fulfillmentDate,
    };
    const id = await saveOrder(newOrder);
    setSavingOrder(false);
    if (id) {
      setSaveSuccess(true);
      setPasteText('');
      setClientName('');
      setOrderNotes('');
      setFulfillmentType('asap');
      setFulfillmentDate('ASAP');
      setParseResult(null);
      setParseError('');
      fetchOrders();
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setParseError('Failed to save the order. Please try again.');
    }
  };

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    await updateOrder(id, { status });
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  const handleNotesChange = async (id: string, notes: string) => {
    await updateOrder(id, { notes });
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, notes } : o)));
  };

  const handleFulfillmentChange = async (id: string, fulfillmentDate: string) => {
    await updateOrder(id, { fulfillmentDate });
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, fulfillmentDate } : o)));
  };

  const handleDeleteOrder = async (id: string) => {
    const order = orders.find((o) => o.id === id);
    const label = order ? order.clientName : id;
    if (!window.confirm(`Delete order for "${label}"? This cannot be undone.`)) return;
    const ok = await deleteOrder(id);
    if (ok) {
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } else {
      alert('Failed to delete order.');
    }
  };

  const visibleOrders =
    filterStatus === 'all' ? orders.filter((order) => order.status !== "completed") : orders.filter((o) => o.status === filterStatus);

  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: inputMode === 'paste' ? 'minmax(320px, 1fr) minmax(320px, 1fr)' : '1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
        className="order-tracker-grid"
      >
        {/* Left/Full: input */}
        <div
          style={{
            background: 'rgba(255,255,255,0.01)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '6px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '0.75rem' }}>
            {([['paste', ClipboardPaste, 'Paste Order'], ['manual', PencilLine, 'Manual Order']] as const).map(
              ([mode, Icon, label]) => {
                const isActive = inputMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '4px',
                      border: `1px solid ${isActive ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                      background: isActive ? 'rgba(197,160,89,0.12)' : 'transparent',
                      color: isActive ? 'var(--color-gold)' : 'var(--color-text-muted)',
                      fontSize: '0.82rem',
                      fontWeight: isActive ? '700' : '400',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => {
                      setInputMode(mode);
                      setParseError('');
                      setParseResult(null);
                      setSaveSuccess(false);
                    }}
                  >
                    <Icon size={13} /> {label}
                  </button>
                );
              }
            )}
          </div>

          {/* Client name — always visible */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <User size={11} /> Client Name
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Alayna Dawnwhisper"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          {/* Fulfillment — always visible */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Calendar size={11} /> Fulfillment
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="form-select"
                style={{ width: '130px', height: '38px', padding: '0 0.5rem', fontSize: '0.82rem' }}
                value={fulfillmentType}
                onChange={(e) => {
                  const type = e.target.value as 'asap' | 'date';
                  setFulfillmentType(type);
                  if (type === 'asap') {
                    setFulfillmentDate('ASAP');
                  } else {
                    const today = new Date().toISOString().split('T')[0];
                    setFulfillmentDate(today);
                  }
                }}
              >
                <option value="asap">ASAP</option>
                <option value="date">Pre-order Date</option>
              </select>
              {fulfillmentType === 'date' && (
                <input
                  type="date"
                  className="form-input"
                  style={{ flex: 1, height: '38px', fontSize: '0.82rem', padding: '0 0.5rem' }}
                  value={fulfillmentDate === 'ASAP' ? '' : fulfillmentDate}
                  onChange={(e) => setFulfillmentDate(e.target.value)}
                />
              )}
            </div>
          </div>

          {inputMode === 'paste' && (<>
          {/* Order text */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <ClipboardPaste size={11} /> Order Text (paste from Discord)
            </label>
            <textarea
              className="form-input"
              rows={10}
              placeholder={'Paste the order text here, e.g.:\n\n--- FFXIV Submarine Order Request ---\n\n[Build 1]\nHull: Whale-class Hull — 240,000 Gil\n...\n\nTotal Price: 860,000 Gil'}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setParseResult(null);
                setParseError('');
                setSaveSuccess(false);
              }}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: '1.5' }}
            />
          </div>

          {/* Notes (paste mode) */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <FileText size={11} /> Notes{' '}
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Any notes about this order…"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.82rem' }}
            />
          </div>

          {/* Error */}
          {parseError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--color-error)', fontSize: '0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '4px', padding: '0.6rem 0.75rem' }}>
              <XCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              {parseError}
            </div>
          )}

          {/* Success */}
          {saveSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontSize: '0.8rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '4px', padding: '0.6rem 0.75rem' }}>
              <CheckCircle size={14} />
              Order saved successfully!
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="ff-btn-secondary"
              style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              onClick={handleParse}
              disabled={!pasteText.trim()}
            >
              <Package size={14} /> Parse Order
            </button>
            {parseResult && (
              <button
                type="button"
                className="ff-btn glow-active"
                style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                onClick={handleSaveOrder}
                disabled={savingOrder}
              >
                {savingOrder ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
                {savingOrder ? 'Saving…' : 'Save Order'}
              </button>
            )}
          </div>
          </>)}

          {/* ── MANUAL MODE ── */}
          {inputMode === 'manual' && (
            <>
              {/* Notes (manual mode) */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FileText size={11} /> Notes{' '}
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Any notes about this order…"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.82rem' }}
                />
              </div>
              {saveSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontSize: '0.8rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '4px', padding: '0.6rem 0.75rem' }}>
                  <CheckCircle size={14} /> Order saved successfully!
                </div>
              )}
              <ManualOrderForm
                parts={parts}
                clientName={clientName}
                orderNotes={orderNotes}
                fulfillmentDate={fulfillmentDate}
                onSaved={fetchOrders}
                onError={(msg) => setParseError(msg)}
                onSuccess={() => {
                  setSaveSuccess(true);
                  setClientName('');
                  setOrderNotes('');
                  setFulfillmentType('asap');
                  setFulfillmentDate('ASAP');
                  setTimeout(() => setSaveSuccess(false), 3000);
                }}
              />
            </>
          )}
        </div>

        {/* Right: parse preview */}
        <div>
          {!parseResult && !parseError && (
            <div
              style={{
                height: '100%',
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                border: '1px dashed rgba(197,160,89,0.2)',
                borderRadius: '6px',
                color: 'var(--color-text-muted)',
                fontSize: '0.85rem',
                padding: '2rem',
                textAlign: 'center',
              }}
            >
              <ClipboardPaste size={32} style={{ opacity: 0.3 }} />
              <span>Paste an order text and click "Parse Order" to preview before saving.</span>
            </div>
          )}
          {parseResult && (
            <ParsePreview
              items={parseResult.items}
              subtotal={parseResult.subtotal}
              discountPercent={parseResult.discountPercent}
              discountAmount={parseResult.discountAmount}
              total={parseResult.total}
            />
          )}
        </div>
      </div>
      <div>
        {/* Header + filter bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem',
            borderBottom: '1px solid rgba(197,160,89,0.15)',
            paddingBottom: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={17} style={{ color: 'var(--color-gold)' }} />
            <h4 style={{ fontSize: '1rem', color: 'var(--color-text-title)', margin: 0 }}>
              All Orders
              {orders.length > 0 && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  ({orders.length})
                </span>
              )}
            </h4>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {([['all', 'All'], ...ALL_STATUSES.map((s) => [s, STATUS_CONFIG[s].label])] as [string, string][]).map(([val, label]) => {
              const count = val === 'all' ? orders.filter((order) => order.status !== "completed").length : (statusCounts[val] || 0);
              const isActive = filterStatus === val;
              return (
                <button
                  key={val}
                  type="button"
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '99px',
                    border: `1px solid ${isActive ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                    background: isActive ? 'rgba(197,160,89,0.12)' : 'transparent',
                    color: isActive ? 'var(--color-gold)' : 'var(--color-text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? '700' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => setFilterStatus(val as OrderStatus | 'all')}
                >
                  {label} {count > 0 ? `(${count})` : ''}
                </button>
              );
            })}

            <button
              type="button"
              className="ff-btn-secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              onClick={fetchOrders}
              disabled={loadingOrders}
            >
              <RefreshCw size={12} className={loadingOrders ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* List */}
        {loadingOrders ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2rem', color: 'var(--color-text-muted)' }}>
            <RefreshCw size={18} className="spin" style={{ color: 'var(--color-gold)' }} />
            <span>Loading orders…</span>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              border: '1px dashed rgba(197,160,89,0.15)',
              borderRadius: '6px',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem',
            }}
          >
            {orders.length === 0
              ? "No orders yet. Paste a client's order above to get started."
              : `No ${filterStatus !== 'all' ? STATUS_CONFIG[filterStatus as OrderStatus].label.toLowerCase() : ''} orders.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {visibleOrders.map((order) => (
              <OrderRow
                key={order.id + '-' + (order.fulfillmentDate || 'ASAP')}
                order={order}
                onStatusChange={handleStatusChange}
                onNotesChange={handleNotesChange}
                onFulfillmentChange={handleFulfillmentChange}
                onDelete={handleDeleteOrder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
