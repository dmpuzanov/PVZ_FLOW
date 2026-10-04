import type { AdjustmentRecord, ArrivalRecord, Article, ScheduleMap, ShipmentRecord } from '../types/pvz';

const ARTICLES: Article[] = ['АК-10','АК-15','Г-3500','Г-1800','Г-800','Ми-К','Ми-П'];
const CSV_NAMES = ['АК-10','АК-15','Г 3500','Г 1800','Г 800','Ми-К','Ми-П'];

export interface WeeklyCsvImport {
  arrivals: ArrivalRecord[];
  shipments: ShipmentRecord[];
  adjustments: AdjustmentRecord[];
  schedule: ScheduleMap;
  dates: string[];
}

const iso = (ru: string) => {
  const [d,m,y] = ru.split('.');
  return `${y}-${m}-${d}`;
};
const num = (v?: string) => Number((v || '').trim().replace(',', '.')) || 0;

/** Parse PVZ.FLOW wide CSV. Input must already be decoded as windows-1251 or UTF-8. */
export function importWeeklyCsv(text: string): WeeklyCsvImport {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.split(';'));
  const header = rows.findIndex(r => r[0] === 'Дата' && r[3] === 'АК-10');
  if (header < 0) throw new Error('Не найдена шапка матрицы PVZ.FLOW');

  const arrivals: ArrivalRecord[] = [];
  const shipments: ShipmentRecord[] = [];
  const adjustments: AdjustmentRecord[] = [];
  const schedule: ScheduleMap = {};
  const dates: string[] = [];
  let seq = 0;
  const stamp = (date: string) => `${date}T12:00:${String(seq++ % 60).padStart(2,'0')}.000Z`;

  for (const row of rows.slice(header + 2)) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(row[0] || '')) continue;
    const date = iso(row[0]);
    dates.push(date);
    if (row[2] === 'Пузанов Д.В.' || row[2] === 'Завалишин Д.Л.') schedule[date] = row[2];

    ARTICLES.forEach((article, index) => {
      const base = 3 + index * 7;
      const opening = num(row[base]);
      const arrival = num(row[base + 1]);
      const returned = num(row[base + 2]);
      const correction = num(row[base + 3]);
      const inventory = num(row[base + 4]);
      const shipment = num(row[base + 5]);
      const label = CSV_NAMES[index];

      if (dates.length === 1 && opening) adjustments.push({
        id:`csv-opening-${index}`, date, article, quantity:opening, kind:'opening', position:'beforeDay',
        reason:'Входящий остаток из CSV', note:`Импорт ${label}`, createdAt:stamp(date)
      });
      if (arrival) arrivals.push({id:`csv-arr-${seq}`,date,article,quantity:arrival,type:'arrival',note:'Импорт CSV',createdAt:stamp(date)});
      if (returned) arrivals.push({id:`csv-ret-${seq}`,date,article,quantity:returned,type:'return',note:'Импорт CSV',createdAt:stamp(date)});
      if (shipment) shipments.push({id:`csv-shp-${seq}`,date,article,quantity:shipment,createdAt:stamp(date)});
      if (correction) adjustments.push({id:`csv-cor-${seq}`,date,article,quantity:correction,kind:'correction',position:'beforeDay',reason:'Корректировка из CSV',createdAt:stamp(date)});
      if (inventory) adjustments.push({id:`csv-inv-${seq}`,date,article,quantity:inventory,kind:'inventory',position:'afterDay',reason:'Инвентаризационная корректировка из CSV',createdAt:stamp(date)});
    });
  }
  if (!dates.length) throw new Error('В CSV нет строк с датами');
  return {arrivals, shipments, adjustments, schedule, dates};
}
