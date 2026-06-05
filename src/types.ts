export interface SubmarinePart {
  id: string;
  partType: string;
  className: string;
  classKey: string;
  isModified: boolean;
  name: string;
  price: number;
  stock: number;
}

export interface SubmarineClass {
  key: string;
  name: string;
  basePrice: number;
  baseModifiedPrice: number;
}

export type PartType = 'Hull' | 'Stern' | 'Bow' | 'Bridge';

export type SelectionMap = Record<PartType, SubmarinePart | null>;

export type UpdateStatus = 'saving' | 'success' | 'error';

export type UpdatingMap = Record<string, UpdateStatus>;
