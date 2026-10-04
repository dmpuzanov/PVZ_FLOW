import {
  ALL_ARTICLES,
  ARTICLE_MAP,
} from '../constants/initialData';
import {
  Article,
  ArticleFulfillment,
  ArrivalRecord,
  AdjustmentRecord,
  CapsuleItem,
  DailyStockCell,
  DailyStockRow,
  OperatorFulfillment,
  OperatorName,
  OperatorTariff,
  ProblematicStockItem,
  ScheduleMap,
  SellerTariff,
  Settings,
  ShipmentRecord,
} from '../types/pvz';

/**
 * Format ISO date string (YYYY-MM-DD) to Russian short display (DD.MM.YYYY or DD.MM)
 */
export function formatDateRu(dateStr: string, includeYear = true): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return includeYear ? `${day}.${month}.${year}` : `${day}.${month}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(val: number): string {
  return new Intl.NumberFormat('ru-RU').format(val);
}

/**
 * Generates an array of contiguous dates [from, to] inclusive.
 */
export function getDateRange(fromStr: string, toStr: string): string[] {
  if (!fromStr || !toStr) return [];
  const start = new Date(fromStr);
  const end = new Date(toStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  if (start > end) return [fromStr];

  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Get all relevant dates for Matrix:
 * Unions all dates with arrivals, shipments, and the report range.
 */
export function getAllMatrixDates(
  arrivals: ArrivalRecord[],
  shipments: ShipmentRecord[],
  settings: Settings
): string[] {
  const dateSet = new Set<string>();

  // Add dates from settings range
  if (settings.reportDateFrom && settings.reportDateTo) {
    const range = getDateRange(settings.reportDateFrom, settings.reportDateTo);
    range.forEach((d) => dateSet.add(d));
  }

  // Add dates from arrivals
  arrivals.forEach((a) => {
    if (a.date) dateSet.add(a.date);
  });

  // Add dates from shipments
  shipments.forEach((s) => {
    if (s.date) dateSet.add(s.date);
  });

  if (dateSet.size === 0) {
    const today = new Date().toISOString().split('T')[0];
    dateSet.add(today);
  }

  const sorted = Array.from(dateSet).sort();
  // Fill any gaps so the matrix is continuous from min to max date
  const minDate = sorted[0];
  const maxDate = sorted[sorted.length - 1];
  return getDateRange(minDate, maxDate);
}

/**
 * 3.1 - 3.4 & 4.1: Calculate Matrix (stock_daily)
 * Invariant: balanceEnd = balanceStart + arrival - shipment
 * Invariant: balanceStart(day N) = balanceEnd(day N - 1)
 */
export function calculateMatrix(
  dates: string[],
  arrivals: ArrivalRecord[],
  shipments: ShipmentRecord[],
  adjustments: AdjustmentRecord[] = []
): DailyStockRow[] {
  // Group arrivals by date and article
  const arrivalSumMap = new Map<string, number>();
  arrivals.forEach((arr) => {
    const key = `${arr.date}_${arr.article}`;
    arrivalSumMap.set(key, (arrivalSumMap.get(key) || 0) + arr.quantity);
  });

  // Group shipments by date and article
  const shipmentSumMap = new Map<string, number>();
  shipments.forEach((shp) => {
    const key = `${shp.date}_${shp.article}`;
    shipmentSumMap.set(key, (shipmentSumMap.get(key) || 0) + shp.quantity);
  });

  // Корректировки остаются отдельными событиями и никогда не входят в услуги.
  const adjustmentSumMap = new Map<string, number>();
  const openingMap = new Map<Article, number>();
  adjustments.forEach((adj) => {
    if (adj.kind === 'opening') {
      openingMap.set(adj.article, (openingMap.get(adj.article) || 0) + adj.quantity);
    } else {
      const key = `${adj.date}_${adj.article}`;
      adjustmentSumMap.set(key, (adjustmentSumMap.get(key) || 0) + adj.quantity);
    }
  });

  // Running balance for each article starts from explicit opening events.
  const runningEnd = new Map<Article, number>();
  ALL_ARTICLES.forEach((art) => runningEnd.set(art, openingMap.get(art) || 0));

  const rows: DailyStockRow[] = [];

  for (const date of dates) {
    const byArticle: Record<Article, DailyStockCell> = {} as any;
    let dayTotalArrival = 0;
    let dayTotalShipment = 0;
    let dayTotalEnd = 0;

    for (const art of ALL_ARTICLES) {
      const balanceStart = runningEnd.get(art) || 0;
      const arrival = arrivalSumMap.get(`${date}_${art}`) || 0;
      const shipment = shipmentSumMap.get(`${date}_${art}`) || 0;
      const adjustment = adjustmentSumMap.get(`${date}_${art}`) || 0;
      const balanceEnd = balanceStart + arrival - shipment + adjustment;

      runningEnd.set(art, balanceEnd);

      byArticle[art] = {
        balanceStart,
        arrival,
        shipment,
        adjustment,
        balanceEnd,
      };

      dayTotalArrival += arrival;
      dayTotalShipment += shipment;
      dayTotalEnd += balanceEnd;
    }

    rows.push({
      date,
      byArticle,
      totalArrival: dayTotalArrival,
      totalShipment: dayTotalShipment,
      totalBalanceEnd: dayTotalEnd,
    });
  }

  return rows;
}

/**
 * 3.5 & 5.4: Check for negative stock balances
 * Returns empty array if all remainders >= 0, or list of problematic items.
 */
export function simulateNegativeStockCheck(
  candidateArrivals: ArrivalRecord[],
  candidateShipments: ShipmentRecord[],
  currentMatrix: DailyStockRow[],
  settings: Settings
): ProblematicStockItem[] {
  const allDates = getAllMatrixDates(candidateArrivals, candidateShipments, settings);
  const simulatedMatrix = calculateMatrix(allDates, candidateArrivals, candidateShipments);

  // Build lookup of current remainder
  const currentLookup = new Map<string, number>();
  currentMatrix.forEach((r) => {
    ALL_ARTICLES.forEach((art) => {
      currentLookup.set(`${r.date}_${art}`, r.byArticle[art]?.balanceEnd ?? 0);
    });
  });

  const problems: ProblematicStockItem[] = [];

  for (const row of simulatedMatrix) {
    for (const art of ALL_ARTICLES) {
      const cell = row.byArticle[art];
      if (cell && cell.balanceEnd < 0) {
        const curRem = currentLookup.get(`${row.date}_${art}`) ?? 0;
        problems.push({
          date: row.date,
          article: art,
          currentRemainder: curRem,
          projectedRemainder: cell.balanceEnd,
        });
      }
    }
  }

  return problems;
}

/**
 * 3.6, 4.4 & 5.6: FIFO Capsule Calculation
 * Creates capsule views from Arrivals and allocates Shipments FIFO.
 * Computes шт-дни (unit-days) across the specified report period.
 */
export function calculateCapsules(
  arrivals: ArrivalRecord[],
  shipments: ShipmentRecord[],
  settings: Settings,
  tariffs: Record<Article, SellerTariff>,
  adjustments: AdjustmentRecord[] = []
): CapsuleItem[] {
  const periodDates = getDateRange(settings.reportDateFrom, settings.reportDateTo);

  // Group arrivals by date, article, type, id
  const capsules: CapsuleItem[] = [];

  // Group arrivals by date and article to match 4.4:
  // "Капсула = приёмка (или возврат) за конкретную дату по конкретному артикулу.
  // initialQuantity = сумма quantity всех записей Arrival за дату создания по артикулу."
  // Or keep individual arrivals so notes and exact source IDs are transparent.
  // Grouping by (date, article, type) is cleanest:
  const arrivalGroups = new Map<string, {
    id: string;
    article: Article;
    date: string;
    type: 'arrival' | 'return';
    quantity: number;
    notes: string[];
  }>();

  // Sort arrivals chronologically
  const sortedArrivals = [...arrivals].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

  sortedArrivals.forEach((arr) => {
    const key = `${arr.article}_${arr.date}_${arr.type}`;
    const existing = arrivalGroups.get(key);
    if (existing) {
      existing.quantity += arr.quantity;
      if (arr.note) existing.notes.push(arr.note);
    } else {
      arrivalGroups.set(key, {
        id: arr.id,
        article: arr.article,
        date: arr.date,
        type: arr.type,
        quantity: arr.quantity,
        notes: arr.note ? [arr.note] : [],
      });
    }
  });

  // Convert groups into capsule tracking objects per article
  const capsulesByArticle = new Map<Article, Array<{
    id: string;
    article: Article;
    date: string;
    type: 'arrival' | 'return';
    initialQuantity: number;
    remaining: number;
    shippedTotal: number;
    availableDate: string;
    availableOrder: number;
    dailyShipments: Map<string, number>; // дата -> общее FIFO-списание (отгрузка или коррекция)
  }>>();

  ALL_ARTICLES.forEach((art) => capsulesByArticle.set(art, []));

  arrivalGroups.forEach((group) => {
    const list = capsulesByArticle.get(group.article)!;
    list.push({
      id: group.id,
      article: group.article,
      date: group.date,
      type: group.type,
      initialQuantity: group.quantity,
      remaining: group.quantity,
      shippedTotal: 0,
      availableDate: group.date,
      availableOrder: 0,
      dailyShipments: new Map<string, number>(),
    });
  });

  // Положительная корректировка — самостоятельная техническая капсула.
  // sourceArrivalDate сохраняет фактический возраст товара, availableDate — момент появления в учёте.
  adjustments.filter((a) => a.quantity > 0).forEach((adj) => {
    capsulesByArticle.get(adj.article)!.push({
      id: adj.id,
      article: adj.article,
      date: adj.sourceArrivalDate || adj.date,
      type: 'arrival',
      initialQuantity: adj.quantity,
      remaining: adj.quantity,
      shippedTotal: 0,
      availableDate: adj.date,
      availableOrder: adj.position === 'beforeDay' ? 0 : 2,
      dailyShipments: new Map<string, number>(),
    });
  });

  // Единая хронология FIFO-списаний: отрицательная корректировка и отгрузка.
  const depletionEvents = [
    ...shipments.map((s) => ({ date: s.date, article: s.article, quantity: s.quantity, order: 1, createdAt: s.createdAt })),
    ...adjustments.filter((a) => a.quantity < 0).map((a) => ({
      date: a.date, article: a.article, quantity: Math.abs(a.quantity),
      order: a.position === 'beforeDay' ? 0 : 2, createdAt: a.createdAt,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));

  ALL_ARTICLES.forEach((article) => {
    capsulesByArticle.get(article)!.sort((a, b) =>
      a.date.localeCompare(b.date) || a.availableDate.localeCompare(b.availableDate) || a.id.localeCompare(b.id)
    );
  });

  depletionEvents.forEach((event) => {
    const caps = capsulesByArticle.get(event.article) || [];
    let remainingToDeplete = event.quantity;
    for (const cap of caps) {
      if (remainingToDeplete <= 0) break;
      if (cap.availableDate > event.date || (cap.availableDate === event.date && cap.availableOrder > event.order)) continue;
      if (cap.remaining <= 0) continue;
      const taken = Math.min(cap.remaining, remainingToDeplete);
      cap.remaining -= taken;
      cap.shippedTotal += taken;
      remainingToDeplete -= taken;
      cap.dailyShipments.set(event.date, (cap.dailyShipments.get(event.date) || 0) + taken);
    }
  });

  // Now compute daily balances and unit-days for each capsule in period
  capsulesByArticle.forEach((caps, article) => {
    const tariff = tariffs[article]?.storage ?? 0;

    caps.forEach((cap) => {
      let unitDays = 0;
      const dailyBalances: Record<string, number> = {};

      periodDates.forEach((pDate) => {
        if (cap.availableDate > pDate) {
          // Капсула ещё не появилась в учёте на эту дату
          dailyBalances[pDate] = 0;
        } else {
          // Бесплатный период считается один раз от фактической даты капсулы.
          // Выбор нового отчётного периода не обнуляет возраст товара.
          const capsuleDate = new Date(`${cap.date}T00:00:00Z`);
          const currentDate = new Date(`${pDate}T00:00:00Z`);
          const ageDays = Math.floor((currentDate.getTime() - capsuleDate.getTime()) / 86400000);

          // Sum shipments from this capsule up to and including pDate
          let shippedUpToPDate = 0;
          cap.dailyShipments.forEach((qty, sDate) => {
            if (sDate <= pDate) {
              shippedUpToPDate += qty;
            }
          });
          const remainderOnDay = Math.max(0, cap.initialQuantity - shippedUpToPDate);
          dailyBalances[pDate] = remainderOnDay;
          if (ageDays >= (settings.freeStorageDays ?? 5)) {
            unitDays += remainderOnDay;
          }
        }
      });

      capsules.push({
        id: cap.id,
        article: cap.article,
        date: cap.date,
        type: cap.type,
        initialQuantity: cap.initialQuantity,
        shippedQuantity: cap.shippedTotal,
        remainingQuantity: cap.remaining,
        unitDaysInPeriod: unitDays,
        storageCost: unitDays * tariff,
        dailyBalances,
      });
    });
  });

  // Sort capsules by date ASC, then article
  capsules.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.article.localeCompare(b.article);
  });

  return capsules;
}

/**
 * 5.6: Fulfillment calculation for seller
 */
export function calculateSellerFulfillment(
  arrivals: ArrivalRecord[],
  shipments: ShipmentRecord[],
  settings: Settings,
  tariffs: Record<Article, SellerTariff>,
  capsules: CapsuleItem[]
): {
  items: ArticleFulfillment[];
  totalReceptionCost: number;
  totalBrandingCost: number;
  totalPackagingCost: number;
  totalAssemblyCost: number;
  totalStorageCost: number;
  grandTotal: number;
} {
  const from = settings.reportDateFrom;
  const to = settings.reportDateTo;

  // Filter arrivals & shipments in period
  const periodArrivals = arrivals.filter((a) => a.date >= from && a.date <= to && !a.note?.startsWith('[ОБРАТНЫЙ ПОТОК]'));
  const periodShipments = shipments.filter((s) => s.date >= from && s.date <= to);

  const items: ArticleFulfillment[] = [];

  let totalReceptionCost = 0;
  let totalBrandingCost = 0;
  let totalPackagingCost = 0;
  let totalAssemblyCost = 0;
  let totalStorageCost = 0;

  ALL_ARTICLES.forEach((art) => {
    const info = ARTICLE_MAP.get(art)!;
    const tariff = tariffs[art] || { reception: 0, branding: 0, packaging: 0, assembly: 0, storage: 0 };

    const receptionQty = periodArrivals
      .filter((a) => a.article === art && a.type === 'arrival')
      .reduce((sum, a) => sum + a.quantity, 0);

    const returnsQty = periodArrivals
      .filter((a) => a.article === art && a.type === 'return')
      .reduce((sum, a) => sum + a.quantity, 0);

    const assemblyQty = periodShipments
      .filter((s) => s.article === art)
      .reduce((sum, s) => sum + s.quantity, 0);

    // Rule 2 & 5.6: brandingQty = (assemblyQty + returnsQty) * flag
    const brandingQty = info.hasBranding ? (assemblyQty + returnsQty) : 0;

    // packagingQty = assemblyQty + returnsQty
    const packagingQty = assemblyQty + returnsQty;

    // Storage from capsules for this article
    const artCapsules = capsules.filter((c) => c.article === art);
    const storageUnitDays = artCapsules.reduce((sum, c) => sum + c.unitDaysInPeriod, 0);
    const storageCost = artCapsules.reduce((sum, c) => sum + c.storageCost, 0);

    const receptionCost = receptionQty * tariff.reception;
    const brandingCost = brandingQty * tariff.branding;
    const packagingCost = packagingQty * tariff.packaging;
    const assemblyCost = assemblyQty * tariff.assembly;
    const totalCost = receptionCost + brandingCost + packagingCost + assemblyCost + storageCost;

    totalReceptionCost += receptionCost;
    totalBrandingCost += brandingCost;
    totalPackagingCost += packagingCost;
    totalAssemblyCost += assemblyCost;
    totalStorageCost += storageCost;

    items.push({
      article: art,
      receptionQty,
      receptionCost,
      returnsQty,
      assemblyQty,
      assemblyCost,
      brandingQty,
      brandingCost,
      packagingQty,
      packagingCost,
      storageUnitDays,
      storageCost,
      totalCost,
    });
  });

  const grandTotal =
    totalReceptionCost +
    totalBrandingCost +
    totalPackagingCost +
    totalAssemblyCost +
    totalStorageCost;

  return {
    items,
    totalReceptionCost,
    totalBrandingCost,
    totalPackagingCost,
    totalAssemblyCost,
    totalStorageCost,
    grandTotal,
  };
}

/**
 * 5.6: Operator Payroll calculation
 */
export function calculateOperatorPayroll(
  arrivals: ArrivalRecord[],
  shipments: ShipmentRecord[],
  settings: Settings,
  schedule: ScheduleMap,
  tariffs: Record<Article, OperatorTariff>
): {
  operators: OperatorFulfillment[];
  totalPayroll: number;
} {
  const from = settings.reportDateFrom;
  const to = settings.reportDateTo;
  const periodDates = getDateRange(from, to);

  const opNames: OperatorName[] = ['Пузанов Д.В.', 'Завалишин Д.Л.'];

  const results: OperatorFulfillment[] = opNames.map((name) => {
    const assignedDates = periodDates.filter((d) => (schedule[d] || 'Пузанов Д.В.') === name);

    let opReceptionQty = 0;
    let opReceptionPay = 0;
    let opReturnsQty = 0;
    let opAssemblyQty = 0;
    let opAssemblyPay = 0;
    let opBrandingQty = 0;
    let opBrandingPay = 0;
    let opPackagingQty = 0;
    let opPackagingPay = 0;

    const byArticle: Record<Article, {
      reception: number;
      branding: number;
      packaging: number;
      assembly: number;
      total: number;
    }> = {} as any;

    ALL_ARTICLES.forEach((art) => {
      const info = ARTICLE_MAP.get(art)!;
      const tariff = tariffs[art] || { reception: 0, branding: 0, packaging: 0, assembly: 0 };

      // Sum quantities on assigned dates
      const artReception = arrivals
        .filter((a) => a.article === art && a.type === 'arrival' && assignedDates.includes(a.date) && !a.note?.startsWith('[ОБРАТНЫЙ ПОТОК]'))
        .reduce((sum, a) => sum + a.quantity, 0);

      const artReturns = arrivals
        .filter((a) => a.article === art && a.type === 'return' && assignedDates.includes(a.date) && !a.note?.startsWith('[ОБРАТНЫЙ ПОТОК]'))
        .reduce((sum, a) => sum + a.quantity, 0);

      const artAssembly = shipments
        .filter((s) => s.article === art && assignedDates.includes(s.date))
        .reduce((sum, s) => sum + s.quantity, 0);

      // В расчётах с персоналом брендирование Ми оплачивается,
      // хотя селлеру по категории Ми оно не предъявляется.
      const artBranding = artAssembly + artReturns;
      const artPackaging = artAssembly + artReturns;

      const receptionPay = artReception * tariff.reception;
      const brandingPay = artBranding * tariff.branding;
      const packagingPay = artPackaging * tariff.packaging;
      const assemblyPay = artAssembly * tariff.assembly;
      const totalArticlePay = receptionPay + brandingPay + packagingPay + assemblyPay;

      opReceptionQty += artReception;
      opReceptionPay += receptionPay;
      opReturnsQty += artReturns;
      opAssemblyQty += artAssembly;
      opAssemblyPay += assemblyPay;
      opBrandingQty += artBranding;
      opBrandingPay += brandingPay;
      opPackagingQty += artPackaging;
      opPackagingPay += packagingPay;

      byArticle[art] = {
        reception: receptionPay,
        branding: brandingPay,
        packaging: packagingPay,
        assembly: assemblyPay,
        total: totalArticlePay,
      };
    });

    const totalPay = opReceptionPay + opBrandingPay + opPackagingPay + opAssemblyPay;

    return {
      operator: name,
      workDaysCount: assignedDates.length,
      dates: assignedDates,
      receptionQty: opReceptionQty,
      receptionPay: opReceptionPay,
      returnsQty: opReturnsQty,
      assemblyQty: opAssemblyQty,
      assemblyPay: opAssemblyPay,
      brandingQty: opBrandingQty,
      brandingPay: opBrandingPay,
      packagingQty: opPackagingQty,
      packagingPay: opPackagingPay,
      totalPay,
      byArticle,
    };
  });

  const totalPayroll = results.reduce((sum, o) => sum + o.totalPay, 0);

  return {
    operators: results,
    totalPayroll,
  };
}

/**
 * 7.2: CSV Export & Import helpers for Matrix
 */
export function exportMatrixToCsv(matrix: DailyStockRow[]): string {
  // Format: Дата;Артикул;Было;Поставка;Отгрузка;Осталось
  const lines: string[] = ['Дата;Артикул;Было;Поставка;Отгрузка;Осталось'];

  matrix.forEach((row) => {
    ALL_ARTICLES.forEach((art) => {
      const cell = row.byArticle[art];
      if (cell) {
        lines.push(
          `${row.date};${art};${cell.balanceStart};${cell.arrival};${cell.shipment};${cell.balanceEnd}`
        );
      }
    });
  });

  return lines.join('\n');
}
