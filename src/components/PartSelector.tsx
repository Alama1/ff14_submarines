import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatGil, formatNumber } from '../utils/format';
import { Hammer, Plus, Minus } from 'lucide-react';
import { ApiSubmarinePart, PartType } from '../api/types';
import { CraftabilityResult } from '../utils/stockCalc';
import './PartSelector.css';

const CLASS_ORDER = ['shark', 'unkiu', 'whale', 'coelacanth', 'syldra', 'magitek'];

interface PartSelectorProps {
  partType: PartType;
  parts: ApiSubmarinePart[];
  selectedPart: ApiSubmarinePart | null;
  onSelectPart: (part: ApiSubmarinePart | null) => void;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  craftability: CraftabilityResult;
}

export default function PartSelector({
  partType,
  parts = [],
  selectedPart,
  onSelectPart,
  quantity,
  onQuantityChange,
  craftability,
}: PartSelectorProps) {
  const { t } = useTranslation();
  const currentClassKey = selectedPart ? selectedPart.classKey : '';
  const currentIsModified = selectedPart ? selectedPart.isModified : false;

  // Classes available for this part type, derived from the live catalog
  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    parts
      .filter((p) => p.partType === partType)
      .forEach((p) => {
        if (!seen.has(p.classKey)) seen.set(p.classKey, p.className);
      });
    return [...seen.entries()]
      .sort((a, b) => {
        const ia = CLASS_ORDER.indexOf(a[0]);
        const ib = CLASS_ORDER.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([key, name]) => ({ key, name }));
  }, [parts, partType]);

  const handleClassChange = (classKey: string) => {
    const isMod = selectedPart ? currentIsModified : false;
    const matchingPart =
      parts.find(
        (p) => p.partType === partType && p.classKey === classKey && p.isModified === isMod
      ) ??
      parts.find((p) => p.partType === partType && p.classKey === classKey && !p.isModified) ??
      parts.find((p) => p.partType === partType && p.classKey === classKey);
    if (matchingPart) onSelectPart(matchingPart);
  };

  const handleModifiedToggle = (checked: boolean) => {
    if (!selectedPart) return;
    const matchingPart = parts.find(
      (p) => p.partType === partType && p.classKey === currentClassKey && p.isModified === checked
    );
    if (matchingPart) onSelectPart(matchingPart);
  };

  const handleQtyInput = (val: string) => {
    if (val === '') {
      onQuantityChange(0);
      return;
    }
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) onQuantityChange(n);
  };

  const physicalStock = selectedPart ? selectedPart.stock : 0;
  const linePrice = selectedPart ? selectedPart.price * quantity : 0;
  const craftable = craftability.craftable;
  const totalAvailable = physicalStock + craftable;
  const canCraftRest =
    craftability.hasRecipe && craftable >= quantity - physicalStock && quantity > physicalStock;
  const partiallyAvailable =
    quantity > physicalStock &&
    totalAvailable > 0 &&
    totalAvailable < quantity;
  const shortageTooltip = craftability.bottlenecks.length
    ? t('selector.shortageTip')
    : undefined;

  return (
    <div className="ff-card-framed fade-in ps-card">
      <div className="ps-header">
        <h3 className="ps-header-title">
          <span className="ps-header-star">✦</span> {t(`parts.${partType}`)}
        </h3>

        <div className="ps-header-actions">
          {selectedPart && (
            <button type="button" className="ps-omit-btn" onClick={() => onSelectPart(null)}>
              {t('selector.omit')}
            </button>
          )}

          <label
            className={`toggle-container ps-modified-toggle ${!selectedPart ? 'is-disabled' : ''}`}
          >
            <input
              type="checkbox"
              className="ps-hidden-checkbox"
              checked={currentIsModified}
              onChange={(e) => handleModifiedToggle(e.target.checked)}
              disabled={!selectedPart}
            />
            <div className="toggle-switch"></div>
            <span className="ps-modified-label">{t('selector.modified')}</span>
          </label>
        </div>
      </div>

      <div className="ps-class-grid">
        {classes.map((cls) => {
          const isSelected = cls.key === currentClassKey;
          return (
            <button
              key={cls.key}
              type="button"
              className={`${isSelected ? 'ff-btn' : 'ff-btn-secondary'} ps-class-btn ${
                isSelected ? 'is-selected' : ''
              }`}
              onClick={() => handleClassChange(cls.key)}
            >
              {t(`classes.${cls.key}`, { defaultValue: cls.name.replace('-class', '') })}
            </button>
          );
        })}
      </div>

      {selectedPart ? (
        <>
          <div className="ps-price-bar">
            <div className="gil-price ps-price-row">
              <span>{formatGil(selectedPart.price).replace(' Gil', '')}</span>
              <span className="gil-coin">G</span>
              {quantity > 1 && <span className="ps-price-ea">{t('selector.ea')}</span>}
            </div>
            <div className="ps-badges">
              {physicalStock > 0 && (
                <span className="badge badge-success ps-badge">
                  {t('selector.ready', { count: physicalStock })}
                </span>
              )}
              {canCraftRest && (
                <span
                  className="badge ps-badge ps-badge-craft"
                  title={t('selector.craftTip', { count: formatNumber(craftable) })}
                >
                  <Hammer size={8} />
                  {t('selector.craftable')}
                </span>
              )}
              {partiallyAvailable && (
                <span
                  className="badge ps-badge ps-badge-partial"
                  title={shortageTooltip ?? undefined}
                >
                  <Hammer size={8} />
                  {t('selector.readyNow', {
                    ready: formatNumber(totalAvailable),
                    wanted: formatNumber(quantity),
                  })}
                </span>
              )}
              {totalAvailable === 0 && (
                <span className="badge badge-warning ps-badge ps-badge-out">{t('selector.outOfStock')}</span>
              )}
            </div>
          </div>

          <div className="ps-qty-panel">
            <div className="ps-qty-row">
              <span className="ps-qty-label">{t('selector.qty')}</span>
              <button
                type="button"
                className="ff-btn-secondary ps-qty-btn"
                onClick={() => onQuantityChange(Math.max(0, quantity - 1))}
              >
                <Minus size={10} />
              </button>
              <input
                type="number"
                className="ps-qty-input"
                min="0"
                value={quantity}
                onChange={(e) => handleQtyInput(e.target.value)}
              />
              <button
                type="button"
                className="ff-btn-secondary ps-qty-btn"
                onClick={() => onQuantityChange(quantity + 1)}
              >
                <Plus size={10} />
              </button>
            </div>

            {quantity > 1 && (
              <div className="ps-subtotal-row">
                <span className="ps-subtotal-label">{t('selector.subtotal')}</span>
                <div className="gil-price">
                  <span className="ps-subtotal-amount">{formatNumber(linePrice)}</span>
                  <span className="gil-coin ps-subtotal-coin">G</span>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="ps-empty">{t('selector.empty')}</div>
      )}
    </div>
  );
}
