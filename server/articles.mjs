// PVZ.FLOW — article domain.
//
// The Google ПВЗ sheet labels two articles "МК-К"/"МК-П" while the local
// database uses "Ми-К"/"Ми-П". Left unmapped, sync would silently invent two
// phantom articles and corrupt every balance. Normalise at the boundary.

export const ARTICLES = ['АК-10', 'АК-15', 'Г-3500', 'Г-1800', 'Г-800', 'Ми-К', 'Ми-П'];

export const CATEGORY_OF = {
  'АК-10': 'АК',
  'АК-15': 'АК',
  'Г-3500': 'Г',
  'Г-1800': 'Г',
  'Г-800': 'Г',
  'Ми-К': 'Ми',
  'Ми-П': 'Ми',
};

/** Spellings seen in the wild, mapped onto the canonical local article. */
const ALIASES = new Map([
  ['МК-К', 'Ми-К'],
  ['МК-П', 'Ми-П'],
  ['МКК', 'Ми-К'],
  ['МКП', 'Ми-П'],
  ['МИ-К', 'Ми-К'],
  ['МИ-П', 'Ми-П'],
  ['МиК', 'Ми-К'],
  ['МиП', 'Ми-П'],
  ['АК10', 'АК-10'],
  ['АК15', 'АК-15'],
]);

/** Collapse spacing/dashes and case so cosmetic differences still match. */
function looseKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/ё/g, 'е')
    .replace(/[\s ]+/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

const LOOSE = new Map();
for (const a of ARTICLES) LOOSE.set(looseKey(a), a);
for (const [alias, canonical] of ALIASES) LOOSE.set(looseKey(alias), canonical);

/** Map any known spelling of an article onto the canonical one, or null. */
export function normalizeArticle(value) {
  if (value == null) return null;
  const direct = LOOSE.get(looseKey(value));
  if (direct) return direct;
  return null;
}

export function isArticle(value) {
  return normalizeArticle(value) !== null;
}

/**
 * Parse a date cell into YYYY-MM-DD.
 * The sheet mixes DD.MM.YYYY (rows 2-73) with MM/DD/YYYY (rows 74+), so the
 * format is decided by inspecting the value rather than by position.
 */
export function parseSheetDate(raw) {
  const s = String(raw ?? '').trim().replace(/[.\s]+$/, '');
  if (!s) return null;

  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s); // DD.MM.YYYY
  if (m) return iso(+m[3], +m[2], +m[1]);

  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(s); // DD.MM.YY (seller sheet)
  if (m) return iso(2000 + +m[3], +m[2], +m[1]);

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // MM/DD/YYYY or DD/MM/YYYY
  if (m) {
    const a = +m[1];
    const b = +m[2];
    // No row has day > 12, so a value above 12 disambiguates the order.
    // Otherwise assume MM/DD (the Google default for this sheet).
    if (a > 12) return iso(+m[3], b, a);
    return iso(+m[3], a, b);
  }

  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s); // already ISO
  if (m) return iso(+m[1], +m[2], +m[3]);

  return null;
}

function iso(y, m, d) {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parse a quantity cell: blank means zero, anything non-numeric is an error. */
export function parseQty(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return 0;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}