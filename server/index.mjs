// PVZ.FLOW — local HTTP server and JSON API.
//
// Runs on the Node runtime that ships with the portable build: no framework, no
// npm install, no external services. SQLite (node:sqlite) is the only source of
// operational truth; the browser holds nothing but a render cache.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  DbError,
  openAndMigrate,
  createBackup,
  listBackups,
  newId,
  nowIso,
  writeTx,
  sha256File,
} from './db.mjs';
import { syncPvz, reconcileSeller } from './sync.mjs';
import { PVZ_SOURCE, SELLER_SOURCE } from './sheets.mjs';
import { ARTICLES, normalizeArticle } from './articles.mjs';
import { deriveSupplyId } from './productMap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// The launcher normally uses the bundled data/ directory. The override exists so
// the test suite can run against a throwaway ledger.
const DATA_DIR = process.env.PVZ_FLOW_DATA_DIR
  ? path.resolve(process.env.PVZ_FLOW_DATA_DIR)
  : path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'PVZ_FLOW_DATA.sqlite');
const DIST_DIR = path.join(ROOT, 'app', 'dist');
const HOST = '127.0.0.1';

const log = (...a) => console.log(`[pvz-flow ${new Date().toISOString().slice(11, 19)}]`, ...a);

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) seedDatabase();

const opened = openAndMigrate(DB_FILE, log);
let db = opened.db;
let health = opened.health;
log(`database ready: ${DB_FILE}`);
log(`migrated to schema ${opened.migration.to}; integrity ${health.integrity}`);

/**
 * First run: no ledger exists yet. We refuse to silently invent operational
 * history, so a fresh install starts empty and the UI shows that plainly.
 */
