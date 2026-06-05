import { collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { SubmarinePart, SubmarineClass, PartType } from './types';

export const PART_TYPES: PartType[] = ['Hull', 'Stern', 'Bow', 'Bridge'];

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
        const partsList: SubmarinePart[] = [];
        partsSnapshot.forEach((docSnap) => {
          partsList.push({ id: docSnap.id, ...(docSnap.data() as Omit<SubmarinePart, 'id'>) });
        });
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
      return sortParts(JSON.parse(stored) as SubmarinePart[]);
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
  const typeOrder: Record<string, number> = { Hull: 0, Stern: 1, Bow: 2, Bridge: 3 };
  const classOrder: Record<string, number> = {
    shark: 0,
    unkiu: 1,
    whale: 2,
    coelacanth: 3,
    syldra: 4,
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
