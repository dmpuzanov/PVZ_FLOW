// PVZ.FLOW — database access layer.
// Uses node:sqlite (built into Node 22.5+/24), so there is no native addon to
// ship and the portable build needs nothing installed.

import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { migrate } from './migrations.mjs';

export const RETENTION = { keepAutomatic: 30, keepManual: 999 };

export class DbError extends Error {
  constructor(message, code = 'DB_ERROR') {
    super(message);
    this.code = code;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function newId(prefix) {
  // Immutable unique operation id (§4.5).
  const t = Date.now().toString(36);
  const r = crypto.randomBytes(6).toString('hex');
  return `${prefix}-${t}-${r}`;
}

export function openDatabase(file, { readonly = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { readOnly: readonly });

  if (!readonly) {
    // §4.3 transactional writes; §11 WAL + durable commits.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 10000');
  }
  return db;
}

/**
 * §5 / test 13: refuse to run on a damaged database rather than silently
 * substituting demo data. Returns integrity + foreign-key status or throws.
 */
export function inspectIntegrity(db) {
  let integrity;
  try {
    integrity = db.prepare('PRAGMA integrity_check').get();
  } catch (err) {
    throw new DbError(`База данных недоступна: ${err.message}`, 'DB_UNREADABLE');
  }
  const integrityText = integrity && Object.values(integrity)[0];
  if (integrityText !== 'ok') {
    throw new DbError(
      `База данных повреждена (integrity_check: ${integrityText}). Демонстрационные данные не подставляются. Восстановитесь из резервной копии.`,
      'DB_CORRUPT',
    );
  }
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  return { integrity: integrityText, foreignKeyViolations: fk.length };
}

export function openAndMigrate(file, log = () => {}) {
  const db = openDatabase(file);
  const health = inspectIntegrity(db);
  const res = migrate(db, log);
  inspectIntegrity(db);
  return { db, health, migration: res };
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    touchLastSaved(db);
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

export function touchLastSaved(db) {
  try {
    db.prepare(
      `INSERT INTO metadata(key, value, last_saved_at) VALUES('last_saved_at', ?, ?)
       ON CONFLICT(key) DO UPDATE SET last_saved_at = excluded.last_saved_at`,
    ).run(nowIso(), nowIso());
  } catch {
    /* metadata is advisory only */
  }
}

/**
 * §4.9: the audit triggers read metadata.audit_source, so the origin of a write
 * ('app', 'google', 'import', 'restore', …) is recorded with the row itself.
 * Must be called inside the same transaction as the write it describes.
 */
export function setAuditSource(db, source) {
  db.prepare(
    `INSERT INTO metadata(key, value) VALUES('audit_source', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(source || 'app'));
}

/** Transactional write that stamps the audit origin (§4.3 + §4.9). */
export function writeTx(db, source, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    setAuditSource(db, source);
    const out = fn();
    touchLastSaved(db);
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

/**
 * §11: back up with the SQLite backup API, never by copying a live WAL file.
 * node:sqlite exposes backup() on DatabaseSync.
 *
 * Backups live in their own directory (`data/backups`) so they can never be
 * mistaken for, or opened as, the live ledger.
 */
export async function createBackup(
  db,
  file,
  { label = 'auto', keep = RETENTION.keepAutomatic, backupDir } = {},
) {
  const dir = backupDir ?? path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, '-');
  const base = path.basename(file).replace(/\.sqlite$/, '');
  const dest = path.join(dir, `${base}_${label}_${stamp}.sqlite`);
  // Online backup API: consistent snapshot even while WAL is active.
  await sqliteBackup(db, dest);

  // journal_mode is part of the database header, so the copy arrives in WAL mode
  // and reopening it (for the integrity check below) recreates -wal/-shm next to
  // it. Rewriting the snapshot to rollback-journal mode makes each backup one
  // self-contained file that restores correctly on its own.
  const check = new DatabaseSync(dest);
  try {
    check.exec('PRAGMA journal_mode=DELETE');
    const row = check.prepare('PRAGMA integrity_check').get();
    const text = row && Object.values(row)[0];
    if (text !== 'ok') {
      throw new DbError(`Резервная копия не прошла проверку: ${text}`, 'BACKUP_CORRUPT');
    }
  } finally {
    check.close();
  }
  // Only now, with nothing left to reopen the file, drop the sidecars.
  for (const suffix of ['-wal', '-shm']) {
    const extra = dest + suffix;
    if (fs.existsSync(extra)) fs.rmSync(extra);
  }
  pruneBackups(dir, label, keep);
  return dest;
}

export function pruneBackups(dir, label, keep) {
  if (!keep || keep >= RETENTION.keepManual) return;
  const prefix = `PVZ_FLOW_DATA_${label}_`;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.sqlite'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) {
    try {
      fs.rmSync(path.join(dir, f));
    } catch {
      /* leave it if locked */
    }
  }
}

export function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return {
        name: f,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
        label: f.includes('_manual_') ? 'manual' : 'auto',
        sha256: sha256File(full),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}