// ─── Recipes service ──────────────────────────────────────────────────────────

export type PartType = 'Hull' | 'Stern' | 'Bow' | 'Bridge' | 'Materials';

export type WhereToBuy = 'Market' | 'Craft' | 'NPC';

export interface ApiMaterial {
  id: string;
  name: string;
  itemId: number | null;
  desiredQuantity: number;
  currentStock: number;
  marketPrice: number | null;
  myPrice: number | null;
  npcPrice: number | null;
  whereToBuy: WhereToBuy;
  category: 'crafting' | 'repair';
  updatedAt: string;
}

export interface ApiPartMaterial {
  id: number;
  quantity: number;
  material: ApiMaterial;
}

export interface ApiSubmarinePart {
  id: string;
  name: string;
  itemId: number | null;
  partType: PartType;
  className: string;
  classKey: string;
  isModified: boolean;
  price: number;
  stock: number;
  desiredStock: number;
  updatedAt: string;
  materials?: ApiPartMaterial[];
}

// ─── Orders service ───────────────────────────────────────────────────────────

export interface ApiDiscount {
  id: string;
  threshold: number;
  discountPercent: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'finished'
  | 'fulfilled'
  | 'cancelled';

export interface ApiOrderItem {
  id: number;
  partName: string;
  partType: PartType | string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  buildName: string | null;
  part?: ApiSubmarinePart;
}

export interface ApiOrder {
  id: string;
  orderCode: string;
  clientName: string;
  contactInfo: string | null;
  rawText: string | null;
  subtotal: number;
  discountPct: string;
  discountAmt: number;
  total: number;
  status: OrderStatus;
  notes: string | null;
  fulfillmentDt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ApiOrderItem[];
}

export interface CreateOrderItemDto {
  partId: string;
  quantity: number;
  buildName?: string;
}

export interface CreateOrderDto {
  clientName: string;
  contactInfo?: string;
  notes?: string;
  fulfillmentDt?: string;
  items: CreateOrderItemDto[];
}

export interface InProgressOrder {
  id: string;
  orderCode: string;
  clientName: string;
  contactInfo: string | null;
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: Array<{
    partId: string;
    partName: string;
    partType: string | null;
    buildName: string | null;
    quantity: number;
    stock: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

// ─── Inventory service ────────────────────────────────────────────────────────

export interface ApiClaim {
  id?: number;
  claimedFor: string;
  quantity: number;
}

export interface ApiMissingMaterial {
  id: string;
  name: string;
  itemId: number | null;
  currentStock: number;
  desiredQuantity: number;
  deficit: number;
  whereToBuy: WhereToBuy;
  category: 'crafting' | 'repair';
  updatedAt: string;
  claimed: number;
  remaining: number;
  claims: ApiClaim[];
}

// ─── Prices service ───────────────────────────────────────────────────────────

export interface ApiPriceEntry {
  id: string;
  name: string;
  itemId: number | null;
  marketPrice: number | null;
  myPrice: number | null;
  npcPrice: number | null;
  effectivePrice: number | null;
  whereToBuy: WhereToBuy;
  updatedAt: string;
}

export interface ApiPriceSettings {
  world: string;
  source: string;
}
