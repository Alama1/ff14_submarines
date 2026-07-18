import { collection, getDocs, doc, updateDoc, writeBatch, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { SubmarinePart, SubmarineClass, PartType, BulkDiscount, ActiveCraft, Order, OrderItem, PartIngredient } from './types';

export const PART_TYPES: PartType[] = ['Hull', 'Stern', 'Bow', 'Bridge'];
export const ALL_PART_TYPES: PartType[] = ['Hull', 'Stern', 'Bow', 'Bridge', 'Materials'];

export const CLASSES: SubmarineClass[] = [
  { key: 'shark', name: 'Shark-class', basePrice: 120000, baseModifiedPrice: 650000 },
  { key: 'unkiu', name: 'Unkiu-class', basePrice: 180000, baseModifiedPrice: 750000 },
  { key: 'whale', name: 'Whale-class', basePrice: 240000, baseModifiedPrice: 850000 },
  { key: 'coelacanth', name: 'Coelacanth-class', basePrice: 320000, baseModifiedPrice: 1100000 },
  { key: 'syldra', name: 'Syldra-class', basePrice: 420000, baseModifiedPrice: 1450000 },
];

export function generateDefaultParts(): SubmarinePart[] {
  const parts: SubmarinePart[] = [];

  PART_TYPES.forEach((type) => {
    CLASSES.forEach((cls) => {
      parts.push({
        id: `${type.toLowerCase()}-${cls.key}-normal`,
        partType: type,
        className: cls.name,
        classKey: cls.key,
        isModified: false,
        name: `${cls.name} ${type}`,
        price: cls.basePrice,
        stock: 2,
      });

      parts.push({
        id: `${type.toLowerCase()}-${cls.key}-modified`,
        partType: type,
        className: `Modified ${cls.name}`,
        classKey: cls.key,
        isModified: true,
        name: `Modified ${cls.name} ${type}`,
        price: cls.baseModifiedPrice,
        stock: 0,
      });
    });
  });

  parts.push({
    id: 'materials-magitek',
    partType: 'Materials',
    className: 'Magitek Repair Materials',
    classKey: 'magitek',
    isModified: false,
    name: 'Magitek Repair Materials',
    price: 1500,
    stock: 99,
  });

  return parts;
}

export function formatGil(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount) + ' Gil';
}

const LOCAL_STORAGE_KEY = 'ff14_submarine_parts_stock';

export async function loadSubmarineParts(): Promise<SubmarinePart[]> {
  if (isFirebaseConfigured && db) {
    try {
      const partsCol = collection(db, 'submarine_parts');
      const partsSnapshot = await getDocs(partsCol);

      if (!partsSnapshot.empty) {
        let partsList: SubmarinePart[] = [];
        partsSnapshot.forEach((docSnap) => {
          partsList.push({ id: docSnap.id, ...(docSnap.data() as Omit<SubmarinePart, 'id'>) });
        });
        
        const defaults = generateDefaultParts();
        const missing = defaults.filter((d) => !partsList.some((p) => p.id === d.id));
        if (missing.length > 0) {
          partsList = [...partsList, ...missing];
          saveAllParts(partsList).catch(console.error);
        }
        
        return sortParts(partsList);
      } else {
        const defaults = generateDefaultParts();
        await saveAllPartsToFirestore(defaults);
        return defaults;
      }
    } catch (e) {
      console.error(e);
    }
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      let partsList = JSON.parse(stored) as SubmarinePart[];
      const defaults = generateDefaultParts();
      const missing = defaults.filter((d) => !partsList.some((p) => p.id === d.id));
      if (missing.length > 0) {
        partsList = [...partsList, ...missing];
        saveAllParts(partsList).catch(console.error);
      }
      return sortParts(partsList);
    } catch (e) {
      console.error(e);
    }
  }

  const defaults = generateDefaultParts();
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

export async function savePartUpdate(
  partId: string,
  updatedFields: Partial<SubmarinePart>
): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const partDocRef = doc(db, 'submarine_parts', partId);
      await updateDoc(partDocRef, updatedFields as Record<string, unknown>);
      return true;
    } catch (e) {
      console.error(e);
    }
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      const parts: SubmarinePart[] = JSON.parse(stored);
      const index = parts.findIndex((p) => p.id === partId);
      if (index !== -1) {
        parts[index] = { ...parts[index], ...updatedFields };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parts));
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return false;
}

export async function saveAllParts(parts: SubmarinePart[]): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      await saveAllPartsToFirestore(parts);
      return true;
    } catch (e) {
      console.error(e);
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parts));
  return true;
}