function seedDatabase() {
  const fresh = new DatabaseSync(DB_FILE);
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT, last_saved_at TEXT);
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  `);
  fresh
    .prepare(`INSERT INTO metadata(key,value) VALUES('createdAt',?) ON CONFLICT(key) DO NOTHING`)
    .run(nowIso());
  fresh.close();
  log('created a new empty ledger');
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const fail = (res, status, message, code = 'ERROR') => send(res, status, { error: message, code });

function readBody(req, limitBytes = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new DbError('Слишком большой запрос', 'BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new DbError('Некорректный JSON в запросе', 'BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isPosInt = (v) => Number.isInteger(v) && v > 0;

function requireArticle(value) {
  const article = normalizeArticle(String(value ?? '').trim());
  if (!article) throw new DbError(`Неизвестный артикул: ${value}`, 'BAD_ARTICLE');
  return article;
}

/** Back up before any change to the ledger (§11). */
async function backupBefore(reason) {
  const dest = await createBackup(db, DB_FILE, { label: 'auto' });
  log(`backup before ${reason}: ${path.basename(dest)}`);
  return dest;
}

/**
 * Records one confirmed change in the audit log.
 *
 * The nine ledger triggers only see INSERT/UPDATE/DELETE on arrivals,
 * shipments and adjustments. A decision — closing a discrepancy, confirming a
 * product mapping, recording a reverse decision — changes no ledger row, so it
 * would otherwise leave no trace at all. Each confirmed change gets its own row
 * here, carrying what was decided and what it superseded.
 *
 * Must be called inside the writeTx that applies the decision.
 */
function auditDecision(action, entityType, entityId, details) {
  db.prepare(
    `INSERT INTO audit_log(recorded_at,action,entity_type,entity_id,details_json,source)
     VALUES(?,?,?,?,?,?)`,
  ).run(
    nowIso(),
    action,
    entityType,
    entityId ?? null,
    JSON.stringify(details ?? {}),
    metaValue('audit_source') || 'app',
  );
}

/**
 * Any endpoint that applies a decision requires explicit confirmation.
 *
 * Nothing may be changed "automatically": computing a suggested fix and showing
 * it is allowed, applying it is not. Making confirm:true mandatory on the wire
 * means the guarantee does not depend on the UI remembering to ask.
 */
function requireConfirmation(body, what) {
  if (body?.confirm !== true) {
    throw new DbError(
      `${what} требует явного подтверждения пользователя (confirm: true).`,
      'CONFIRMATION_REQUIRED',
    );
  }
}

function metaValue(key) {
  const row = db.prepare(`SELECT value FROM metadata WHERE key = ?`).get(key);
  return row ? row.value : null;
}

function readSettings() {
  const out = {};
  for (const row of db.prepare(`SELECT key, value_json FROM settings`).all()) {
    try {
      out[row.key] = JSON.parse(row.value_json);
    } catch {
      out[row.key] = null;
    }
  }
  return out;
}

function readTariffs(table) {
  const out = {};
  for (const row of db.prepare(`SELECT article, value_json FROM ${table}`).all()) {
    try {
      out[row.article] = JSON.parse(row.value_json);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

function fullState() {
  const arrivals = db
    .prepare(`SELECT id,date,article,quantity,type,note,created_at AS createdAt
              FROM arrivals ORDER BY date,article,id`)
    .all();
  const shipments = db
    .prepare(`SELECT id,date,article,quantity,supply_id AS supplyId,source,note,created_at AS createdAt
              FROM shipments ORDER BY date,article,id`)
    .all();
  const adjustments = db
    .prepare(`SELECT id,date,article,quantity,kind,position,reason,note,
                     source_arrival_date AS sourceArrivalDate, created_at AS createdAt
              FROM adjustments ORDER BY date,article,id`)
    .all();

  const schedule = {};
  for (const r of db.prepare(`SELECT date,operator FROM schedule`).all()) schedule[r.date] = r.operator;

  const reverseFlowUnits = db
    .prepare(`SELECT id,article,received_date AS receivedDate,status,
                     defects_json AS defectsJson,closed_date AS closedDate,
                     decided_at AS decidedAt,counted_in_stock AS countedInStock
              FROM reverse_units ORDER BY received_date,id`)
    .all()
    .map((u) => ({
      ...u,
      defects: safeJson(u.defectsJson, []),
      defectsJson: undefined,
      countedInStock: Boolean(u.countedInStock),
      events: db
        .prepare(`SELECT stage,date,operator FROM reverse_events WHERE unit_id = ? ORDER BY rowid`)
        .all(u.id),
    }));

  const reconciliationResolutions = {};
  for (const r of db.prepare(`SELECT key,value_json FROM reconciliation_resolutions`).all()) {
    reconciliationResolutions[r.key] = safeJson(r.value_json, {});
  }

  return {
    arrivals,
    shipments,
    adjustments,
    schedule,
    settings: readSettings(),
    sellerTariffs: readTariffs('seller_tariffs'),
    operatorTariffs: readTariffs('operator_tariffs'),
    reverseFlowUnits,
    reconciliationResolutions,
    meta: {
      schemaVersion: Number(metaValue('schemaVersion') || 0),
      dataThrough: metaValue('dataThrough'),
      sourceFile: metaValue('sourceFile'),
      sourceSha256: metaValue('sourceSha256'),
      lastSavedAt: db.prepare(`SELECT last_saved_at AS v FROM metadata WHERE key='last_saved_at'`).get()?.v ?? null,
    },
  };
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function healthPayload() {
  const syncState = db.prepare(`SELECT * FROM google_sync_state`).all();
  const lastRun = db
    .prepare(`SELECT id,started_at AS startedAt,finished_at AS finishedAt,status,rows_seen AS rowsSeen,
                     discrepancies,note FROM reconciliation_runs ORDER BY started_at DESC LIMIT 1`)
    .get();
  const openDiscrepancies = db
    .prepare(`SELECT count(*) AS n FROM reconciliation_discrepancies WHERE state='open'`)
    .get().n;
  return {
    status: health.integrity === 'ok' ? 'ok' : 'degraded',
    schemaVersion: Number(metaValue('schemaVersion') || 0),
    integrity: health.integrity,
    foreignKeyViolations: health.foreignKeyViolations,
    database: path.basename(DB_FILE),
    lastSavedAt: metaValue('last_saved_at'),
    dataThrough: metaValue('dataThrough'),
    sources: {
      pvz: { id: PVZ_SOURCE.id, url: PVZ_SOURCE.url, state: syncState.find((s) => s.source_id === PVZ_SOURCE.id) ?? null },
    },
    reconciliation: lastRun ? { ...lastRun, openDiscrepancies } : { openDiscrepancies },
    backups: listBackups(BACKUP_DIR).length,
  };
}

// ---------------------------------------------------------------------------
// writes — CRUD
// ---------------------------------------------------------------------------

// Each ledger table has its own shape, so columns are listed per table instead
// of being spread across one shared statement.
const TABLES = {
  arrivals: {
    table: 'arrivals',
    columns: ['id', 'date', 'article', 'quantity', 'type', 'note', 'created_at'],
  },
  shipments: {
    table: 'shipments',
    columns: ['id', 'date', 'article', 'quantity', 'supply_id', 'source', 'note', 'created_at'],
  },
  adjustments: {
    table: 'adjustments',
    columns: ['id', 'date', 'article', 'quantity', 'kind', 'position', 'reason', 'note', 'source_arrival_date', 'created_at'],
  },
};

// Columns a client is allowed to change after creation.
const EDITABLE = {
  arrivals: ['date', 'article', 'quantity', 'type', 'note'],
  shipments: ['date', 'article', 'quantity', 'supply_id', 'note'],
  adjustments: ['date', 'article', 'quantity', 'kind', 'position', 'reason', 'note', 'source_arrival_date'],
};

function insertRow(kind, body, source) {
  const spec = TABLES[kind];
  const date = body.date;
  if (!isIsoDate(date)) throw new DbError('Некорректная дата (ожидается ГГГГ-ММ-ДД)', 'BAD_DATE');
  const article = requireArticle(body.article);
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new DbError('Количество должно быть числом', 'BAD_QTY');
  }

  let supplyId = null;
  if (kind === 'shipments') {
    if (body.supplyId) {
      // §9 accepts WB-GI-… and the ЦИ-ПШ-… form the scanner produces.
      supplyId = deriveSupplyId(body.supplyId);
      if (!supplyId) throw new DbError('Некорректный WB-GI', 'BAD_SUPPLY_ID');
      const dup = db.prepare(`SELECT id FROM shipments WHERE supply_id = ?`).get(supplyId);
      if (dup) throw new DbError(`WB-GI ${supplyId} уже зарегистрирован`, 'DUPLICATE_SUPPLY_ID');
    }
    if (!isPosInt(quantity)) throw new DbError('Отгрузка должна быть положительным целым числом', 'BAD_QTY');
  }
  if (kind === 'arrivals' && !isPosInt(quantity)) {
    throw new DbError('Поступление должно быть положительным целым числом', 'BAD_QTY');
  }

  const id = body.id ? String(body.id) : newId(kind.slice(0, 3));
  if (db.prepare(`SELECT 1 FROM ${spec.table} WHERE id = ?`).get(id)) {
    throw new DbError(`Запись ${id} уже существует`, 'DUPLICATE_ID');
  }

  const values = {
    id,
    date,
    article,
    quantity,
    type: kind === 'arrivals' ? (body.type === 'return' ? 'return' : 'arrival') : null,
    supply_id: supplyId,
    // A shipment created through the UI is always manual. Only the sync engine
    // may label a row 'google', so provenance cannot be forged from the client.
    source: kind === 'shipments' ? 'manual' : null,
    note: body.note ? String(body.note).slice(0, 1000) : null,
    kind: kind === 'adjustments' ? String(body.kind || 'correction') : null,
    position: kind === 'adjustments' ? (body.position === 'afterDay' ? 'afterDay' : 'beforeDay') : null,
    reason: kind === 'adjustments' ? String(body.reason || '') : null,
    source_arrival_date:
      kind === 'adjustments' && isIsoDate(body.sourceArrivalDate) ? body.sourceArrivalDate : null,
    created_at: nowIso(),
  };

  writeTx(db, source, () => {
    const cols = TABLES[kind].columns;
    db.prepare(
      `INSERT INTO ${spec.table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
    ).run(...cols.map((c) => values[c]));
  });
  return { id };
}

