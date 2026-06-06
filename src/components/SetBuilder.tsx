import { useState, useEffect } from 'react';
import PartSelector from './PartSelector';
import { formatGil, PART_TYPES } from '../SubmarineData';
import { Copy, Check, Info, Anchor, Plus, Minus } from 'lucide-react';
import { SubmarinePart, PartType, SelectionMap } from '../types';

interface SetBuilderProps {
  parts?: SubmarinePart[];
}

type QuantityMap = Record<PartType, number>;

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
    },
  },
];

export default function SetBuilder({ parts = [] }: SetBuilderProps) {
  const [selections, setSelections] = useState<SelectionMap>({
    Hull: null,
    Stern: null,
    Bow: null,
    Bridge: null,
  });

  const [quantities, setQuantities] = useState<QuantityMap>({
    Hull: 1,
    Stern: 1,
    Bow: 1,
    Bridge: 1,
  });

  const [setCount, setSetCount] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (parts.length > 0) {
      const initialSelections: SelectionMap = { Hull: null, Stern: null, Bow: null, Bridge: null };
      PART_TYPES.forEach((type: PartType) => {
        const defaultPart = parts.find(
          (p) => p.partType === type && p.classKey === 'shark' && !p.isModified
        );
        initialSelections[type] = defaultPart ?? parts.find((p) => p.partType === type) ?? null;
      });
      setSelections(initialSelections);
    }
  }, [parts]);

  const handleSelect = (type: PartType, part: SubmarinePart | null) => {
    setSelections((prev) => ({ ...prev, [type]: part }));
  };

  const handleQuantityChange = (type: PartType, qty: number) => {
    const safeQty = Math.max(1, qty);
    setQuantities((prev) => ({ ...prev, [type]: safeQty }));
    setSetCount(0);
  };

  const handleSetCountChange = (count: number) => {
    const safeCount = Math.max(1, count);
    setSetCount(safeCount);
    setQuantities({ Hull: safeCount, Stern: safeCount, Bow: safeCount, Bridge: safeCount });
  };

  const handleSetCountInput = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) handleSetCountChange(n);
  };

  const applyPreset = (preset: PresetDefinition) => {
    const newSelections: SelectionMap = { Hull: null, Stern: null, Bow: null, Bridge: null };
    PART_TYPES.forEach((type) => {
      const spec = preset.parts[type];
      if (spec) {
        const match = parts.find(
          (p) => p.partType === type && p.classKey === spec.classKey && p.isModified === spec.isModified
        );
        newSelections[type] = match ?? null;
      } else {
        newSelections[type] = null;
      }
    });
    setSelections(newSelections);
  };

  const getActivePreset = (): string | null => {
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
  };

  const activePreset = getActivePreset();

  const allSameQty =
    quantities.Hull === quantities.Stern &&
    quantities.Stern === quantities.Bow &&
    quantities.Bow === quantities.Bridge;

  const totalPrice = PART_TYPES.reduce<number>((sum, type) => {
    const part = selections[type];
    return sum + (part ? part.price * quantities[type] : 0);
  }, 0);

  const hasOutOfStock = PART_TYPES.some((type) => {
    const part = selections[type];
    return part && part.stock === 0;
  });

  const anySelected = PART_TYPES.some((type) => selections[type] !== null);

  const generateCopyText = (): string => {
    if (!anySelected) return '';

    const lines = PART_TYPES.map((type) => {
      const part = selections[type];
      if (!part) return null;
      const qty = quantities[type];
      const lineTotal = part.price * qty;
      const qtyStr = qty > 1 ? `×${qty}` : '';
      return `${type}: ${part.name}${qtyStr ? ` ${qtyStr}` : ''} — ${formatGil(lineTotal)}`;
    })
      .filter((line) => line !== null)
      .join('\n');

    const setLabel = allSameQty && setCount > 1 ? `\nSets: ×${setCount}` : '';

    return `--- FFXIV Submarine Order Request ---
${lines}${setLabel}
------------------------------------
Total Price: ${formatGil(totalPrice)}`;
  };

  const handleCopy = () => {
    const text = generateCopyText();
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="set-builder fade-in">
      <div className="builder-header" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>✦</span> Submarine Set Builder
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Choose components and set quantities per part, or use the set multiplier to order multiple identical builds at once.
        </p>
      </div>

      {/* Preset selections */}
      <div className="ff-card-framed" style={{
        marginBottom: '1.5rem',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        background: 'linear-gradient(135deg, rgba(197,160,89,0.03) 0%, rgba(21,31,51,0.1) 100%)',
        borderLeft: '3px solid var(--color-gold)',
      }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-gold-light)', marginBottom: '0.2rem' }}>
            Quick Set Presets
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Select a common configuration to instantly pre-fill components
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
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
                <span style={{ 
                  fontSize: '0.65rem', 
                  color: isActive ? 'rgba(18, 24, 36, 0.8)' : 'var(--color-text-muted)', 
                  fontWeight: 'normal',
                  textTransform: 'none',
                  letterSpacing: 'normal'
                }}>
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
      <div className="ff-card-framed" style={{
        marginBottom: '1.5rem',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        background: 'linear-gradient(135deg, rgba(197,160,89,0.05) 0%, rgba(21,31,51,0.3) 100%)',
        borderLeft: '3px solid var(--color-gold)',
      }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-gold-light)', marginBottom: '0.2rem' }}>
            Number of Sets
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Sets the same quantity for all 4 parts at once
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="ff-btn-secondary"
            style={{ padding: '0.3rem 0.6rem', height: '34px' }}
            onClick={() => handleSetCountChange(Math.max(1, (allSameQty ? quantities.Hull : 1) - 1))}
          >
            <Minus size={12} />
          </button>
          <input
            type="number"
            min="1"
            value={allSameQty && setCount > 0 ? setCount : ''}
            placeholder="—"
            onChange={(e) => handleSetCountInput(e.target.value)}
            style={{
              width: '56px',
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {PART_TYPES.map((type: PartType) => (
              <PartSelector
                key={type}
                partType={type}
                parts={parts}
                selectedPart={selections[type]}
                onSelectPart={(part) => handleSelect(type, part)}
                quantity={quantities[type]}
                onQuantityChange={(qty) => handleQuantityChange(type, qty)}
              />
            ))}
          </div>

          {/* Summary card */}
          <div className="ff-card-framed" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(21, 31, 51, 0.4) 100%)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
              paddingBottom: '0.75rem',
            }}>
              <Anchor style={{ color: 'var(--color-gold)' }} />
              <h3 style={{ fontSize: '1.2rem', color: 'var(--color-text-title)' }}>Order Summary</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', textAlign: 'left' }}>
                <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05rem', color: 'var(--color-gold-light)' }}>
                  Selected Components
                </span>

                {PART_TYPES.map((type: PartType) => {
                  const part = selections[type];
                  const qty = quantities[type];
                  return (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{type}:</span>
                      <span style={{ fontWeight: '500', color: 'var(--color-text-title)', textAlign: 'right', flex: 1 }}>
                        {part ? part.className : 'None'}
                      </span>
                      {part && (
                        <span style={{
                          fontSize: '0.72rem',
                          background: 'rgba(197,160,89,0.12)',
                          color: 'var(--color-gold)',
                          borderRadius: '3px',
                          padding: '0.1rem 0.35rem',
                          fontWeight: '700',
                          flexShrink: 0,
                        }}>
                          ×{qty}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{
                background: 'var(--bg-input)',
                padding: '1.25rem',
                borderRadius: '6px',
                border: '1px solid rgba(197, 160, 89, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                  Total Price
                </span>
                <div className="gil-price" style={{ fontSize: '1.8rem', textShadow: '0 0 10px rgba(197,160,89,0.2)' }}>
                  <span>{new Intl.NumberFormat('en-US').format(totalPrice)}</span>
                  <span className="gil-coin" style={{ width: '22px', height: '22px', fontSize: '12px' }}>G</span>
                </div>
                {allSameQty && quantities.Hull > 1 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                    {quantities.Hull} full set{quantities.Hull > 1 ? 's' : ''}
                  </span>
                )}
              </div>

            </div>

            {hasOutOfStock && (
              <div className="ff-alert ff-alert-warning" style={{ textAlign: 'left', margin: 0 }}>
                <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Includes Custom-Crafted Parts</strong>
                  <span style={{ fontSize: '0.8rem' }}>
                    One or more selected parts are currently out of stock. These will be custom-crafted for you. Delivery may take 1-7 days depending on material availability and current load.
                  </span>
                </div>
              </div>
            )}

            {!hasOutOfStock && anySelected && (
              <div className="ff-alert ff-alert-info" style={{ textAlign: 'left', margin: 0, background: 'rgba(16, 185, 129, 0.05)', color: 'var(--color-success)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                <Check size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.15rem' }}>All Selected Components In Stock</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-main)' }}>
                    Excellent selection! All selected parts are currently in inventory. Ready for immediate delivery.
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="ff-btn glow-active"
                style={{ flex: 1, minWidth: '200px' }}
                onClick={handleCopy}
                disabled={!anySelected}
              >
                {copied ? (
                  <><Check size={16} /> Order Copied!</>
                ) : (
                  <><Copy size={16} /> Copy Order Request</>
                )}
              </button>
            </div>

            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center', marginTop: '-0.5rem' }}>
              Copy this order request and paste it directly to @Alamai via Discord.
            </p>

          </div>

        </div>
      </div>
    </div>
  );
}
