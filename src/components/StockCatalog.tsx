import { useState, useMemo } from 'react';
import { formatGil, PART_TYPES, CLASSES } from '../SubmarineData';
import { Search, ShieldAlert, CheckCircle, HelpCircle } from 'lucide-react';
import { SubmarinePart } from '../types';

interface StockCatalogProps {
  parts?: SubmarinePart[];
}

export default function StockCatalog({ parts = [] }: StockCatalogProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  const [selectedVersion, setSelectedVersion] = useState<string>('All');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);

  const filteredParts = useMemo<SubmarinePart[]>(() => {
    return parts.filter((part) => {
      const matchesSearch =
        part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.partType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedType === 'All' || part.partType === selectedType;
      const matchesClass = selectedClass === 'All' || part.classKey === selectedClass;
      const matchesVersion =
        selectedVersion === 'All' ||
        (selectedVersion === 'Modified' && part.isModified) ||
        (selectedVersion === 'Normal' && !part.isModified);
      const matchesStock = !onlyInStock || part.stock > 0;

      return matchesSearch && matchesType && matchesClass && matchesVersion && matchesStock;
    });
  }, [parts, searchTerm, selectedType, selectedClass, selectedVersion, onlyInStock]);

  return (
    <div className="stock-catalog fade-in">
      <div className="catalog-header" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>✦</span> Submarine Parts Depot
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Browse current stock levels and standard prices for individual components.
        </p>
      </div>

      <div className="ff-card-framed" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'end' }}>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Search size={12} /> Search
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Syldra, Bow..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Component</label>
            <select
              className="form-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="All">All Components</option>
              {PART_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Design Class</label>
            <select
              className="form-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="All">All Classes</option>
              {CLASSES.map((cls) => (
                <option key={cls.key} value={cls.key}>{cls.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Class Variant</label>
            <select
              className="form-select"
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
            >
              <option value="All">All Variants</option>
              <option value="Normal">Normal Only</option>
              <option value="Modified">Modified Only</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', height: '42px' }}>
            <label className="toggle-container">
              <input
                type="checkbox"
                style={{ display: 'none' }}
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
              />
              <div className="toggle-switch"></div>
              <span style={{ fontSize: '0.85rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                In Stock Only
              </span>
            </label>
          </div>

        </div>
      </div>

      {filteredParts.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1.25rem',
        }}>
          {filteredParts.map((part) => {
            const inStock = part.stock > 0;

            return (
              <div
                key={part.id}
                className="ff-card fade-in"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '160px',
                  borderLeft: `4px solid ${part.isModified ? 'var(--color-gold)' : '#334155'}`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {part.partType}
                    </span>
                    {part.isModified ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Modified</span>
                    ) : (
                      <span className="badge" style={{ fontSize: '0.65rem', background: '#334155', color: '#cbd5e1' }}>Standard</span>
                    )}
                  </div>

                  <h3 style={{
                    fontSize: '1.05rem',
                    textAlign: 'left',
                    lineHeight: '1.3',
                    marginBottom: '0.75rem',
                    color: part.isModified ? 'var(--color-gold-light)' : 'var(--color-text-title)',
                  }}>
                    {part.className} {part.partType}
                  </h3>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                  <div className="gil-price" style={{ fontSize: '1.1rem' }}>
                    <span>{formatGil(part.price).replace(' Gil', '')}</span>
                    <span className="gil-coin">G</span>
                  </div>

                  <div>
                    {inStock ? (
                      <span className="badge badge-success" style={{ gap: '0.2rem' }}>
                        <CheckCircle size={10} /> In Stock ({part.stock})
                      </span>
                    ) : (
                      <span className="badge badge-warning" style={{ gap: '0.2rem', opacity: 0.8 }}>
                        <HelpCircle size={10} /> Craft to Order
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ff-card-framed" style={{ padding: '3rem', textAlign: 'center' }}>
          <ShieldAlert size={48} style={{ color: 'var(--color-gold)', margin: '0 auto 1rem', opacity: 0.6 }} />
          <h3 style={{ marginBottom: '0.5rem' }}>No Submarine Parts Found</h3>
          <p style={{ color: 'var(--color-text-muted)' }}>Try adjusting your search query or filter options.</p>
        </div>
      )}
    </div>
  );
}
