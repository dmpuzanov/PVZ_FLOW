/**
 * PVZ.FLOW — typed client for the local SQLite API.
 *
 * §4.2: the database is the only source of operational truth. The browser keeps
 * no ledger copy, so every mutation here is a real request and the returned row
 * is what the UI renders.
 */

import type {
  AdjustmentRecord,
  ArrivalRecord,
  Article,
  OperatorTariff,
  ScheduleMap,
  SellerTariff,
  Settings,
  ShipmentRecord,
} from '../types/pvz';

export type ReverseFlowUnit = {
  id: string;
  article: Article;
  receivedDate: string;
  status: 'awaiting' | 'repair' | 'direct' | 'written_off';
  defects: string[];
  closedDate?: string | null;
  decidedAt?: string | null;
  /** Server-derived (§8); the client value is only a hint. */
  countedInStock?: boolean;
  events: { stage: string; date: string; operator: string }[];
};

export type ReconciliationResolution = {
  decision: 'pvz' | 'seller' | 'explained';
  comment: string;
  resolvedAt: string;
};

export type AppState = {
  arrivals: ArrivalRecord[];
  shipments: ShipmentRecord[];
  adjustments: AdjustmentRecord[];
  schedule: ScheduleMap;
  settings: Settings;
  sellerTariffs: Record<Article, SellerTariff>;
  operatorTariffs: Record<Article, OperatorTariff>;
  reverseFlowUnits: ReverseFlowUnit[];
  reconciliationResolutions: Record<string, ReconciliationResolution>;
  meta: {
    schemaVersion: number;
    dataThrough: string | null;
    sourceFile: string | null;
    sourceSha256: string | null;
    lastSavedAt: string | null;
  };
};

export type Health = {
  status: string;
  schemaVersion: number;
  integrity: string;
  foreignKeyViolations: number;
  database: string;
  lastSavedAt: string | null;
  dataThrough: string | null;
  sources: { pvz: { id: string; url: string; state: Record<string, unknown> | null } };
  reconciliation: Record<string, unknown>;
  backups: number;
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      'Локальный сервер недоступен. Проверьте, что PVZ.FLOW запущен, и повторите действие.',
      0,
      'SERVER_DOWN',
    );
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* empty body */
  }
  if (!response.ok) {
    const p = payload as { error?: string; code?: string } | null;
    throw new ApiError(p?.error ?? `Ошибка ${response.status}`, response.status, p?.code ?? 'ERROR');
  }
  return payload as T;
}

export type ReconciliationRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  rowsSeen: number;
  discrepancies: number;
  note: string;
};

export type ReconciliationDiscrepancy = {
  id: string;
  runId: string;
  date: string;
  article: Article;
  googleQty: number;
  localQty: number;
  delta: number;
  state: 'open' | 'resolved';
  needsRecheck: number;
  note: string;
};

export type ProductMapRow = {
  code: string;
  article: Article;
  productName: string;
  confidence: string;
  confirmed: number;
};

