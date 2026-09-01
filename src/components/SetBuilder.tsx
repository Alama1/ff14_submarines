import { useMemo, useState } from 'react';
import PartSelector from './PartSelector';
import { formatGil, formatNumber, PART_TYPES, ALL_PART_TYPES } from '../utils/format';
import {
  Anchor,
  Plus,
  Minus,
  Tag,
  Info,
  Check,
  Send,
  RefreshCw,
  Copy,
  ExternalLink,
  AlertCircle,
  Ship,
} from 'lucide-react';
import { ApiSubmarinePart, CreateOrderItemDto, PartType } from '../api/types';
import { useCatalog } from '../hooks/useCatalog';
import {
  computeAvailableMaterials,
  computeCommittedMaterials,
  computePartCraftable,
  computeSetCraftable,
} from '../utils/stockCalc';
import { submitOrder } from '../api/endpoints';
import { ApiError } from '../api/client';
import { addRecentOrderCode } from '../utils/orderCodes';
import { Hammer } from 'lucide-react';

interface SetBuilderProps {
  catalog: ReturnType<typeof useCatalog>;
  onTrackOrder: (code: string) => void;
}

type QuantityMap = Record<PartType, number>;

interface SubmarineBuild {
  id: string;
  name: string;
  selections: Record<PartType, ApiSubmarinePart | null>;
  quantities: QuantityMap;
  setCount: number;
}

interface PresetDefinition {
  name: string;
  description: string;
  parts: Record<PartType, { classKey: string; isModified: boolean } | null>;
}

const PRESETS: PresetDefinition[] = [
  {
    name: 'WSUC',
    description: 'Whale Hull, Shark Stern, Unkiu Bow, Coelacanth Bridge (Standard)',
    parts: {
      Hull: { classKey: 'whale', isModified: false },
      Stern: { classKey: 'shark', isModified: false },
      Bow: { classKey: 'unkiu', isModified: false },
      Bridge: { classKey: 'coelacanth', isModified: false },
      Materials: null,
    },
  },
  {
    name: 'SSSS',
    description: 'All Shark Parts (Starter / Speed)',
    parts: {
      Hull: { classKey: 'shark', isModified: false },
      Stern: { classKey: 'shark', isModified: false },
      Bow: { classKey: 'shark', isModified: false },
      Bridge: { classKey: 'shark', isModified: false },
      Materials: null,
    },
  },
  {
    name: 'WSUC++',
    description: 'Modified Whale, Shark, Unkiu, Coelacanth (Max Stats)',
    parts: {
      Hull: { classKey: 'whale', isModified: true },
      Stern: { classKey: 'shark', isModified: true },
      Bow: { classKey: 'unkiu', isModified: true },
      Bridge: { classKey: 'coelacanth', isModified: true },
      Materials: null,
    },
  },
  {
    name: 'W-UC',
    description: 'Whale Hull, Unkiu Bow, Coelacanth Bridge (No Stern)',
    parts: {
      Hull: { classKey: 'whale', isModified: false },
      Stern: null,
      Bow: { classKey: 'unkiu', isModified: false },
      Bridge: { classKey: 'coelacanth', isModified: false },
      Materials: null,
    },
  },
];

function createEmptySelections(): Record<PartType, ApiSubmarinePart | null> {
  return { Hull: null, Stern: null, Bow: null, Bridge: null, Materials: null };
}

function createDefaultBuild(id: string, name: string, parts: ApiSubmarinePart[]): SubmarineBuild {
  const selections = createEmptySelections();
  if (parts.length > 0) {
    PART_TYPES.forEach((type: PartType) => {
      const defaultPart = parts.find(
        (p) => p.partType === type && p.classKey === 'shark' && !p.isModified
      );
      selections[type] = defaultPart ?? parts.find((p) => p.partType === type) ?? null;
    });
    selections.Materials = parts.find((p) => p.partType === 'Materials') ?? null;
  }
  return {
    id,
    name,
    selections,
    quantities: { Hull: 1, Stern: 1, Bow: 1, Bridge: 1, Materials: 0 },
    setCount: 1,
  };
}

// ─── Order submission form ────────────────────────────────────────────────────

interface OrderFormState {
  clientName: string;
  isAnonymous: boolean;
  contactInfo: string;
  notes: string;
  fulfillmentType: 'asap' | 'date';
  fulfillmentDate: string;
}

interface SubmittedOrder {
  orderCode: string;
  total: number;
}

interface OrderSubmitFormProps {
  items: CreateOrderItemDto[];
  subtotal: number;
  discountPct: number;
  discountAmt: number;
  total: number;
  onCancel: () => void;
  onSubmitted: (order: SubmittedOrder) => void;
}

