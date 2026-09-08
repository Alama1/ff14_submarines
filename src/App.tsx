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
          <div className="app-brand-row">
            <Anchor size={36} className="app-brand-icon" />
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
          <Hammer size={14} className="tab-btn-icon" />
          Set Builder
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Ship size={14} className="tab-btn-icon" />
          Orders
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'crafters' ? 'active' : ''}`}
          onClick={() => setActiveTab('crafters')}
        >
          <Wrench size={14} className="tab-btn-icon" />
          For crafters
        </button>
      </nav>

      <main className="app-main">
        {catalog.loading ? (
          <div className="app-loading">
            <RefreshCw size={36} className="spin app-loading-icon" />
            <p className="app-loading-text">Loading Eorzean Stock Records...</p>
          </div>
        ) : catalog.error ? (
          <div className="app-error">
            <p className="app-error-title">⚓ Failed to reach the harbor</p>
            <p className="app-error-detail">{catalog.error}</p>
            <button
              type="button"
              className="ff-btn"
              onClick={() => {
                catalog.refresh();
              }}
            >
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

      <footer className="app-footer">
        <p className="app-footer-tagline">
          Alamai Submarines — Best Submarine parts in Eorzea. Created with dedication to details.
        </p>
        <p className="app-footer-legal">
          FINAL FANTASY XIV © 2010 - 2026 SQUARE ENIX CO., LTD. All Rights Reserved. We are not
          affiliated with Square Enix.
        </p>
      </footer>
    </div>
  );
}

export default App;