function sortParts(parts: SubmarinePart[]): SubmarinePart[] {
  const typeOrder: Record<string, number> = { Hull: 0, Stern: 1, Bow: 2, Bridge: 3, Materials: 4 };
  const classOrder: Record<string, number> = {
    shark: 0,
    unkiu: 1,
    whale: 2,
    coelacanth: 3,
    syldra: 4,
    magitek: 5,
  };

  return [...parts].sort((a, b) => {
    if (typeOrder[a.partType] !== typeOrder[b.partType]) {
      return typeOrder[a.partType] - typeOrder[b.partType];
    }
    if (classOrder[a.classKey] !== classOrder[b.classKey]) {
      return classOrder[a.classKey] - classOrder[b.classKey];
    }
    return (a.isModified ? 1 : 0) - (b.isModified ? 1 : 0);
  });
}

async function saveAllPartsToFirestore(parts: SubmarinePart[]): Promise<void> {
  if (!db) return;
  const batch = writeBatch(db);
  parts.forEach((part) => {
    const docRef = doc(db!, 'submarine_parts', part.id);
    const { id, ...data } = part;
    batch.set(docRef, data, { merge: true });
  });
  await batch.commit();
}

export function generateDefaultDiscounts(): BulkDiscount[] {
  return [
    { id: 'discount-20', threshold: 20, discountPercent: 5 },
    { id: 'discount-48', threshold: 48, discountPercent: 7 },
    { id: 'discount-100', threshold: 100, discountPercent: 10 },
  ];
}

export function sortDiscounts(discounts: BulkDiscount[]): BulkDiscount[] {
  return [...discounts].sort((a, b) => a.threshold - b.threshold);
}

const DISCOUNTS_LOCAL_STORAGE_KEY = 'ff14_submarine_bulk_discounts';

export async function loadBulkDiscounts(): Promise<BulkDiscount[]> {
  if (isFirebaseConfigured && db) {
    try {
      const discountsCol = collection(db, 'bulk_discounts');
      const snapshot = await getDocs(discountsCol);
      if (!snapshot.empty) {
        const list: BulkDiscount[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as Omit<BulkDiscount, 'id'>) });
        });
        return sortDiscounts(list);
      } else {
        const defaults = generateDefaultDiscounts();
        await saveAllDiscountsToFirestore(defaults);
        return defaults;
      }
    } catch (e) {
      console.error('Error loading discounts from Firestore:', e);
    }
  }

  const stored = localStorage.getItem(DISCOUNTS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      return sortDiscounts(JSON.parse(stored) as BulkDiscount[]);
    } catch (e) {
      console.error('Error parsing discounts from localStorage:', e);
    }
  }

  const defaults = generateDefaultDiscounts();
  localStorage.setItem(DISCOUNTS_LOCAL_STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

export async function saveBulkDiscount(discount: BulkDiscount): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'bulk_discounts', discount.id);
      const { id, ...data } = discount;
      await setDoc(docRef, data, { merge: true });
      return true;
    } catch (e) {
      console.error('Error saving discount to Firestore:', e);
    }
  }

  const stored = localStorage.getItem(DISCOUNTS_LOCAL_STORAGE_KEY);
  let discounts: BulkDiscount[] = [];
  if (stored) {
    try {
      discounts = JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
  }
  const idx = discounts.findIndex(d => d.id === discount.id);
  if (idx !== -1) {
    discounts[idx] = discount;
  } else {
    discounts.push(discount);
  }
  localStorage.setItem(DISCOUNTS_LOCAL_STORAGE_KEY, JSON.stringify(discounts));
  return true;
}

export async function deleteBulkDiscount(discountId: string): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'bulk_discounts', discountId);
      await deleteDoc(docRef);
      return true;
    } catch (e) {
      console.error('Error deleting discount from Firestore:', e);
    }
  }

  const stored = localStorage.getItem(DISCOUNTS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      let discounts: BulkDiscount[] = JSON.parse(stored);
      discounts = discounts.filter(d => d.id !== discountId);
      localStorage.setItem(DISCOUNTS_LOCAL_STORAGE_KEY, JSON.stringify(discounts));
      return true;
    } catch (e) {
      console.error('Error deleting discount from localStorage:', e);
    }
  }
  return false;
}

export async function saveAllDiscounts(discounts: BulkDiscount[]): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      await saveAllDiscountsToFirestore(discounts);
      return true;
    } catch (e) {
      console.error('Error saving all discounts to Firestore:', e);
    }
  }

  localStorage.setItem(DISCOUNTS_LOCAL_STORAGE_KEY, JSON.stringify(discounts));
  return true;
}

