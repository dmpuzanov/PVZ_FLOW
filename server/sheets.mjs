// PVZ.FLOW — Google Sheets TSV fetch + parse.
//
// Both sources are published TSV endpoints, so no API key is ever needed
// (§1: the program must run without API keys).

import { parseSheetDate, normalizeArticle, parseQty } from './articles.mjs';

// The published endpoints can be overridden so the test suite can serve a
// captured fixture from localhost instead of depending on the live sheets.
const PVZ_URL =
  process.env.PVZ_FLOW_PVZ_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUn2SPdirBqIm_zv8-ePClaiqht4RUi55JjtSXbQBUK3zJh7idWAbbG4y3Guchp2T76Q5_pmA8DYDM/pub?gid=969349755&single=true&output=tsv';

const SELLER_URL =
  process.env.PVZ_FLOW_SELLER_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT28y6vUX8THVP8GG81UsewI7mGLUQHks64I6XKly4RG4t9vq65ZHbqGJMOiCZOq_tColcHYno5gkXH/pub?gid=227958676&single=true&output=tsv';

export const PVZ_SOURCE = {
  id: 'pvz',
  label: 'ПВЗ — оперативный источник выбытия',
  url: PVZ_URL,
  // §6: continuous sync, today included.
  deferDays: 0,
};

export const SELLER_SOURCE = {
  id: 'seller',
  label: 'Таблица селлера — источник отложенной сверки',
  url: SELLER_URL,
  // §7: reconciliation only starts a day later.
  deferDays: 1,
};

const WEEKDAYS = {
  пн: 1,
  пнд: 1,
  вт: 2,
  вторник: 2,
  ср: 3,
  среда: 3,
  чт: 4,
  четверг: 4,
  пт: 5,
  пятница: 5,
  сб: 6,
  суббота: 6,
  вс: 0,
  воскресенье: 0,
};

export function isoWeekday(dateIso) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return d.getUTCDay();
}

export async function fetchTsv(url, { timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'PVZ.FLOW/1.0 (local desktop app)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the daily-matrix TSV used by the ПВЗ sheet.
 * Layout: [date, weekday, <article columns...>, ВСЕГО, Оператор]
 *
 * Every article column is resolved through normalizeArticle, so the sheet's
 * "МК-К"/"МК-П" spellings land on the local "Ми-К"/"Ми-П" instead of creating
 * phantom articles. A row whose weekday contradicts its date is reported
 * rather than silently trusted.
 */
export function parseDailyMatrix(tsv) {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('пустой ответ таблицы');

  const header = lines[0].split('\t');
  const totalCol = header.findIndex((h) => h.trim() === 'ВСЕГО');
  const operatorCol = header.length - 1;
  const articleCols = [];
  header.forEach((h, i) => {
    if (i === 0 || i === 1 || i === totalCol || i === operatorCol) return;
    const canonical = normalizeArticle(h);
    if (canonical) articleCols.push({ index: i, article: canonical, raw: h.trim() });
  });
  if (!articleCols.length) throw new Error('в таблице не найдено ни одного известного артикула');

  const days = [];
  const warnings = [];
  const unmapped = new Set();

  for (let r = 1; r < lines.length; r += 1) {
    const cells = lines[r].split('\t');
    const date = parseSheetDate(cells[0]);
    if (!date) {
      if (cells[0]?.trim()) warnings.push(`строка ${r + 1}: не распознана дата ${JSON.stringify(cells[0])}`);
      continue;
    }
    const weekdayCell = (cells[1] ?? '').trim().toLowerCase();
    const expected = WEEKDAYS[weekdayCell];
    if (expected !== undefined && expected !== isoWeekday(date)) {
      warnings.push(`строка ${r + 1}: ${date} — день недели "${cells[1].trim()}" не совпадает с датой`);
    }

    const quantities = {};
    for (const col of articleCols) {
      const q = parseQty(cells[col.index]);
      if (q === null) {
        warnings.push(`строка ${r + 1}: нечисловое количество в колонке ${col.raw}`);
        continue;
      }
      if (q !== 0) quantities[col.article] = q;
    }
    // Flag article-looking headers we could not map, so drift is visible.
    header.forEach((h, i) => {
      if (i === 0 || i === 1 || i === totalCol || i === operatorCol) return;
      if (h.trim() && !normalizeArticle(h)) unmapped.add(h.trim());
    });

    days.push({
      date,
      operator: (cells[operatorCol] ?? '').trim() || null,
      quantities,
      declaredTotal: parseQty(cells[totalCol]),
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return {
    days,
    warnings,
    unmappedHeaders: [...unmapped],
    articleColumns: articleCols.map((c) => c.article),
  };
}

/** Generic parser for the seller sheet: a header row plus free-form rows. */
export function parseSellerTable(tsv) {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new Error('пустой ответ таблицы селлера');
  const header = lines[0].split('\t').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    // Each row must be split on tabs before it can be addressed by column.
    const cells = line.split('\t');
    const rec = {};
    header.forEach((h, i) => {
      if (h) rec[h] = (cells[i] ?? '').trim();
    });
    return rec;
  });
  return { header, rows };
}