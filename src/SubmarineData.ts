import { collection, getDocs, doc, updateDoc, writeBatch, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { SubmarinePart, SubmarineClass, PartType, BulkDiscount, ActiveCraft } from './types';

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