function updateRow(kind, id, body, source) {
  const spec = TABLES[kind];
  const current = db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).get(id);
  if (!current) throw new DbError(`Запись ${id} не найдена`, 'NOT_FOUND');

  // §6: a row that came from Google is immutable.
  if (kind === 'shipments' && current.source === 'google') {
    throw new DbError(
      'Строка сформирована синхронизацией с Google и не редактируется. Изменения возможны только через процедуру восстановления.',
      'IMMUTABLE_ROW',
    );
  }

  const next = { ...current };
  if ('date' in body) {
    if (!isIsoDate(body.date)) throw new DbError('Некорректная дата', 'BAD_DATE');
    next.date = body.date;
  }
  if ('article' in body) next.article = requireArticle(body.article);
  if ('quantity' in body) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q) || q === 0) throw new DbError('Количество должно быть числом', 'BAD_QTY');
    next.quantity = q;
  }
  for (const f of ['type', 'kind', 'position', 'reason', 'note']) {
    if (f in body) next[f] = body[f] ?? null;
  }
  if ('sourceArrivalDate' in body) {
    next.source_arrival_date = isIsoDate(body.sourceArrivalDate) ? body.sourceArrivalDate : null;
  }
  if ('supplyId' in body && kind === 'shipments') {
    const sid = body.supplyId ? deriveSupplyId(body.supplyId) : null;
    if (body.supplyId && !sid) throw new DbError('Некорректный WB-GI', 'BAD_SUPPLY_ID');
    if (sid) {
      const dup = db.prepare(`SELECT id FROM shipments WHERE supply_id = ? AND id <> ?`).get(sid, id);
      if (dup) throw new DbError(`WB-GI ${sid} уже зарегистрирован`, 'DUPLICATE_SUPPLY_ID');
    }
    next.supply_id = sid;
  }

  writeTx(db, source, () => {
    const sets = EDITABLE[kind].map((c) => `${c}=?`).join(',');
    db.prepare(`UPDATE ${spec.table} SET ${sets} WHERE id=?`).run(
      ...EDITABLE[kind].map((c) => next[c] ?? null),
      id,
    );
  });
  return { id };
}