async function saveAllDiscountsToFirestore(discounts: BulkDiscount[]): Promise<void> {
  if (!db) return;
  const batch = writeBatch(db);
  discounts.forEach((discount) => {
    const docRef = doc(db!, 'bulk_discounts', discount.id);
    const { id, ...data } = discount;
    batch.set(docRef, data, { merge: true });
  });
  await batch.commit();
}

const ACTIVE_CRAFTS_LOCAL_STORAGE_KEY = 'ff14_submarine_active_crafts';

export async function loadActiveCrafts(): Promise<ActiveCraft[]> {
  if (isFirebaseConfigured && db) {
    try {
      const activeCol = collection(db, 'active_crafts');
      const snapshot = await getDocs(activeCol);
      const list: ActiveCraft[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Omit<ActiveCraft, 'id'>;
        list.push({ id: docSnap.id, ...data });
      });
      return list;
    } catch (e) {
      console.error('Error loading active crafts from Firestore:', e);
    }
  }

  const stored = localStorage.getItem(ACTIVE_CRAFTS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as ActiveCraft[];
    } catch (e) {
      console.error('Error parsing active crafts from localStorage:', e);
    }
  }
  return [];
}

// Saves a new craft claim — always creates a new document (multi-claimer support).
// Returns the new document ID, or null on failure.
export async function saveActiveCraft(
  craft: Omit<ActiveCraft, 'id'>
): Promise<string | null> {
  if (isFirebaseConfigured && db) {
    try {
      const activeCol = collection(db, 'active_crafts');
      const docRef = await addDoc(activeCol, craft);
      return docRef.id;
    } catch (e) {
      console.error('Error saving active craft to Firestore:', e);
      return null;
    }
  }

  // localStorage fallback
  const stored = localStorage.getItem(ACTIVE_CRAFTS_LOCAL_STORAGE_KEY);
  let crafts: ActiveCraft[] = [];
  if (stored) {
    try {
      crafts = JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
  }
  const newId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  crafts.push({ id: newId, ...craft });
  localStorage.setItem(ACTIVE_CRAFTS_LOCAL_STORAGE_KEY, JSON.stringify(crafts));
  return newId;
}

export async function deleteActiveCraft(craftId: string): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'active_crafts', craftId);
      await deleteDoc(docRef);
      return true;
    } catch (e) {
      console.error('Error deleting active craft from Firestore:', e);
    }
  }

  const stored = localStorage.getItem(ACTIVE_CRAFTS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      let crafts: ActiveCraft[] = JSON.parse(stored);
      crafts = crafts.filter(c => c.id !== craftId);
      localStorage.setItem(ACTIVE_CRAFTS_LOCAL_STORAGE_KEY, JSON.stringify(crafts));
      return true;
    } catch (e) {
      console.error('Error deleting active craft from localStorage:', e);
    }
  }
  return false;
}

export async function deleteAllActiveCrafts(): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const activeCol = collection(db, 'active_crafts');
      const snapshot = await getDocs(activeCol);
      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
      return true;
    } catch (e) {
      console.error('Error deleting all active crafts from Firestore:', e);
    }
  }

  localStorage.removeItem(ACTIVE_CRAFTS_LOCAL_STORAGE_KEY);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────────────────────

const ORDERS_LOCAL_STORAGE_KEY = 'ff14_submarine_orders';

export async function loadOrders(): Promise<Order[]> {
  if (isFirebaseConfigured && db) {
    try {
      const ordersCol = collection(db, 'orders');
      const snapshot = await getDocs(ordersCol);
      const list: Order[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as Omit<Order, 'id'>) });
      });
      return list.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Error loading orders from Firestore:', e);
    }
  }

  const stored = localStorage.getItem(ORDERS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      const list: Order[] = JSON.parse(stored);
      return list.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Error parsing orders from localStorage:', e);
    }
  }
  return [];
}

