import { useState, useEffect } from 'react';
import { useCatalog } from './hooks/useCatalog';
import ForCrafters from './components/ForCrafters';
import SetBuilder from './components/SetBuilder';
import OrdersPanel from './components/OrdersPanel';
import About from './components/About';
import { Anchor, Hammer, RefreshCw, Wrench, Ship, Info } from 'lucide-react';
import './App.css';

type TabId = 'builder' | 'orders' | 'crafters' | 'about';

const VALID_TABS: TabId[] = ['builder', 'orders', 'crafters', 'about'];

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
        <button
          type="button"
          className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <Info size={14} className="tab-btn-icon" />
          About
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
            {activeTab === 'about' && <About />}
          </>
        )}
      </main>

      <footer className="app-footer">
        <details className="app-footer-faq">
          <summary className="app-footer-tagline">
            Alamai Submarines — Best Submarine parts in Eorzea. <strong>FAQ</strong>
          </summary>
          {/* Kept in sync with the FAQPage JSON-LD in index.html — edit both together */}
          <h3>Where can I buy submarine parts in FFXIV?</h3>
          <p>You can buy premium FFXIV submarine parts from Alamai Submarines at submarines.alamai.dev. We offer all submarine components including hulls, sterns, bows, and bridges with live stock levels and instant ordering.</p>
          <h3>How do I make money with crafting in FF14?</h3>
          <p>One of the best ways to make gil with crafting in FF14 is by crafting submarine parts for other players. Submarine parts are always in demand because Free Companies need them for submarine voyages. Alamai Submarines connects crafters with buyers through our For Crafters program.</p>
          <h3>What are the best submarine builds in FFXIV?</h3>
          <p>Popular submarine builds in FFXIV include WSUC (Whale-class) and SSSS (Shark-class) configurations. Use our Set Builder tool at submarines.alamai.dev to compare different part combinations, see stats, and calculate total costs for your ideal submarine build.</p>
          <h3>What is a submarine set builder for FF14?</h3>
          <p>A submarine set builder is a tool that lets you pick individual submarine parts (hull, stern, bow, bridge) and see the total stats, price, and availability. Alamai Submarines offers a free set builder with live pricing and stock levels.</p>
        </details>
        <p className="app-footer-legal">
          FINAL FANTASY XIV © 2010 - 2026 SQUARE ENIX CO., LTD. All Rights Reserved. We are not
          affiliated with Square Enix.
        </p>
      </footer>
    </div>
  );
}

export default App;