function deleteRow(kind, id, source) {
  const spec = TABLES[kind];
  const current = db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).get(id);
  if (!current) throw new DbError(`Запись ${id} не найдена`, 'NOT_FOUND');
  if (kind === 'shipments' && current.source === 'google') {
    throw new DbError(
      'Строка сформирована синхронизацией с Google и не удаляется. Используйте процедуру восстановления.',
      'IMMUTABLE_ROW',
    );
  }
  writeTx(db, source, () => {
    db.prepare(`DELETE FROM ${spec.table} WHERE id = ?`).run(id);
  });
  return { id, deleted: true };
}

// ---------------------------------------------------------------------------
// reverse flow
// ---------------------------------------------------------------------------

/**
 * §8: a unit that reaches direct flow or is written off moves the balance.
 * `linked-return-…` units already carry their +1 through the arrival record, so
 * they must never be counted twice.
 */
function saveReverseUnit(body, source) {
  const id = String(body.id ?? '').trim();
  if (!id) throw new DbError('Не указан идентификатор карточки', 'BAD_ID');
  const article = requireArticle(body.article);
  const status = ['awaiting', 'repair', 'direct', 'written_off'].includes(body.status)
    ? body.status
    : 'awaiting';
  const events = Array.isArray(body.events) ? body.events : [];

  const countedInStock =
    body.countedInStock === true || body.countedInStock === 1
      ? 1
      : id.startsWith('linked-return-') && (status === 'direct' || status === 'written_off')
        ? 1
        : 0;

  writeTx(db, source, () => {
    db.prepare(
      `INSERT INTO reverse_units(id,article,received_date,status,defects_json,closed_date,decided_at,counted_in_stock)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         article=excluded.article, status=excluded.status, defects_json=excluded.defects_json,
         closed_date=excluded.closed_date, counted_in_stock=excluded.counted_in_stock`,
    ).run(
      id, article, isIsoDate(body.receivedDate) ? body.receivedDate : nowIso().slice(0, 10), status,
      JSON.stringify(Array.isArray(body.defects) ? body.defects : []),
      isIsoDate(body.closedDate) ? body.closedDate : null,
      status === 'awaiting' || status === 'repair' ? null : nowIso(),
      countedInStock,
    );
    db.prepare(`DELETE FROM reverse_events WHERE unit_id = ?`).run(id);
    // reverse_events.id is INTEGER PRIMARY KEY AUTOINCREMENT — never supply it.
    const ins = db.prepare(
      `INSERT INTO reverse_events(unit_id,stage,date,operator) VALUES(?,?,?,?)`,
    );
    for (const e of events) {
      if (!isIsoDate(e?.date)) continue;
      ins.run(id, String(e.stage || 'intake'), e.date, String(e.operator || ''));
    }
  });
  return { id, countedInStock };
}

