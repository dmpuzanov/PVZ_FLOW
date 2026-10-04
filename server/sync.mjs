// PVZ.FLOW — Google ПВЗ sync (§6) and seller-table reconciliation (§7).

import crypto from 'node:crypto';
import { fetchTsv, parseDailyMatrix, parseSellerTable, PVZ_SOURCE, SELLER_SOURCE, isoWeekday } from './sheets.mjs';
import { normalizeArticle } from './articles.mjs';
import { deriveSupplyId, guessArticleFromName } from './productMap.mjs';
import { newId, writeTx, createBackup, nowIso } from './db.mjs';

/** A failed sync must stay visible in health instead of silently doing nothing. */
function recordSyncFailure(db, sourceId, at, message) {
  try {
    db.prepare(
      `INSERT INTO google_sync_state(source_id, last_sync_at, last_status, last_error)
       VALUES(?,?,'error',?)
       ON CONFLICT(source_id) DO UPDATE SET
         last_sync_at = excluded.last_sync_at,
         last_status = 'error',
         last_error = excluded.last_error`,
    ).run(sourceId, at, String(message).slice(0, 500));
  } catch {
    /* health reporting must never mask the original failure */
  }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * §6 Google ПВЗ sync.
 *
 * Rules implemented literally:
 *  - continuous, today included (no date cutoff);
 *  - locking is the FACT of a sync, not the calendar date;
 *  - already-synced rows are immutable (google-origin shipments are never
 *    updated or deleted);
 *  - only the not-yet-synced POSITIVE difference is added;
 *  - when Google decreases, local rows are left alone;
 *  - manual WB-GI shipments count towards the difference;
 *  - Google rows dated before settings.reportDateFrom are ignored entirely
 *    (the ledger did not exist yet);
 *  - the accepted baseline history 07–27.09 is immutable: positive
 *    differences there are reported as blockedByAcceptedBaseline, never added;
 *  - from 28.09 on, every local shipment counts towards the difference
 *    regardless of its source, and the remaining positive difference is the
 *    plannedNew set (that is what a real sync applies).
 */

// The accepted baseline window (§ baseline 303) — dates 07..27.09 are history.
const ACCEPTED_BASELINE_START = '2026-09-07';
const ACCEPTED_BASELINE_END = '2026-09-27';

function readSetting(db, key) {
  try {
    const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value_json) : null;
  } catch {
    return null;
  }
}

