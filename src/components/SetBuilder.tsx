import { useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import PartSelector from './PartSelector';
import { formatGil, formatNumber, PART_TYPES, ALL_PART_TYPES } from '../utils/format';
import {
  Anchor,
  Plus,
  Minus,
  Tag,
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
  computeOrderAvailability,
  computePartCraftable,
} from '../utils/stockCalc';
import { submitOrder, validatePromoCode } from '../api/endpoints';
import { ApiError } from '../api/client';
import { PromoCodeValidation } from '../api/types';
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
  promoCode?: string | null;
  discountSource?: 'bulk' | 'promo' | null;
}

interface OrderSubmitFormProps {
  items: CreateOrderItemDto[];
  subtotal: number;
  promoBase: number;
  discountPct: number;
  discountAmt: number;
  onCancel: () => void;
  onSubmitted: (order: SubmittedOrder) => void;
}

function OrderSubmitForm({
  items,
  subtotal,
  promoBase,
  discountPct,
  discountAmt,
  onCancel,
  onSubmitted,
}: OrderSubmitFormProps) {
  // shortcut: server-generated text (ApiError.message, promo result.message) stays English
  // until the backend takes a lang param — UI strings below are all localized.
  const { t } = useTranslation();
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
  const [promoInput, setPromoInput] = useState('');
  const [promoCheck, setPromoCheck] = useState<PromoCodeValidation | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState('');

  // Promo discount recomputed against the promo-eligible subtotal (excludes
  // repair kits) — mirrors the backend (percent rounds, flat caps at the base).
  const promoInfo = promoCheck?.valid ? promoCheck.code ?? null : null;
  const promoAmt = useMemo(() => {
    if (!promoInfo) return 0;
    const value = Number(promoInfo.discountValue) || 0;
    return promoInfo.discountType === 'percent'
      ? Math.round(promoBase * (value / 100))
      : Math.max(0, Math.min(Math.round(value), promoBase));
  }, [promoInfo, promoBase]);

  // Promo and bulk discounts never stack — the higher one wins (ties → promo).
  const promoWins = promoAmt >= discountAmt && promoAmt > 0;
  const effectiveAmt = promoWins ? promoAmt : discountAmt;
  const effectiveTotal = subtotal - effectiveAmt;

  const resetPromoResult = () => {
    setPromoCheck(null);
    setPromoError('');
  };

  const handleCheckPromo = async () => {
    const code = promoInput.trim();
    setPromoError('');
    if (!code) {
      setPromoCheck(null);
      return;
    }
    setPromoChecking(true);
    try {
      const result = await validatePromoCode(code, promoBase);
      setPromoCheck(result);
    } catch (e: unknown) {
      setPromoCheck(null);
      setPromoError(
        e instanceof ApiError ? e.message : t('builder.errPromoCheck')
      );
    } finally {
      setPromoChecking(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.clientName.trim()) {
      setError(t('builder.errName'));
      return;
    }
    if (form.fulfillmentType === 'date' && !form.fulfillmentDate) {
      setError(t('builder.errDate'));
      return;
    }

    // Re-validate the promo code right before placing the order — uses may
    // have run out since it was last checked.
    let appliedPromo: string | undefined;
    if (promoInput.trim()) {
      setPromoChecking(true);
      let result: PromoCodeValidation;
      try {
        result = await validatePromoCode(promoInput.trim(), promoBase);
      } catch (e: unknown) {
        setPromoCheck(null);
        setPromoError(
          e instanceof ApiError ? e.message : t('builder.errPromoCheck')
        );
        setPromoChecking(false);
        return;
      }
      setPromoChecking(false);
      setPromoCheck(result);
      if (!result.valid) {
        setError(result.message || t('builder.promoInvalid'));
        return;
      }
      appliedPromo = result.code?.code;
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
        promoCode: appliedPromo,
        items,
      });
      addRecentOrderCode(order.orderCode);
      onSubmitted({
        orderCode: order.orderCode,
        total: order.total,
        promoCode: order.promoCode,
        discountSource: order.discountSource,
      });
    } catch (e: unknown) {
      setError(
        e instanceof ApiError
          ? e.message
          : t('builder.errSubmit')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ff-card-framed fade-in sb-form-card">
      <div className="sb-form-title-row">
        <Send size={20} />
        <h3 className="sb-form-title">{t('builder.sendRequest')}</h3>
      </div>
      <p className="sb-form-hint">
        <Trans
          i18nKey="builder.formHint"
          components={{ handle: <strong className="sb-form-handle">@Alamai</strong> }}
        />
      </p>

      <div className="sb-form-grid">
        <div className="form-group sb-form-group">
          <label className="form-label sb-label-sm">{t('builder.discordName')}</label>
          <input
            type="text"
            className="form-input"
            placeholder={t('common.exampleName')}
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            maxLength={100}
          />
        </div>
        <div className="form-group sb-form-group">
          <label className="form-label sb-label-sm">{t('builder.charName')}</label>
          <input
            type="text"
            className="form-input"
            placeholder={t('builder.charNameExample')}
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
          <span className="sb-anon-title">{t('builder.anonTitle')}</span>
          <span className="sb-anon-desc">{t('builder.anonDesc')}</span>
        </span>
      </label>

      <div className="form-group sb-form-group">
        <label className="form-label sb-label-sm">{t('builder.notes')}</label>
        <textarea
          className="form-input sb-notes-input"
          rows={2}
          placeholder={t('builder.notesPlaceholder')}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="sb-fulfillment-row">
        <div className="form-group sb-form-group">
          <label className="form-label sb-label-sm">{t('builder.fulfillment')}</label>
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
            <option value="asap">{t('builder.asap')}</option>
            <option value="date">{t('builder.preOrderDate')}</option>
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

      {/* Promo code */}
      <div className="form-group sb-form-group">
        <label className="form-label sb-label-sm">{t('builder.promoLabel')}</label>
        <div className="sb-promo-row">
          <input
            type="text"
            className="form-input sb-promo-input"
            placeholder={t('builder.promoPlaceholder')}
            value={promoInput}
            maxLength={40}
            onChange={(e) => {
              setPromoInput(e.target.value.toUpperCase());
              resetPromoResult();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCheckPromo();
              }
            }}
          />
          <button
            type="button"
            className="ff-btn-secondary sb-promo-check"
            onClick={handleCheckPromo}
            disabled={promoChecking || !promoInput.trim()}
          >
            {promoChecking ? <RefreshCw size={14} className="spin" /> : <Tag size={14} />}
            {t('builder.check')}
          </button>
        </div>
        {promoError && (
          <div className="sb-promo-msg is-error">
            <AlertCircle size={12} />
            {promoError}
          </div>
        )}
        {!promoError && promoCheck && (
          promoCheck.valid ? (
            <div className="sb-promo-msg is-success">
              <Check size={12} />
              {promoInfo!.discountType === 'percent'
                ? `${t('builder.percentOff', { pct: Number(promoInfo!.discountValue) })} (−${formatGil(promoAmt)})`
                : `−${formatGil(promoAmt)}`}{' '}
              {t('builder.appliedToOrder')}
            </div>
          ) : (
            <div className="sb-promo-msg is-error">
              <AlertCircle size={12} />
              {promoCheck.message || t('builder.promoInvalid')}
            </div>
          )
        )}
        {promoCheck?.valid && !promoWins && discountAmt > 0 && (
          <div className="sb-promo-msg is-info">
            <AlertCircle size={12} />
            {t('builder.bulkHigher', { pct: discountPct })}
          </div>
        )}
      </div>

      {/* Price recap */}
      <div className="sb-price-recap">
        {(discountPct > 0 || promoAmt > 0) && (
          <>
            <div className="sb-price-col">
              <span className="sb-price-label is-muted">{t('common.subtotal')}</span>
              <span className="sb-price-value">{formatGil(subtotal)}</span>
            </div>
            <div className="sb-price-col">
              <span className="sb-price-label is-success">
                {promoWins
                  ? t('builder.promoCodeLabel', { code: promoInfo!.code })
                  : t('builder.bulkDiscount', { pct: discountPct })}
              </span>
              <span className="sb-price-value is-success">−{formatGil(effectiveAmt)}</span>
            </div>
          </>
        )}
        <div className="sb-price-col">
          <span className="sb-price-label is-gold">{t('common.total')}</span>
          <div className="gil-price sb-price-total">
            <span>{formatNumber(effectiveTotal)}</span>
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
          disabled={submitting || promoChecking}
        >
          {submitting ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
          {submitting ? t('builder.submitting') : t('builder.submitBtn')}
        </button>
        <button type="button" className="ff-btn-secondary" onClick={onCancel} disabled={submitting || promoChecking}>
          {t('common.cancel')}
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
  const { t } = useTranslation();
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
        <h2 className="sb-success-title">{t('builder.successTitle')}</h2>
        <p className="sb-success-sub">
          <Trans
            i18nKey="builder.successSub"
            values={{ total: formatGil(order.total) }}
            components={{ strong: <strong /> }}
          />
        </p>
        {order.promoCode && order.discountSource === 'bulk' && (
          <p className="sb-success-promo-note">
            <Trans
              i18nKey="builder.successBulkNote"
              values={{ code: order.promoCode }}
              components={{ strong: <strong /> }}
            />
          </p>
        )}
      </div>

      <div className="sb-success-code-block">
        <span className="sb-success-code-label">{t('builder.codeLabel')}</span>
        <button type="button" className="sb-success-code-btn" onClick={handleCopy} title={t('common.copyTip')}>
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
          <Trans
            i18nKey="builder.nextStep"
            components={{
              strong: <strong />,
              handle: <span className="sb-success-handle">@Alamai</span>,
            }}
          />
        </span>
      </div>

      <div className="sb-success-actions">
        <button type="button" className="ff-btn" onClick={onTrack}>
          <ExternalLink size={14} /> {t('builder.trackBtn')}
        </button>
        <button type="button" className="ff-btn-secondary" onClick={onNewOrder}>
          <Plus size={14} /> {t('builder.anotherBtn')}
        </button>
      </div>
    </div>
  );
}

// ─── Main SetBuilder ──────────────────────────────────────────────────────────

export default function SetBuilder({ catalog, onTrackOrder }: SetBuilderProps) {
  const { t } = useTranslation();
  const { parts, partsById, discounts, inProgress, missing } = catalog;

  const [builds, setBuilds] = useState<SubmarineBuild[]>(() =>
    parts.length > 0 ? [createDefaultBuild('1', 'Build 1', parts)] : []
  );
  const [activeBuildId, setActiveBuildId] = useState<string>('1');

  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<SubmittedOrder | null>(null);

  // Live availability: inventory stock (/missing feed) minus materials
  // committed to in-progress orders
  const availableMaterials = useMemo(() => {
    const committed = computeCommittedMaterials(inProgress, partsById);
    const stockFromMissing = Object.fromEntries(missing.map((m) => [m.id, m.currentStock]));
    return computeAvailableMaterials(parts, committed, stockFromMissing);
  }, [parts, partsById, inProgress, missing]);

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

  // Promo codes never discount repair kits (Materials) — mirrors the backend.
  const promoBaseSubtotal = builds.reduce(
    (sum, b) =>
      sum +
      PART_TYPES.reduce<number>((partSum, type) => {
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
      map[type] = computePartCraftable(
        selections[type],
        availableMaterials,
        quantities[type]
      );
    });
    return map;
  }, [selections, quantities, availableMaterials]);

  // ── Whole-order availability vs. current material stock ─────────────────────
  // Aggregates every part at its requested quantity across ALL builds, then
  // checks the combined demand against the materials we physically have.
  const orderAvailability = useMemo(() => {
    const requests: { part: ApiSubmarinePart; quantity: number }[] = [];
    builds.forEach((b) => {
      ALL_PART_TYPES.forEach((type) => {
        if (type === 'Materials') return;
        const part = b.selections[type];
        const qty = b.quantities[type];
        if (part && qty > 0) requests.push({ part, quantity: qty });
      });
    });
    return computeOrderAvailability(requests, availableMaterials);
  }, [builds, availableMaterials]);

  const allInFinishedStock =
    orderAvailability.totalUnits > 0 &&
    orderAvailability.readyUnits >= orderAvailability.totalUnits;

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
            <Plus size={14} /> {t('builder.addSet')}
          </button>
        </div>

        {builds.length > 1 && (
          <button
            type="button"
            className="ff-btn-secondary sb-remove-btn"
            onClick={() => handleRemoveBuild(activeBuildId)}
          >
            {t('builder.removeSet')}
          </button>
        )}
      </div>

      <div className="sb-header">
        <div className="sb-header-text">
          <h2 className="sb-header-title">
            <span>✦</span> {t('builder.title')}
          </h2>
          <p className="sb-header-sub">{t('builder.sub')}</p>
        </div>

        {/* Name editor for the active build */}
        <div className="sb-rename-block">
          <label className="sb-rename-label">{t('builder.nameLabel')}</label>
          <input
            type="text"
            className="sb-rename-input"
            value={activeBuild.name}
            onChange={(e) => handleRenameBuild(activeBuildId, e.target.value)}
            placeholder={t('builder.namePlaceholder')}
          />
        </div>
      </div>

      {/* Preset selections */}
      <div className="ff-card-framed sb-presets">
        <div className="sb-presets-title">{t('builder.presetsTitle')}</div>
        <div className="sb-presets-sub">{t('builder.presetsSub')}</div>
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
                title={t(`preset.${preset.name}.desc`, { defaultValue: preset.description })}
              >
                <span className="sb-preset-name">{preset.name}</span>
                <span className="sb-preset-desc">{t(`preset.${preset.name}.tag`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Set multiplier banner */}
      <div className="ff-card-framed sb-multiplier">
        <div className="sb-multiplier-title">{t('builder.multiplierTitle')}</div>
        <div className="sb-multiplier-sub">{t('builder.multiplierSub')}</div>

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
          {!allSameQty && <span className="sb-multiplier-warning">{t('builder.mixedQty')}</span>}
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
                    <h3 className="sb-mrm-title">{t('builder.mrmTitle')}</h3>
                  </div>
                  <span className="sb-mrm-stock">
                    {mrmPart.stock > 0
                      ? t('builder.inStock', { n: formatNumber(mrmPart.stock) })
                      : t('builder.outOfStockNow')}
                  </span>
                </div>
                <div className="sb-mrm-note">
                  <div className="gil-price" style={{ fontSize: '1rem' }}>
                    <span>{formatGil(mrmPart.price).replace(' Gil', '')}</span>
                    <span className="gil-coin">G</span> {t('selector.ea')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span
                      style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}
                    >
                      {t('selector.qty')}
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
          {anySelected && orderAvailability.totalUnits > 0 && (
            <div
              className={`ff-alert sb-craft-banner ${
                orderAvailability.complete ? '' : 'is-warning'
              }`}
            >
              {orderAvailability.complete ? (
                <Check size={18} className="sb-craft-banner-icon" />
              ) : (
                <AlertCircle size={18} className="sb-craft-banner-icon" />
              )}
              <div className="sb-craft-banner-body">
                {allInFinishedStock ? (
                  <>
                    <strong className="sb-craft-banner-title">{t('builder.readyTitle')}</strong>
                    <span className="sb-craft-banner-text">
                      {t('builder.readyText', {
                        count: orderAvailability.totalUnits,
                        n: formatNumber(orderAvailability.totalUnits),
                      })}
                    </span>
                  </>
                ) : orderAvailability.complete ? (
                  <>
                    <strong className="sb-craft-banner-title">{t('builder.availableTitle')}</strong>
                    <span className="sb-craft-banner-text">
                      {t('builder.availableText', {
                        ready: formatNumber(orderAvailability.readyUnits),
                        total: formatNumber(orderAvailability.totalUnits),
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <strong className="sb-craft-banner-title">{t('builder.shortageTitle')}</strong>
                    <span className="sb-craft-banner-text">{t('builder.shortageText')}</span>
                  </>
                )}
                <div className="sb-craft-stats">
                  <span className="sb-craft-stat">
                    <Check size={11} />
                    {t('builder.finishedStockStat', {
                      ready: formatNumber(orderAvailability.readyUnits),
                      total: formatNumber(orderAvailability.totalUnits),
                    })}
                  </span>
                  {orderAvailability.complete && orderAvailability.surplusUnits > 0 && (
                    <span className="sb-craft-stat is-success">
                      <Hammer size={11} />
                      {t('builder.spareStat', { n: formatNumber(orderAvailability.surplusUnits) })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Summary card */}
          <div className="ff-card-framed sb-summary">
            <div className="sb-summary-header">
              <div className="sb-summary-title-row">
                <Anchor />
                <h3 className="sb-summary-title">{t('builder.summary')}</h3>
              </div>
              {builds.length > 1 && (
                <span className="sb-summary-count">{t('builder.configuredSets', { count: builds.length })}</span>
              )}
            </div>

            <div className="sb-summary-grid">
              <div className="sb-components">
                <span className="sb-components-label">{t('builder.selectedComponents')}</span>

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
                              {type === 'Materials' ? t('common.extra') : t(`parts.${type}`)}:
                            </span>
                            <span className="sb-build-row-name">
                              {type === 'Materials'
                                ? t('builder.mrmTitle')
                                : `${part.isModified ? `${t('selector.modified')} ` : ''}${t(
                                    `classes.${part.classKey}`,
                                    { defaultValue: part.className.replace('-class', '') }
                                  )}`}
                            </span>
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
                      <span className="sb-total-row-label">{t('builder.subtotalColon')}</span>
                      <span className="gil-price sb-total-row-value">
                        <span>{formatNumber(overallSubtotal)}</span>
                        <span className="gil-coin sb-coin-xs">G</span>
                      </span>
                    </div>
                    <div className="sb-total-row is-success">
                      <span className="sb-total-row-label is-flex">
                        <Tag size={12} /> {t('builder.bulkDiscountColon', { pct: discountPct })}
                      </span>
                      <span>−{formatNumber(discountAmount)} G</span>
                    </div>
                  </>
                )}

                <div className={`sb-total-final ${activeDiscount ? 'has-discount' : ''}`}>
                  <span className="sb-total-label">{t('builder.totalPriceLabel')}</span>
                  <div className="gil-price sb-total-price">
                    <span>{formatNumber(totalPrice)}</span>
                    <span className="gil-coin sb-coin-xl">G</span>
                  </div>
                  {totalParts > 0 && (
                    <span className="sb-total-parts">
                      {t('builder.partsOrdered', { count: totalParts, n: formatNumber(totalParts) })}
                    </span>
                  )}
                  {hasUnpricedParts && (
                    <span className="sb-total-unpriced">{t('builder.unpricedNote')}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Discount Legend/Guide */}
            {discounts.length > 0 && (
              <div className="sb-discount-guide">
                <div className="sb-discount-guide-head">
                  <div className="sb-discount-guide-title">
                    <Tag size={12} /> {t('builder.guideTitle')}
                  </div>
                  <span className="sb-discount-guide-count">
                    {t('builder.currentCount')} <strong>{formatNumber(totalParts)}</strong>
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
                        <span>{t('builder.nPlusParts', { n: formatNumber(d.threshold) })}</span>
                        <span className="sb-discount-chip-pct">{t('builder.pctOff', { pct: Number(d.discountPercent) })}</span>
                        {isCurrent && <span className="sb-discount-chip-active">{t('builder.activeChip')}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {showSubmitForm ? (
              <OrderSubmitForm
                items={orderItems}
                subtotal={overallSubtotal}
                promoBase={promoBaseSubtotal}
                discountPct={discountPct}
                discountAmt={discountAmount}
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
                    <Send size={16} /> {t('builder.continueOrder')}
                  </button>
                </div>

                <p className="sb-summary-footnote">{t('builder.footnote')}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