function OrderSubmitForm({
  items,
  subtotal,
  discountPct,
  discountAmt,
  total,
  onCancel,
  onSubmitted,
}: OrderSubmitFormProps) {
  const [form, setForm] = useState<OrderFormState>({
    clientName: '',
    isAnonymous: false,
    contactInfo: '',
    notes: '',
    fulfillmentType: 'asap',
    fulfillmentDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!form.clientName.trim()) {
      setError('Please enter your character or Discord name.');
      return;
    }
    if (form.fulfillmentType === 'date' && !form.fulfillmentDate) {
      setError('Please pick a fulfillment date or switch back to ASAP.');
      return;
    }

    const fulfillmentDt =
      form.fulfillmentType === 'date' ? form.fulfillmentDate : 'ASAP';

    setSubmitting(true);
    try {
      const order = await submitOrder({
        clientName: form.clientName.trim(),
        isAnonymous: form.isAnonymous || undefined,
        contactInfo: form.contactInfo.trim() || undefined,
        notes: form.notes.trim() || undefined,
        fulfillmentDt,
        items,
      });
      addRecentOrderCode(order.orderCode);
      onSubmitted({ orderCode: order.orderCode, total: order.total });
    } catch (e: unknown) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Failed to submit the order. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ff-card-framed fade-in"
      style={{
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        borderLeft: '3px solid var(--color-gold)',
        background: 'linear-gradient(135deg, rgba(197,160,89,0.04) 0%, rgba(21,31,51,0.3) 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Send size={20} style={{ color: 'var(--color-gold)' }} />
        <h3 style={{ fontSize: '1.2rem' }}>Send Order Request</h3>
      </div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0, textAlign: 'left' }}>
        Submitting creates your order and gives you a confirmation code. Send that code to{' '}
        <strong style={{ color: 'var(--color-gold)' }}>@Alamai</strong> on Discord to confirm the
        build.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>
            Character / Discord Name *
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Alamai"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            maxLength={100}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>
            Discord Contact (optional)
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. alamai"
            value={form.contactInfo}
            onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
            maxLength={100}
          />
        </div>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.6rem',
          cursor: 'pointer',
          background: 'rgba(197,160,89,0.04)',
          border: '1px solid rgba(197,160,89,0.12)',
          borderRadius: '4px',
          padding: '0.65rem 0.85rem',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={form.isAnonymous}
          onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })}
          style={{ marginTop: '0.15rem', accentColor: 'var(--color-gold)', cursor: 'pointer' }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', textAlign: 'left' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-text-main)' }}>
            Order anonymously
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
            It fully hides your name in the live in-progress order tracking — you'll show up as
            “Anonymous” instead.
          </span>
        </span>
      </label>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: '0.75rem' }}>
          Notes (optional)
        </label>
        <textarea
          className="form-input"
          rows={2}
          placeholder="Anything Alamai should know about this order…"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>
            Fulfillment
          </label>
          <select
            className="form-select"
            style={{ width: '150px', height: '38px', padding: '0 0.5rem', fontSize: '0.85rem' }}
            value={form.fulfillmentType}
            onChange={(e) => {
              const type = e.target.value as 'asap' | 'date';
              setForm({
                ...form,
                fulfillmentType: type,
                fulfillmentDate:
                  type === 'date' && !form.fulfillmentDate
                    ? new Date().toISOString().split('T')[0]
                    : form.fulfillmentDate,
              });
            }}
          >
            <option value="asap">ASAP</option>
            <option value="date">Pre-order Date</option>
          </select>
        </div>
        {form.fulfillmentType === 'date' && (
          <input
            type="date"
            className="form-input"
            style={{ width: '170px', height: '38px', fontSize: '0.85rem', padding: '0 0.5rem', marginTop: '1.55rem' }}
            value={form.fulfillmentDate}
            onChange={(e) => setForm({ ...form, fulfillmentDate: e.target.value })}
          />
        )}
      </div>

      {/* Price recap */}
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'rgba(197,160,89,0.04)',
          border: '1px solid rgba(197,160,89,0.12)',
          borderRadius: '4px',
          padding: '0.75rem 1rem',
        }}
      >
        {discountPct > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Subtotal
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: '600' }}>{formatGil(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-success)', textTransform: 'uppercase' }}>
                Bulk Discount ({discountPct}%)
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--color-success)' }}>
                −{formatGil(discountAmt)}
              </span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--color-gold-light)', textTransform: 'uppercase' }}>
            Total
          </span>
          <div className="gil-price" style={{ fontSize: '1.1rem' }}>
            <span>{formatNumber(total)}</span>
            <span className="gil-coin" style={{ width: '15px', height: '15px', fontSize: '9px' }}>G</span>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--color-error)',
            fontSize: '0.82rem',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '4px',
            padding: '0.6rem 0.75rem',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="ff-btn glow-active"
          style={{ flex: 1, minWidth: '200px' }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
          {submitting ? 'Submitting…' : 'Submit Order Request'}
        </button>
        <button type="button" className="ff-btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Success view ─────────────────────────────────────────────────────────────

interface OrderSuccessViewProps {
  order: SubmittedOrder;
  onTrack: () => void;
  onNewOrder: () => void;
}

function OrderSuccessView({ order, onTrack, onNewOrder }: OrderSuccessViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(order.orderCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="ff-card-framed fade-in"
      style={{
        padding: '2.5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.25rem',
        textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(21,31,51,0.4) 100%)',
        borderLeft: '3px solid var(--color-success)',
      }}
    >
      <div
        style={{
          background: 'rgba(16,185,129,0.12)',
          padding: '1rem',
          borderRadius: '50%',
          color: 'var(--color-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={32} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <h2 style={{ fontSize: '1.5rem' }}>Order Request Sent!</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
          Your order has been created with a total of{' '}
          <strong style={{ color: 'var(--color-gold)' }}>{formatGil(order.total)}</strong>.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-text-muted)',
          }}
        >
          Your Confirmation Code
        </span>
        <button
          type="button"
          onClick={handleCopy}
          title="Click to copy"
          style={{
            fontFamily: 'monospace',
            fontSize: '2rem',
            fontWeight: '700',
            letterSpacing: '0.15em',
            color: 'var(--color-gold-light)',
            background: 'var(--bg-input)',
            border: '2px dashed var(--color-gold)',
            borderRadius: '8px',
            padding: '0.75rem 2rem',
            cursor: 'pointer',
            textShadow: '0 0 15px var(--color-gold-glow)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {order.orderCode}
          {copied ? <Check size={18} style={{ color: 'var(--color-success)' }} /> : <Copy size={18} />}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          padding: '1rem 1.25rem',
          background: 'rgba(197,160,89,0.06)',
          border: '1px solid rgba(197,160,89,0.2)',
          borderRadius: '4px',
          maxWidth: '520px',
          textAlign: 'left',
        }}
      >
        <Ship size={18} style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: '0.15rem' }} />
        <span style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', lineHeight: '1.55' }}>
          <strong style={{ color: 'var(--color-gold-light)' }}>Next step:</strong> send this code to{' '}
          <span
            style={{
              fontFamily: 'monospace',
              background: 'rgba(197, 160, 89, 0.12)',
              color: 'var(--color-gold)',
              padding: '0.1rem 0.45rem',
              borderRadius: '3px',
              fontWeight: '700',
            }}
          >
            @Alamai
          </span>{' '}
          on Discord to confirm your build request. You can track the progress anytime in the Orders
          tab.
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="ff-btn" onClick={onTrack}>
          <ExternalLink size={14} /> Track This Order
        </button>
        <button type="button" className="ff-btn-secondary" onClick={onNewOrder}>
          <Plus size={14} /> Build Another Order
        </button>
      </div>
    </div>
  );
}

