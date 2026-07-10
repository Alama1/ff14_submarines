import { useState, useEffect } from 'react';
import PartSelector from './PartSelector';
import { formatGil, PART_TYPES, ALL_PART_TYPES } from '../SubmarineData';
import { Copy, Check, Info, Anchor, Plus, Minus, Tag } from 'lucide-react';
import { SubmarinePart, PartType, SelectionMap, BulkDiscount } from '../types';

interface SetBuilderProps {
  parts?: SubmarinePart[];
  discounts?: BulkDiscount[];
}

type QuantityMap = Record<PartType, number>;

interface SubmarineBuild {
  id: string;
  name: string;
  selections: SelectionMap;
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

export default function SetBuilder({ parts = [], discounts = [] }: SetBuilderProps) {
  const [builds, setBuilds] = useState<SubmarineBuild[]>([]);
  const [activeBuildId, setActiveBuildId] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const createDefaultBuild = (id: string, name: string): SubmarineBuild => {
    const initialSelections: SelectionMap = { Hull: null, Stern: null, Bow: null, Bridge: null, Materials: null };
    if (parts.length > 0) {
      PART_TYPES.forEach((type: PartType) => {
        const defaultPart = parts.find(
          (p) => p.partType === type && p.classKey === 'shark' && !p.isModified
        );
        initialSelections[type] = defaultPart ?? parts.find((p) => p.partType === type) ?? null;
      });
      initialSelections.Materials = parts.find((p) => p.partType === 'Materials') ?? null;
    }
    return {
      id,
      name,
      selections: initialSelections,
      quantities: {
        Hull: 1,
        Stern: 1,
        Bow: 1,
        Bridge: 1,
        Materials: 0,
      },
      setCount: 1,
    };
  };

  useEffect(() => {
    if (parts.length > 0 && builds.length === 0) {
      const defaultBuild = createDefaultBuild('1', 'Build 1');
      setBuilds([defaultBuild]);
      setActiveBuildId('1');
    }
  }, [parts]);

  const activeBuild = builds.find((b) => b.id === activeBuildId) || createDefaultBuild('temp', 'Temp');
  const selections = activeBuild.selections;
  const quantities = activeBuild.quantities;
  const setCount = activeBuild.setCount;

  const handleAddBuild = () => {
    const nextId = (builds.reduce((max, b) => Math.max(max, parseInt(b.id, 10) || 0), 0) + 1).toString();
    const newBuild = createDefaultBuild(nextId, `Build ${nextId}`);
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
    setBuilds((prev) =>
      prev.map((b) => (b.id === id ? { ...b, name: newName } : b))
    );
  };

  const handleSelect = (type: PartType, part: SubmarinePart | null) => {
    setBuilds((prev) =>
      prev.map((b) =>
        b.id === activeBuildId
          ? { ...b, selections: { ...b.selections, [type]: part } }
          : b
      )
    );
  };

  const handleQuantityChange = (type: PartType, qty: number) => {
    const minQty = 0;
    const safeQty = Math.max(minQty, qty);
    setBuilds((prev) =>
      prev.map((b) => {
        if (b.id === activeBuildId) {
          const newQuantities = { ...b.quantities, [type]: safeQty };
          return {
            ...b,
            quantities: newQuantities,
            setCount: 0,
          };
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
                (p) => p.partType === type && p.classKey === spec.classKey && p.isModified === spec.isModified
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

  const getBuildSubtotal = (build: SubmarineBuild) => {
    return ALL_PART_TYPES.reduce<number>((sum, type) => {
      const part = build.selections[type];
      return sum + (part ? part.price * build.quantities[type] : 0);
    }, 0);
  };

  const getBuildDiscountableSubtotal = (build: SubmarineBuild) => {
    return PART_TYPES.reduce<number>((sum, type) => {
      const part = build.selections[type];
      return sum + (part ? part.price * build.quantities[type] : 0);
    }, 0);
  };

  const overallSubtotal = builds.reduce((sum, b) => sum + getBuildSubtotal(b), 0);
  const discountableSubtotal = builds.reduce((sum, b) => sum + getBuildDiscountableSubtotal(b), 0);

  const totalParts = builds.reduce((sum, b) => {
    return sum + PART_TYPES.reduce((partSum, type) => {
      const part = b.selections[type];
      return partSum + (part ? Number(b.quantities[type]) || 0 : 0);
    }, 0);
  }, 0);

  const getRequiredPartsForDiscount = (d: { threshold: number | string }) => {
    return (Number(d.threshold) || 0) * 4;
  };

  const activeDiscount = discounts
    .filter((d) => totalParts >= getRequiredPartsForDiscount(d))
    .reduce((max, d) => {
      const pct = Number(d.discountPercent) || 0;
      const maxPct = Number(max.discountPercent) || 0;
      return pct > maxPct ? d : max;
    }, { threshold: 0, discountPercent: 0 });

  const discountAmount = Math.round(discountableSubtotal * (Number(activeDiscount.discountPercent) / 100));
  const totalPrice = overallSubtotal - discountAmount;

  const hasOutOfStock = builds.some((b) =>
    ALL_PART_TYPES.some((type) => {
      const part = b.selections[type];
      return part && part.stock < b.quantities[type] && b.quantities[type] > 0;
    })
  );

  const anySelected = builds.some((b) =>
    PART_TYPES.some((type) => b.selections[type] !== null && b.quantities[type] > 0) || b.quantities.Materials > 0
  );

  const generateCopyText = (): string => {
    const activeBuildsWithItems = builds.filter((b) =>
      ALL_PART_TYPES.some((type) => b.selections[type] !== null && b.quantities[type] > 0)
    );
    if (activeBuildsWithItems.length === 0) return '';

    const buildsSections = activeBuildsWithItems.map((build, index) => {
      const lines = ALL_PART_TYPES.map((type) => {
        const part = build.selections[type];
        if (!part) return null;
        const qty = build.quantities[type];
        if (qty === 0) return null;
        const lineTotal = part.price * qty;
        const qtyStr = qty > 1 ? `×${qty}` : '';
        return `${type === 'Materials' ? 'Extra' : type}: ${part.name}${qtyStr ? ` ${qtyStr}` : ''} — ${formatGil(lineTotal)}`;
      })
        .filter((line) => line !== null)
        .join('\n');

      const buildSameQty =
        build.quantities.Hull === build.quantities.Stern &&
        build.quantities.Stern === build.quantities.Bow &&
        build.quantities.Bow === build.quantities.Bridge;
      const setLabel = buildSameQty && build.setCount > 1 ? `\nSets: ×${build.setCount}` : '';

      return `[${build.name || `Build ${index + 1}`}]\n${lines}${setLabel}`;
    }).join('\n\n');

    const thresholdParts = getRequiredPartsForDiscount(activeDiscount);
    const discountLabel = activeDiscount.discountPercent > 0
      ? `\nSubtotal: ${formatGil(overallSubtotal)}\nBulk Discount (${activeDiscount.discountPercent}% for ${thresholdParts}+ parts): -${formatGil(discountAmount)}`
      : '';

    const priceText = activeDiscount.discountPercent > 0 ? formatGil(totalPrice) : formatGil(overallSubtotal);

    return `--- FFXIV Submarine Order Request ---

${buildsSections}

------------------------------------${discountLabel}
Total Price: ${priceText}`;
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
      {/* Build/Set tabs navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
        paddingBottom: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {builds.map((b) => {
            const isActive = b.id === activeBuildId;
            return (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: isActive ? 'linear-gradient(135deg, #1d263b 0%, #151b27 100%)' : 'rgba(18, 24, 36, 0.6)',
                  border: `1px solid ${isActive ? 'var(--color-gold)' : 'var(--color-gold-dark)'}`,
                  borderRadius: '4px',
                  boxShadow: isActive ? '0 0 10px var(--color-gold-glow)' : 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  height: '38px',
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '2px',
                    background: 'var(--color-gold)',
                  }} />
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

      <div className="builder-header" style={{ marginBottom: '1.5rem', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ flex: '1', minWidth: '280px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✦</span> Submarine Set Builder
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Choose components and set quantities per part, or use the set multiplier to order multiple identical builds at once.
          </p>
        </div>

        {/* Name editor for the active build */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '200px' }}>
          <label style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gold-light)' }}>
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
            Quick Set Presets (Active Set Only)
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
            value={allSameQty && setCount > 0 ? setCount : (setCount === 0 ? 0 : '')}
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
              />
            ))}
          </div>

          {/* Magitek Repair Materials Selector */}
          {(() => {
            const mrmPart = parts.find((p) => p.partType === 'Materials');
            if (!mrmPart) return null;
            return (
              <div className="ff-card-framed" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <span style={{ color: 'var(--color-gold)' }}>✦</span>
                     <h3 style={{ fontSize: '1.15rem', color: 'var(--color-text-title)', margin: 0 }}>Magitek Repair Materials</h3>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: '1.1rem', fontStyle: 'italic' }}>
                    * Bulk discount does not apply to materials
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="gil-price" style={{ fontSize: '1rem' }}>
                    <span>{formatGil(mrmPart.price).replace(' Gil', '')}</span><span className="gil-coin">G</span> ea.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Qty:</span>
                    <button type="button" className="ff-btn-secondary" style={{ padding: '0.15rem 0.4rem', height: '26px' }} onClick={() => handleQuantityChange('Materials', Math.max(0, quantities.Materials - 1))}><Minus size={10} /></button>
                    <input type="number" min="0" value={quantities.Materials} onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 0) handleQuantityChange('Materials', n); }} style={{ width: '90px', textAlign: 'center', background: 'var(--bg-input)', border: '1px solid rgba(197,160,89,0.2)', borderRadius: '4px', color: 'var(--color-text-title)', padding: '0.15rem', height: '26px', boxSizing: 'border-box' }} />
                    <button type="button" className="ff-btn-secondary" style={{ padding: '0.15rem 0.4rem', height: '26px' }} onClick={() => handleQuantityChange('Materials', quantities.Materials + 1)}><Plus size={10} /></button>
                  </div>
                </div>
              </div>
            );
          })()}

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
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
              paddingBottom: '0.75rem',
            }}>
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
                <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05rem', color: 'var(--color-gold-light)' }}>
                  Selected Components
                </span>

                {builds.map((build, index) => {
                  const buildSelections = build.selections;
                  const buildQuantities = build.quantities;
                  const hasParts = ALL_PART_TYPES.some(type => buildSelections[type] !== null && buildQuantities[type] > 0);
                  if (!hasParts) return null;
                  
                  return (
                    <div key={build.id} style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-gold)', borderBottom: '1px solid rgba(197, 160, 89, 0.1)', paddingBottom: '0.2rem' }}>
                        {build.name || `Build ${index + 1}`}
                      </div>
                      {ALL_PART_TYPES.map((type: PartType) => {
                        const part = buildSelections[type];
                        const qty = buildQuantities[type];
                        if (!part || qty === 0) return null;
                        
                        return (
                          <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{type === 'Materials' ? 'Extra' : type}:</span>
                            <span style={{ fontWeight: '500', color: 'var(--color-text-title)', textAlign: 'right', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {part.className}
                            </span>
                            <span style={{
                              fontSize: '0.68rem',
                              background: 'rgba(197,160,89,0.12)',
                              color: 'var(--color-gold)',
                              borderRadius: '3px',
                              padding: '0.05rem 0.25rem',
                              fontWeight: '700',
                              flexShrink: 0,
                            }}>
                              ×{qty}
                            </span>
                          </div>
                        );
                      })}
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
                gap: '0.5rem',
              }}>
                {activeDiscount.discountPercent > 0 ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Subtotal:</span>
                      <span className="gil-price" style={{ fontSize: '0.92rem' }}>
                        <span>{new Intl.NumberFormat('en-US').format(overallSubtotal)}</span>
                        <span className="gil-coin" style={{ width: '13px', height: '13px', fontSize: '8px' }}>G</span>
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--color-success)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Tag size={12} /> Bulk Discount ({activeDiscount.discountPercent}%):
                      </span>
                      <span>-{new Intl.NumberFormat('en-US').format(discountAmount)} G</span>
                    </div>
                  </>
                ) : null}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', marginTop: activeDiscount.discountPercent > 0 ? '0.4rem' : '0' }}>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                    Total Price
                  </span>
                  <div className="gil-price" style={{ fontSize: '1.8rem', textShadow: '0 0 10px rgba(197,160,89,0.2)' }}>
                    <span>{new Intl.NumberFormat('en-US').format(totalPrice)}</span>
                    <span className="gil-coin" style={{ width: '22px', height: '22px', fontSize: '12px' }}>G</span>
                  </div>
                  {totalParts > 0 && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      {totalParts} part{totalParts > 1 ? 's' : ''} ordered
                    </span>
                  )}
                </div>
              </div>

            </div>

            {/* Discount Legend/Guide */}
            {discounts.length > 0 && (
              <div style={{
                background: 'rgba(197, 160, 89, 0.02)',
                border: '1px solid rgba(197, 160, 89, 0.1)',
                borderRadius: '4px',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <div style={{
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
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Tag size={12} /> Bulk Discount Guide
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 'normal' }}>
                    Current Parts Count: <strong style={{ color: 'var(--color-gold)', fontSize: '0.8rem' }}>{totalParts}</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.72rem' }}>
                  {discounts.map((d) => {
                    const requiredParts = getRequiredPartsForDiscount(d);
                    const isCurrent = Number(activeDiscount.threshold) === Number(d.threshold);
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
                        <span>{requiredParts}+ Parts:</span>
                        <span style={{ color: isCurrent ? 'var(--color-success)' : 'var(--color-text-title)' }}>{d.discountPercent}% Off</span>
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
