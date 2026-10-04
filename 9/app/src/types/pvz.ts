/**
 * PVZ.FLOW Data Types & Contracts
 * Version 2.1 (2026)
 */

export type Article = 
  | 'АК-10'
  | 'АК-15'
  | 'Г-3500'
  | 'Г-1800'
  | 'Г-800'
  | 'Ми-К'
  | 'Ми-П';

export type Category = 'АК' | 'Г' | 'Ми';

export interface ArticleInfo {
  article: Article;
  category: Category;
  hasBranding: boolean;
  weightKg: number;
  description: string;
}

export type ArrivalType = 'arrival' | 'return';

export interface ArrivalRecord {
  id: string;
  date: string; // YYYY-MM-DD
  article: Article;
  quantity: number;
  type: ArrivalType;
  note?: string;
  createdAt: string;
}

export interface ShipmentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  article: Article;
  quantity: number;
  supplyId?: string; // WB-GI-XXXXXXXXX for manually registered shipments
  source?: 'manual' | 'google' | 'import';
  createdAt: string;
}

export type AdjustmentKind = 'opening' | 'correction' | 'inventory';

export interface AdjustmentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  article: Article;
  quantity: number; // signed value
  kind: AdjustmentKind;
  position: 'beforeDay' | 'afterDay';
  reason: string;
  note?: string;
  sourceArrivalDate?: string; // для положительной технической капсулы
  createdAt: string;
}

export type OperatorName = 'Пузанов Д.В.' | 'Завалишин Д.Л.';

export interface ScheduleMap {
  [date: string]: OperatorName;
}

export interface SellerTariff {
  reception: number;
  branding: number;
  packaging: number;
  assembly: number;
  storage: number; // per unit-day
}

export interface OperatorTariff {
  reception: number;
  branding: number;
  packaging: number;
  assembly: number;
}

export interface Settings {
  pvzName: string;
  sellerName: string;
  reportDateFrom: string; // YYYY-MM-DD
  reportDateTo: string;   // YYYY-MM-DD
  freeStorageDays: number; // Бесплатный срок с даты создания капсулы
}

// 4.1 stock_daily
export interface DailyStockCell {
  balanceStart: number; // Было
  arrival: number;      // Поставка (приёмка + возвраты)
  shipment: number;     // Отгрузка
  adjustment?: number;  // Отдельное техническое событие, не услуга
  balanceEnd: number;   // Осталось
}

export interface DailyStockRow {
  date: string;
  byArticle: Record<Article, DailyStockCell>;
  totalArrival: number;
  totalShipment: number;
  totalBalanceEnd: number;
}

// 4.4 Capsule (View)
export interface CapsuleItem {
  id: string;
  article: Article;
  date: string;
  type: ArrivalType;
  initialQuantity: number;
  shippedQuantity: number;
  remainingQuantity: number;
  unitDaysInPeriod: number;
  storageCost: number;
  dailyBalances: Record<string, number>; // date -> remainder at end of day
}

// Fulfillment summary per article
export interface ArticleFulfillment {
  article: Article;
  receptionQty: number;
  receptionCost: number;
  returnsQty: number;
  assemblyQty: number;
  assemblyCost: number;
  brandingQty: number;
  brandingCost: number;
  packagingQty: number;
  packagingCost: number;
  storageUnitDays: number;
  storageCost: number;
  totalCost: number;
}

// Operator fulfillment work
export interface OperatorFulfillment {
  operator: OperatorName;
  workDaysCount: number;
  dates: string[];
  receptionQty: number;
  receptionPay: number;
  returnsQty: number;
  assemblyQty: number;
  assemblyPay: number;
  brandingQty: number;
  brandingPay: number;
  packagingQty: number;
  packagingPay: number;
  totalPay: number;
  byArticle: Record<Article, {
    reception: number;
    branding: number;
    packaging: number;
    assembly: number;
    total: number;
  }>;
}

// Negative stock check problem item
export interface ProblematicStockItem {
  date: string;
  article: Article;
  currentRemainder: number;
  projectedRemainder: number;
}