export const api = {
  health: () => request<Health>('GET', '/api/health'),
  state: () => request<AppState>('GET', '/api/state'),

  createArrival: (body: Omit<ArrivalRecord, 'id' | 'createdAt'>) =>
    request<{ id: string }>('POST', '/api/arrivals', body),
  updateArrival: (id: string, body: Partial<Omit<ArrivalRecord, 'id' | 'createdAt'>>) =>
    request<{ id: string }>('PATCH', `/api/arrivals/${encodeURIComponent(id)}`, body),
  deleteArrival: (id: string) =>
    request<{ id: string }>('DELETE', `/api/arrivals/${encodeURIComponent(id)}`),

  createShipment: (body: Omit<ShipmentRecord, 'id' | 'createdAt'>) =>
    request<{ id: string }>('POST', '/api/shipments', body),
  updateShipment: (id: string, body: Partial<Omit<ShipmentRecord, 'id' | 'createdAt'>>) =>
    request<{ id: string }>('PATCH', `/api/shipments/${encodeURIComponent(id)}`, body),
  deleteShipment: (id: string) =>
    request<{ id: string }>('DELETE', `/api/shipments/${encodeURIComponent(id)}`),

  createAdjustment: (body: Omit<AdjustmentRecord, 'id' | 'createdAt'>) =>
    request<{ id: string }>('POST', '/api/adjustments', body),
  updateAdjustment: (id: string, body: Partial<Omit<AdjustmentRecord, 'id' | 'createdAt'>>) =>
    request<{ id: string }>('PATCH', `/api/adjustments/${encodeURIComponent(id)}`, body),
  deleteAdjustment: (id: string) =>
    request<{ id: string }>('DELETE', `/api/adjustments/${encodeURIComponent(id)}`),

  setSchedule: (date: string, operator?: string) =>
    request<{ ok: true }>('POST', '/api/schedule', { date, operator }),
  saveSettings: (patch: Partial<Settings>) => request<{ ok: true }>('POST', '/api/settings', patch),
  saveSellerTariffs: (value: Partial<Record<Article, SellerTariff>>) =>
    request<{ ok: true }>('POST', '/api/seller_tariffs', value),
  saveOperatorTariffs: (value: Partial<Record<Article, OperatorTariff>>) =>
    request<{ ok: true }>('POST', '/api/operator_tariffs', value),

  saveReverseUnit: (unit: Partial<ReverseFlowUnit> & { id: string }) =>
    request<{ id: string }>('POST', '/api/reverse/units', unit),

  syncPvz: (dryRun = false) =>
    request<Record<string, unknown>>('POST', '/api/sync/pvz', { dryRun }),
  reconcile: () => request<Record<string, unknown>>('POST', '/api/reconcile'),
  reconciliation: () =>
    request<{
      runs: ReconciliationRun[];
      discrepancies: ReconciliationDiscrepancy[];
      productMap: ProductMapRow[];
    }>('GET', '/api/reconciliation'),
  resolveDiscrepancy: (body: {
    key: string;
    decision: 'pvz' | 'seller' | 'explained';
    comment?: string;
    discrepancyId?: string;
    runId?: string;
    operator?: string;
    // The server refuses to change anything without this flag. It is set only
    // after the user has actually answered the confirmation prompt.
    confirm: true;
  }) => request<{ ok: true }>('POST', '/api/reconciliation/resolve', body),
  confirmMapping: (code: string, article: Article) =>
    request<{ ok: true; code: string; article: Article; applied: boolean }>(
      'POST',
      '/api/reconciliation/confirm-mapping',
      { code, article, confirm: true },
    ),

  createBackup: () => request<{ file: string; sha256: string }>('POST', '/api/backup', { label: 'manual' }),
  listBackups: () =>
    request<{ backups: { name: string; sizeBytes: number; createdAt: string; label: string; sha256: string }[] }>(
      'GET',
      '/api/backups',
    ),
  restoreBackup: (name: string) =>
    request<{ ok: true; restored: string; safetyCopy: string }>(
      'POST',
      `/api/restore/${encodeURIComponent(name)}`,
      { confirm: true },
    ),
};

/**
 * §9 — accepts the forms a scanner or a human actually produces:
 *   WB-GI-123456789, wb-gi-123456789, WB GI 123 456 789, ЦИ-ПШ-123456789
 * Returns the canonical WB-GI-XXXXXXXXX form, or null when nothing matches.
 */
export function parseSupplyId(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[–—−]/g, '-');

  const wbgi = upper.match(/WB[\s\-_]?GI[\s\-_]?(\d[\d\s]{5,})/);
  if (wbgi) {
    const digits = wbgi[1].replace(/\D/g, '');
    if (digits.length >= 6) return `WB-GI-${digits}`;
  }
  const cish = upper.match(/ЦИ[\s\-_]?ПШ[\s\-_]?(\d[\d\s]{5,})/);
  if (cish) {
    const digits = cish[1].replace(/\D/g, '');
    if (digits.length >= 6) return `WB-GI-${digits}`;
  }
  return null;
}

/** Pulls every WB-GI / ЦИ-ПШ identifier out of a pasted multi-line block. */
export function parseSupplyIds(text: string): { supplyId: string; unknown: string[] } {
  const found: string[] = [];
  const unknown: string[] = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseSupplyId(trimmed);
    if (parsed) {
      if (!found.includes(parsed)) found.push(parsed);
    } else {
      unknown.push(trimmed);
    }
  }
  return { supplyId: found[0] ?? '', unknown };
}