export async function saveOrder(order: Omit<Order, 'id'>): Promise<string | null> {
  if (isFirebaseConfigured && db) {
    try {
      const ordersCol = collection(db, 'orders');
      const docRef = await addDoc(ordersCol, order);
      return docRef.id;
    } catch (e) {
      console.error('Error saving order to Firestore:', e);
      return null;
    }
  }

  // localStorage fallback
  const stored = localStorage.getItem(ORDERS_LOCAL_STORAGE_KEY);
  let orders: Order[] = [];
  if (stored) {
    try { orders = JSON.parse(stored); } catch { /* ignore */ }
  }
  const newId = `local-order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  orders.push({ id: newId, ...order });
  localStorage.setItem(ORDERS_LOCAL_STORAGE_KEY, JSON.stringify(orders));
  return newId;
}

export async function updateOrder(orderId: string, fields: Partial<Omit<Order, 'id'>>): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'orders', orderId);
      await updateDoc(docRef, { ...fields, updatedAt: Date.now() } as Record<string, unknown>);
      return true;
    } catch (e) {
      console.error('Error updating order in Firestore:', e);
    }
  }

  const stored = localStorage.getItem(ORDERS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      let orders: Order[] = JSON.parse(stored);
      orders = orders.map((o) =>
        o.id === orderId ? { ...o, ...fields, updatedAt: Date.now() } : o
      );
      localStorage.setItem(ORDERS_LOCAL_STORAGE_KEY, JSON.stringify(orders));
      return true;
    } catch (e) {
      console.error('Error updating order in localStorage:', e);
    }
  }
  return false;
}

export async function deleteOrder(orderId: string): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'orders', orderId);
      await deleteDoc(docRef);
      return true;
    } catch (e) {
      console.error('Error deleting order from Firestore:', e);
    }
  }

  const stored = localStorage.getItem(ORDERS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      let orders: Order[] = JSON.parse(stored);
      orders = orders.filter((o) => o.id !== orderId);
      localStorage.setItem(ORDERS_LOCAL_STORAGE_KEY, JSON.stringify(orders));
      return true;
    } catch (e) {
      console.error('Error deleting order from localStorage:', e);
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order text parser
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedOrderResult {
  items: OrderItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  error?: string;
}

/**
 * Parses the Discord order text produced by SetBuilder into structured data.
 *
 * Expected format (one or more builds):
 *   --- FFXIV Submarine Order Request ---
 *
 *   [Build 1]
 *   Hull: Whale-class Hull ×3 — 720,000 Gil
 *   Stern: Shark-class Stern — 120,000 Gil
 *   Extra: Magitek Repair Materials ×5 — 7,500 Gil
 *
 *   ------------------------------------
 *   Subtotal: 847,500 Gil
 *   Bulk Discount (5% for 80+ parts): -42,375 Gil
 *   Total Price: 805,125 Gil
 */
export function parseOrderText(
  text: string,
  parts: SubmarinePart[]
): ParsedOrderResult {
  if (!text.trim()) {
    return { items: [], subtotal: 0, discountPercent: 0, discountAmount: 0, total: 0, error: 'Empty text.' };
  }

  const lines = text.split('\n').map((l) => l.trim());

  // ── Helper to strip Gil formatting ──────────────────────────────────────
  const parseGil = (raw: string): number => {
    return parseInt(raw.replace(/[,\s]/g, '').replace(/Gil/i, ''), 10) || 0;
  };

  // ── Part name → part ID lookup ──────────────────────────────────────────
  const findPartId = (partName: string): string => {
    const exact = parts.find((p) => p.name === partName);
    if (exact) return exact.id;
    const lower = partName.toLowerCase();
    const ci = parts.find((p) => p.name.toLowerCase() === lower);
    if (ci) return ci.id;
    return '';
  };

  // ── Line patterns ────────────────────────────────────────────────────────
  // Matches: "Hull: Whale-class Hull ×3 — 720,000 Gil"
  const itemLineRe = /^(Hull|Stern|Bow|Bridge|Extra):\s+(.+?)(?:\s+×(\d+))?\s+[—\-]\s+([\d,]+)\s*Gil$/i;
  // Matches: "[Build 1]" or "[My Set]"
  const buildHeaderRe = /^\[(.+)\]$/;
  // Footer patterns
  const subtotalRe = /^Subtotal:\s+([\d,]+)\s*Gil$/i;
  const discountRe = /^Bulk Discount\s*\((\d+(?:\.\d+)?)%[^)]*\):\s*-?([\d,]+)\s*Gil$/i;
  const totalRe = /^Total Price:\s+([\d,]+)\s*Gil$/i;

  const items: OrderItem[] = [];
  let currentBuildName = 'Build 1';
  let subtotal = 0;
  let discountPercent = 0;
  let discountAmount = 0;
  let total = 0;
  let foundAnyItem = false;

  for (const line of lines) {
    if (!line || line.startsWith('---') || line.startsWith('====')) continue;

    // Build header
    const buildMatch = line.match(buildHeaderRe);
    if (buildMatch) {
      currentBuildName = buildMatch[1];
      continue;
    }

    // Item line
    const itemMatch = line.match(itemLineRe);
    if (itemMatch) {
      const [, typeRaw, partName, qtyStr, lineTotalStr] = itemMatch;
      const partType = typeRaw.toLowerCase() === 'extra' ? 'Materials' : typeRaw;
      const qty = qtyStr ? parseInt(qtyStr, 10) : 1;
      const lineTotal = parseGil(lineTotalStr);
      const unitPrice = qty > 0 ? Math.round(lineTotal / qty) : lineTotal;
      const partId = findPartId(partName.trim());

      items.push({
        partId,
        partName: partName.trim(),
        partType,
        quantity: qty,
        unitPrice,
        lineTotal,
        buildName: currentBuildName,
      });
      foundAnyItem = true;
      continue;
    }

    // Sets multiplier line — informational only, skip
    if (/^Sets:\s+×\d+$/i.test(line)) continue;

    // Footer lines
    const subtotalMatch = line.match(subtotalRe);
    if (subtotalMatch) { subtotal = parseGil(subtotalMatch[1]); continue; }

    const discountMatch = line.match(discountRe);
    if (discountMatch) {
      discountPercent = parseFloat(discountMatch[1]);
      discountAmount = parseGil(discountMatch[2]);
      continue;
    }

    const totalMatch = line.match(totalRe);
    if (totalMatch) { total = parseGil(totalMatch[1]); continue; }
  }

  if (!foundAnyItem) {
    return {
      items: [],
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      total: 0,
      error: 'No order items found. Make sure you pasted the full order text from the Set Builder.',
    };
  }

  // If subtotal wasn't in the text, derive it from items
  if (subtotal === 0) {
    subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  }
  // If total wasn't in the text, derive it
  if (total === 0) {
    total = subtotal - discountAmount;
  }

  return { items, subtotal, discountPercent, discountAmount, total };
}

// ──────────────────────────────────────────────────────────────────────────────
// Part Ingredient Recipes
// ──────────────────────────────────────────────────────────────────────────────

const PART_INGREDIENTS_LOCAL_STORAGE_KEY = 'ff14_submarine_part_ingredients';

/** Load all part ingredient recipes from Firestore (or localStorage fallback). */
export async function loadPartIngredients(): Promise<PartIngredient[]> {
  if (isFirebaseConfigured && db) {
    try {
      const col = collection(db, 'part_ingredients');
      const snapshot = await getDocs(col);
      const list: PartIngredient[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ partId: docSnap.id, ...(docSnap.data() as Omit<PartIngredient, 'partId'>) });
      });
      return list;
    } catch (e) {
      console.error('Error loading part ingredients from Firestore:', e);
    }
  }

  const stored = localStorage.getItem(PART_INGREDIENTS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as PartIngredient[];
    } catch (e) {
      console.error('Error parsing part ingredients from localStorage:', e);
    }
  }
  return [];
}

/** Create or overwrite the ingredient recipe for a part. */
export async function savePartIngredient(recipe: PartIngredient): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'part_ingredients', recipe.partId);
      const { partId, ...data } = recipe;
      await setDoc(docRef, data, { merge: false });
      return true;
    } catch (e) {
      console.error('Error saving part ingredient to Firestore:', e);
      return false;
    }
  }

  // localStorage fallback
  const stored = localStorage.getItem(PART_INGREDIENTS_LOCAL_STORAGE_KEY);
  let list: PartIngredient[] = [];
  if (stored) {
    try { list = JSON.parse(stored); } catch { /* ignore */ }
  }
  const idx = list.findIndex((r) => r.partId === recipe.partId);
  if (idx !== -1) {
    list[idx] = recipe;
  } else {
    list.push(recipe);
  }
  localStorage.setItem(PART_INGREDIENTS_LOCAL_STORAGE_KEY, JSON.stringify(list));
  return true;
}

/** Delete the ingredient recipe for a part. */
export async function deletePartIngredient(partId: string): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'part_ingredients', partId);
      await deleteDoc(docRef);
      return true;
    } catch (e) {
      console.error('Error deleting part ingredient from Firestore:', e);
      return false;
    }
  }

  const stored = localStorage.getItem(PART_INGREDIENTS_LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      let list: PartIngredient[] = JSON.parse(stored);
      list = list.filter((r) => r.partId !== partId);
      localStorage.setItem(PART_INGREDIENTS_LOCAL_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('Error deleting part ingredient from localStorage:', e);
    }
  }
  return false;
}
