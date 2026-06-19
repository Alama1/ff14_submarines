import { useState, useMemo, FormEvent, ChangeEvent, useEffect } from 'react';
import {
  ALL_PART_TYPES,
  generateDefaultParts,
  savePartUpdate,
  saveAllParts,
  saveBulkDiscount,
  deleteBulkDiscount,
  saveAllDiscounts,
  generateDefaultDiscounts,
  loadActiveCrafts,
  saveActiveCraft,
  deleteActiveCraft,
  deleteAllActiveCrafts,
} from '../SubmarineData';
import { Lock, Unlock, Eye, EyeOff, Plus, Minus, RotateCcw, Upload, Download, Trash2, Tag, Hammer } from 'lucide-react';
import { isFirebaseConfigured, auth, allowedAdminEmails, getEnv } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { SubmarinePart, UpdateStatus, UpdatingMap, BulkDiscount, ActiveCraft } from '../types';

interface AdminPanelProps {
  parts?: SubmarinePart[];
  onRefreshParts: () => void;
  onUpdatePart: (partId: string, updates: Partial<SubmarinePart>) => void;
  discounts?: BulkDiscount[];
  onRefreshDiscounts: () => void;
}

interface AdminEditRowProps {
  part: SubmarinePart;
  status?: UpdateStatus;
  onAdjustStock: (part: SubmarinePart, delta: number) => void;
  onFieldChange: (partId: string, field: keyof SubmarinePart, value: string) => void;
}

function AdminEditRow({ part, status, onAdjustStock, onFieldChange }: AdminEditRowProps) {
  const [stock, setStock] = useState<string>(String(part.stock));
  const [price, setPrice] = useState<string>(String(part.price));

  useEffect(() => {
    setStock(String(part.stock));
  }, [part.stock]);

  useEffect(() => {
    setPrice(String(part.price));
  }, [part.price]);

  const handleBlur = (field: keyof SubmarinePart, localValue: string, originalValue: number) => {
    let parsedValue = parseInt(localValue, 10);
    if (isNaN(parsedValue)) parsedValue = 0;
    if (parsedValue < 0) parsedValue = 0;
    
    if (parsedValue !== originalValue) {
      onFieldChange(part.id, field, String(parsedValue));
    }
    // reset local to parsed just in case
    if (field === 'stock') setStock(String(parsedValue));
    if (field === 'price') setPrice(String(parsedValue));
  };

  return (
    <tr
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        background: part.isModified ? 'rgba(197, 160, 89, 0.01)' : 'transparent',
      }}
      className="admin-edit-row"
    >
      <td style={{ padding: '0.75rem', fontWeight: '500' }}>
        <div style={{ color: part.isModified ? 'var(--color-gold-light)' : 'var(--color-text-title)' }}>
          {part.name}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          ID: {part.id}
        </div>
      </td>

      <td style={{ padding: '0.75rem' }}>
        {part.isModified ? (
          <span className="badge badge-warning" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>Mod</span>
        ) : (
          <span className="badge" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', background: '#334155', color: '#cbd5e1' }}>Std</span>
        )}
      </td>

      <td style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            className="ff-btn-secondary"
            style={{ padding: '0.25rem 0.5rem', height: '32px' }}
            onClick={() => onAdjustStock(part, -1)}
          >
            <Minus size={12} />
          </button>
          <input
            type="number"
            className="form-input"
            style={{ width: '55px', textAlign: 'center', padding: '0.3rem', height: '32px', boxSizing: 'border-box' }}
            value={stock}
            min="0"
            onChange={(e) => setStock(e.target.value)}
            onBlur={() => handleBlur('stock', stock, part.stock)}
          />
          <button
            type="button"
            className="ff-btn-secondary"
            style={{ padding: '0.25rem 0.5rem', height: '32px' }}
            onClick={() => onAdjustStock(part, 1)}
          >
            <Plus size={12} />
          </button>
        </div>
      </td>

      <td style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="number"
            className="form-input"
            style={{ width: '100%', padding: '0.3rem 0.5rem', height: '32px', boxSizing: 'border-box' }}
            value={price}
            min="0"
            step="10000"
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => handleBlur('price', price, part.price)}
          />
          <span className="gil-coin">G</span>
        </div>
      </td>

      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        {status === 'saving' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-gold)' }} className="blink">...</span>
        )}
        {status === 'success' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>✓</span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>Err</span>
        )}
      </td>
    </tr>
  );
}