// ─── Main SetBuilder ──────────────────────────────────────────────────────────

export default function SetBuilder({ catalog, onTrackOrder }: SetBuilderProps) {
  const { parts, partsById, discounts, inProgress } = catalog;

  const [builds, setBuilds] = useState<SubmarineBuild[]>(() =>
    parts.length > 0 ? [createDefaultBuild('1', 'Build 1', parts)] : []
  );
  const [activeBuildId, setActiveBuildId] = useState<string>('1');

  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<SubmittedOrder | null>(null);

  // Live availability: inventory stock minus materials committed to in-progress orders
  const availableMaterials = useMemo(() => {
    const committed = computeCommittedMaterials(inProgress, partsById);
    return computeAvailableMaterials(parts, committed);
  }, [parts, partsById, inProgress]);

  const activeBuild =
    builds.find((b) => b.id === activeBuildId) ?? builds[0] ?? createDefaultBuild('temp', 'Temp', parts);
  const selections = activeBuild.selections;
  const quantities = activeBuild.quantities;
  const setCount = activeBuild.setCount;

  const handleAddBuild = () => {
    const nextId = (
      builds.reduce((max, b) => Math.max(max, parseInt(b.id, 10) || 0), 0) + 1
    ).toString();
    const newBuild = createDefaultBuild(nextId, `Build ${nextId}`, parts);
    setBuilds([...builds, newBuild]);
    setActiveBuildId(nextId);
  };

  const handleRemoveBuild = (id: string) => {
    if (builds.length <= 1) return;
    const activeIndex = builds.findIndex((b) => b.id === id);
    const newBuilds = builds.filter((b) => b.id !== id);
    setBuilds(newBuilds);
    if (activeBuildId === id) {
      const newActiveIndex = Math.max(0, activeIndex - 1);
      setActiveBuildId(newBuilds[newActiveIndex].id);
    }
  };

  const handleRenameBuild = (id: string, newName: string) => {
    setBuilds((prev) => prev.map((b) => (b.id === id ? { ...b, name: newName } : b)));
  };

  const handleSelect = (type: PartType, part: ApiSubmarinePart | null) => {
    setBuilds((prev) =>
      prev.map((b) =>
        b.id === activeBuildId ? { ...b, selections: { ...b.selections, [type]: part } } : b
      )
    );
  };

  const handleQuantityChange = (type: PartType, qty: number) => {
    const safeQty = Math.max(0, qty);
    setBuilds((prev) =>
      prev.map((b) => {
        if (b.id === activeBuildId) {
          return { ...b, quantities: { ...b.quantities, [type]: safeQty }, setCount: 0 };
        }
        return b;
      })
    );
  };

  const handleSetCountChange = (count: number) => {
    const safeCount = Math.max(0, count);
    setBuilds((prev) =>
      prev.map((b) => {
        if (b.id === activeBuildId) {
          return {
            ...b,
            setCount: safeCount,
            quantities: {
              ...b.quantities,
              Hull: safeCount,
              Stern: safeCount,
              Bow: safeCount,
              Bridge: safeCount,
            },
          };
        }
        return b;
      })
    );
  };

  const handleSetCountInput = (val: string) => {
    if (val === '') {
      handleSetCountChange(0);
      return;
    }
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) handleSetCountChange(n);
  };

  const applyPreset = (preset: PresetDefinition) => {
    setBuilds((prev) =>
      prev.map((b) => {
        if (b.id === activeBuildId) {
          const newSelections = { ...b.selections };
          PART_TYPES.forEach((type) => {
            const spec = preset.parts[type];
            if (spec) {
              const match = parts.find(
                (p) =>
                  p.partType === type &&
                  p.classKey === spec.classKey &&
                  p.isModified === spec.isModified
              );
              newSelections[type] = match ?? null;
            } else {
              newSelections[type] = null;
            }
          });
          return { ...b, selections: newSelections };
        }
        return b;
      })
    );
  };

  const activePreset = useMemo(() => {
    for (const preset of PRESETS) {
      const matches = PART_TYPES.every((type) => {
        const spec = preset.parts[type];
        const sel = selections[type];
        if (spec === null) return sel === null;
        if (sel === null) return false;
        return sel.classKey === spec.classKey && sel.isModified === spec.isModified;
      });
      if (matches) return preset.name;
    }
    return null;
  }, [selections]);

  const allSameQty =
    quantities.Hull === quantities.Stern &&
    quantities.Stern === quantities.Bow &&
    quantities.Bow === quantities.Bridge;

  // ── Pricing — mirrors the backend order calculation exactly ─────────────────

  const overallSubtotal = builds.reduce(
    (sum, b) =>
      sum +
      ALL_PART_TYPES.reduce<number>((partSum, type) => {
        const part = b.selections[type];
        return partSum + (part ? part.price * b.quantities[type] : 0);
      }, 0),
    0
  );

  const totalParts = builds.reduce((sum, b) => {
    return (
      sum +
      ALL_PART_TYPES.reduce((partSum, type) => {
        const part = b.selections[type];
        return partSum + (part ? Number(b.quantities[type]) || 0 : 0);
      }, 0)
    );
  }, 0);

  // Backend: highest tier whose threshold <= total part count (materials included)
  const activeDiscount = useMemo(() => {
    const sorted = [...discounts].sort((a, b) => b.threshold - a.threshold);
    const matching = sorted.find((d) => totalParts >= d.threshold);
    if (!matching) return null;
    return { threshold: matching.threshold, discountPercent: Number(matching.discountPercent) || 0 };
  }, [discounts, totalParts]);

  const discountPct = activeDiscount?.discountPercent ?? 0;
  const discountAmount = Math.round(overallSubtotal * (discountPct / 100));
  const totalPrice = overallSubtotal - discountAmount;

  // ── Availability ─────────────────────────────────────────────────────────────

  const partCraftability = useMemo(() => {
    const map: Partial<Record<PartType, ReturnType<typeof computePartCraftable>>> = {};
    PART_TYPES.forEach((type) => {
      map[type] = computePartCraftable(selections[type], availableMaterials);
    });
    return map;
  }, [selections, availableMaterials]);

  const setCraftableCount = useMemo(() => {
    const selected = PART_TYPES.map((type) => selections[type]).filter(
      (p): p is ApiSubmarinePart => p !== null && quantities[p.partType as PartType] > 0
    );
    return computeSetCraftable(selected, availableMaterials);
  }, [selections, quantities, availableMaterials]);

  const insufficientParts = useMemo(() => {
    const list: { partName: string; requested: number; available: number }[] = [];
    builds.forEach((b) => {
      ALL_PART_TYPES.forEach((type) => {
        const part = b.selections[type];
        const qty = b.quantities[type];
        if (!part || qty <= 0) return;
        const craftable = computePartCraftable(part, availableMaterials).craftable;
        const totalAvail = part.stock + craftable;
        if (totalAvail < qty) {
          list.push({ partName: part.name, requested: qty, available: totalAvail });
        }
      });
    });
    return list;
  }, [builds, availableMaterials]);

  const hasInsufficientParts = insufficientParts.length > 0;

  const hasOutOfStock = builds.some((b) =>
    ALL_PART_TYPES.some((type) => {
      const part = b.selections[type];
      return part && part.stock < b.quantities[type] && b.quantities[type] > 0;
    })
  );

  const anySelected = builds.some(
    (b) =>
      PART_TYPES.some((type) => b.selections[type] !== null && b.quantities[type] > 0) ||
      b.quantities.Materials > 0
  );

  const hasUnpricedParts = builds.some((b) =>
    ALL_PART_TYPES.some(
      (type) => b.selections[type] && b.quantities[type] > 0 && b.selections[type]!.price === 0
    )
  );

  // ── Submission payload ───────────────────────────────────────────────────────

  const orderItems: CreateOrderItemDto[] = useMemo(() => {
    const items: CreateOrderItemDto[] = [];
    builds.forEach((b) => {
      ALL_PART_TYPES.forEach((type) => {
        const part = b.selections[type];
        const qty = b.quantities[type];
        if (!part || qty <= 0) return;
        items.push({ partId: part.id, quantity: qty, buildName: b.name || undefined });
      });
    });
    return items;
  }, [builds]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (submittedOrder) {
    return (
      <div className="set-builder fade-in">
        <OrderSuccessView
          order={submittedOrder}
          onTrack={() => onTrackOrder(submittedOrder.orderCode)}
          onNewOrder={() => {
            setSubmittedOrder(null);
            setShowSubmitForm(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="set-builder fade-in">
      {/* Build/Set tabs navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {builds.map((b) => {
            const isActive = b.id === activeBuildId;
            return (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: isActive
                    ? 'linear-gradient(135deg, #1d263b 0%, #151b27 100%)'
                    : 'rgba(18, 24, 36, 0.6)',
                  border: `1px solid ${isActive ? 'var(--color-gold)' : 'var(--color-gold-dark)'}`,
                  borderRadius: '4px',
                  boxShadow: isActive ? '0 0 10px var(--color-gold-glow)' : 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  height: '38px',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '2px',
                      background: 'var(--color-gold)',
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setActiveBuildId(b.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isActive ? 'var(--color-gold-light)' : 'var(--color-text-muted)',
                    padding: '0 1rem',
                    fontSize: '0.88rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    height: '100%',
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {b.name}
                </button>
              </div>
            );
          })}

          <button
            type="button"
            className="ff-btn-secondary"
            onClick={handleAddBuild}
            style={{
              padding: '0 0.8rem',
              height: '38px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <Plus size={14} /> Add Another Set
          </button>
        </div>

        {builds.length > 1 && (
          <button
            type="button"
            className="ff-btn-secondary"
            onClick={() => handleRemoveBuild(activeBuildId)}
            style={{
              padding: '0 0.8rem',
              height: '38px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: 'var(--color-error)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.borderColor = 'var(--color-error)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            }}
          >
            Remove Set
          </button>
        )}
      </div>

      <div
        className="builder-header"
        style={{
          marginBottom: '1.5rem',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ flex: '1', minWidth: '280px' }}>
          <h2
            style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>✦</span> Submarine Set Builder
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Choose components and set quantities per part, or use the set multiplier to order
            multiple identical builds at once. Submit your selection to get an order code.
          </p>
        </div>

        {/* Name editor for the active build */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '200px' }}>
          <label
            style={{
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-gold-light)',
            }}
          >
            Set / Build Name
          </label>
          <input
            type="text"
            value={activeBuild.name}
            onChange={(e) => handleRenameBuild(activeBuildId, e.target.value)}
            placeholder="e.g. Speed Set"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid rgba(197,160,89,0.25)',
              borderRadius: '4px',
              color: 'var(--color-text-title)',
              fontSize: '0.9rem',
              padding: '0.4rem 0.6rem',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Preset selections */}
      <div
        className="ff-card-framed"
        style={{
          marginBottom: '1.5rem',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          background: 'linear-gradient(135deg, rgba(197,160,89,0.03) 0%, rgba(21,31,51,0.1) 100%)',
          borderLeft: '3px solid var(--color-gold)',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div
            style={{
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-gold-light)',
              marginBottom: '0.2rem',
            }}
          >
            Quick Set Presets (Active Set Only)
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Select a common configuration to instantly pre-fill components
          </div>
        </div>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}
        >
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.name;
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className={isActive ? 'ff-btn' : 'ff-btn-secondary'}
                style={{
                  padding: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  textAlign: 'center',
                  borderRadius: '4px',
                  boxShadow: isActive ? '0 0 12px var(--color-gold-glow)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.15rem',
                  height: 'auto',
                }}
                title={preset.description}
              >
                <span style={{ fontSize: '0.9rem', color: isActive ? '#121824' : 'var(--color-gold)' }}>
                  {preset.name}
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    color: isActive ? 'rgba(18, 24, 36, 0.8)' : 'var(--color-text-muted)',
                    fontWeight: 'normal',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                  }}
                >
                  {preset.name === 'WSUC' && 'Standard'}
                  {preset.name === 'SSSS' && 'All Shark'}
                  {preset.name === 'WSUC++' && 'Modified'}
                  {preset.name === 'W-UC' && 'No Stern'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Set multiplier banner */}
      <div
        className="ff-card-framed"
        style={{
          marginBottom: '1.5rem',
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'linear-gradient(135deg, rgba(197,160,89,0.05) 0%, rgba(21,31,51,0.3) 100%)',
          borderLeft: '3px solid var(--color-gold)',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div
            style={{
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-gold-light)',
              marginBottom: '0.2rem',
            }}
          >
            Number of Sets (Active Set Only)
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Sets the same quantity for all 4 parts of the active set at once
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="ff-btn-secondary"
            style={{ padding: '0.3rem 0.6rem', height: '34px' }}
            onClick={() => handleSetCountChange(Math.max(0, (allSameQty ? quantities.Hull : 1) - 1))}
          >
            <Minus size={12} />
          </button>
          <input
            type="number"
            min="0"
            value={allSameQty && setCount > 0 ? setCount : setCount === 0 ? 0 : ''}
            placeholder="—"
            onChange={(e) => handleSetCountInput(e.target.value)}
            style={{
              width: '90px',
              textAlign: 'center',
              background: 'var(--bg-input)',
              border: '1px solid rgba(197,160,89,0.25)',
              borderRadius: '4px',
              color: 'var(--color-text-title)',
              fontSize: '1rem',
              fontWeight: '600',
              padding: '0.3rem',
              height: '34px',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            className="ff-btn-secondary"
            style={{ padding: '0.3rem 0.6rem', height: '34px' }}
            onClick={() => handleSetCountChange((allSameQty ? quantities.Hull : 1) + 1)}
          >
            <Plus size={12} />
          </button>
          {!allSameQty && (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', maxWidth: '120px' }}>
              Parts have mixed quantities
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }} className="builder-grid-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="builder-columns-wrapper">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {PART_TYPES.map((type: PartType) => (
              <PartSelector
                key={type}
                partType={type}
                parts={parts}
                selectedPart={selections[type]}
                onSelectPart={(part) => handleSelect(type, part)}
                quantity={quantities[type]}
                onQuantityChange={(qty) => handleQuantityChange(type, qty)}
                craftability={partCraftability[type] ?? { craftable: 0, hasRecipe: false, bottlenecks: [] }}
              />
            ))}
          </div>

          {/* Magitek Repair Materials Selector */}
          {(() => {
            const mrmPart = parts.find((p) => p.partType === 'Materials');
            if (!mrmPart) return null;
            return (
              <div
                className="ff-card-framed"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--color-gold)' }}>✦</span>
                    <h3 style={{ fontSize: '1.15rem', color: 'var(--color-text-title)', margin: 0 }}>
                      Magitek Repair Materials
                    </h3>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--color-text-muted)',
                      marginLeft: '1.1rem',
                      fontStyle: 'italic',
                    }}
                  >
                    {mrmPart.stock > 0
                      ? `${formatNumber(mrmPart.stock)} in stock`
                      : 'Currently out of stock'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="gil-price" style={{ fontSize: '1rem' }}>
                    <span>{formatGil(mrmPart.price).replace(' Gil', '')}</span>
                    <span className="gil-coin">G</span> ea.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span
                      style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}
                    >
                      Qty:
                    </span>
                    <button
                      type="button"
                      className="ff-btn-secondary"
                      style={{ padding: '0.15rem 0.4rem', height: '26px' }}
                      onClick={() =>
                        handleQuantityChange('Materials', Math.max(0, quantities.Materials - 1))
                      }
                    >
                      <Minus size={10} />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={quantities.Materials}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (!isNaN(n) && n >= 0) handleQuantityChange('Materials', n);
                      }}
                      style={{
                        width: '90px',
                        textAlign: 'center',
                        background: 'var(--bg-input)',
                        border: '1px solid rgba(197,160,89,0.2)',
                        borderRadius: '4px',
                        color: 'var(--color-text-title)',
                        padding: '0.15rem',
                        height: '26px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      className="ff-btn-secondary"
                      style={{ padding: '0.15rem 0.4rem', height: '26px' }}
                      onClick={() => handleQuantityChange('Materials', quantities.Materials + 1)}
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Crafting Stock Availability Banner ── */}
          {anySelected && (
            <div
              className="ff-alert"
              style={{
                textAlign: 'left',
                margin: '0 0 1.5rem 0',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                borderLeft: `4px solid ${hasInsufficientParts ? 'var(--color-gold)' : 'var(--color-success)'}`,
                background: hasInsufficientParts
                  ? 'linear-gradient(135deg, rgba(197,160,89,0.04) 0%, rgba(21,31,51,0.2) 100%)'
                  : 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(21,31,51,0.2) 100%)',
                color: 'var(--color-text-main)',
              }}
            >
              {hasInsufficientParts ? (
                <>
                  <Info size={18} style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: '0.1rem' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--color-gold-light)' }}>
                      Custom Crafting Notice
                    </strong>
                    <span
                      style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: '1.5' }}
                    >
                      Some of the parts that you selected can't be crafted instantly, so it may take a
                      bit longer to fulfill. Everything else looks fine!
                    </span>
                    {setCraftableCount.hasRecipe && setCraftableCount.craftable > 0 && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-gold-light)', marginTop: '0.25rem' }}>
                        <Hammer size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Enough ingredients to craft <strong>{formatNumber(setCraftableCount.craftable)}</strong>{' '}
                        complete {setCraftableCount.craftable === 1 ? 'set' : 'sets'}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Check size={18} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: '0.1rem' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--color-success)' }}>
                      All Materials Available
                    </strong>
                    <span
                      style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: '1.5' }}
                    >
                      All materials for your craft are in-stock, so craft will be quick!
                    </span>
                    {setCraftableCount.hasRecipe && setCraftableCount.craftable > 0 && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-success)', marginTop: '0.25rem' }}>
                        <Hammer size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Enough ingredients to craft <strong>{formatNumber(setCraftableCount.craftable)}</strong>{' '}
                        complete {setCraftableCount.craftable === 1 ? 'set' : 'sets'}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Summary card */}
          <div
            className="ff-card-framed"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(21, 31, 51, 0.4) 100%)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
                paddingBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Anchor style={{ color: 'var(--color-gold)' }} />
                <h3 style={{ fontSize: '1.2rem', color: 'var(--color-text-title)' }}>Order Summary</h3>
              </div>
              {builds.length > 1 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {builds.length} Configured Sets
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', textAlign: 'left' }}>
                <span
                  style={{
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05rem',
                    color: 'var(--color-gold-light)',
                  }}
                >
                  Selected Components
                </span>

                {builds.map((build, index) => {
                  const buildSelections = build.selections;
                  const buildQuantities = build.quantities;
                  const hasParts = ALL_PART_TYPES.some(
                    (type) => buildSelections[type] !== null && buildQuantities[type] > 0
                  );
                  if (!hasParts) return null;

                  return (
                    <div
                      key={build.id}
                      style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                    >
                      <div
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          color: 'var(--color-gold)',
                          borderBottom: '1px solid rgba(197, 160, 89, 0.1)',
                          paddingBottom: '0.2rem',
                        }}
                      >
                        {build.name || `Build ${index + 1}`}
                      </div>
                      {ALL_PART_TYPES.map((type: PartType) => {
                        const part = buildSelections[type];
                        const qty = buildQuantities[type];
                        if (!part || qty === 0) return null;

                        return (
                          <div
                            key={type}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.82rem',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                          >
                            <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                              {type === 'Materials' ? 'Extra' : type}:
                            </span>
                            <span
                              style={{
                                fontWeight: '500',
                                color: 'var(--color-text-title)',
                                textAlign: 'right',
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {part.className}
                            </span>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                background: 'rgba(197,160,89,0.12)',
                                color: 'var(--color-gold)',
                                borderRadius: '3px',
                                padding: '0.05rem 0.25rem',
                                fontWeight: '700',
                                flexShrink: 0,
                              }}
                            >
                              ×{qty}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  background: 'var(--bg-input)',
                  padding: '1.25rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(197, 160, 89, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {activeDiscount && (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.82rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        paddingBottom: '0.4rem',
                      }}
                    >
                      <span style={{ color: 'var(--color-text-muted)' }}>Subtotal:</span>
                      <span className="gil-price" style={{ fontSize: '0.92rem' }}>
                        <span>{formatNumber(overallSubtotal)}</span>
                        <span className="gil-coin" style={{ width: '13px', height: '13px', fontSize: '8px' }}>
                          G
                        </span>
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.82rem',
                        color: 'var(--color-success)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        paddingBottom: '0.4rem',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Tag size={12} /> Bulk Discount ({discountPct}%):
                      </span>
                      <span>−{formatNumber(discountAmount)} G</span>
                    </div>
                  </>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.2rem',
                    marginTop: activeDiscount ? '0.4rem' : '0',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    Total Price
                  </span>
                  <div className="gil-price" style={{ fontSize: '1.8rem', textShadow: '0 0 10px rgba(197,160,89,0.2)' }}>
                    <span>{formatNumber(totalPrice)}</span>
                    <span className="gil-coin" style={{ width: '22px', height: '22px', fontSize: '12px' }}>G</span>
                  </div>
                  {totalParts > 0 && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      {formatNumber(totalParts)} part{totalParts > 1 ? 's' : ''} ordered
                    </span>
                  )}
                  {hasUnpricedParts && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-warning)', textAlign: 'center' }}>
                      Some selected parts have no price set yet — the final total will be confirmed
                      by @Alamai.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Discount Legend/Guide */}
            {discounts.length > 0 && (
              <div
                style={{
                  background: 'rgba(197, 160, 89, 0.02)',
                  border: '1px solid rgba(197, 160, 89, 0.1)',
                  borderRadius: '4px',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-gold-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontWeight: '600',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Tag size={12} /> Bulk Discount Guide
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--color-text-muted)',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                    }}
                  >
                    Current Parts Count:{' '}
                    <strong style={{ color: 'var(--color-gold)', fontSize: '0.8rem' }}>
                      {formatNumber(totalParts)}
                    </strong>
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.72rem' }}>
                  {discounts.map((d) => {
                    const isCurrent = activeDiscount?.threshold === d.threshold;
                    return (
                      <div
                        key={d.id}
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '3px',
                          background: isCurrent ? 'var(--color-success-bg)' : 'transparent',
                          border: `1px solid ${isCurrent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                          color: isCurrent ? 'var(--color-success)' : 'var(--color-text-muted)',
                          fontWeight: isCurrent ? 'bold' : 'normal',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <span>{formatNumber(d.threshold)}+ Parts:</span>
                        <span style={{ color: isCurrent ? 'var(--color-success)' : 'var(--color-text-title)' }}>
                          {Number(d.discountPercent)}% Off
                        </span>
                        {isCurrent && <span style={{ fontSize: '0.65rem' }}>★ Active</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {hasOutOfStock && (
              <div className="ff-alert ff-alert-warning" style={{ textAlign: 'left', margin: 0 }}>
                <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
                    Includes Custom-Crafted Parts
                  </strong>
                  <span style={{ fontSize: '0.8rem' }}>
                    One or more selected parts are currently out of stock. These will be
                    custom-crafted for you. Delivery may take 1-7 days depending on material
                    availability and current load.
                  </span>
                </div>
              </div>
            )}

            {!hasOutOfStock && anySelected && (
              <div
                className="ff-alert ff-alert-info"
                style={{
                  textAlign: 'left',
                  margin: 0,
                  background: 'rgba(16, 185, 129, 0.05)',
                  color: 'var(--color-success)',
                  borderColor: 'rgba(16, 185, 129, 0.2)',
                }}
              >
                <Check size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
                    All Selected Components In Stock
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-main)' }}>
                    Excellent selection! All selected parts are currently in inventory. Ready for
                    immediate delivery.
                  </span>
                </div>
              </div>
            )}

            {showSubmitForm ? (
              <OrderSubmitForm
                items={orderItems}
                subtotal={overallSubtotal}
                discountPct={discountPct}
                discountAmt={discountAmount}
                total={totalPrice}
                onCancel={() => setShowSubmitForm(false)}
                onSubmitted={(order) => {
                  setSubmittedOrder(order);
                  setShowSubmitForm(false);
                }}
              />
            ) : (
              <>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="ff-btn glow-active"
                    style={{ flex: 1, minWidth: '200px' }}
                    onClick={() => setShowSubmitForm(true)}
                    disabled={!anySelected || orderItems.length === 0}
                  >
                    <Send size={16} /> Send Order Request
                  </button>
                </div>

                <p
                  style={{
                    color: 'var(--color-text-muted)',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    marginTop: '-0.5rem',
                  }}
                >
                  Submitting creates your order request — you'll receive a confirmation code to send
                  to @Alamai on Discord.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
