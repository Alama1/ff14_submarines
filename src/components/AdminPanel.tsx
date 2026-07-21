import { useState, useMemo, FormEvent, ChangeEvent, useEffect, useRef } from 'react';
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
  savePartIngredient,
  deletePartIngredient,
} from '../SubmarineData';
import { Lock, Unlock, Eye, EyeOff, Plus, Minus, RotateCcw, Upload, Download, Trash2, Tag, Hammer, ShoppingCart, Beaker, Save, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import OrderTracker from './OrderTracker';
import { isFirebaseConfigured, auth, allowedAdminEmails, getEnv } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { SubmarinePart, UpdateStatus, UpdatingMap, BulkDiscount, ActiveCraft, PartIngredient, Ingredient } from '../types';
import {
  getCache, setCache,
  ADMIN_SHEET_INGREDIENTS_TTL,
  CACHE_KEY_ADMIN_SHEET_INGREDIENTS,
} from '../cache';

interface AdminPanelProps {
  parts?: SubmarinePart[];
  onRefreshParts: () => void;
  onUpdatePart: (partId: string, updates: Partial<SubmarinePart>) => void;
  discounts?: BulkDiscount[];
  onRefreshDiscounts: () => void;
  partIngredients?: PartIngredient[];
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
  partIngredients = [],
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

  // ─── Part Ingredient Editor States ───
  const [selectedPartIdForRecipe, setSelectedPartIdForRecipe] = useState<string>('');
  const [editingRecipeIngredients, setEditingRecipeIngredients] = useState<Ingredient[]>([]);
  const [newRecipeIngName, setNewRecipeIngName] = useState<string>('');
  const [newRecipeIngQty, setNewRecipeIngQty] = useState<string>('1');
  const [recipeError, setRecipeError] = useState<string>('');
  const [recipeSuccess, setRecipeSuccess] = useState<string>('');
  const [savingRecipe, setSavingRecipe] = useState<boolean>(false);
  const [recipeManualInput, setRecipeManualInput] = useState<boolean>(false);
  const [recipeManualIngredientName, setRecipeManualIngredientName] = useState<string>('');

  // ─── Bulk Recipe Import States ───
  const [bulkRecipeText, setBulkRecipeText] = useState<string>('');
  const [showBulkImport, setShowBulkImport] = useState<boolean>(false);
  const [bulkImportStatus, setBulkImportStatus] = useState<string>('');
  const [bulkImportError, setBulkImportError] = useState<string>('');

const handleRecipePartSelect = (partId: string) => {
    setSelectedPartIdForRecipe(partId);
    if (partId) {
      const match = partIngredients.find(pi => pi.partId === partId);
      setEditingRecipeIngredients(match ? [...match.ingredients] : []);
      setRecipeError('');
      setRecipeSuccess('');
    } else {
      setEditingRecipeIngredients([]);
    }
  };

const sheetIngInitRef = useRef(false);
  useEffect(() => {
    if (!sheetIngInitRef.current && sheetIngredients.length > 0 && !newRecipeIngName) {
      sheetIngInitRef.current = true;
      setNewRecipeIngName(sheetIngredients[0]);
    }
  }, [sheetIngredients, newRecipeIngName]);


  const fetchActiveCrafts = async () => {
    try {
      const data = await loadActiveCrafts();
      setActiveCrafts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSheetIngredients = async () => {
    // Try 1-day cache first
    const cached = getCache<string[]>(CACHE_KEY_ADMIN_SHEET_INGREDIENTS, ADMIN_SHEET_INGREDIENTS_TTL);
    if (cached && cached.length > 0) {
      setSheetIngredients(cached);
      if (!newCraftIngredient && cached.length > 0) {
        setNewCraftIngredient(cached[0]);
      }
      return;
    }

    const sheetUrl = getEnv('VITE_CRAFTERS_SHEET_URL');
    if (!sheetUrl) return;
    try {
      const res = await fetch(sheetUrl);
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        const ingredients = data.items.map((item: any) => item.ingredient);
        const unique = Array.from(new Set(ingredients)).sort() as string[];
        setSheetIngredients(unique);
        setCache(CACHE_KEY_ADMIN_SHEET_INGREDIENTS, unique);
        if (unique.length > 0) {
          setNewCraftIngredient(unique[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching sheet ingredients in admin panel:', e);
    }
  };

const authInitRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !authInitRef.current) {
      authInitRef.current = true;
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

  const handleAddIngredientToRecipe = () => {
    const finalName = recipeManualInput ? recipeManualIngredientName.trim() : newRecipeIngName;
    if (!finalName) {
      setRecipeError('Ingredient name cannot be empty.');
      return;
    }
    const qty = parseInt(newRecipeIngQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setRecipeError('Quantity must be a positive number.');
      return;
    }

    const nameLower = finalName.toLowerCase();
    const existingIdx = editingRecipeIngredients.findIndex(
      (ing) => ing.name.toLowerCase() === nameLower
    );

    let updated: Ingredient[];
    if (existingIdx !== -1) {
      updated = editingRecipeIngredients.map((ing, idx) =>
        idx === existingIdx ? { ...ing, quantity: ing.quantity + qty } : ing
      );
    } else {
      updated = [
        ...editingRecipeIngredients,
        { name: finalName, quantity: qty }
      ];
    }

    setEditingRecipeIngredients(updated);
    setRecipeError('');
    setRecipeSuccess('');
    if (recipeManualInput) {
      setRecipeManualIngredientName('');
    }
    setNewRecipeIngQty('1');
  };

  const handleRemoveIngredientFromRecipe = (name: string) => {
    setEditingRecipeIngredients(
      editingRecipeIngredients.filter((ing) => ing.name !== name)
    );
    setRecipeError('');
    setRecipeSuccess('');
  };

  const handleSaveRecipe = async () => {
    if (!selectedPartIdForRecipe) {
      setRecipeError('No part selected.');
      return;
    }

    const part = parts.find((p) => p.id === selectedPartIdForRecipe);
    if (!part) {
      setRecipeError('Selected part not found.');
      return;
    }

    setSavingRecipe(true);
    setRecipeError('');
    setRecipeSuccess('');

    try {
      if (editingRecipeIngredients.length === 0) {
        const success = await deletePartIngredient(selectedPartIdForRecipe);
        if (success) {
          setRecipeSuccess('Recipe deleted/cleared successfully!');
          onRefreshParts();
        } else {
          setRecipeError('Failed to clear the recipe.');
        }
      } else {
        const recipe: PartIngredient = {
          partId: selectedPartIdForRecipe,
          partName: part.name,
          ingredients: editingRecipeIngredients,
        };
        const success = await savePartIngredient(recipe);
        if (success) {
          setRecipeSuccess('Recipe saved successfully!');
          onRefreshParts();
        } else {
          setRecipeError('Failed to save the recipe.');
        }
      }
    } catch (e) {
      console.error(e);
      setRecipeError('An unexpected error occurred.');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleBulkImportRecipes = async () => {
    if (!bulkRecipeText.trim()) {
      setBulkImportError('Please paste spreadsheet data first.');
      return;
    }

    setBulkImportStatus('Parsing and importing...');
    setBulkImportError('');

    try {
      const parsedRecipes = parseSpreadsheetRecipes(bulkRecipeText, parts);
      if (parsedRecipes.length === 0) {
        setBulkImportError('Could not parse any valid recipes. Ensure columns are tab-separated.');
        setBulkImportStatus('');
        return;
      }

      let count = 0;
      for (const recipe of parsedRecipes) {
        const success = await savePartIngredient(recipe);
        if (success) count++;
      }

      setBulkImportStatus(`Successfully imported ${count} recipes!`);
      setBulkRecipeText('');
      onRefreshParts();
      setTimeout(() => setBulkImportStatus(''), 5000);
    } catch (e) {
      console.error(e);
      setBulkImportError('An unexpected error occurred during import.');
      setBulkImportStatus('');
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

      <div className="ff-card-framed" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h3 style={{
          fontSize: '1.1rem',
          textAlign: 'left',
          marginBottom: '1.5rem',
          borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
          paddingBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--color-gold-light)',
        }}>
          <ShoppingCart size={18} /> Order Tracker
        </h3>
        <OrderTracker parts={parts} />
      </div>

      {/* ─── Part Ingredients Editor ─── */}
      <div className="ff-card-framed" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h3 style={{
          fontSize: '1.1rem',
          textAlign: 'left',
          marginBottom: '1.5rem',
          borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
          paddingBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--color-gold-light)',
        }}>
          <Beaker size={18} /> Part Ingredients Editor
        </h3>

        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem', textAlign: 'left' }}>
          Define the raw materials required to craft each submarine component. These recipes are used to calculate real-time craftability in the Set Builder.
        </p>

        {/* Bulk Import Section */}
        <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
          <button
            type="button"
            className="ff-btn-secondary"
            onClick={() => setShowBulkImport(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            {showBulkImport ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Bulk Import from Spreadsheet
          </button>

          {showBulkImport && (
            <div style={{
              marginTop: '0.75rem',
              padding: '1rem',
              background: 'rgba(0,0,0,0.15)',
              border: '1px dashed rgba(197,160,89,0.2)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                Paste Tab-Separated Rows (Part Row followed by Quantity Row)
              </label>
              <textarea
                className="form-input"
                rows={6}
                value={bulkRecipeText}
                onChange={(e) => setBulkRecipeText(e.target.value)}
                placeholder="e.g.&#10;Shark-class Pressure Hull&#9;Walnut Lumber&#9;Spruce Lumber&#10;Item quantity&#9;18&#9;18"
                style={{ fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
              />
              <button
                type="button"
                className="ff-btn"
                onClick={handleBulkImportRecipes}
                style={{ alignSelf: 'flex-start', padding: '0.45rem 1rem', fontSize: '0.8rem' }}
              >
                Parse &amp; Import Recipes
              </button>
              {bulkImportStatus && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: '500' }}>
                  {bulkImportStatus}
                </span>
              )}
              {bulkImportError && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-error)', fontWeight: '500' }}>
                  {bulkImportError}
                </span>
              )}
            </div>
          )}
        </div>


        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Select Part Dropdown */}
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
            <label className="form-label" style={{ fontWeight: '600' }}>Select Submarine Part</label>
            <select
              className="form-select"
              value={selectedPartIdForRecipe}
              onChange={(e) => handleRecipePartSelect(e.target.value)}
              style={{ width: '100%', maxWidth: '400px' }}
            >
              <option value="">-- Choose a component --</option>
              {parts.filter(p => p.partType !== 'Materials').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.partType})
                </option>
              ))}
            </select>
          </div>

          {selectedPartIdForRecipe && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.5rem',
              marginTop: '0.5rem',
            }}>
              {/* Left Column: Current Recipe list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-gold-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recipe Ingredients
                </h4>

                {editingRecipeIngredients.length > 0 ? (
                  <div style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.05)',
                    overflow: 'hidden',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)', textAlign: 'left' }}>Item</th>
                          <th style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)', textAlign: 'right', width: '80px' }}>Quantity</th>
                          <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editingRecipeIngredients.map((ing) => (
                          <tr key={ing.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-title)', fontWeight: '500' }}>
                              {ing.name}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                              {ing.quantity}
                            </td>
                            <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                              <button
                                type="button"
                                className="ff-btn-danger"
                                onClick={() => handleRemoveIngredientFromRecipe(ing.name)}
                                style={{ padding: '0.2rem 0.4rem', height: '24px', display: 'inline-flex', alignItems: 'center' }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    border: '1px dashed rgba(197,160,89,0.15)',
                    borderRadius: '6px',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.82rem',
                    fontStyle: 'italic',
                  }}>
                    No ingredients in recipe. Add some ingredients on the right.
                  </div>
                )}

                {/* Save / Clear Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '1rem' }}>
                  <button
                    type="button"
                    className="ff-btn glow-active"
                    onClick={handleSaveRecipe}
                    disabled={savingRecipe}
                    style={{ flex: 1, height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                  >
                    {savingRecipe ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                    {savingRecipe ? 'Saving…' : 'Save Recipe'}
                  </button>
                </div>
                {recipeSuccess && (
                  <div style={{ color: 'var(--color-success)', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: '500' }}>
                    {recipeSuccess}
                  </div>
                )}
                {recipeError && (
                  <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: '500' }}>
                    {recipeError}
                  </div>
                )}
              </div>

              {/* Right Column: Add Ingredient Form */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                textAlign: 'left',
                background: 'rgba(255, 255, 255, 0.01)',
                border: '1px solid rgba(197,160,89,0.08)',
                padding: '1rem',
                borderRadius: '6px',
              }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-gold-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Add Ingredient
                </h4>

                {/* Manual Mode Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', height: '24px' }}>
                  <label className="toggle-container">
                    <input
                      type="checkbox"
                      style={{ display: 'none' }}
                      checked={recipeManualInput}
                      onChange={(e) => setRecipeManualInput(e.target.checked)}
                    />
                    <div className="toggle-switch"></div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Enter Custom Name (Manual)
                    </span>
                  </label>
                </div>

                {/* Ingredient Selector / Input */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ingredient Name</label>
                  {recipeManualInput ? (
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Shark Scale..."
                      value={recipeManualIngredientName}
                      onChange={(e) => setRecipeManualIngredientName(e.target.value)}
                    />
                  ) : (
                    <select
                      className="form-select"
                      value={newRecipeIngName}
                      onChange={(e) => setNewRecipeIngName(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      {sheetIngredients.length > 0 ? (
                        sheetIngredients.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))
                      ) : (
                        <option value="">-- No ingredients found --</option>
                      )}
                    </select>
                  )}
                  {!recipeManualInput && sheetIngredients.length === 0 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem', display: 'block' }}>
                      Tip: Enable custom name to type manually.
                    </span>
                  )}
                </div>

                {/* Quantity Input */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Quantity Required</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="ff-btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', height: '34px' }}
                      onClick={() => setNewRecipeIngQty(prev => String(Math.max(1, parseInt(prev, 10) - 1)))}
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={newRecipeIngQty}
                      onChange={(e) => setNewRecipeIngQty(e.target.value)}
                      style={{ flex: 1, textAlign: 'center' }}
                    />
                    <button
                      type="button"
                      className="ff-btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', height: '34px' }}
                      onClick={() => setNewRecipeIngQty(prev => String((parseInt(prev, 10) || 0) + 1))}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>

                {/* Add to recipe button */}
                <button
                  type="button"
                  className="ff-btn-secondary"
                  onClick={handleAddIngredientToRecipe}
                  style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                >
                  <Plus size={14} /> Add to Recipe
                </button>
              </div>
            </div>
          )}
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
                        key={discount.id + '-' + discount.threshold + '-' + discount.discountPercent}
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
                key={part.id + '-' + part.stock + '-' + part.price}
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

function parseSpreadsheetRecipes(text: string, parts: SubmarinePart[]): PartIngredient[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const recipes: PartIngredient[] = [];

  for (let i = 0; i < lines.length; i += 2) {
    const headerLine = lines[i];
    const qtyLine = lines[i + 1];
    if (!qtyLine) break;

    const headers = headerLine.split('\t').map(h => h.trim());
    const qties = qtyLine.split('\t').map(q => q.trim());

    const rawPartName = headers[0];
    if (!rawPartName) continue;

    // Normalize part name
    let cleanPartName = rawPartName
      .replace(/Pressure Hull/gi, 'Hull')
      .replace(/Coelananth/gi, 'Coelacanth')
      .trim();

    // Find the part ID
    const part = parts.find(p => p.name.toLowerCase() === cleanPartName.toLowerCase());
    if (!part) continue;

    const ingredientMap: Record<string, number> = {};

    const maxCols = Math.max(headers.length, qties.length);
    for (let col = 1; col < maxCols; col++) {
      const ingName = headers[col];
      const qtyStr = qties[col];
      if (!ingName || ingName.toLowerCase() === 'item quantity' || !qtyStr) continue;

      const qty = parseInt(qtyStr, 10);
      if (isNaN(qty) || qty <= 0) continue;

      const normalizedIngName = ingName.trim();
      let finalIngName = normalizedIngName;
      if (
        (normalizedIngName.toLowerCase() === 'whale-class' ||
         normalizedIngName.toLowerCase() === 'shark-class' ||
         normalizedIngName.toLowerCase() === 'unkiu-class' ||
         normalizedIngName.toLowerCase() === 'coelacanth-class' ||
         normalizedIngName.toLowerCase() === 'syldra-class')
      ) {
        finalIngName = `${normalizedIngName} ${part.partType}`;
      } else if (normalizedIngName.toLowerCase() === 'coelananth-class') {
        finalIngName = `Coelacanth-class ${part.partType}`;
      }

      const key = finalIngName.toLowerCase();
      const existingKey = Object.keys(ingredientMap).find(k => k.toLowerCase() === key);
      if (existingKey) {
        ingredientMap[existingKey] += qty;
      } else {
        ingredientMap[finalIngName] = qty;
      }
    }

    recipes.push({
      partId: part.id,
      partName: part.name,
      ingredients: Object.entries(ingredientMap).map(([name, quantity]) => ({
        name,
        quantity
      }))
    });
  }

  return recipes;
}
