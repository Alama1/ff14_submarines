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
import './SetBuilder.css';

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
    <div className="ff-card-framed fade-in sb-form-card">
      <div className="sb-form-title-row">
        <Send size={20} />
        <h3 className="sb-form-title">Send Order Request</h3>
      </div>
      <p className="sb-form-hint">
        Submitting creates your order and gives you a confirmation code. Send that code to{' '}
        <strong className="sb-form-handle">@Alamai</strong> on Discord to confirm the
        build.
      </p>

      <div className="sb-form-grid">
        <div className="form-group sb-form-group">
          <label className="form-label sb-label-sm">Character / Discord Name *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Alamai"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            maxLength={100}
          />
        </div>
        <div className="form-group sb-form-group">
          <label className="form-label sb-label-sm">Discord Contact (optional)</label>
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

      <label className="sb-anon-label">
        <input
          type="checkbox"
          className="sb-anon-checkbox"
          checked={form.isAnonymous}
          onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })}
        />
        <span className="sb-anon-text">
          <span className="sb-anon-title">Order anonymously</span>
          <span className="sb-anon-desc">
            It fully hides your name in the live in-progress order tracking — you'll show up as
            “Anonymous” instead.
          </span>
        </span>
      </label>

      <div className="form-group sb-form-group">
        <label className="form-label sb-label-sm">Notes (optional)</label>
        <textarea
          className="form-input sb-notes-input"
          rows={2}
          placeholder="Anything Alamai should know about this order…"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="sb-fulfillment-row">
        <div className="form-group sb-form-group">
          <label className="form-label sb-label-sm">Fulfillment</label>
          <select
            className="form-select sb-fulfillment-select"
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
            className="form-input sb-fulfillment-date"
            value={form.fulfillmentDate}
            onChange={(e) => setForm({ ...form, fulfillmentDate: e.target.value })}
          />
        )}
      </div>

      {/* Price recap */}
      <div className="sb-price-recap">
        {discountPct > 0 && (
          <>
            <div className="sb-price-col">
              <span className="sb-price-label is-muted">Subtotal</span>
              <span className="sb-price-value">{formatGil(subtotal)}</span>
            </div>
            <div className="sb-price-col">
              <span className="sb-price-label is-success">Bulk Discount ({discountPct}%)</span>
              <span className="sb-price-value is-success">−{formatGil(discountAmt)}</span>
            </div>
          </>
        )}
        <div className="sb-price-col">
          <span className="sb-price-label is-gold">Total</span>
          <div className="gil-price sb-price-total">
            <span>{formatNumber(total)}</span>
            <span className="gil-coin sb-coin-sm">G</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="sb-error">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="sb-form-actions">
        <button
          type="button"
          className="ff-btn glow-active sb-submit-btn"
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
    <div className="ff-card-framed fade-in sb-success-card">
      <div className="sb-success-icon">
        <Check size={32} />
      </div>

      <div className="sb-success-head">
        <h2 className="sb-success-title">Order Request Sent!</h2>
        <p className="sb-success-sub">
          Your order has been created with a total of{' '}
          <strong>{formatGil(order.total)}</strong>.
        </p>
      </div>

      <div className="sb-success-code-block">
        <span className="sb-success-code-label">Your Confirmation Code</span>
        <button type="button" className="sb-success-code-btn" onClick={handleCopy} title="Click to copy">
          {order.orderCode}
          {copied ? (
            <Check size={18} className="sb-success-code-icon is-copied" />
          ) : (
            <Copy size={18} className="sb-success-code-icon" />
          )}
        </button>
      </div>

      <div className="sb-success-next">
        <Ship size={18} className="sb-success-next-icon" />
        <span className="sb-success-next-text">
          <strong>Next step:</strong> send this code to{' '}
          <span className="sb-success-handle">@Alamai</span> on Discord to confirm your build
          request. You can track the progress anytime in the Orders tab.
        </span>
      </div>

      <div className="sb-success-actions">
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
        if (type === 'Materials') return;
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
      <div className="sb-toolbar">
        <div className="sb-toolbar-tabs">
          {builds.map((b) => {
            const isActive = b.id === activeBuildId;
            return (
              <div key={b.id} className={`sb-tab ${isActive ? 'is-active' : ''}`}>
                {isActive && <div className="sb-tab-active-bar" />}
                <button type="button" className="sb-tab-btn" onClick={() => setActiveBuildId(b.id)}>
                  {b.name}
                </button>
              </div>
            );
          })}

          <button type="button" className="ff-btn-secondary sb-add-btn" onClick={handleAddBuild}>
            <Plus size={14} /> Add Another Set
          </button>
        </div>

        {builds.length > 1 && (
          <button
            type="button"
            className="ff-btn-secondary sb-remove-btn"
            onClick={() => handleRemoveBuild(activeBuildId)}
          >
            Remove Set
          </button>
        )}
      </div>

      <div className="sb-header">
        <div className="sb-header-text">
          <h2 className="sb-header-title">
            <span>✦</span> Submarine Set Builder
          </h2>
          <p className="sb-header-sub">
            Choose components and set quantities per part, or use the set multiplier to order
            multiple identical builds at once. Submit your selection to get an order code.
          </p>
        </div>

        {/* Name editor for the active build */}
        <div className="sb-rename-block">
          <label className="sb-rename-label">Set / Build Name</label>
          <input
            type="text"
            className="sb-rename-input"
            value={activeBuild.name}
            onChange={(e) => handleRenameBuild(activeBuildId, e.target.value)}
            placeholder="e.g. Speed Set"
          />
        </div>
      </div>

      {/* Preset selections */}
      <div className="ff-card-framed sb-presets">
        <div className="sb-presets-title">Quick Set Presets (Active Set Only)</div>
        <div className="sb-presets-sub">
          Select a common configuration to instantly pre-fill components
        </div>
        <div className="sb-presets-grid">
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.name;
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`${isActive ? 'ff-btn' : 'ff-btn-secondary'} sb-preset-btn ${
                  isActive ? 'is-active' : ''
                }`}
                title={preset.description}
              >
                <span className="sb-preset-name">{preset.name}</span>
                <span className="sb-preset-desc">
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
      <div className="ff-card-framed sb-multiplier">
        <div className="sb-multiplier-title">Number of Sets (Active Set Only)</div>
        <div className="sb-multiplier-sub">
          Sets the same quantity for all 4 parts of the active set at once
        </div>

        <div className="sb-multiplier-controls">
          <button
            type="button"
            className="ff-btn-secondary sb-multiplier-btn"
            onClick={() => handleSetCountChange(Math.max(0, (allSameQty ? quantities.Hull : 1) - 1))}
          >
            <Minus size={12} />
          </button>
          <input
            type="number"
            className="sb-multiplier-input"
            min="0"
            value={allSameQty && setCount > 0 ? setCount : setCount === 0 ? 0 : ''}
            placeholder="—"
            onChange={(e) => handleSetCountInput(e.target.value)}
          />
          <button
            type="button"
            className="ff-btn-secondary sb-multiplier-btn"
            onClick={() => handleSetCountChange((allSameQty ? quantities.Hull : 1) + 1)}
          >
            <Plus size={12} />
          </button>
          {!allSameQty && <span className="sb-multiplier-warning">Parts have mixed quantities</span>}
        </div>
      </div>

      <div className="sb-grid">
        <div className="sb-columns">
          <div className="sb-parts-grid">
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
              <div className="ff-card-framed sb-mrm">
                <div className="sb-mrm-info">
                  <div className="sb-mrm-title-row">
                    <span className="sb-mrm-star">✦</span>
                    <h3 className="sb-mrm-title">Magitek Repair Materials</h3>
                  </div>
                  <span className="sb-mrm-stock">
                    {mrmPart.stock > 0
                      ? `${formatNumber(mrmPart.stock)} in stock`
                      : 'Currently out of stock'}
                  </span>
                </div>
                <div className="sb-mrm-note">
                  <span className="sb-mrm-note-text">
                    Due to high demand, repair kits ordering is temporary paused
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Crafting Stock Availability Banner ── */}
          {anySelected && (
            <div className={`ff-alert sb-craft-banner ${hasInsufficientParts ? 'is-warning' : ''}`}>
              {hasInsufficientParts ? (
                <>
                  <Info size={18} className="sb-craft-banner-icon" />
                  <div className="sb-craft-banner-body">
                    <strong className="sb-craft-banner-title">Custom Crafting Notice</strong>
                    <span className="sb-craft-banner-text">
                      Some of the parts that you selected can't be crafted instantly, so it may take a
                      bit longer to fulfill. Everything else looks fine!
                    </span>
                    {setCraftableCount.hasRecipe && setCraftableCount.craftable > 0 && (
                      <span className="sb-craft-banner-count">
                        <Hammer size={10} />
                        Enough ingredients to craft <strong>{formatNumber(setCraftableCount.craftable)}</strong>{' '}
                        complete {setCraftableCount.craftable === 1 ? 'set' : 'sets'}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Check size={18} className="sb-craft-banner-icon" />
                  <div className="sb-craft-banner-body">
                    <strong className="sb-craft-banner-title">All Materials Available</strong>
                    <span className="sb-craft-banner-text">
                      All materials for your craft are in-stock, so craft will be quick!
                    </span>
                    {setCraftableCount.hasRecipe && setCraftableCount.craftable > 0 && (
                      <span className="sb-craft-banner-count">
                        <Hammer size={10} />
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
          <div className="ff-card-framed sb-summary">
            <div className="sb-summary-header">
              <div className="sb-summary-title-row">
                <Anchor />
                <h3 className="sb-summary-title">Order Summary</h3>
              </div>
              {builds.length > 1 && (
                <span className="sb-summary-count">{builds.length} Configured Sets</span>
              )}
            </div>

            <div className="sb-summary-grid">
              <div className="sb-components">
                <span className="sb-components-label">Selected Components</span>

                {builds.map((build, index) => {
                  const buildSelections = build.selections;
                  const buildQuantities = build.quantities;
                  const hasParts = ALL_PART_TYPES.some(
                    (type) => buildSelections[type] !== null && buildQuantities[type] > 0
                  );
                  if (!hasParts) return null;

                  return (
                    <div key={build.id} className="sb-build-block">
                      <div className="sb-build-name">{build.name || `Build ${index + 1}`}</div>
                      {ALL_PART_TYPES.map((type: PartType) => {
                        const part = buildSelections[type];
                        const qty = buildQuantities[type];
                        if (!part || qty === 0) return null;

                        return (
                          <div key={type} className="sb-build-row">
                            <span className="sb-build-row-type">
                              {type === 'Materials' ? 'Extra' : type}:
                            </span>
                            <span className="sb-build-row-name">{part.className}</span>
                            <span className="sb-build-row-qty">×{qty}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="sb-total-box">
                {activeDiscount && (
                  <>
                    <div className="sb-total-row">
                      <span className="sb-total-row-label">Subtotal:</span>
                      <span className="gil-price sb-total-row-value">
                        <span>{formatNumber(overallSubtotal)}</span>
                        <span className="gil-coin sb-coin-xs">G</span>
                      </span>
                    </div>
                    <div className="sb-total-row is-success">
                      <span className="sb-total-row-label is-flex">
                        <Tag size={12} /> Bulk Discount ({discountPct}%):
                      </span>
                      <span>−{formatNumber(discountAmount)} G</span>
                    </div>
                  </>
                )}

                <div className={`sb-total-final ${activeDiscount ? 'has-discount' : ''}`}>
                  <span className="sb-total-label">Total Price</span>
                  <div className="gil-price sb-total-price">
                    <span>{formatNumber(totalPrice)}</span>
                    <span className="gil-coin sb-coin-xl">G</span>
                  </div>
                  {totalParts > 0 && (
                    <span className="sb-total-parts">
                      {formatNumber(totalParts)} part{totalParts > 1 ? 's' : ''} ordered
                    </span>
                  )}
                  {hasUnpricedParts && (
                    <span className="sb-total-unpriced">
                      Some selected parts have no price set yet — the final total will be confirmed
                      by @Alamai.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Discount Legend/Guide */}
            {discounts.length > 0 && (
              <div className="sb-discount-guide">
                <div className="sb-discount-guide-head">
                  <div className="sb-discount-guide-title">
                    <Tag size={12} /> Bulk Discount Guide
                  </div>
                  <span className="sb-discount-guide-count">
                    Current Parts Count:{' '}
                    <strong>{formatNumber(totalParts)}</strong>
                  </span>
                </div>
                <div className="sb-discount-list">
                  {discounts.map((d) => {
                    const isCurrent = activeDiscount?.threshold === d.threshold;
                    return (
                      <div
                        key={d.id}
                        className={`sb-discount-chip ${isCurrent ? 'is-current' : ''}`}
                      >
                        <span>{formatNumber(d.threshold)}+ Parts:</span>
                        <span className="sb-discount-chip-pct">{Number(d.discountPercent)}% Off</span>
                        {isCurrent && <span className="sb-discount-chip-active">★ Active</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {hasOutOfStock && (
              <div className="ff-alert ff-alert-warning sb-alert">
                <Info size={16} />
                <div>
                  <strong className="sb-alert-title">Includes Custom-Crafted Parts</strong>
                  <span className="sb-alert-text">
                    One or more selected parts are currently out of stock. These will be
                    custom-crafted for you. Delivery may take 1-7 days depending on material
                    availability and current load.
                  </span>
                </div>
              </div>
            )}

            {!hasOutOfStock && anySelected && (
              <div className="ff-alert ff-alert-info sb-alert sb-alert-instock">
                <Check size={16} />
                <div>
                  <strong className="sb-alert-title">All Selected Components In Stock</strong>
                  <span className="sb-alert-text">
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
                <div className="sb-summary-actions">
                  <button
                    type="button"
                    className="ff-btn glow-active sb-submit-btn"
                    onClick={() => setShowSubmitForm(true)}
                    disabled={!anySelected || orderItems.length === 0}
                  >
                    <Send size={16} /> Send Order Request
                  </button>
                </div>

                <p className="sb-summary-footnote">
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
