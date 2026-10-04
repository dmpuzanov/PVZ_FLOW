import { Article, ArticleInfo, OperatorName, OperatorTariff, ScheduleMap, SellerTariff, Settings, ArrivalRecord, ShipmentRecord } from '../types/pvz';

export const ARTICLES_CONFIG: ArticleInfo[] = [
  {
    article: 'АК-10',
    category: 'АК',
    hasBranding: true,
    weightKg: 0.6,
    description: 'Артикул АК-10 (Категория АК, вес ~0.6 кг, брендирование ДА)',
  },
  {
    article: 'АК-15',
    category: 'АК',
    hasBranding: true,
    weightKg: 0.6,
    description: 'Артикул АК-15 (Категория АК, вес ~0.6 кг, брендирование ДА)',
  },
  {
    article: 'Г-3500',
    category: 'Г',
    hasBranding: true,
    weightKg: 5.7,
    description: 'Артикул Г-3500 (Категория Г, вес ~5.7 кг, брендирование ДА)',
  },
  {
    article: 'Г-1800',
    category: 'Г',
    hasBranding: true,
    weightKg: 3.0,
    description: 'Артикул Г-1800 (Категория Г, вес ~3.0 кг, брендирование ДА)',
  },
  {
    article: 'Г-800',
    category: 'Г',
    hasBranding: true,
    weightKg: 3.0,
    description: 'Артикул Г-800 (Категория Г, вес ~3.0 кг, брендирование ДА)',
  },
  {
    article: 'Ми-К',
    category: 'Ми',
    hasBranding: false,
    weightKg: 1.0,
    description: 'Артикул Ми-К (Категория Ми, вес ~1.0 кг, брендирование НЕТ)',
  },
  {
    article: 'Ми-П',
    category: 'Ми',
    hasBranding: false,
    weightKg: 1.0,
    description: 'Артикул Ми-П (Категория Ми, вес ~1.0 кг, брендирование НЕТ)',
  },
];

export const ALL_ARTICLES: Article[] = ARTICLES_CONFIG.map((a) => a.article);

export const ARTICLE_MAP = new Map<Article, ArticleInfo>(
  ARTICLES_CONFIG.map((a) => [a.article, a])
);

export const DEFAULT_SELLER_TARIFFS: Record<Article, SellerTariff> = {
  'АК-10': { reception: 10, branding: 10, packaging: 20, assembly: 10, storage: 0.36 },
  'АК-15': { reception: 10, branding: 10, packaging: 20, assembly: 10, storage: 0.36 },
  'Г-3500': { reception: 10, branding: 15, packaging: 35, assembly: 25, storage: 5.0 },
  'Г-1800': { reception: 10, branding: 10, packaging: 30, assembly: 15, storage: 5.0 },
  'Г-800': { reception: 10, branding: 10, packaging: 30, assembly: 15, storage: 5.0 },
  'Ми-К': { reception: 10, branding: 0, packaging: 20, assembly: 10, storage: 1.36 },
  'Ми-П': { reception: 10, branding: 0, packaging: 20, assembly: 10, storage: 0.16 },
};

export const DEFAULT_OPERATOR_TARIFFS: Record<Article, OperatorTariff> = {
  'АК-10': { reception: 1, branding: 3, packaging: 8, assembly: 1 },
  'АК-15': { reception: 1, branding: 3, packaging: 8, assembly: 1 },
  'Г-3500': { reception: 3, branding: 10, packaging: 21, assembly: 3 },
  'Г-1800': { reception: 2, branding: 5, packaging: 16, assembly: 2 },
  'Г-800': { reception: 2, branding: 5, packaging: 16, assembly: 2 },
  'Ми-К': { reception: 1, branding: 3, packaging: 8, assembly: 1 },
  'Ми-П': { reception: 1, branding: 3, packaging: 8, assembly: 1 },
};

export const DEFAULT_SETTINGS: Settings = {
  pvzName: 'ПВЗ Wildberries № 4082 «Центральный»',
  sellerName: 'ИП Смирнов А.Е. (WB Seller)',
  reportDateFrom: '2026-09-14',
  reportDateTo: '2026-09-20',
  freeStorageDays: 5,
};

