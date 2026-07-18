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

// ─── Ingredient recipes ───────────────────────────────────────────────────────

export interface Ingredient {
  /** Must match the 'ingredient' field from the Google Sheets API (case-insensitive). */
  name: string;
  quantity: number;
}

export interface PartIngredient {
  partId: string;     // matches SubmarinePart.id
  partName: string;   // human-readable label
  ingredients: Ingredient[];
}

// ─── Live stock API shape (same as ForCrafters) ───────────────────────────────

export interface CrafterItem {
  ingredient: string;
  totalQty: number;
  stock: number;
  missing: number;
  whereToBuy: 'Market' | 'Crafting' | string;
  pricePerUnit: number;
  totalPrice: number;
}

export interface StockApiResponse {
  items: CrafterItem[];
  grandTotal: number;
  updatedAt: string;
  error?: string;
}

export interface SubmarineClass {
  key: string;
  name: string;
  basePrice: number;
  baseModifiedPrice: number;
}

export type PartType = 'Hull' | 'Stern' | 'Bow' | 'Bridge' | 'Materials';

export type SelectionMap = Record<PartType, SubmarinePart | null>;

export type UpdateStatus = 'saving' | 'success' | 'error';

export type UpdatingMap = Record<string, UpdateStatus>;

export interface BulkDiscount {
  id: string;
  threshold: number;
  discountPercent: number;
}

export interface ActiveCraft {
  id: string;        // Firestore auto-generated document ID
  ingredient: string; // name of the ingredient being crafted
  quantity: number;
  claimedBy?: string;
}

export interface OrderItem {
  partId: string;      // matched submarine part ID (empty if unmatched)
  partName: string;    // full part name as parsed from text
  partType: string;    // Hull | Stern | Bow | Bridge | Materials
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  buildName: string;   // e.g. "Build 1"
}

export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Order {
  id: string;             // Firestore auto-generated document ID
  clientName: string;     // entered by admin
  rawText: string;        // original pasted Discord order text
  items: OrderItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  status: OrderStatus;
  createdAt: number;      // Unix timestamp ms
  updatedAt: number;
  notes: string;
  fulfillmentDate: string; // 'ASAP' or date string 'YYYY-MM-DD'
}