export async function syncPvz(db, dbFile, { backup = true, dryRun = false } = {}) {
  const startedAt = nowIso();
  // A dry run must not touch the ledger at all, so it takes no backup either.
  if (backup && !dryRun) await createBackup(db, dbFile, { label: 'auto' });

  let raw;
  try {
    raw = await fetchTsv(PVZ_SOURCE.url);
  } catch (err) {
    recordSyncFailure(db, PVZ_SOURCE.id, startedAt, err.message);
    throw err;
  }
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  const parsed = parseDailyMatrix(raw);
  const today = todayIso();

  // Skip future days: the sheet pre-fills zeros, but a future day is not yet
  // operational information.
  const relevant = parsed.days.filter((d) => d.date <= today);

  const ledgerStart = readSetting(db, 'reportDateFrom') ?? ACCEPTED_BASELINE_START;

  const plan = [];
  const ignoredBeforeLedgerStart = [];
  const blockedByAcceptedBaseline = [];
  const alreadyAccountedRows = [];
  for (const day of relevant) {
    for (const [article, googleQty] of Object.entries(day.quantities)) {
      // 1) Rows from before the ledger started are not data — they are skipped
      //    entirely, no matter what Google or the local ledger claims.
      if (day.date < ledgerStart) {
        ignoredBeforeLedgerStart.push({ date: day.date, article, googleQty });
        continue;
      }

      const localRow = db
        .prepare(
          `SELECT
             coalesce(sum(CASE WHEN source = 'google' THEN quantity ELSE 0 END), 0) AS fromGoogle,
             coalesce(sum(CASE WHEN source IS NULL OR source <> 'google' THEN quantity ELSE 0 END), 0) AS manual
           FROM shipments WHERE date = ? AND article = ?`,
        )
        .get(day.date, article);
      const accounted = Number(localRow.fromGoogle) + Number(localRow.manual);
      const diff = googleQty - accounted;

      // 2) The accepted baseline 07–27.09 is immutable history: a positive
      //    difference there is reported as blocked, never added.
      if (day.date >= ACCEPTED_BASELINE_START && day.date <= ACCEPTED_BASELINE_END) {
        if (diff > 0) {
          blockedByAcceptedBaseline.push({ date: day.date, article, googleQty, alreadyAccounted: accounted, blocked: diff });
        } else {
          alreadyAccountedRows.push({ date: day.date, article, googleQty, alreadyAccounted: accounted });
        }
        continue;
      }

      // 3) From 28.09 on every local shipment (any source) counts, and only
      //    the remaining positive difference may be added.
      if (diff > 0) {
        plan.push({
          date: day.date,
          article,
          googleQty,
          alreadyAccounted: accounted,
          add: diff,
          operator: day.operator,
        });
      } else {
        // diff <= 0: already synced, or Google is lower. §6 — never delete
        // local rows and never re-add.
        alreadyAccountedRows.push({ date: day.date, article, googleQty, alreadyAccounted: accounted });
      }
    }
  }

  const plannedUnits = plan.reduce((sum, p) => sum + p.add, 0);

  let added = 0;
  if (!dryRun && plan.length) {
    added = writeTx(db, 'google', () => {
      let n = 0;
      const insShip = db.prepare(
        `INSERT INTO shipments(id, date, article, quantity, supply_id, source, note, created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      );
      const insRaw = db.prepare(
        `INSERT INTO google_supply_rows(id, source_id, row_date, article, quantity, supply_id, destination, operator, raw_json)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(source_id, row_date, article, quantity, supply_id) DO NOTHING`,
      );
      for (const p of plan) {
        const sid = newId('shp');
        // supply_id stays NULL: the ПВЗ sheet has no per-unit ids, and inventing
        // one would collide with real WB-GI values (§4.6 uniqueness).
        insShip.run(sid, p.date, p.article, p.add, null, 'google', 'ПВЗ: разница с Google', nowIso());
        insRaw.run(
          newId('grow'),
          PVZ_SOURCE.id,
          p.date,
          p.article,
          p.add,
          null,
          null,
          p.operator,
          JSON.stringify({ googleQty: p.googleQty, alreadyAccounted: p.alreadyAccounted, add: p.add }),
        );
        n += p.add;
      }
      return n;
    });
  }

  // "Last data date" means the last day that actually carries numbers, not the
  // last pre-filled zero row the sheet always extends to.
  const lastDataDate =
    [...relevant].reverse().find((d) => Object.values(d.quantities).some((q) => q > 0))?.date ?? null;
  if (!dryRun) {
    db.prepare(
      `INSERT INTO google_sync_state(source_id, last_sync_at, last_status, rows_seen, rows_added, sha256)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(source_id) DO UPDATE SET
         last_sync_at = excluded.last_sync_at,
         last_status = excluded.last_status,
         last_error = NULL,
         rows_seen = excluded.rows_seen,
         rows_added = excluded.rows_added,
         sha256 = excluded.sha256`,
    ).run(PVZ_SOURCE.id, startedAt, 'ok', relevant.length, plan.length, sha);
  }

  return {
    startedAt,
    dryRun,
    rowsSeen: relevant.length,
    daysWithDiff: plan.length,
    unitsAdded: added,
    plannedUnits,
    lastDataDate,
    today,
    articleColumns: parsed.articleColumns,
    warnings: parsed.warnings,
    unmappedHeaders: parsed.unmappedHeaders,
    plan,
    ignoredBeforeLedgerStart,
    blockedByAcceptedBaseline,
    alreadyAccountedRows,
    ledgerStart,
  };
}

/**
 * §7 Seller-table reconciliation.
 *
 * Deliberately read-only with respect to stock: discrepancies are only shown,
 * nothing is auto-corrected, missing seller data is not a ПВЗ error, and old
 * decisions are flagged for recheck instead of deleted.
 */
export async function reconcileSeller(db, dbFile, { backup = true } = {}) {
  const startedAt = nowIso();
  if (backup) await createBackup(db, dbFile, { label: 'auto' });

  const runId = newId('rec');
  let raw = '';
  let fetchError = null;
  try {
    raw = await fetchTsv(SELLER_SOURCE.url);
  } catch (err) {
    fetchError = err.message;
  }

  if (fetchError) {
    db.prepare(
      `INSERT INTO reconciliation_runs(id, started_at, finished_at, status, source_id, note)
       VALUES(?,?,?,?,?,?)`,
    ).run(runId, startedAt, nowIso(), 'failed', SELLER_SOURCE.id, fetchError);
    return { runId, startedAt, status: 'failed', error: fetchError, discrepancies: 0 };
  }

  const { header, rows } = parseSellerTable(raw);
  const codeCol = header.findIndex((h) => /артикул/i.test(h));
  const nameCol = header.findIndex((h) => /наимен/i.test(h));
  const qtyCol = header.findIndex((h) => /количество/i.test(h));

  // Only confirmed mappings may be applied. Disputed codes (АК-10/АК-15/Г-800)
  // are reported as discrepancies and never silently folded into a total.
  const mapRows = db
    .prepare('SELECT code, article, product_name, confidence, confirmed FROM product_map')
    .all();
  const productMap = new Map(mapRows.map((r) => [r.code, r]));
  const disputedCodes = new Set(mapRows.filter((r) => !r.confirmed).map((r) => r.code));

  const grouped = new Map(); // date -> article -> qty
  const unmapped = new Map(); // code/name -> count
  const disputedRows = new Map(); // disputed code -> {article, qty, count}
  const ambiguous = []; // WB-GI appearing more than once with conflicting data
  const seenSupply = new Map();
  let usable = 0;
  let skippedBlank = 0;
  let skippedNA = 0;
  let skippedBadDate = 0;
  let duplicateIdentical = 0;

  for (const row of rows) {
    const cells = Object.values(row);
    const rawSupply = cells.find((v) => /WB-GI-\d+/i.test(String(v ?? '')));
    if (!rawSupply) {
      if (cells.some((v) => String(v ?? '').trim() === '#N/A')) skippedNA += 1;
      else if (cells.some((v) => String(v ?? '').trim() !== '')) skippedBlank += 1;
      continue;
    }
    const supplyId = String(rawSupply).trim().toUpperCase();
    const date = require_date(row, header);
    const code = String(row[header[codeCol]] ?? '').trim();
    const name = String(row[header[nameCol]] ?? '').trim();
    const qty = Number(String(row[header[qtyCol]] ?? '0').replace(/\s/g, '')) || 0;

    // A row without a usable date cannot be reconciled against a daily ledger.
    if (!date) {
      skippedBadDate += 1;
      continue;
    }

    const mapped = productMap.get(code);
    // §7 as instructed by the user: a disputed code is never auto-resolved.
    if (mapped && !mapped.confirmed) {
      const prev = disputedRows.get(code) ?? { code, article: mapped.article, qty: 0, count: 0 };
      prev.qty += qty;
      prev.count += 1;
      disputedRows.set(code, prev);
      continue;
    }

    const article = mapped?.article ?? normalizeArticle(code) ?? guessArticleFromName(name);
    if (!article) {
      const label = `${code} ${name}`.trim();
      unmapped.set(label, (unmapped.get(label) ?? 0) + 1);
      continue;
    }

    // The same supply id can appear on several rows. Counting it twice would
    // invent a discrepancy, so an identical repeat is ignored and a conflicting
    // repeat is reported and excluded from both totals.
    const signature = `${date}|${article}|${qty}`;
    if (seenSupply.has(supplyId)) {
      if (seenSupply.get(supplyId) === signature) duplicateIdentical += 1;
      else ambiguous.push({ supplyId, first: seenSupply.get(supplyId), second: signature });
      continue;
    }
    seenSupply.set(supplyId, signature);

    const key = `${date}|${article}`;
    grouped.set(key, (grouped.get(key) ?? 0) + qty);
    usable += 1;
  }

  // §7: reconciliation only starts a day later.
  const today = todayIso();
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - SELLER_SOURCE.deferDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const discrepancies = [];
  for (const [key, sellerQty] of grouped.entries()) {
    const [date, article] = key.split('|');
    if (date > cutoffIso) continue; // deferred window (§7)
    const local = db
      .prepare('SELECT coalesce(sum(quantity),0) AS q FROM shipments WHERE date = ? AND article = ?')
      .get(date, article);
    const localQty = Number(local.q);
    const delta = sellerQty - localQty;
    if (delta !== 0) {
      discrepancies.push({ date, article, sellerQty, localQty, delta });
    }
  }
  discrepancies.sort((a, b) => a.date.localeCompare(b.date) || a.article.localeCompare(b.article));

  writeTx(db, 'app', () => {
    db.prepare(
      `INSERT INTO reconciliation_runs(id, started_at, finished_at, status, source_id, rows_seen, discrepancies, note)
       VALUES(?,?,?,?,?,?,?,?)`,
    ).run(
      runId,
      startedAt,
      nowIso(),
      'ok',
      SELLER_SOURCE.id,
      usable,
      discrepancies.length + disputedRows.size,
      [
        `deferred through ${cutoffIso}`,
        ambiguous.length ? `ambiguous=${ambiguous.length}` : null,
        disputedRows.size ? `disputed-mappings=${disputedRows.size}` : null,
      ]
        .filter(Boolean)
        .join('; '),
    );
    const ins = db.prepare(
      `INSERT INTO reconciliation_discrepancies(id, run_id, row_date, article, google_qty, local_qty, delta, state, needs_recheck, note)
       VALUES(?,?,?,?,?,?,?,'open',0,?)`,
    );
    for (const d of discrepancies) {
      ins.run(
        newId('disc'),
        runId,
        d.date,
        d.article,
        d.sellerQty,
        d.localQty,
        d.delta,
        ambiguous.length ? `ambiguous supply ids: ${ambiguous.length}` : null,
      );
    }
    // Disputed product codes are reported as open items with a zero balance
    // difference: the quantity is known but the article is not confirmed, so
    // nothing is applied to stock until the user decides.
    for (const d of disputedRows.values()) {
      ins.run(
        newId('disc'),
        runId,
        cutoffIso,
        d.article,
        d.qty,
        0,
        0,
        `требуется подтверждение соответствия: код ${d.code} (${d.count} строк, ${d.qty} шт)`,
      );
    }
    // §7: previous decisions are kept, not deleted; they are flagged for recheck.
    if (discrepancies.length) {
      db.prepare(
        `UPDATE reconciliation_discrepancies SET needs_recheck = 1
          WHERE state = 'resolved' AND run_id <> ?`,
      ).run(runId);
    }
  });

  return {
    runId,
    startedAt,
    status: 'ok',
    rowsSeen: usable,
    skippedNA,
    skippedBlank,
    skippedBadDate,
    duplicateIdentical,
    cutoffDate: cutoffIso,
    today,
    discrepancies: discrepancies.length,
    details: discrepancies.slice(0, 500),
    ambiguousSupplies: ambiguous.slice(0, 100),
    ambiguousCount: ambiguous.length,
    disputedMappings: [...disputedRows.values()],
    unmappedProducts: [...unmapped.entries()].map(([k, count]) => ({ product: k, count })),
  };
}

/**
 * Seller dates are DD.MM.YY. One published row carries a trailing separator
 * ("28.09.26."), and a textual value must never be coerced into a date.
 */
function require_date(row, header) {
  const cell = String(row[header[0]] ?? '').trim();
  const m = cell.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\.?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Reject values that only look like a date after JS rolls them over.
  const probe = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}