interface AdminDiscountRowProps {
  discount: BulkDiscount;
  status?: UpdateStatus;
  onFieldChange: (id: string, field: 'threshold' | 'discountPercent', value: string) => void;
  onDelete: (id: string) => void;
}

function AdminDiscountRow({ discount, status, onFieldChange, onDelete }: AdminDiscountRowProps) {
  const [threshold, setThreshold] = useState<string>(String(discount.threshold));
  const [percent, setPercent] = useState<string>(String(discount.discountPercent));

  useEffect(() => {
    setThreshold(String(discount.threshold));
  }, [discount.threshold]);

  useEffect(() => {
    setPercent(String(discount.discountPercent));
  }, [discount.discountPercent]);

  const handleBlur = (field: 'threshold' | 'discountPercent', localValue: string, originalValue: number) => {
    let parsedValue = parseInt(localValue, 10);
    if (isNaN(parsedValue)) parsedValue = 0;
    if (parsedValue < 0) parsedValue = 0;
    if (field === 'discountPercent' && parsedValue > 100) parsedValue = 100;

    if (parsedValue !== originalValue) {
      onFieldChange(discount.id, field, String(parsedValue));
    }
    if (field === 'threshold') setThreshold(String(parsedValue));
    if (field === 'discountPercent') setPercent(String(parsedValue));
  };

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <td style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="number"
            className="form-input"
            style={{ width: '80px', textAlign: 'center', padding: '0.3rem', height: '32px', boxSizing: 'border-box' }}
            value={threshold}
            min="1"
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={() => handleBlur('threshold', threshold, discount.threshold)}
          />
          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>+ Sets</span>
        </div>
      </td>
      <td style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="number"
            className="form-input"
            style={{ width: '80px', textAlign: 'center', padding: '0.3rem', height: '32px', boxSizing: 'border-box' }}
            value={percent}
            min="1"
            max="100"
            onChange={(e) => setPercent(e.target.value)}
            onBlur={() => handleBlur('discountPercent', percent, discount.discountPercent)}
          />
          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>% Off</span>
        </div>
      </td>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        {status === 'saving' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-gold)' }} className="blink">...</span>
        )}
        {status === 'success' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>✓</span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>Err</span>
        )}
      </td>
      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
        <button
          type="button"
          className="ff-btn-danger"
          style={{ padding: '0.25rem 0.5rem', height: '32px', display: 'inline-flex', alignItems: 'center' }}
          onClick={() => onDelete(discount.id)}
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
}

