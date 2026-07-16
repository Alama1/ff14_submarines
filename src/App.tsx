import { useState, useEffect } from 'react';
import { loadSubmarineParts, loadBulkDiscounts } from './SubmarineData';
import ForCrafters from './components/ForCrafters';
import SetBuilder from './components/SetBuilder';
import AdminPanel from './components/AdminPanel';
import { Anchor, Hammer, Lock, RefreshCw, Wrench } from 'lucide-react';
import { SubmarinePart, BulkDiscount } from './types';
import './App.css';
 
import { auth, isFirebaseConfigured, allowedAdminEmails } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
 
type TabId = 'builder' | 'crafters' | 'admin';

const VALID_TABS: TabId[] = ['builder', 'crafters', 'admin'];

function getTabFromHash(): TabId {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (!hash) return 'builder';
  return VALID_TABS.includes(hash as TabId) ? (hash as TabId) : 'builder';
}

function App() {
  const [parts, setParts] = useState<SubmarinePart[]>([]);
  const [discounts, setDiscounts] = useState<BulkDiscount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTabState] = useState<TabId>(getTabFromHash);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);

  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    if (tab === 'builder') {
      // Clean URL — remove the hash entirely for the default tab
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      window.location.hash = tab;
    }
  };

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [partsData, discountsData] = await Promise.all([
        loadSubmarineParts(),
        loadBulkDiscounts(),
      ]);
      setParts(partsData);
      setDiscounts(discountsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePart = (partId: string, updates: Partial<SubmarinePart>): void => {
    setParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, ...updates } : p))
    );
  };

  useEffect(() => {
    fetchData();

    // Sync tab when the user navigates with browser back / forward
    const onHashChange = () => setActiveTabState(getTabFromHash());
    window.addEventListener('hashchange', onHashChange);

    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user && user.email) {
          const emailLower = user.email.toLowerCase();
          setIsAdminUnlocked(allowedAdminEmails.includes(emailLower));
        } else {
          setIsAdminUnlocked(false);
        }
      });
      return () => {
        window.removeEventListener('hashchange', onHashChange);
        unsubscribe();
      };
    } else {
      const checkAdminState = () => {
        const authVal = localStorage.getItem('ff14_sub_admin_auth');
        setIsAdminUnlocked(authVal === 'unlocked');
      };

      checkAdminState();

      window.addEventListener('storage', checkAdminState);
      const interval = setInterval(checkAdminState, 1000);

      return () => {
        window.removeEventListener('hashchange', onHashChange);
        window.removeEventListener('storage', checkAdminState);
        clearInterval(interval);
      };
    }
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Anchor size={36} style={{ color: 'var(--color-gold)', filter: 'drop-shadow(0 0 8px var(--color-gold-glow))' }} />
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
          className={`tab-btn ${activeTab === 'crafters' ? 'active' : ''}`}
          onClick={() => setActiveTab('crafters')}
        >
          <Wrench size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
          For crafters
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          <Lock
            size={14}
            style={{
              marginRight: '0.4rem',
              verticalAlign: 'middle',
              color: isAdminUnlocked ? 'var(--color-success)' : 'var(--color-text-muted)',
            }}
          />
          Admin Board
        </button>
      </nav>

      <main style={{ flex: 1, marginBottom: '3rem' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
            <RefreshCw size={36} className="spin" style={{ color: 'var(--color-gold)' }} />
            <p style={{ fontStyle: 'italic', color: 'var(--color-text-muted)', fontFamily: 'var(--font-title)', letterSpacing: '0.05em' }}>
              Loading Eorzean Stock Records...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'builder' && <SetBuilder parts={parts} discounts={discounts} />}
            {activeTab === 'crafters' && <ForCrafters />}
            {activeTab === 'admin' && (
              <AdminPanel
                parts={parts}
                onRefreshParts={fetchData}
                onUpdatePart={handleUpdatePart}
                discounts={discounts}
                onRefreshDiscounts={fetchData}
              />
            )}
          </>
        )}
      </main>

      <footer style={{
        textAlign: 'center',
        paddingTop: '2rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        color: 'var(--color-text-muted)',
        fontSize: '0.75rem',
      }}>
        <p style={{ marginBottom: '0.5rem' }}>
          Alamai Submarines — Best Submarine parts in Eorzea. Created with dedication to details.
        </p>
        <p style={{ opacity: 0.6 }}>
          FINAL FANTASY XIV © 2010 - 2026 SQUARE ENIX CO., LTD. All Rights Reserved. We are not affiliated with Square Enix.
        </p>
      </footer>
    </div>
  );
}

export default App;
