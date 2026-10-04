// PVZ.FLOW — mapping between Wildberries product codes and local articles.
//
// The seller sheet identifies goods only by WB product code and name. Mapping
// code -> article is a BUSINESS decision, so it is stored in SQLite and
// surfaced in the UI rather than hardcoded here. The seeds below are inferred
// from the seller's own product names and MUST be confirmed by the user
// before reconciliation results are trusted.

export const SEED_PRODUCT_MAP = [
  { code: '1088614022', article: 'АК-15', name: 'Аккумулятор для электроинструмента 21V', confidence: 'inferred' },
  { code: '604564457', article: 'АК-10', name: 'Аккумулятор для электроинструмента', confidence: 'inferred' },
  { code: '402395402', article: 'Г-1800', name: 'Гайковерт аккумуляторный ударный мощный 1800 Нм', confidence: 'high' },
  { code: '548182523', article: 'Г-3500', name: 'Гайковерт аккумуляторный бесщеточный ударный мощный 3500 Нм', confidence: 'high' },
  { code: '1006014419', article: 'Г-800', name: 'Гайковерт аккумуляторный ударный мощный', confidence: 'inferred' },
  { code: '706101815', article: 'Ми-К', name: 'Беспроводные караоке микрофоны', confidence: 'inferred' },
  { code: '687469463', article: 'Ми-П', name: 'Микрофон петличный беспроводной', confidence: 'inferred' },
];

/** Heuristic fallback when a code has no explicit mapping row. */
export function guessArticleFromName(name) {
  const s = String(name ?? '').toLowerCase();
  if (/3500/.test(s)) return 'Г-3500';
  if (/1800/.test(s)) return 'Г-1800';
  if (/гайковерт/.test(s)) return 'Г-800';
  if (/караоке/.test(s)) return 'Ми-К';
  if (/петличн/.test(s)) return 'Ми-П';
  if (/аккумулятор/.test(s)) return /21\s*v/i.test(name) ? 'АК-15' : 'АК-10';
  return null;
}

/** §9: extract a unique WB-GI-XXXXXXXXX token from a scanned string. */
export function extractSupplyId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/WB-GI-\d{6,}/i);
  return m ? m[0].toUpperCase() : null;
}

/** §9: accept a scan that contains no WB-GI and mint a local id instead. */
export function deriveSupplyId(input) {
  const direct = extractSupplyId(input);
  if (direct) return direct;
  const digits = String(input ?? '').match(/(\d{6,})/);
  if (digits) return `WB-GI-${digits[1]}`;
  return null;
}

export const SUPPLY_ID_RE = /^WB-GI-\d{6,}$/;