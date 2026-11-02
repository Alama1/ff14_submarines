import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { LANGS } from './i18n';
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
  const { t } = useTranslation();
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
          <span className="app-subtitle">{t('app.subtitle')}</span>
        </div>
        <div className="app-lang-switcher" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={`app-lang-btn ${i18n.language === l ? 'is-active' : ''}`}
              onClick={() => i18n.changeLanguage(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <nav className="tab-navigation">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          <Hammer size={14} className="tab-btn-icon" />
          {t('app.nav.builder')}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Ship size={14} className="tab-btn-icon" />
          {t('app.nav.orders')}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'crafters' ? 'active' : ''}`}
          onClick={() => setActiveTab('crafters')}
        >
          <Wrench size={14} className="tab-btn-icon" />
          {t('app.nav.crafters')}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <Info size={14} className="tab-btn-icon" />
          {t('app.nav.about')}
        </button>
      </nav>

      <main className="app-main">
        {catalog.loading ? (
          <div className="app-loading">
            <RefreshCw size={36} className="spin app-loading-icon" />
            <p className="app-loading-text">{t('app.loading')}</p>
          </div>
        ) : catalog.error ? (
          <div className="app-error">
            <p className="app-error-title">⚓ {t('app.errorTitle')}</p>
            <p className="app-error-detail">{catalog.error}</p>
            <button
              type="button"
              className="ff-btn"
              onClick={() => {
                catalog.refresh();
              }}
            >
              <RefreshCw size={14} /> {t('app.tryAgain')}
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
            Alamai Submarines — {t('app.subtitle')} <strong>FAQ</strong>
          </summary>
          {/* Text mirrors the English-only FAQPage JSON-LD in index.html (SEO copy is
              intentionally English; the visible FAQ is translated via locales) */}
          <h3>{t('footer.faq.q1')}</h3>
          <p>{t('footer.faq.a1')}</p>
          <h3>{t('footer.faq.q2')}</h3>
          <p>{t('footer.faq.a2')}</p>
          <h3>{t('footer.faq.q3')}</h3>
          <p>{t('footer.faq.a3')}</p>
          <h3>{t('footer.faq.q4')}</h3>
          <p>{t('footer.faq.a4')}</p>
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
