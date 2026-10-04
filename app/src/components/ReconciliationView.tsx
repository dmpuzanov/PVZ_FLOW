import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, HelpCircle, Printer, RefreshCw } from 'lucide-react';
import { ALL_ARTICLES } from '../constants/initialData';
import { Article } from '../types/pvz';
import { ApiError, api } from '../utils/api';

type Run = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  rowsSeen: number;
  discrepancies: number;
  note: string;
};
type Discrepancy = {
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
type MapRow = { code: string; article: Article; productName: string; confidence: string; confirmed: number };
type Decision = 'pvz' | 'seller' | 'explained';

const label = (d: Decision) =>
  d === 'seller' ? 'Приняты данные селлера' : d === 'pvz' ? 'Подтверждены данные ПВЗ' : 'Расхождение объяснено';

const fmtDate = (isoDate: string) => isoDate.split('-').reverse().join('.');

export const ReconciliationView: React.FC = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [productMap, setProductMap] = useState<MapRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [open, setOpen] = useState('');
  const [comment, setComment] = useState('');
  // Nothing is applied by choosing an option. The first click only proposes, the
  // second one confirms, and only then is the request sent with confirm: true.
  const [pending, setPending] = useState<{ key: string; label: string; apply: () => Promise<void> } | null>(null);

  const cancelPending = () => setPending(null);

  const load = useCallback(async () => {
    try {
      const data = await api.reconciliation();
      setRuns(data.runs ?? []);
      setDiscrepancies(data.discrepancies ?? []);
      setProductMap(data.productMap ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // §7 — the server owns the comparison. The browser never downloads the sheets
  // itself, so a run is always reproducible and auditable through audit_log.
  const runReconcile = async () => {
    setBusy(true);
    setError('');
    try {
      const result = (await api.reconcile()) as { rowsSeen?: number; discrepancies?: number; status?: string };
      await load();
      setError(
        result.status === 'failed'
          ? 'Источник селлера недоступен. Сверка не выполнена, данные ПВЗ не изменены.'
          : '',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (row: Discrepancy, decision: Decision) => {
    setBusy(true);
    setError('');
    try {
      await api.resolveDiscrepancy({
        key: `${row.date}|${row.article}`,
        decision,
        comment: comment.trim() || 'Без комментария',
        discrepancyId: row.id,
        runId: row.runId,
        confirm: true,
      });
      setComment('');
      setOpen('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const confirmMapping = async (code: string, article: Article) => {
    setBusy(true);
    setError('');
    try {
      await api.confirmMapping(code, article);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  /** First step: describe what would change and wait for a deliberate second click. */
  const propose = (key: string, text: string, apply: () => Promise<void>) => setPending({ key, label: text, apply });

  const disputed = useMemo(() => productMap.filter((m) => !m.confirmed), [productMap]);
  const openRows = useMemo(() => discrepancies.filter((d) => d.state === 'open'), [discrepancies]);
  const lastRun = runs[0];
  const rows = onlyDiff ? openRows : discrepancies;

  return (
    <div className="flex-1 overflow-auto bg-[#f6f4f1] p-6">
      <div className="max-w-[1450px] mx-auto space-y-5">
        <div className="flex flex-wrap justify-between gap-3 items-center">
          <div>
            <h2 className="text-xl font-bold text-[#5A081E]">
              Сверка ПВЗ / селлер <span className="text-xs font-normal text-stone-400">версия 3.2</span>
            </h2>
            <p className="text-sm text-stone-500">
              Сверка выполняется на сервере и только записывает расхождения — остатки не изменяются.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button onClick={() => window.print()} className="px-3 py-2 bg-white border rounded-lg text-sm">
              <Printer className="inline w-4 h-4 mr-1" />Печать
            </button>
            <button onClick={() => void load()} disabled={loading} className="px-3 py-2 bg-white border rounded-lg text-sm disabled:opacity-50">
              Обновить
            </button>
            <button onClick={runReconcile} disabled={busy} className="px-4 py-2 rounded-lg bg-[#5A081E] text-white text-sm font-semibold disabled:opacity-50">
              <RefreshCw className={`inline w-4 h-4 mr-2 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Сверка…' : 'Сверить сейчас'}
            </button>
          </div>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <AlertTriangle className="inline w-4 h-4 mr-2" />
          <strong>Правило суток:</strong> данные ПВЗ применяются сразу. Данные селлера сверяются с задержкой
          в один день, поэтому отсутствие строки у селлера означает ожидание данных, а не ошибку ПВЗ.
        </div>

        {error && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            <AlertTriangle className="inline w-4 h-4 mr-2" />{error}
          </div>
        )}

        {/* Disputed mappings must never be auto-applied. */}
        {disputed.length > 0 && (
          <div className="bg-white border-2 border-[#BD995A] rounded-xl p-5">
            <h3 className="font-bold text-[#5A081E] mb-1">
              <HelpCircle className="inline w-4 h-4 mr-1" />
              Требуют подтверждения соответствия товаров ({disputed.length})
            </h3>
            <p className="text-xs text-stone-500 mb-3">
              Автоматическое сопоставление отключено: строки с этими кодами не попадают в сверку, пока вы
              не подтвердите соответствие вручную.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-100 text-left">
                  <th className="p-2">Код WB</th>
                  <th className="p-2">Товар в таблице</th>
                  <th className="p-2">Предполагаемый артикул</th>
                  <th className="p-2">Подтвердить как</th>
                </tr>
              </thead>
              <tbody>
                {disputed.map((m) => (
                  <tr key={m.code} className="border-t">
                    <td className="p-2 font-mono">{m.code}</td>
                    <td className="p-2">{m.productName || '—'}</td>
                    <td className="p-2 font-semibold text-amber-700">{m.article}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1 print:hidden">
                        {ALL_ARTICLES.map((a) => (
                          <button
                            key={a}
                            onClick={() =>
                              propose(
                                `map:${m.code}`,
                                `Подтвердить соответствие: код ${m.code} → ${a}. Код начнёт участвовать в сверке, существующие строки не изменятся.`,
                                () => confirmMapping(m.code, a),
                              )
                            }
                            disabled={busy}
                            className={`px-2 py-1 rounded border text-xs font-semibold disabled:opacity-50 ${
                              a === m.article
                                ? 'border-[#5A081E] text-[#5A081E] bg-[#FDF6F8]'
                                : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                            }`}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                      {pending?.key === `map:${m.code}` && (
                        <div className="mt-2 p-2 rounded border border-[#BD995A] bg-[#FDF6F8] text-xs">
                          <p className="mb-2 text-stone-700">{pending.label}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => void pending.apply()}
                              disabled={busy}
                              className="px-2 py-1 rounded bg-[#5A081E] text-white font-semibold disabled:opacity-50"
                            >
                              Подтверждаю
                            </button>
                            <button
                              onClick={cancelPending}
                              disabled={busy}
                              className="px-2 py-1 rounded border bg-white font-semibold disabled:opacity-50"
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      )}
                      <span className="hidden print:inline text-xs">{m.article}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-stone-500">Строк обработано</div>
            <b className="text-2xl">{lastRun?.rowsSeen ?? 0}</b>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-stone-500">Требуют проверки</div>
            <b className="text-2xl text-amber-700">{openRows.length}</b>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-stone-500">Обработано</div>
            <b className="text-2xl text-emerald-700">{discrepancies.length - openRows.length}</b>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-stone-500">Последняя сверка</div>
            <b className="text-sm">
              {lastRun?.finishedAt ? new Date(lastRun.finishedAt).toLocaleString('ru-RU') : 'не выполнялась'}
            </b>
          </div>
        </div>

        {lastRun?.status === 'failed' && lastRun.note && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            Последняя сверка завершилась ошибкой: {lastRun.note}
          </div>
        )}

        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <b>Результаты сверки</b>
            <label className="text-sm print:hidden">
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={(e) => setOnlyDiff(e.target.checked)}
                className="mr-2"
              />
              только открытые
            </label>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#EEE5D6] text-[#5A081E]">
              <tr>
                {['Дата', 'Артикул', 'Селлер', 'ПВЗ (наш учёт)', 'Разница', 'Статус', ''].map((x, i) => (
                  <th className="text-left px-4 py-2" key={i}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t hover:bg-stone-50">
                      <td className="px-4 py-2 font-mono">{fmtDate(r.date)}</td>
                      <td className="px-4 py-2 font-semibold">{r.article}</td>
                      <td className="px-4 py-2">{r.googleQty}</td>
                      <td className="px-4 py-2">{r.localQty}</td>
                      <td className={`px-4 py-2 font-bold ${r.delta ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {r.delta > 0 ? '+' : ''}{r.delta}
                      </td>
                      <td className="px-4 py-2">
                        {r.state === 'resolved' ? (
                          <span className="text-emerald-700">
                            <CheckCircle2 className="inline w-4 h-4 mr-1" />Обработано
                          </span>
                        ) : (
                          <span className="text-amber-700">
                            Расхождение{r.needsRecheck ? ' · требует перепроверки' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 print:hidden">
                        {r.state === 'open' && (
                          <button
                            onClick={() => { setOpen(isOpen ? '' : r.id); setComment(''); }}
                            className="text-[#5A081E] font-semibold"
                          >
                            Проверить {isOpen ? <ChevronUp className="inline w-4 h-4" /> : <ChevronDown className="inline w-4 h-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t bg-[#faf7f1]">
                        <td colSpan={7} className="p-4">
                          {r.note && <p className="text-xs text-stone-600 mb-2">{r.note}</p>}
                          <h4 className="font-bold mb-2">Результат проверки</h4>
                          <p className="text-xs text-stone-600 mb-2">
                            Выбор варианта ничего не изменяет. Расхождение останется открытым, пока вы не
                            подтвердите решение отдельной кнопкой; каждое подтверждение попадает в журнал аудита.
                          </p>
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Комментарий: что проверено и почему выбран этот вариант"
                            className="w-full h-20 p-2 border rounded bg-white"
                          />
                          <div className="flex flex-wrap gap-2 mt-2 print:hidden">
                            {(['seller', 'pvz', 'explained'] as Decision[]).map((d) => (
                              <button
                                key={d}
                                onClick={() =>
                                  propose(
                                    `disc:${r.id}`,
                                    `${label(d)}: расхождение ${fmtDate(r.date)} по ${r.article} на ${r.delta > 0 ? '+' : ''}${r.delta} шт будет отмечено обработанным.`,
                                    () => resolve(r, d),
                                  )
                                }
                                disabled={busy}
                                className={`px-3 py-2 rounded text-xs font-semibold disabled:opacity-50 ${
                                  d === 'seller'
                                    ? 'bg-[#5A081E] text-white'
                                    : d === 'pvz'
                                      ? 'bg-[#BD995A] text-stone-900'
                                      : 'border bg-white'
                                }`}
                              >
                                {d === 'seller' ? 'Верно у селлера' : d === 'pvz' ? 'Верно в ПВЗ' : 'Расхождение объяснено'}
                              </button>
                            ))}
                          </div>
                          {pending?.key === `disc:${r.id}` && (
                            <div className="mt-2 p-3 rounded border border-[#BD995A] bg-[#FDF6F8] text-xs print:hidden">
                              <p className="mb-2 text-stone-700">{pending.label}</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => void pending.apply()}
                                  disabled={busy}
                                  className="px-3 py-2 rounded bg-[#5A081E] text-white font-semibold disabled:opacity-50"
                                >
                                  Подтверждаю решение
                                </button>
                                <button
                                  onClick={cancelPending}
                                  disabled={busy}
                                  className="px-3 py-2 rounded border bg-white font-semibold disabled:opacity-50"
                                >
                                  Отмена
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-500">
                    {loading ? 'Загрузка…' : 'Открытых расхождений нет.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {runs.length > 0 && (
          <div className="bg-white border rounded-xl p-4">
            <h3 className="font-bold mb-2">История сверок</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-100 text-left">
                  <th className="p-2">Начало</th>
                  <th className="p-2">Статус</th>
                  <th className="p-2">Строк</th>
                  <th className="p-2">Расхождений</th>
                  <th className="p-2">Примечание</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{new Date(r.startedAt).toLocaleString('ru-RU')}</td>
                    <td className="p-2">{r.status === 'ok' ? 'выполнена' : 'ошибка'}</td>
                    <td className="p-2">{r.rowsSeen}</td>
                    <td className="p-2">{r.discrepancies}</td>
                    <td className="p-2 text-stone-500">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