export default function AdminPanel({
  parts = [],
  onRefreshParts,
  onUpdatePart,
  discounts = [],
  onRefreshDiscounts,
}: AdminPanelProps) {
  const [passcode, setPasscode] = useState<string>('');
  const [showPasscode, setShowPasscode] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (isFirebaseConfigured && auth) {
      const user = auth.currentUser;
      return user !== null && user.email !== null && allowedAdminEmails.includes(user.email.toLowerCase());
    }
    return localStorage.getItem('ff14_sub_admin_auth') === 'unlocked';
  });
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string>('');

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('All');

  const [updatingIds, setUpdatingIds] = useState<UpdatingMap>({});
  const [bulkStatus, setBulkStatus] = useState<string>('');

  const [updatingDiscountIds, setUpdatingDiscountIds] = useState<UpdatingMap>({});
  const [newThreshold, setNewThreshold] = useState<string>('');
  const [newPercent, setNewPercent] = useState<string>('');
  const [discountError, setDiscountError] = useState<string>('');

  const [activeCrafts, setActiveCrafts] = useState<ActiveCraft[]>([]);
  const [sheetIngredients, setSheetIngredients] = useState<string[]>([]);
  const [newCraftIngredient, setNewCraftIngredient] = useState<string>('');
  const [newCraftQuantity, setNewCraftQuantity] = useState<string>('');
  const [newCraftClaimedBy, setNewCraftClaimedBy] = useState<string>('');
  const [isManualInput, setIsManualInput] = useState<boolean>(false);
  const [manualIngredientName, setManualIngredientName] = useState<string>('');
  const [craftError, setCraftError] = useState<string>('');
  const [loadingCrafts, setLoadingCrafts] = useState<boolean>(false);

  const fetchActiveCrafts = async () => {
    try {
      const data = await loadActiveCrafts();
      setActiveCrafts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSheetIngredients = async () => {
    const sheetUrl = getEnv('VITE_CRAFTERS_SHEET_URL');
    if (!sheetUrl) return;
    try {
      const res = await fetch(sheetUrl);
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        const ingredients = data.items.map((item: any) => item.ingredient);
        const unique = Array.from(new Set(ingredients)).sort() as string[];
        setSheetIngredients(unique);
        if (unique.length > 0) {
          setNewCraftIngredient(unique[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching sheet ingredients in admin panel:', e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchActiveCrafts();
      fetchSheetIngredients();
    }
  }, [isAuthenticated]);


  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user && user.email) {
          const emailLower = user.email.toLowerCase();
          if (allowedAdminEmails.includes(emailLower)) {
            setIsAuthenticated(true);
            setAuthError('');
          } else {
            setIsAuthenticated(false);
            setAuthError(`Your Google account (${user.email}) is not authorized to edit stock records.`);
            try {
              if (auth) await signOut(auth);
            } catch (error) {
              console.error('Error logging out unauthorized user:', error);
            }
          }
        } else {
          setIsAuthenticated(false);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (isFirebaseConfigured && auth) {
      setAuthError('');
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
      } catch (error: any) {
        console.error(error);
        if (error.code === 'auth/popup-closed-by-user') {
          setAuthError('Sign-in window closed before completion.');
        } else if (error.code === 'auth/unauthorized-domain') {
          setAuthError('This domain is not authorized for Google Sign-in in your Firebase Console.');
        } else {
          setAuthError('Authentication failed. Please check your connection.');
        }
      }
    } else {
      if (passcode === 'ff14sub') {
        setIsAuthenticated(true);
        setAuthError('');
        if (rememberMe) {
          localStorage.setItem('ff14_sub_admin_auth', 'unlocked');
        }
      } else {
        setAuthError('Invalid passcode. Hint: check default passcode.');
      }
    }
  };

  const handleLock = async () => {
    if (isFirebaseConfigured && auth) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error(error);
      }
    } else {
      setIsAuthenticated(false);
      localStorage.removeItem('ff14_sub_admin_auth');
      setPasscode('');
    }
  };

  const handleFieldChange = async (partId: string, field: keyof SubmarinePart, value: string) => {
    let parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) parsedValue = 0;
    if (parsedValue < 0) parsedValue = 0;

    setUpdatingIds((prev) => ({ ...prev, [partId]: 'saving' as UpdateStatus }));

    const success = await savePartUpdate(partId, { [field]: parsedValue });

    if (success) {
      setUpdatingIds((prev) => ({ ...prev, [partId]: 'success' as UpdateStatus }));
      onUpdatePart(partId, { [field]: parsedValue });
      setTimeout(() => {
        setUpdatingIds((prev) => {
          const copy = { ...prev };
          delete copy[partId];
          return copy;
        });
      }, 1500);
    } else {
      setUpdatingIds((prev) => ({ ...prev, [partId]: 'error' as UpdateStatus }));
    }
  };

  const handleAdjustStock = async (part: SubmarinePart, delta: number) => {
    const newStock = Math.max(0, part.stock + delta);
    await handleFieldChange(part.id, 'stock', String(newStock));
  };

  const handleDiscountFieldChange = async (
    discountId: string,
    field: 'threshold' | 'discountPercent',
    value: string
  ) => {
    let parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) parsedValue = 0;
    if (parsedValue < 0) parsedValue = 0;
    if (field === 'discountPercent' && parsedValue > 100) parsedValue = 100;

    setUpdatingDiscountIds((prev) => ({ ...prev, [discountId]: 'saving' as UpdateStatus }));

    const currentDiscount = discounts.find((d) => d.id === discountId);
    if (!currentDiscount) return;

    const updated = { ...currentDiscount, [field]: parsedValue };

    const success = await saveBulkDiscount(updated);
    if (success) {
      setUpdatingDiscountIds((prev) => ({ ...prev, [discountId]: 'success' as UpdateStatus }));
      onRefreshDiscounts();
      setTimeout(() => {
        setUpdatingDiscountIds((prev) => {
          const copy = { ...prev };
          delete copy[discountId];
          return copy;
        });
      }, 1500);
    } else {
      setUpdatingDiscountIds((prev) => ({ ...prev, [discountId]: 'error' as UpdateStatus }));
    }
  };

  const handleDeleteDiscount = async (discountId: string) => {
    if (!window.confirm('Are you sure you want to delete this discount tier?')) return;
    const success = await deleteBulkDiscount(discountId);
    if (success) {
      onRefreshDiscounts();
    } else {
      alert('Failed to delete discount tier.');
    }
  };

  const handleAddDiscount = async (e: FormEvent) => {
    e.preventDefault();
    setDiscountError('');

    const thresh = parseInt(newThreshold, 10);
    const pct = parseInt(newPercent, 10);

    if (isNaN(thresh) || thresh <= 0) {
      setDiscountError('Threshold must be a positive number.');
      return;
    }
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setDiscountError('Discount percent must be between 1 and 100.');
      return;
    }

    if (discounts.some((d) => d.threshold === thresh)) {
      setDiscountError(`A discount tier for ${thresh}+ sets already exists.`);
      return;
    }

    const newDiscount: BulkDiscount = {
      id: `discount-${thresh}-${Date.now()}`,
      threshold: thresh,
      discountPercent: pct,
    };

    const success = await saveBulkDiscount(newDiscount);
    if (success) {
      setNewThreshold('');
      setNewPercent('');
      onRefreshDiscounts();
    } else {
      setDiscountError('Failed to save the new discount tier.');
    }
  };

  const handleResetDiscounts = async () => {
    if (!window.confirm('Are you sure you want to reset all discount tiers to defaults?')) return;
    const defaults = generateDefaultDiscounts();
    const success = await saveAllDiscounts(defaults);
    if (success) {
      onRefreshDiscounts();
    } else {
      alert('Failed to reset discounts.');
    }
  };

  const handleAddActiveCraft = async (e: FormEvent) => {
    e.preventDefault();
    setCraftError('');

    const ingredient = isManualInput ? manualIngredientName.trim() : newCraftIngredient;
    const qty = parseInt(newCraftQuantity, 10);

    if (!ingredient) {
      setCraftError('Ingredient name cannot be empty.');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setCraftError('Quantity must be a positive number.');
      return;
    }

    const newCraft = {
      ingredient,
      quantity: qty,
      ...(newCraftClaimedBy.trim() ? { claimedBy: newCraftClaimedBy.trim() } : {}),
    };

    setLoadingCrafts(true);
    const newId = await saveActiveCraft(newCraft);
    setLoadingCrafts(false);

    if (newId) {
      setNewCraftQuantity('');
      setNewCraftClaimedBy('');
      if (isManualInput) {
        setManualIngredientName('');
      }
      fetchActiveCrafts();
    } else {
      setCraftError('Failed to save the crafting assignment.');
    }
  };

  const handleDeleteActiveCraft = async (craftId: string) => {
    const craft = activeCrafts.find(c => c.id === craftId);
    const label = craft ? craft.ingredient : craftId;
    if (!window.confirm(`Remove claim for "${label}"?`)) return;
    setLoadingCrafts(true);
    const success = await deleteActiveCraft(craftId);
    setLoadingCrafts(false);
    if (success) {
      fetchActiveCrafts();
    } else {
      alert('Failed to delete the crafting assignment.');
    }
  };

  const handleClearAllCrafts = async () => {
    if (!window.confirm('Clear ALL active crafting assignments? This cannot be undone.')) return;
    setLoadingCrafts(true);
    const success = await deleteAllActiveCrafts();
    setLoadingCrafts(false);
    if (success) {
      fetchActiveCrafts();
    } else {
      alert('Failed to clear all crafting assignments.');
    }
  };


  const handleSeedDatabase = async () => {
    if (!window.confirm('Are you sure you want to overwrite all default parts?')) return;

    setBulkStatus('Seeding...');
    const defaults = generateDefaultParts();
    const success = await saveAllParts(defaults);

    if (success) {
      setBulkStatus('Seeded!');
      onRefreshParts();
      setTimeout(() => setBulkStatus(''), 3000);
    } else {
      setBulkStatus('Failed.');
    }
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(parts, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'ff14_submarines_stock.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;

    fileReader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') return;
        const importedData = JSON.parse(result) as SubmarinePart[];
        if (Array.isArray(importedData) && importedData.length > 0 && Object.prototype.hasOwnProperty.call(importedData[0], 'id')) {
          setBulkStatus('Importing...');
          const success = await saveAllParts(importedData);
          if (success) {
            setBulkStatus('Imported!');
            onRefreshParts();
            setTimeout(() => setBulkStatus(''), 3000);
          } else {
            setBulkStatus('Failed.');
          }
        } else {
          alert('Invalid format.');
        }
      } catch {
        alert('Failed parsing.');
      }
    };
    fileReader.readAsText(file);
  };

  const filteredParts = useMemo<SubmarinePart[]>(() => {
    return parts.filter((part) => {
      const matchesSearch = part.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedType === 'All' || part.partType === selectedType;
      return matchesSearch && matchesType;
    });
  }, [parts, searchTerm, selectedType]);

  if (!isAuthenticated) {
    return (
      <div className="admin-lock-screen fade-in" style={{ display: 'flex', justifyContent: 'center', padding: '4rem 1.5rem' }}>
        <div className="ff-card-framed" style={{ maxWidth: '400px', width: '100%', padding: '2.5rem 2rem' }}>

          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(197, 160, 89, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              border: '1px solid var(--color-gold)',
            }}>
              <Lock size={28} style={{ color: 'var(--color-gold)' }} />
            </div>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Aetherial Lock</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              Authentication required to modify stock quantities and gil prices.
            </p>
          </div>

          <form onSubmit={handleUnlock}>
            {isFirebaseConfigured && auth ? (
              <div style={{ textAlign: 'center', margin: '1rem 0' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
                  Sign in with an authorized Google account to access administrative controls.
                </p>
                <button
                  type="submit"
                  className="ff-btn glow-active"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: '600',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    style={{ marginRight: '0.25rem' }}
                  >
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>
              </div>
            ) : (
              <>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Admin Passcode</label>
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    className="form-input"
                    style={{ paddingRight: '2.5rem' }}
                    placeholder="Enter passcode..."
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      bottom: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    onClick={() => setShowPasscode(!showPasscode)}
                  >
                    {showPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <label className="toggle-container">
                    <input
                      type="checkbox"
                      style={{ display: 'none' }}
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <div className="toggle-switch" style={{ scale: '0.8', marginRight: '0.25rem' }}></div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Remember Admin Session</span>
                  </label>
                </div>

                <button type="submit" className="ff-btn" style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}>
                  Unlock Panel
                </button>
              </>
            )}

            {authError && (
              <p style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: '1.25rem', textAlign: 'left', lineHeight: '1.4' }}>
                {authError}
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel-dashboard fade-in">

      <div className="ff-card-framed" style={{
        marginBottom: '2rem',
        padding: '1.25rem',
        background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-admin-header) 100%)',
        borderLeft: '4px solid var(--color-gold)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.4rem', color: 'var(--color-gold-light)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <Unlock size={20} /> Administrator Board
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              You are connected to {isFirebaseConfigured
                ? <strong style={{ color: 'var(--color-success)' }}>Firebase Firestore</strong>
                : <strong style={{ color: 'var(--color-warning)' }}>LocalStorage (Local Mode)</strong>
              }.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="ff-btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={handleLock}>
              Lock Panel
            </button>
          </div>
        </div>
      </div>

      <div className="ff-card" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
        <h3 style={{ fontSize: '1rem', textAlign: 'left', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
          Database Operations &amp; Backups
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>

          <button type="button" className="ff-btn-secondary" onClick={handleExportJSON}>
            <Download size={14} /> Export JSON
          </button>

          <label className="ff-btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={14} /> Import JSON
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportJSON}
            />
          </label>

          <button type="button" className="ff-btn-danger" onClick={handleSeedDatabase}>
            <RotateCcw size={14} /> Seed Default Parts
          </button>

          {bulkStatus && (
            <span style={{
              fontSize: '0.85rem',
              color: bulkStatus.includes('success') || bulkStatus.includes('Seeding') ? 'var(--color-success)' : 'var(--color-warning)',
              fontWeight: '500',
            }}>
              {bulkStatus}
            </span>
          )}
        </div>
      </div>

      <div className="ff-card-framed" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h3 style={{
          fontSize: '1.1rem',
          textAlign: 'left',
          marginBottom: '1rem',
          borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
          paddingBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--color-gold-light)',
        }}>
          <Hammer size={18} /> Active Crafting Assignments
        </h3>

        <div style={{ display: 'flex', flexDirection: 'row', gap: '2rem', flexWrap: 'wrap' }}>
          
          <div style={{ flex: '2 1 400px', minWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-title)', margin: 0, textAlign: 'left', fontFamily: 'var(--font-title)' }}>
                Ongoing Crafting Progress
              </h4>
              {activeCrafts.length > 0 && (
                <button
                  type="button"
                  className="ff-btn-danger"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  onClick={handleClearAllCrafts}
                  disabled={loadingCrafts}
                >
                  <Trash2 size={11} /> Clear All
                </button>
              )}
            </div>
            
            {activeCrafts.length === 0 ? (
              <div style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'var(--bg-input)',
                border: '1px dashed rgba(197,160,89,0.2)',
                borderRadius: '4px',
                color: 'var(--color-text-muted)',
                fontSize: '0.85rem'
              }}>
                No items are currently marked as being crafted.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', background: 'var(--bg-input)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(197, 160, 89, 0.2)', background: 'rgba(197, 160, 89, 0.02)' }}>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)' }}>Ingredient</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)', width: '120px', textAlign: 'right' }}>Amount Crafted</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)', textAlign: 'left' }}>Claimed By</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)', width: '80px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCrafts.map((craft) => (
                      <tr key={craft.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--color-text-title)', fontWeight: '500' }}>
                          {craft.ingredient}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', textAlign: 'right', fontWeight: 'bold' }}>
                          {craft.quantity}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: craft.claimedBy ? 'var(--color-gold-light)' : 'var(--color-text-muted)', fontStyle: craft.claimedBy ? 'normal' : 'italic' }}>
                          {craft.claimedBy || '—'}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="ff-btn-danger"
                            style={{ padding: '0.25rem 0.5rem', height: '28px', display: 'inline-flex', alignItems: 'center' }}
                            onClick={() => handleDeleteActiveCraft(craft.id)}
                            disabled={loadingCrafts}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ flex: '1 1 250px', minWidth: '250px', background: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-title)', marginBottom: '1rem', textAlign: 'left', fontFamily: 'var(--font-title)' }}>
              Declare Crafting Task
            </h4>
            
            <form onSubmit={handleAddActiveCraft} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Select Ingredient</label>
                
                {isManualInput ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Beech Lumber"
                      value={manualIngredientName}
                      onChange={(e) => setManualIngredientName(e.target.value)}
                    />
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-gold)',
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: 0
                      }}
                      onClick={() => setIsManualInput(false)}
                    >
                      ← Back to dropdown list
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <select
                      className="form-select"
                      value={newCraftIngredient}
                      onChange={(e) => {
                        if (e.target.value === '__manual__') {
                          setIsManualInput(true);
                        } else {
                          setNewCraftIngredient(e.target.value);
                        }
                      }}
                    >
                      {sheetIngredients.length === 0 ? (
                        <option value="">(Enter manually or connect sheet)</option>
                      ) : (
                        sheetIngredients.map((ing) => (
                          <option key={ing} value={ing}>{ing}</option>
                        ))
                      )}
                      <option value="__manual__">+ Type manually...</option>
                    </select>
                  </div>
                )}
              </div>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Quantity Being Crafted</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 150"
                  min="1"
                  value={newCraftQuantity}
                  onChange={(e) => setNewCraftQuantity(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Claimed By <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Alamai"
                  value={newCraftClaimedBy}
                  onChange={(e) => setNewCraftClaimedBy(e.target.value)}
                />
              </div>

              {craftError && (
                <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', textAlign: 'left', lineHeight: '1.3' }}>
                  {craftError}
                </div>
              )}

              <button type="submit" className="ff-btn" style={{ padding: '0.5rem', marginTop: '0.25rem' }} disabled={loadingCrafts}>
                <Plus size={14} /> Add craft
              </button>
            </form>
          </div>

        </div>
      </div>

      <div className="ff-card-framed" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h3 style={{
          fontSize: '1.1rem',
          textAlign: 'left',
          marginBottom: '1rem',
          borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
          paddingBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--color-gold-light)',
        }}>
          <Tag size={18} /> Bulk Discount Rules
        </h3>

        <div style={{ display: 'flex', flexDirection: 'row', gap: '2rem', flexWrap: 'wrap' }}>
          
          <div style={{ flex: '2 1 400px', minWidth: '300px' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-title)', marginBottom: '0.75rem', textAlign: 'left', fontFamily: 'var(--font-title)' }}>
              Active Discount Tiers
            </h4>
            
            {discounts.length === 0 ? (
              <div style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'var(--bg-input)',
                border: '1px dashed rgba(197,160,89,0.2)',
                borderRadius: '4px',
                color: 'var(--color-text-muted)',
                fontSize: '0.85rem'
              }}>
                No bulk discounts defined. Order totals will use standard pricing.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', background: 'var(--bg-input)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(197, 160, 89, 0.2)', background: 'rgba(197, 160, 89, 0.02)' }}>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)' }}>Threshold</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)' }}>Discount (%)</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)', width: '60px', textAlign: 'center' }}>Sync</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-gold)', width: '60px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discounts.map((discount) => (
                      <AdminDiscountRow
                        key={discount.id}
                        discount={discount}
                        status={updatingDiscountIds[discount.id]}
                        onFieldChange={handleDiscountFieldChange}
                        onDelete={handleDeleteDiscount}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ flex: '1 1 250px', minWidth: '250px', background: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-title)', marginBottom: '1rem', textAlign: 'left', fontFamily: 'var(--font-title)' }}>
              Add Discount Tier
            </h4>
            
            <form onSubmit={handleAddDiscount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Threshold (Sets)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 3"
                  min="1"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                />
              </div>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Discount Percentage</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="e.g. 10"
                    min="1"
                    max="100"
                    value={newPercent}
                    onChange={(e) => setNewPercent(e.target.value)}
                  />
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>%</span>
                </div>
              </div>

              {discountError && (
                <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', textAlign: 'left', lineHeight: '1.3' }}>
                  {discountError}
                </div>
              )}

              <button type="submit" className="ff-btn" style={{ padding: '0.5rem', marginTop: '0.25rem' }}>
                <Plus size={14} /> Add Tier
              </button>
            </form>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '1.25rem', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
              <button type="button" className="ff-btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', width: '100%' }} onClick={handleResetDiscounts}>
                <RotateCcw size={12} /> Reset to Defaults
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="ff-card-framed" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1, minWidth: '300px' }}>

            <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
              <select
                className="form-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="All">All Components</option>
                {ALL_PART_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search by part name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Showing {filteredParts.length} of {parts.length} parts
          </div>

        </div>
      </div>

      <div className="ff-card-framed" style={{ padding: '0.5rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(197, 160, 89, 0.3)' }}>
              <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-gold)', textTransform: 'uppercase' }}>Part Name</th>
              <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-gold)', textTransform: 'uppercase', width: '90px' }}>Variant</th>
              <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-gold)', textTransform: 'uppercase', width: '180px', textAlign: 'center' }}>In-Stock Qty</th>
              <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-gold)', textTransform: 'uppercase', width: '200px' }}>Unit Price (Gil)</th>
              <th style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-gold)', textTransform: 'uppercase', width: '80px', textAlign: 'center' }}>Sync</th>
            </tr>
          </thead>
          <tbody>
            {filteredParts.map((part) => (
              <AdminEditRow
                key={part.id}
                part={part}
                status={updatingIds[part.id]}
                onAdjustStock={handleAdjustStock}
                onFieldChange={handleFieldChange}
              />
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
