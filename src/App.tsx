import { useState, useEffect } from 'react';
import { loadSubmarineParts } from './SubmarineData';
import StockCatalog from './components/StockCatalog';
import SetBuilder from './components/SetBuilder';
import AdminPanel from './components/AdminPanel';
import { Anchor, Hammer, Lock, RefreshCw, Layers } from 'lucide-react';
import { SubmarinePart } from './types';
import './App.css';

import { auth, isFirebaseConfigured, allowedAdminEmails } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

function App() {
  const [parts, setParts] = useState<SubmarinePart[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'catalog' | 'builder' | 'admin'>('catalog');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);

  const fetchParts = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await loadSubmarineParts();
      setParts(data);
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
    fetchParts();

    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user && user.email) {
          const emailLower = user.email.toLowerCase();
          setIsAdminUnlocked(allowedAdminEmails.includes(emailLower));
        } else {
          setIsAdminUnlocked(false);
        }
      });
      return () => unsubscribe();
    } else {
      const checkAdminState = () => {
        const authVal = localStorage.getItem('ff14_sub_admin_auth');
        setIsAdminUnlocked(authVal === 'unlocked');
      };

      checkAdminState();

      window.addEventListener('storage', checkAdminState);
      const interval = setInterval(checkAdminState, 1000);

      return () => {
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
          className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          <Layers size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
          Stock Catalog
        </button>
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
            {activeTab === 'catalog' && <StockCatalog parts={parts} />}
            {activeTab === 'builder' && <SetBuilder parts={parts} />}
            {activeTab === 'admin' && (
              <AdminPanel parts={parts} onRefreshParts={fetchParts} onUpdatePart={handleUpdatePart} />
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