// ---------------------------------------------------------------------------
// routing
// ---------------------------------------------------------------------------

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const rx = new RegExp(
    `^${pattern.replace(/:([A-Za-z]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    })}$`,
  );
  routes.push({ method, rx, keys, handler });
};

// -- health & state ---------------------------------------------------------

route('GET', '/api/health', async () => healthPayload());
route('GET', '/api/state', async () => fullState());
route('GET', '/api/articles', async () => ({ articles: ARTICLES }));

// -- CRUD ------------------------------------------------------------------

for (const kind of Object.keys(TABLES)) {
  route('POST', `/api/${kind}`, async ({ body }) => {
    await backupBefore(`${kind} create`);
    return insertRow(kind, body, 'app');
  });
  route('PATCH', `/api/${kind}/:id`, async ({ params, body }) => {
    await backupBefore(`${kind} update`);
    return updateRow(kind, params.id, body, 'app');
  });
  route('DELETE', `/api/${kind}/:id`, async ({ params, body }) => {
    await backupBefore(`${kind} delete`);
    return deleteRow(kind, params.id, body?.source || 'app');
  });
}

// -- schedule, settings, tariffs -------------------------------------------

route('POST', '/api/schedule', async ({ body }) => {
  if (!isIsoDate(body.date)) throw new DbError('Некорректная дата', 'BAD_DATE');
  await backupBefore('schedule update');
  writeTx(db, 'app', () => {
    if (body.operator) {
      db.prepare(
        `INSERT INTO schedule(date,operator) VALUES(?,?)
         ON CONFLICT(date) DO UPDATE SET operator=excluded.operator`,
      ).run(body.date, String(body.operator));
    } else {
      db.prepare(`DELETE FROM schedule WHERE date = ?`).run(body.date);
    }
  });
  return { ok: true };
});

