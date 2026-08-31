import { useState, useEffect } from 'react';
import { useCatalog } from './hooks/useCatalog';
import ForCrafters from './components/ForCrafters';
import SetBuilder from './components/SetBuilder';
import OrdersPanel from './components/OrdersPanel';
import { Anchor, Hammer, RefreshCw, Wrench, Ship } from 'lucide-react';
import './App.css';

type TabId = 'builder' | 'orders' | 'crafters';

const VALID_TABS: TabId[] = ['builder', 'orders', 'crafters'];

function getTabFromHash(): TabId {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (!hash) return 'builder';
  return VALID_TABS.includes(hash as TabId) ? (hash as TabId) : 'builder';
}

function App() {
  const catalog = useCatalog();
  const [activeTab, setActiveTabState] = useState<TabId>(getTabFromHash);
  const [orderLookupCode, setOrderLookupCode] = useState<string>('');

  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    if (tab === 'builder') {
      // Clean URL — remove the hash entirely for the default tab
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      window.location.hash = tab;
    }
  };

  /** Switches to the Orders tab and pre-fills the tracking code. */
  const handleTrackOrder = (code: string) => {
    setOrderLookupCode(code);
    setActiveTab('orders');
  };

  useEffect(() => {
    // Sync tab when the user navigates with browser back / forward
    const onHashChange = () => setActiveTabState(getTabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Anchor
              size={36}
              style={{ color: 'var(--color-gold)', filter: 'drop-shadow(0 0 8px var(--color-gold-glow))' }}
            />
            <h1 className="app-title">Alamai Submarines</h1>
          </div>
          <span className="app-subtitle">Best Submarine parts in Eorzea</span>
        </div>
      </header>

      <nav className="tab-navigation">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          <Hammer size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
          Set Builder
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Ship size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
          Orders
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'crafters' ? 'active' : ''}`}
          onClick={() => setActiveTab('crafters')}
        >
          <Wrench size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
          For crafters
        </button>
      </nav>

      <main style={{ flex: 1, marginBottom: '3rem' }}>
        {catalog.loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              gap: '1rem',
            }}
          >
            <RefreshCw size={36} className="spin" style={{ color: 'var(--color-gold)' }} />
            <p
              style={{
                fontStyle: 'italic',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-title)',
                letterSpacing: '0.05em',
              }}
            >
              Loading Eorzean Stock Records...
            </p>
          </div>
        ) : catalog.error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              gap: '1rem',
            }}
          >
            <p
              style={{
                color: 'var(--color-error)',
                fontFamily: 'var(--font-title)',
                letterSpacing: '0.05em',
                fontSize: '1.05rem',
              }}
            >
              ⚓ Failed to reach the harbor
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', maxWidth: '440px', textAlign: 'center' }}>
              {catalog.error}
            </p>
            <button type="button" className="ff-btn" onClick={catalog.refresh}>
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'builder' && (
              <SetBuilder catalog={catalog} onTrackOrder={handleTrackOrder} />
            )}
            {activeTab === 'orders' && (
              <OrdersPanel
                key={orderLookupCode}
                catalog={catalog}
                initialCode={orderLookupCode}
              />
            )}
            {activeTab === 'crafters' && <ForCrafters />}
          </>
        )}
      </main>

      <footer
        style={{
          textAlign: 'center',
          paddingTop: '2rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          color: 'var(--color-text-muted)',
          fontSize: '0.75rem',
        }}
      >
        <p style={{ marginBottom: '0.5rem' }}>
          Alamai Submarines — Best Submarine parts in Eorzea. Created with dedication to details.
        </p>
        <p style={{ opacity: 0.6 }}>
          FINAL FANTASY XIV © 2010 - 2026 SQUARE ENIX CO., LTD. All Rights Reserved. We are not
          affiliated with Square Enix.
        </p>
      </footer>
    </div>
  );
}

export default App;
