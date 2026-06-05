import { formatGil, CLASSES } from '../SubmarineData';
import { Check, Hammer, Plus, Minus } from 'lucide-react';
import { SubmarinePart } from '../types';

interface PartSelectorProps {
  partType: string;
  parts?: SubmarinePart[];
  selectedPart: SubmarinePart | null;
  onSelectPart: (part: SubmarinePart | null) => void;
  quantity: number;
  onQuantityChange: (qty: number) => void;
}

export default function PartSelector({
  partType,
  parts = [],
  selectedPart,
  onSelectPart,
  quantity,
  onQuantityChange,
}: PartSelectorProps) {
  const currentClassKey = selectedPart ? selectedPart.classKey : '';
  const currentIsModified = selectedPart ? selectedPart.isModified : false;

  const handleClassChange = (classKey: string) => {
    // If no part was selected, default isModified to false
    const isMod = selectedPart ? currentIsModified : false;
    const matchingPart = parts.find(
      (p) => p.partType === partType && p.classKey === classKey && p.isModified === isMod
    );
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
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) onQuantityChange(n);
  };

  const inStock = selectedPart && selectedPart.stock > 0;
  const linePrice = selectedPart ? selectedPart.price * quantity : 0;

  return (
    <div className="ff-card-framed fade-in" style={{ padding: '1.25rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
        paddingBottom: '0.75rem',
      }}>
        <h3 style={{ fontSize: '1.15rem', color: 'var(--color-text-title)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--color-gold)' }}>✦</span> {partType}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {selectedPart && (
            <button
              type="button"
              onClick={() => onSelectPart(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '0 0.25rem',
                outline: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-muted)'}
            >
              Omit
            </button>
          )}

          <label className="toggle-container" style={{ opacity: selectedPart ? 1 : 0.5, cursor: selectedPart ? 'pointer' : 'not-allowed' }}>
            <input
              type="checkbox"
              style={{ display: 'none' }}
              checked={currentIsModified}
              onChange={(e) => handleModifiedToggle(e.target.checked)}
              disabled={!selectedPart}
            />
            <div className="toggle-switch"></div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: currentIsModified ? 'var(--color-gold)' : 'var(--color-text-muted)',
            }}>
              Modified
            </span>
          </label>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.4rem',
        marginBottom: '1rem',
      }}>
        {CLASSES.map((cls) => {
          const isSelected = cls.key === currentClassKey;
          return (
            <button
              key={cls.key}
              type="button"
              className={isSelected ? 'ff-btn' : 'ff-btn-secondary'}
              style={{
                flex: '1 1 calc(33.33% - 0.4rem)',
                minWidth: '70px',
                padding: '0.4rem 0.2rem',
                fontSize: '0.72rem',
                fontWeight: isSelected ? '700' : '500',
                borderRadius: '4px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isSelected ? '0 0 10px var(--color-gold-glow)' : 'none',
              }}
              onClick={() => handleClassChange(cls.key)}
            >
              {cls.name.replace('-class', '')}
            </button>
          );
        })}
      </div>

      {selectedPart ? (
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-input)',
            padding: '0.6rem 0.8rem',
            borderRadius: '4px 4px 0 0',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderBottom: 'none',
          }}>
            <div className="gil-price" style={{ fontSize: '1rem' }}>
              <span>{formatGil(selectedPart.price).replace(' Gil', '')}</span>
              <span className="gil-coin">G</span>
              {quantity > 1 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>
                  ea.
                </span>
              )}
            </div>
            <div>
              {inStock ? (
                <span className="badge badge-success" style={{ gap: '0.2rem', padding: '0.15rem 0.45rem', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                  <Check size={8} /> In Stock ({selectedPart.stock})
                </span>
              ) : (
                <span className="badge badge-warning" style={{ gap: '0.2rem', padding: '0.15rem 0.45rem', fontSize: '0.65rem', opacity: 0.9, whiteSpace: 'nowrap' }}>
                  <Hammer size={8} /> Order Only
                </span>
              )}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(197, 160, 89, 0.04)',
            padding: '0.5rem 0.8rem',
            borderRadius: '0 0 4px 4px',
            border: '1px solid rgba(197, 160, 89, 0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Qty:</span>
              <button
                type="button"
                className="ff-btn-secondary"
                style={{ padding: '0.15rem 0.4rem', height: '26px', fontSize: '0.75rem' }}
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              >
                <Minus size={10} />
              </button>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => handleQtyInput(e.target.value)}
                style={{
                  width: '44px',
                  textAlign: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid rgba(197,160,89,0.2)',
                  borderRadius: '4px',
                  color: 'var(--color-text-title)',
                  fontSize: '0.85rem',
                  padding: '0.15rem',
                  height: '26px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                className="ff-btn-secondary"
                style={{ padding: '0.15rem 0.4rem', height: '26px', fontSize: '0.75rem' }}
                onClick={() => onQuantityChange(quantity + 1)}
              >
                <Plus size={10} />
              </button>
            </div>

            {quantity > 1 && (
              <div className="gil-price" style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-gold-light)' }}>{new Intl.NumberFormat('en-US').format(linePrice)}</span>
                <span className="gil-coin" style={{ width: '14px', height: '14px', fontSize: '8px' }}>G</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed rgba(197, 160, 89, 0.2)',
          borderRadius: '4px',
          padding: '1.5rem',
          color: 'var(--color-text-muted)',
          fontSize: '0.82rem',
          textAlign: 'center',
          height: '76px',
          boxSizing: 'border-box',
        }}>
          Part omitted (select a class above to include)
        </div>
      )}
    </div>
  );
}
