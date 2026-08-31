import { PartType } from '../api/types';

export const PART_TYPES: PartType[] = ['Hull', 'Stern', 'Bow', 'Bridge'];
export const ALL_PART_TYPES: PartType[] = ['Hull', 'Stern', 'Bow', 'Bridge', 'Materials'];

export function formatGil(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount) + ' Gil';
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount);
}

/** Sorts parts into a stable builder order: type, then class, then modified. */
export function sortParts<T extends { partType: string; classKey: string; isModified: boolean }>(
  parts: T[]
): T[] {
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
      return (typeOrder[a.partType] ?? 9) - (typeOrder[b.partType] ?? 9);
    }
    if (classOrder[a.classKey] !== classOrder[b.classKey]) {
      return (classOrder[a.classKey] ?? 9) - (classOrder[b.classKey] ?? 9);
    }
    return (a.isModified ? 1 : 0) - (b.isModified ? 1 : 0);
  });
}