export const DEMO_ARRIVALS: ArrivalRecord[] = [
  // 10.09.2026 initial batches
  { id: 'arr-1', date: '2026-09-10', article: 'АК-10', quantity: 125, type: 'arrival', note: 'Поставка №1 партия', createdAt: '2026-09-10T09:00:00.000Z' },
  { id: 'arr-2', date: '2026-09-10', article: 'АК-15', quantity: 100, type: 'arrival', note: 'Поставка №1 партия', createdAt: '2026-09-10T09:15:00.000Z' },
  { id: 'arr-3', date: '2026-09-10', article: 'Г-3500', quantity: 60, type: 'arrival', note: 'Поставка №1 партия', createdAt: '2026-09-10T09:30:00.000Z' },
  { id: 'arr-4', date: '2026-09-10', article: 'Г-1800', quantity: 125, type: 'arrival', note: 'Поставка №1 партия (Капсула 1)', createdAt: '2026-09-10T09:45:00.000Z' },
  { id: 'arr-5', date: '2026-09-10', article: 'Г-800', quantity: 80, type: 'arrival', note: 'Поставка №1 партия', createdAt: '2026-09-10T10:00:00.000Z' },
  { id: 'arr-6', date: '2026-09-10', article: 'Ми-К', quantity: 50, type: 'arrival', note: 'Поставка №1 партия', createdAt: '2026-09-10T10:15:00.000Z' },
  { id: 'arr-7', date: '2026-09-10', article: 'Ми-П', quantity: 120, type: 'arrival', note: 'Поставка №1 партия', createdAt: '2026-09-10T10:30:00.000Z' },
  // 14.09.2026 arrival & returns
  { id: 'arr-8', date: '2026-09-14', article: 'АК-10', quantity: 15, type: 'arrival', note: 'Допоставка селлера', createdAt: '2026-09-14T11:00:00.000Z' },
  { id: 'arr-9', date: '2026-09-14', article: 'Г-1800', quantity: 1, type: 'return', note: 'Возврат-невыкуп с ПВЗ клиента', createdAt: '2026-09-14T11:30:00.000Z' },
  { id: 'arr-10', date: '2026-09-14', article: 'Ми-К', quantity: 1, type: 'return', note: 'Возврат-невыкуп', createdAt: '2026-09-14T12:00:00.000Z' },
];

export const DEMO_SHIPMENTS: ShipmentRecord[] = [
  // 14.09.2026
  { id: 'ship-1', date: '2026-09-14', article: 'АК-10', quantity: 40, createdAt: '2026-09-14T16:00:00.000Z' },
  { id: 'ship-2', date: '2026-09-14', article: 'Г-1800', quantity: 19, createdAt: '2026-09-14T16:30:00.000Z' },
  // 15.09.2026
  { id: 'ship-3', date: '2026-09-15', article: 'АК-10', quantity: 7, createdAt: '2026-09-15T16:00:00.000Z' },
  { id: 'ship-4', date: '2026-09-15', article: 'Г-1800', quantity: 13, createdAt: '2026-09-15T16:30:00.000Z' },
  // 16.09.2026
  { id: 'ship-5', date: '2026-09-16', article: 'АК-10', quantity: 13, createdAt: '2026-09-16T16:00:00.000Z' },
  { id: 'ship-6', date: '2026-09-16', article: 'Г-1800', quantity: 13, createdAt: '2026-09-16T16:30:00.000Z' },
  // 17.09.2026
  { id: 'ship-7', date: '2026-09-17', article: 'АК-10', quantity: 10, createdAt: '2026-09-17T16:00:00.000Z' },
  { id: 'ship-8', date: '2026-09-17', article: 'Г-1800', quantity: 13, createdAt: '2026-09-17T16:30:00.000Z' },
  // 18.09.2026
  { id: 'ship-9', date: '2026-09-18', article: 'АК-10', quantity: 12, createdAt: '2026-09-18T16:00:00.000Z' },
  { id: 'ship-10', date: '2026-09-18', article: 'Г-1800', quantity: 15, createdAt: '2026-09-18T16:30:00.000Z' },
  // 19.09.2026
  { id: 'ship-11', date: '2026-09-19', article: 'АК-10', quantity: 8, createdAt: '2026-09-19T16:00:00.000Z' },
  { id: 'ship-12', date: '2026-09-19', article: 'Г-1800', quantity: 13, createdAt: '2026-09-19T16:30:00.000Z' },
  // 20.09.2026
  { id: 'ship-13', date: '2026-09-20', article: 'АК-10', quantity: 5, createdAt: '2026-09-20T16:00:00.000Z' },
];

export const DEMO_SCHEDULE: ScheduleMap = {
  '2026-09-10': 'Пузанов Д.В.',
  '2026-09-11': 'Пузанов Д.В.',
  '2026-09-12': 'Завалишин Д.Л.',
  '2026-09-13': 'Завалишин Д.Л.',
  '2026-09-14': 'Пузанов Д.В.',
  '2026-09-15': 'Пузанов Д.В.',
  '2026-09-16': 'Завалишин Д.Л.',
  '2026-09-17': 'Завалишин Д.Л.',
  '2026-09-18': 'Пузанов Д.В.',
  '2026-09-19': 'Пузанов Д.В.',
  '2026-09-20': 'Завалишин Д.Л.',
};
