// PVZ.FLOW — schema migrations.
// The authoritative baseline is the v2 schema already present in PVZ_FLOW_DATA.sqlite
// (built from PVZ_FLOW_ВОССТАНОВЛЕННАЯ_БАЗА_07-09_02-10.json, sha256 1e881746…42e27).
// We never rebuild it; we only migrate forward so the loaded rows stay untouched.

import * as productMapModule from './productMap.mjs';

export const MIGRATIONS = [
  {
    version: 3,
    name: 'named-unique-supply-id',
    // §4.6/§9: manual shipment requires a unique WB-GI-XXXXXXXXX.
    // v2 relied on an implicit autoindex; give it a stable, explicit name.
    up: (db) => {
      const has = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='ux_shipments_supply_id'`)
        .get();
      if (!has) {
        db.exec(`CREATE UNIQUE INDEX ux_shipments_supply_id ON shipments(supply_id) WHERE supply_id IS NOT NULL`);
      }
    },
  },
  {
    version: 4,
    name: 'audit-source-column',
    // §4.9: audit log must record creation, change, deletion, source and time.
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(audit_log)`).all().map((c) => c.name);
      if (!cols.includes('source')) {
        db.exec(`ALTER TABLE audit_log ADD COLUMN source TEXT NOT NULL DEFAULT 'app'`);
      }
    },
  },
  {
    version: 5,
    name: 'audit-update-delete-triggers',
    // v2 only audited INSERT. §4.9 requires update and delete too.
    up: (db) => {
      const have = new Set(
        db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all().map((r) => r.name),
      );
      for (const [tbl, label] of [
        ['arrivals', 'arrival'],
        ['shipments', 'shipment'],
        ['adjustments', 'adjustment'],
      ]) {
        if (!have.has(`audit_${tbl}_update`)) {
          db.exec(`
            CREATE TRIGGER audit_${tbl}_update AFTER UPDATE ON ${tbl} BEGIN
              INSERT INTO audit_log(recorded_at,action,entity_type,entity_id,details_json,source)
              VALUES(datetime('now'),'UPDATE','${label}',NEW.id,json_object('date',NEW.date,'article',NEW.article,'quantity',NEW.quantity),'app');
            END`);
        }
        if (!have.has(`audit_${tbl}_delete`)) {
          db.exec(`
            CREATE TRIGGER audit_${tbl}_delete AFTER DELETE ON ${tbl} BEGIN
              INSERT INTO audit_log(recorded_at,action,entity_type,entity_id,details_json,source)
              VALUES(datetime('now'),'DELETE','${label}',OLD.id,json_object('date',OLD.date,'article',OLD.article,'quantity',OLD.quantity),'app');
            END`);
        }
      }
    },
  },
  {
    version: 6,
    name: 'reverse-flow-decisions',
    // §8: after inspection a unit goes to direct flow, repair or write-off.
    // v2 had no per-unit decision detail, so "repair" was indistinguishable from direct.
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(reverse_units)`).all().map((c) => c.name);
      if (!cols.includes('decided_at')) {
        db.exec(`ALTER TABLE reverse_units ADD COLUMN decided_at TEXT`);
      }
      if (!cols.includes('counted_in_stock')) {
        // Whether this unit already produced its +1 into the direct balance.
        // §8: completing processing must not grant a second +1.
        db.exec(`ALTER TABLE reverse_units ADD COLUMN counted_in_stock INTEGER NOT NULL DEFAULT 0`);
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS reverse_decisions (
          id TEXT PRIMARY KEY,
          unit_id TEXT NOT NULL REFERENCES reverse_units(id) ON DELETE CASCADE,
          decided_at TEXT NOT NULL,
          decision TEXT NOT NULL CHECK(decision IN ('direct','repair','written_off')),
          operator TEXT,
          note TEXT,
          UNIQUE(unit_id)
        )`);
      // Historical units from 30.09 are already inside the direct balance (§8).
      db.exec(`
        UPDATE reverse_units SET counted_in_stock = 1
         WHERE status IN ('direct','written_off') AND closed_date IS NOT NULL`);
    },
  },
  {
    version: 7,
    name: 'google-sync-state',
    // §6: sync state lives in SQLite; blocking is a fact of syncing, not of date.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_sync_state (
          source_id TEXT PRIMARY KEY,
          last_sync_at TEXT,
          last_status TEXT,
          last_error TEXT,
          rows_seen INTEGER NOT NULL DEFAULT 0,
          rows_added INTEGER NOT NULL DEFAULT 0,
          sha256 TEXT
        )`);
      db.exec(`
        CREATE TABLE IF NOT EXISTS google_supply_rows (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          row_date TEXT NOT NULL,
          article TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          supply_id TEXT,
          destination TEXT,
          operator TEXT,
          raw_json TEXT,
          UNIQUE(source_id, row_date, article, quantity, supply_id)
        )`);
    },
  },
  {
    version: 8,
    name: 'reconciliation',
    // §7: seller table drives deferred reconciliation. Discrepancies are only shown;
    // nothing is auto-corrected, and old decisions are flagged, never deleted.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_runs (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL,
          source_id TEXT,
          rows_seen INTEGER NOT NULL DEFAULT 0,
          discrepancies INTEGER NOT NULL DEFAULT 0,
          note TEXT
        )`);
      db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
          row_date TEXT NOT NULL,
          article TEXT NOT NULL,
          google_qty INTEGER NOT NULL DEFAULT 0,
          local_qty INTEGER NOT NULL DEFAULT 0,
          delta INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL DEFAULT 'open',
          needs_recheck INTEGER NOT NULL DEFAULT 0,
          note TEXT
        )`);
      db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_resolutions (
          id TEXT PRIMARY KEY,
          discrepancy_id TEXT NOT NULL REFERENCES reconciliation_discrepancies(id) ON DELETE CASCADE,
          decided_at TEXT NOT NULL,
          decision TEXT NOT NULL,
          operator TEXT,
          note TEXT
        )`);
    },
  },
  {
    version: 9,
    name: 'ui-prefs-only',
    // §4.2: localStorage/SQLite may keep non-critical UI prefs such as print
    // orientation. Operational data must never live here.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ui_prefs (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`);
    },
  },
  {
    version: 10,
    name: 'meta-last-save',
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(metadata)`).all().map((c) => c.name);
      if (!cols.includes('last_saved_at')) {
        db.exec(`ALTER TABLE metadata ADD COLUMN last_saved_at TEXT`);
      }
    },
  },
  {
    version: 11,
    name: 'product-map',
    // The seller sheet only knows WB product codes. Mapping them onto local
    // articles is a business decision, so it lives in the database and can be
    // corrected from the UI instead of being buried in code.
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_map (
          code TEXT PRIMARY KEY,
          article TEXT NOT NULL,
          product_name TEXT,
          confidence TEXT NOT NULL DEFAULT 'inferred',
          confirmed INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        )`);
      const { SEED_PRODUCT_MAP } = productMapModule;
      const ins = db.prepare(
        `INSERT INTO product_map(code, article, product_name, confidence, confirmed, updated_at)
         VALUES(?,?,?,?,0,datetime('now'))
         ON CONFLICT(code) DO UPDATE SET
           article = excluded.article,
           product_name = excluded.product_name,
           confidence = excluded.confidence`,
      );
      for (const row of SEED_PRODUCT_MAP) ins.run(row.code, row.article, row.name, row.confidence);
    },
  },
  {
    version: 12,
    name: 'audit-source-context-and-disputed-mappings',
    // Two corrections that cannot be expressed by the earlier steps:
    //
    // 1) §4.9 requires the audit log to record WHERE a change came from. The
    //    original v2 INSERT triggers did not mention `source` at all, so every
    //    creation was logged as 'app', and the triggers added in v5 hardcoded
    //    the same literal. We recreate all nine triggers so they read the
    //    ambient source from metadata.audit_source, which the API sets inside
    //    the same transaction as the write it describes.
    //
    // 2) The WB product-code mappings are a business decision. Only the ones we
    //    can actually justify are confirmed; the disputed ones stay unconfirmed
    //    so reconciliation reports them instead of silently rewriting stock.
    up: (db) => {
      const sourceExpr = `coalesce((SELECT value FROM metadata WHERE key='audit_source'),'app')`;

      db.exec(`
        DROP TRIGGER IF EXISTS audit_arrival_insert;
        DROP TRIGGER IF EXISTS audit_arrivals_update;
        DROP TRIGGER IF EXISTS audit_arrivals_delete;
        DROP TRIGGER IF EXISTS audit_shipment_insert;
        DROP TRIGGER IF EXISTS audit_shipments_update;
        DROP TRIGGER IF EXISTS audit_shipments_delete;
        DROP TRIGGER IF EXISTS audit_adjustment_insert;
        DROP TRIGGER IF EXISTS audit_adjustments_update;
        DROP TRIGGER IF EXISTS audit_adjustments_delete;
      `);

      const tables = [
        ['arrivals', 'arrival', 'supply_id', null],
        ['shipments', 'shipment', 'supply_id', 'supplyId'],
        ['adjustments', 'adjustment', 'source_arrival_date', 'sourceArrivalDate'],
      ];
      for (const [tbl, label, extraCol, extraKey] of tables) {
        // A DELETE trigger has no NEW row, so the extra column must be read from OLD.
        const extraNew = extraKey ? `,'${extraKey}',NEW.${extraCol}` : '';
        const extraOld = extraKey ? `,'${extraKey}',OLD.${extraCol}` : '';
        db.exec(`
          CREATE TRIGGER audit_${tbl}_insert AFTER INSERT ON ${tbl} BEGIN
            INSERT INTO audit_log(recorded_at,action,entity_type,entity_id,details_json,source)
            VALUES(datetime('now'),'INSERT','${label}',NEW.id,
              json_object('date',NEW.date,'article',NEW.article,'quantity',NEW.quantity${extraNew}),
              ${sourceExpr});
          END`);
        db.exec(`
          CREATE TRIGGER audit_${tbl}_update AFTER UPDATE ON ${tbl} BEGIN
            INSERT INTO audit_log(recorded_at,action,entity_type,entity_id,details_json,source)
            VALUES(datetime('now'),'UPDATE','${label}',NEW.id,
              json_object('date',NEW.date,'article',NEW.article,'quantity',NEW.quantity${extraNew}),
              ${sourceExpr});
          END`);
        db.exec(`
          CREATE TRIGGER audit_${tbl}_delete AFTER DELETE ON ${tbl} BEGIN
            INSERT INTO audit_log(recorded_at,action,entity_type,entity_id,details_json,source)
            VALUES(datetime('now'),'DELETE','${label}',OLD.id,
              json_object('date',OLD.date,'article',OLD.article,'quantity',OLD.quantity${extraOld}),
              ${sourceExpr});
          END`);
      }

      db.prepare(
        `INSERT INTO metadata(key, value) VALUES('audit_source','app')
         ON CONFLICT(key) DO NOTHING`,
      ).run();

      // Confirmed: article is legible in the product name (Г-1800 / Г-3500) and
      // the Ми-* codes are the canonical МК-К/МК-П articles used by the ПВЗ sheet.
      const confirmed = [
        ['402395402', 'high'],
        ['548182523', 'high'],
        ['687469463', 'verified'],
        ['706101815', 'verified'],
      ];
      for (const [code, confidence] of confirmed) {
        db.prepare(
          `UPDATE product_map SET confirmed = 1, confidence = ?, updated_at = datetime('now') WHERE code = ?`,
        ).run(confidence, code);
      }

      // Disputed on purpose: several WB codes share a generic description that
      // fits more than one local article. Never auto-corrected, never applied to
      // stock — surfaced as a discrepancy until the user confirms.
      const disputed = ['1006014419', '1088614022', '604564457'];
      for (const code of disputed) {
        db.prepare(
          `UPDATE product_map SET confirmed = 0, confidence = 'disputed', updated_at = datetime('now') WHERE code = ?`,
        ).run(code);
      }

      db.prepare(
        `INSERT INTO metadata(key, value) VALUES('schemaVersion','12')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run();
    },
  },
  {
    version: 13,
    name: 'fix-audit-delete-triggers',
    up(db) {
      // Migration 12 reused the NEW.* reference inside the AFTER DELETE triggers,
      // where no NEW row exists. Any DELETE on shipments or adjustments therefore
      // failed with "no such column: NEW.supply_id", which made it impossible to
      // remove an erroneous row from the UI. The database already sat at version
      // 12 when this was found, so the corrected triggers are rebuilt here.
      db.exec(`
        DROP TRIGGER IF EXISTS audit_arrivals_delete;
        DROP TRIGGER IF EXISTS audit_shipments_delete;
        DROP TRIGGER IF EXISTS audit_adjustments_delete;
      `);

      const sourceExpr = `coalesce((SELECT value FROM metadata WHERE key='audit_source'),'app')`;
      const deletes = [
        ['arrivals', 'arrival', ''],
        ['shipments', 'shipment', `,'supplyId',OLD.supply_id`],
        ['adjustments', 'adjustment', `,'sourceArrivalDate',OLD.source_arrival_date`],
      ];
      for (const [tbl, label, extraOld] of deletes) {
        db.exec(`
          CREATE TRIGGER audit_${tbl}_delete AFTER DELETE ON ${tbl} BEGIN
            INSERT INTO audit_log(recorded_at,action,entity_type,entity_id,details_json,source)
            VALUES(datetime('now'),'DELETE','${label}',OLD.id,
              json_object('date',OLD.date,'article',OLD.article,'quantity',OLD.quantity${extraOld}),
              ${sourceExpr});
          END`);
      }

      db.prepare(
        `INSERT INTO metadata(key, value) VALUES('schemaVersion','13')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run();
    },
  },
  {
    version: 14,
    name: 'append-only-decision-history',
    up(db) {
      // reconciliation_resolutions is keyed by discrepancy, so recording a new
      // decision overwrote the previous one. That silently revoked a decision the
      // user had already confirmed, which is exactly what must never happen
      // automatically. This table keeps every confirmed decision as its own row;
      // reconciliation_resolutions stays as the "current" view over it.
      db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_decisions(
          id TEXT PRIMARY KEY,
          discrepancy_key TEXT NOT NULL,
          discrepancy_id TEXT,
          run_id TEXT,
          decision TEXT NOT NULL,
          comment TEXT,
          supersedes TEXT,
          decided_at TEXT NOT NULL,
          decided_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_reconciliation_decisions_key
          ON reconciliation_decisions(discrepancy_key, decided_at);
      `);

      // Every confirmed change must leave a separate record in the audit log.
      // Decisions are not ledger rows, so the INSERT/UPDATE/DELETE triggers do
      // not see them; they are written explicitly by the routes that apply them.
      db.prepare(
        `INSERT INTO metadata(key, value) VALUES('schemaVersion','14')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run();
    },
  },
];

/**
 * The v2 baseline schema, reproduced verbatim from the authoritative ledger.
 *
 * A shipped build already contains PVZ_FLOW_DATA.sqlite, so this is normally a
 * no-op. It exists so that a genuinely empty database (first run, or a restored
 * directory that lost the file) comes up as a valid empty ledger instead of
 * failing halfway through a migration. No rows are ever invented here.
 */
const BASELINE_SCHEMA = `
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS arrivals(
  id TEXT PRIMARY KEY, date TEXT NOT NULL, article TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  type TEXT NOT NULL CHECK(type IN ('arrival','return')),
  note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shipments(
  id TEXT PRIMARY KEY, date TEXT NOT NULL, article TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  supply_id TEXT UNIQUE, source TEXT, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS adjustments(
  id TEXT PRIMARY KEY, date TEXT NOT NULL, article TEXT NOT NULL, quantity INTEGER NOT NULL,
  kind TEXT, position TEXT, reason TEXT, note TEXT, source_arrival_date TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, recorded_at TEXT NOT NULL, action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT, details_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS app_state(
  key TEXT PRIMARY KEY, value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS schedule(date TEXT PRIMARY KEY, operator TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seller_tariffs(article TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operator_tariffs(article TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reverse_units(
  id TEXT PRIMARY KEY, article TEXT NOT NULL, received_date TEXT NOT NULL, status TEXT NOT NULL,
  defects_json TEXT NOT NULL DEFAULT '[]', closed_date TEXT);
CREATE TABLE IF NOT EXISTS reverse_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id TEXT NOT NULL REFERENCES reverse_units(id) ON DELETE CASCADE,
  stage TEXT NOT NULL, date TEXT NOT NULL, operator TEXT NOT NULL,
  UNIQUE(unit_id,stage,date,operator));
CREATE TABLE IF NOT EXISTS reconciliation_resolutions(key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
`;

export function ensureBaselineSchema(db) {
  db.exec(BASELINE_SCHEMA);
}

export function currentVersion(db) {
  const row = db.prepare(`SELECT max(version) AS v FROM schema_migrations`).get();
  return row && row.v ? Number(row.v) : 0;
}

export function migrate(db, log = () => {}) {
  ensureBaselineSchema(db);
  const from = currentVersion(db);
  for (const m of MIGRATIONS) {
    if (m.version <= from) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      m.up(db);
      db.prepare(`INSERT INTO schema_migrations(version, applied_at) VALUES(?, datetime('now'))`).run(
        m.version,
      );
      db.exec('COMMIT');
      log(`applied migration ${m.version} (${m.name})`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${m.version} (${m.name}) failed: ${err.message}`);
    }
  }
  return { from, to: currentVersion(db) };
}