route('POST', '/api/settings', async ({ body }) => {
  await backupBefore('settings update');
  writeTx(db, 'app', () => {
    for (const [k, v] of Object.entries(body || {})) {
      db.prepare(
        `INSERT INTO settings(key,value_json) VALUES(?,?)
         ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
      ).run(String(k), JSON.stringify(v));
    }
  });
  return { ok: true };
});

for (const table of ['seller_tariffs', 'operator_tariffs']) {
  route('POST', `/api/${table}`, async ({ body }) => {
    await backupBefore(`${table} update`);
    writeTx(db, 'app', () => {
      for (const [article, value] of Object.entries(body || {})) {
        db.prepare(
          `INSERT INTO ${table}(article,value_json) VALUES(?,?)
           ON CONFLICT(article) DO UPDATE SET value_json=excluded.value_json`,
        ).run(requireArticle(article), JSON.stringify(value));
      }
    });
    return { ok: true };
  });
}

// -- reverse flow -----------------------------------------------------------

route('POST', '/api/reverse/units', async ({ body }) => {
  await backupBefore('reverse unit change');
  return saveReverseUnit(body, 'app');
});

route('POST', '/api/reverse/decisions', async ({ body }) => {
  if (!body.unitId) throw new DbError('Не указана карточка', 'BAD_ID');
  requireConfirmation(body, 'Решение по возвратной единице');
  await backupBefore('reverse decision');
  const decisionId = newId('dec');
  writeTx(db, 'app', () => {
    db.prepare(
      `INSERT INTO reverse_decisions(id,unit_id,decided_at,decision,operator,note) VALUES(?,?,?,?,?,?)`,
    ).run(decisionId, String(body.unitId), nowIso(), String(body.decision || ''), String(body.operator || ''), String(body.note || ''));
    auditDecision('REVERSE_DECISION', 'reverse_unit', String(body.unitId), {
      decisionId,
      decision: String(body.decision || ''),
      operator: String(body.operator || ''),
      note: String(body.note || ''),
      confirmedByUser: true,
    });
  });
  return { ok: true, decisionId };
});

// -- reconciliation ---------------------------------------------------------

route('GET', '/api/reconciliation', async () => ({
  runs: db
    .prepare(`SELECT id,started_at AS startedAt,finished_at AS finishedAt,status,rows_seen AS rowsSeen,discrepancies,note
              FROM reconciliation_runs ORDER BY started_at DESC LIMIT 20`)
    .all(),
  discrepancies: db
    .prepare(`SELECT id,run_id AS runId,row_date AS date,article,google_qty AS googleQty,local_qty AS localQty,
                     delta,state,needs_recheck AS needsRecheck,note
              FROM reconciliation_discrepancies ORDER BY row_date,article LIMIT 1000`)
    .all(),
  productMap: db.prepare(`SELECT code,article,product_name AS productName,confidence,confirmed FROM product_map ORDER BY code`).all(),
}));

/**
 * Every confirmed decision, newest last. reconciliation_resolutions only holds
 * the current one per discrepancy, so this is the record that shows what was
 * decided before and what each decision superseded.
 */
route('GET', '/api/reconciliation/history', async () => ({
  decisions: db
    .prepare(
      `SELECT id,discrepancy_key AS discrepancyKey,discrepancy_id AS discrepancyId,run_id AS runId,
              decision,comment,supersedes,decided_at AS decidedAt,decided_by AS decidedBy
       FROM reconciliation_decisions ORDER BY decided_at,id`,
    )
    .all(),
}));

/** The audit log, newest first, with its JSON payload decoded for display. */
route('GET', '/api/audit', async () => ({
  entries: db
    .prepare(
      `SELECT id,recorded_at AS recordedAt,action,entity_type AS entityType,entity_id AS entityId,
              details_json AS detailsJson,source
       FROM audit_log ORDER BY id DESC LIMIT 500`,
    )
    .all()
    .map((r) => ({ ...r, details: safeJson(r.detailsJson, {}), detailsJson: undefined })),
}));

route('POST', '/api/reconciliation/resolve', async ({ body }) => {
  const key = String(body.key ?? '');
  if (!key.includes('|')) throw new DbError('Некорректный ключ расхождения', 'BAD_KEY');
  requireConfirmation(body, 'Закрытие расхождения');
  await backupBefore('reconciliation decision');
  const decision = String(body.decision || 'explained');
  const comment = String(body.comment ?? 'Без комментария');
  const decidedAt = nowIso();
  const discrepancyId = String(body.discrepancyId ?? '');

  writeTx(db, 'app', () => {
    // The previous decision is never destroyed: it is referenced by the new one
    // and kept in reconciliation_decisions, so a confirmed decision can only be
    // superseded by another explicit decision, never silently by the system.
    const previous = db
      .prepare(`SELECT value_json FROM reconciliation_resolutions WHERE key = ?`)
      .get(key);
    const priorValue = previous ? safeJson(previous.value_json, null) : null;
    const supersedes = priorValue?.decisionId ?? null;

    const decisionId = newId('rdec');
    const value = JSON.stringify({ decision, comment, resolvedAt: decidedAt, decisionId });
    db.prepare(
      `INSERT INTO reconciliation_resolutions(key,value_json) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
    ).run(key, value);

    db.prepare(
      `INSERT INTO reconciliation_decisions
         (id,discrepancy_key,discrepancy_id,run_id,decision,comment,supersedes,decided_at,decided_by)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(
      decisionId,
      key,
      discrepancyId || null,
      body.runId ? String(body.runId) : null,
      decision,
      comment,
      supersedes,
      decidedAt,
      body.operator ? String(body.operator) : null,
    );

    if (discrepancyId) {
      db.prepare(
        `UPDATE reconciliation_discrepancies SET state='resolved', needs_recheck=0 WHERE id = ?`,
      ).run(discrepancyId);
    }

    auditDecision('RESOLVE', 'reconciliation', discrepancyId || key, {
      key,
      decision,
      comment,
      decisionId,
      supersedes,
      previousDecision: priorValue?.decision ?? null,
      previousComment: priorValue?.comment ?? null,
      confirmedByUser: true,
    });
  });
  return { ok: true };
});

/**
 * Confirming a disputed code is the only way its mapping is ever applied.
 *
 * Disputed codes stay unconfirmed and are reported as open discrepancies; the
 * sync engine never applies them to stock on its own. This endpoint is the
 * explicit, audited, user-confirmed step that changes one.
 */
route('POST', '/api/reconciliation/confirm-mapping', async ({ body }) => {
  const code = String(body.code ?? '');
  const article = requireArticle(body.article);
  if (!code) throw new DbError('Не указан код товара', 'BAD_CODE');
  requireConfirmation(body, 'Подтверждение соответствия артикула');
  await backupBefore('product mapping confirmation');

  let changed = null;
  writeTx(db, 'app', () => {
    const before = db.prepare(`SELECT code,article,confidence,confirmed FROM product_map WHERE code=?`).get(code);
    if (!before) throw new DbError(`Код товара ${code} отсутствует в таблице соответствий`, 'NO_SUCH_CODE');
    if (before.article === article && before.confirmed === 1) {
      changed = { before, after: before, applied: false };
      return;
    }
    db.prepare(
      `UPDATE product_map SET article=?, confirmed=1, confidence='confirmed', updated_at=? WHERE code=?`,
    ).run(article, nowIso(), code);
    const after = db.prepare(`SELECT code,article,confidence,confirmed FROM product_map WHERE code=?`).get(code);
    changed = { before, after, applied: true };
    auditDecision('CONFIRM_MAPPING', 'product_map', code, {
      code,
      previousArticle: before.article,
      previousConfidence: before.confidence,
      previousConfirmed: before.confirmed,
      article,
      confidence: after.confidence,
      confirmedByUser: true,
    });
  });

  // Applying a mapping changes future reconciliation, so the affected stock is
  // reported rather than rewritten: existing rows keep their article and the
  // difference reappears as a discrepancy the user can decide on.
  return { ok: true, code, article, applied: changed.applied };
});

// -- sync -------------------------------------------------------------------

route('POST', '/api/sync/pvz', async ({ body }) => {
  try {
    return await syncPvz(db, DB_FILE, { backup: body?.backup !== false, dryRun: !!body?.dryRun });
  } catch (err) {
    log(`ПВЗ sync failed: ${err.message}`);
    throw new DbError(`Источник ПВЗ недоступен: ${err.message}`, 'SOURCE_UNAVAILABLE');
  }
});

route('POST', '/api/reconcile', async ({ body }) => {
  try {
    return await reconcileSeller(db, DB_FILE, { backup: body?.backup !== false });
  } catch (err) {
    log(`reconcile failed: ${err.message}`);
    throw new DbError(`Источник селлера недоступен: ${err.message}`, 'SOURCE_UNAVAILABLE');
  }
});

// -- backup / restore -------------------------------------------------------

route('GET', '/api/backups', async () => ({ backups: listBackups(BACKUP_DIR) }));

route('POST', '/api/backup', async ({ body }) => {
  const manual = body?.label === 'manual';
  const dest = await createBackup(db, DB_FILE, {
    label: manual ? 'manual' : 'auto',
    keep: manual ? 999 : 30,
  });
  return { ok: true, file: path.basename(dest), sha256: sha256File(dest) };
});

/**
 * Restore is deliberately awkward: it is the one operation that can destroy
 * data, so the caller must name the backup and confirm in the same request.
 */
route('POST', '/api/restore/:name', async ({ params, body }) => {
  const name = path.basename(decodeURIComponent(params.name));
  const target = path.join(BACKUP_DIR, name);
  if (path.dirname(target) !== BACKUP_DIR || !fs.existsSync(target)) {
    throw new DbError('Резервная копия не найдена', 'BACKUP_NOT_FOUND');
  }
  if (body?.confirm !== true) {
    throw new DbError(
      'Для восстановления требуется явное подтверждение (confirm: true).',
      'CONFIRMATION_REQUIRED',
    );
  }
  // Never overwrite the only good copy: snapshot the current state first.
  const safety = await createBackup(db, DB_FILE, { label: 'manual' });
  log(`restoring from ${name}; current state saved as ${path.basename(safety)}`);

  db.close();
  fs.copyFileSync(target, DB_FILE);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(DB_FILE + suffix)) fs.rmSync(DB_FILE + suffix);
  }
  const reopened = openAndMigrate(DB_FILE, log);
  // Rebind: every route closes over these bindings.
  db = reopened.db;
  health = reopened.health;

  // The restored file carries the audit log it had when the backup was taken, so
  // the restore itself is recorded here against the database now in use.
  writeTx(db, 'restore', () => {
    auditDecision('RESTORE', 'ledger', path.basename(DB_FILE), {
      restoredFrom: name,
      safetyCopy: path.basename(safety),
      integrity: reopened.health.integrity,
      schemaVersion: reopened.migration.to,
      confirmedByUser: true,
    });
  });

  return {
    ok: true,
    restored: name,
    safetyCopy: path.basename(safety),
    integrity: reopened.health.integrity,
    schemaVersion: reopened.migration.to,
  };
});

// ---------------------------------------------------------------------------
// static files
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(req, res) {
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Интерфейс не собран. Запустите сборку приложения.');
    return;
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.join(DIST_DIR, urlPath);
  if (!file.startsWith(DIST_DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST_DIR, 'index.html'); // SPA fallback
  }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.rx.exec(url.pathname);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
    try {
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const result = await r.handler({ params, query: url.searchParams, body, req });
      return send(res, 200, result ?? { ok: true });
    } catch (err) {
      const status =
        err.code === 'NOT_FOUND' || err.code === 'BACKUP_NOT_FOUND' || err.code === 'NO_SUCH_CODE'
          ? 404
          : err.code === 'CONFIRMATION_REQUIRED'
          ? 409
          : err.code === 'IMMUTABLE_ROW' || err.code === 'DUPLICATE_SUPPLY_ID' || err.code === 'DUPLICATE_ID'
          ? 409
          : 400;
      if (status >= 500 || err.code === 'DB_CORRUPT') log(`error ${req.method} ${url.pathname}: ${err.stack || err.message}`);
      return fail(res, status, err.message, err.code || 'ERROR');
    }
  }
  return fail(res, 404, 'Неизвестный метод API', 'NO_ROUTE');
});

/**
 * The specification asks for http://localhost:8783/. That port is however
 * reserved by Windows on machines running Hyper-V/WSL/Docker (it shows up in
 * `netsh interface ipv4 show excludedportrange`), and binding it fails with
 * EACCES. We therefore try the required port first and fall back to the next
 * free one rather than refusing to start; the launcher always opens whichever
 * address we actually bound.
 */
const PREFERRED_PORT = Number(process.env.PORT || 8783);
// De-duplicated and ordered so a port that has just failed can never be retried.
const CANDIDATE_PORTS = [
  ...new Set([PREFERRED_PORT, PREFERRED_PORT + 2, PREFERRED_PORT + 3, 8790, 8800, 9000]),
];

/** Index of the candidate currently being tried; -1 means nothing tried yet. */
let portCursor = -1;
let activePort = null;

/** Advances to the next candidate, or returns null when they are all exhausted. */
function nextCandidatePort() {
  if (portCursor + 1 >= CANDIDATE_PORTS.length) return null;
  portCursor += 1;
  return CANDIDATE_PORTS[portCursor];
}

function listenOnNextPort() {
  const port = nextCandidatePort();
  if (port === null) {
    log(`Не удалось занять ни один порт из: ${CANDIDATE_PORTS.join(', ')}`);
    log('Освободите один из этих портов либо запустите с другой переменной PORT.');
    process.exit(1);
    return;
  }
  log(`пробуем порт ${port}`);
  server.listen(port, HOST);
}

server.on('error', (err) => {
  if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
    const failed = CANDIDATE_PORTS[portCursor];
    // nextCandidatePort() can never return the port that just failed.
    const next = nextCandidatePort();
    if (next !== null) {
      log(`порт ${failed} недоступен (${err.code}), пробуем ${next}`);
      server.listen(next, HOST);
      return;
    }
    log(`Не удалось занять ни один порт из: ${CANDIDATE_PORTS.join(', ')}`);
    log('Освободите один из этих портов либо запустите с другой переменной PORT.');
    process.exit(1);
  }
  log(`fatal: ${err.stack || err.message}`);
  process.exit(1);
});

server.on('listening', () => {
  const shown = server.address()?.port ?? activePort;
  activePort = shown;
  if (shown !== PREFERRED_PORT) {
    log(`ВНИМАНИЕ: порт ${PREFERRED_PORT} недоступен на этой машине. Приложение открыто на порту ${shown}.`);
  }
  log(`PVZ.FLOW is running at http://localhost:${shown}/`);
  log(`data: ${DATA_DIR}`);
  try {
    fs.writeFileSync(path.join(ROOT, 'app', 'runtime.json'), JSON.stringify({ port: shown, url: `http://localhost:${shown}/` }, null, 2));
  } catch {
    /* the launcher also reads stdout */
  }
});

listenOnNextPort();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('shutting down');
    server.close(() => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
  });
}
