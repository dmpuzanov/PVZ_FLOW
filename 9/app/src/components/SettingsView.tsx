import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Download,
  Upload,
  Sliders,
  DollarSign,
  Building,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { ALL_ARTICLES, ARTICLE_MAP } from '../constants/initialData';
import { usePvz } from '../context/PvzContext';
import { Article, OperatorTariff, SellerTariff } from '../types/pvz';
import { ApiError, api } from '../utils/api';

type BackupInfo = { name: string; sizeBytes: number; createdAt: string; label: string; sha256: string };

export const SettingsView: React.FC = () => {
  const {
    settings,
    sellerTariffs,
    operatorTariffs,
    updateSettings,
    updateSellerTariff,
    updateOperatorTariff,
    createBackup,
    refresh,
    addToast,
  } = usePvz();

  const [pvzName, setPvzName] = useState(settings.pvzName);
  const [sellerName, setSellerName] = useState(settings.sellerName);
  const [reportDateFrom, setReportDateFrom] = useState(settings.reportDateFrom);
  const [reportDateTo, setReportDateTo] = useState(settings.reportDateTo);
  const [freeStorageDays, setFreeStorageDays] = useState(settings.freeStorageDays ?? 5);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  /** §11 — restore only ever runs behind an explicit confirmation. */
  const [pendingRestore, setPendingRestore] = useState<BackupInfo | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      const { backups: list } = await api.listBackups();
      setBackups(list ?? []);
    } catch {
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({ pvzName, sellerName, reportDateFrom, reportDateTo, freeStorageDays });
  };

  const handleCreateBackup = async () => {
    setBusy(true);
    try {
      await createBackup();
      await loadBackups();
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!pendingRestore) return;
    const target = pendingRestore;
    setBusy(true);
    try {
      const result = await api.restoreBackup(target.name);
      await refresh();
      await loadBackups();
      setPendingRestore(null);
      addToast(`База восстановлена из ${result.restored}. Страховочная копия: ${result.safetyCopy}`);
    } catch (err) {
      addToast(err instanceof ApiError ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const fmtSize = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} МБ` : `${Math.round(bytes / 1024)} КБ`;

  return (
    <div className="flex-1 overflow-auto bg-[#F8F8F9] p-6 space-y-6">
      {/* Page Title */}
      <div>
        <h2 className="text-xl font-bold text-[#333333]">Параметры и тарифная сетка</h2>
        <p className="text-xs text-[#6B5530]">
          Настройка реквизитов ПВЗ, отчётного периода, тарифов селлера и сдельных расценок операторов
        </p>
      </div>

      {/* 1. General Info & Period Form */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex items-center gap-2 mb-4 text-[#5A081E] font-bold text-sm uppercase tracking-wide">
          <Building className="w-4 h-4" />
          <span>Основные параметры и отчётный период</span>
        </div>

        <form onSubmit={handleSaveGeneral} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Название ПВЗ
              </label>
              <input
                type="text"
                required
                value={pvzName}
                onChange={(e) => setPvzName(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#BD995A]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Название селлера / юр. лицо
              </label>
              <input
                type="text"
                required
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#BD995A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Начало отчётного периода
              </label>
              <input
                type="date"
                required
                value={reportDateFrom}
                onChange={(e) => setReportDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#BD995A]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Окончание отчётного периода
              </label>
              <input
                type="date"
                required
                value={reportDateTo}
                onChange={(e) => setReportDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#BD995A]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Бесплатных дней хранения
              </label>
              <input
                type="number"
                min="0"
                max="365"
                required
                value={freeStorageDays}
                onChange={(e) => setFreeStorageDays(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#BD995A]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-[#5A081E] text-white hover:bg-[#460617] transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5 text-[#BD995A]" />
              <span>Сохранить параметры периода</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2. Seller Tariffs */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[#5A081E] font-bold text-sm uppercase tracking-wide">
            <DollarSign className="w-4 h-4" />
            <span>Тарифы для селлера (рублей за единицу)</span>
          </div>
          <span className="text-xs text-[#6B5530]">Для категории «Ми» брендирование всегда 0 руб</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-neutral-200 rounded-lg overflow-hidden">
            <thead className="bg-[#F8F8F9] text-neutral-700 font-semibold border-b border-neutral-200">
              <tr>
                <th className="py-2.5 px-3">Артикул</th>
                <th className="py-2.5 px-3">Категория</th>
                <th className="py-2.5 px-3">Приёмка (₽)</th>
                <th className="py-2.5 px-3">Брендирование (₽)</th>
                <th className="py-2.5 px-3">Упаковка (₽)</th>
                <th className="py-2.5 px-3">Сборка (₽)</th>
                <th className="py-2.5 px-3">Хранение (₽/шт-день)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {ALL_ARTICLES.map((art) => {
                const info = ARTICLE_MAP.get(art)!;
                const tariff = sellerTariffs[art] || { reception: 0, branding: 0, packaging: 0, assembly: 0, storage: 0 };

                return (
                  <tr key={art} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 font-bold text-neutral-900">{art}</td>
                    <td className="py-2 px-3 text-neutral-600">{info.category}</td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.reception}
                        onChange={(e) => updateSellerTariff(art, 'reception', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-300 rounded font-mono text-right"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        disabled={!info.hasBranding}
                        value={info.hasBranding ? tariff.branding : 0}
                        onChange={(e) => updateSellerTariff(art, 'branding', Number(e.target.value))}
                        className={`w-20 px-2 py-1 border rounded font-mono text-right ${
                          !info.hasBranding ? 'bg-neutral-100 text-neutral-400 border-neutral-200' : 'border-neutral-300'
                        }`}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.packaging}
                        onChange={(e) => updateSellerTariff(art, 'packaging', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-300 rounded font-mono text-right"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.assembly}
                        onChange={(e) => updateSellerTariff(art, 'assembly', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-300 rounded font-mono text-right"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.storage}
                        onChange={(e) => updateSellerTariff(art, 'storage', Number(e.target.value))}
                        className="w-24 px-2 py-1 border border-neutral-300 rounded font-mono text-right font-bold text-[#5A081E]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Operator Tariffs */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[#5A081E] font-bold text-sm uppercase tracking-wide">
            <Sliders className="w-4 h-4" />
            <span>Сдельные расценки операторов склада (рублей за единицу)</span>
          </div>
          <span className="text-xs text-[#6B5530]">Выплачивается оператору смены по графику</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-neutral-200 rounded-lg overflow-hidden">
            <thead className="bg-[#F8F8F9] text-neutral-700 font-semibold border-b border-neutral-200">
              <tr>
                <th className="py-2.5 px-3">Артикул</th>
                <th className="py-2.5 px-3">Категория</th>
                <th className="py-2.5 px-3">Приёмка (₽)</th>
                <th className="py-2.5 px-3">Брендирование (₽)</th>
                <th className="py-2.5 px-3">Упаковка (₽)</th>
                <th className="py-2.5 px-3">Сборка (₽)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {ALL_ARTICLES.map((art) => {
                const info = ARTICLE_MAP.get(art)!;
                const tariff = operatorTariffs[art] || { reception: 0, branding: 0, packaging: 0, assembly: 0 };

                return (
                  <tr key={art} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 font-bold text-neutral-900">{art}</td>
                    <td className="py-2 px-3 text-neutral-600">{info.category}</td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.reception}
                        onChange={(e) => updateOperatorTariff(art, 'reception', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-300 rounded font-mono text-right"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.branding}
                        onChange={(e) => updateOperatorTariff(art, 'branding', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-300 rounded font-mono text-right"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.packaging}
                        onChange={(e) => updateOperatorTariff(art, 'packaging', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-300 rounded font-mono text-right"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tariff.assembly}
                        onChange={(e) => updateOperatorTariff(art, 'assembly', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-300 rounded font-mono text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Backup & Recovery (§11) */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex items-center gap-2 mb-2 text-[#5A081E] font-bold text-sm uppercase tracking-wide">
          <ShieldCheck className="w-4 h-4" />
          <span>Резервное копирование и восстановление</span>
        </div>
        <p className="text-xs text-[#6B5530] mb-5">
          Копия создаётся на вашем ПК средствами SQLite и включает все таблицы, включая строки,
          загруженные из Google. Восстановление доступно только после явного подтверждения.
        </p>

        <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-neutral-200">
          <button
            onClick={handleCreateBackup}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#5A081E] text-white hover:bg-[#460617] transition-colors shadow-xs disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-[#BD995A]" />
            <span>Создать резервную копию</span>
          </button>

          <button
            onClick={() => void loadBackups()}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 text-[#5A081E]" />
            <span>Обновить список</span>
          </button>

          {backups.length > 0 && (
            <span className="text-xs text-[#6B5530]">Копий на диске: {backups.length}</span>
          )}
        </div>

        {backups.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs border border-neutral-200 rounded-lg overflow-hidden">
              <thead className="bg-[#F8F8F9] text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3">Файл</th>
                  <th className="py-2.5 px-3">Создан</th>
                  <th className="py-2.5 px-3">Тип</th>
                  <th className="py-2.5 px-3">Размер</th>
                  <th className="py-2.5 px-3">Контрольная сумма</th>
                  <th className="py-2.5 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {backups.map((b) => (
                  <tr key={b.name} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 font-mono text-[11px]">{b.name}</td>
                    <td className="py-2 px-3 text-neutral-600">
                      {new Date(b.createdAt).toLocaleString('ru-RU')}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold ${
                          b.label === 'manual' ? 'bg-[#5A081E] text-white' : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {b.label === 'manual' ? 'вручную' : 'авто'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-neutral-600">{fmtSize(b.sizeBytes)}</td>
                    <td className="py-2 px-3 font-mono text-[10px] text-neutral-500">
                      {b.sha256?.slice(0, 12)}…
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => setPendingRestore(b)}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-neutral-300 text-[11px] font-semibold text-[#5A081E] hover:bg-neutral-50 disabled:opacity-50"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Восстановить</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-xs text-neutral-500">
            Резервных копий пока нет. Копия также создаётся автоматически перед каждой синхронизацией.
          </p>
        )}

        {/* Explicit confirmation — §11 forbids a silent or one-click restore. */}
        {pendingRestore && (
          <div className="mt-5 p-4 rounded-lg border-2 border-[#5A081E] bg-[#FDF6F8]">
            <p className="text-xs font-bold text-[#5A081E] mb-1">
              Подтвердите восстановление базы из {pendingRestore.name}
            </p>
            <p className="text-xs text-neutral-700 mb-3">
              Текущая база будет заменена целиком. Перед заменой сервер создаст страховочную копию
              текущего состояния, поэтому операцию можно отменить, но внесённые после выбранной копии
              изменения будут потеряны.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRestore}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#5A081E] text-white text-xs font-bold hover:bg-[#460617] disabled:opacity-50"
              >
                Да, восстановить
              </button>
              <button
                onClick={() => setPendingRestore(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-white border border-neutral-300 text-[#333333] text-xs font-semibold hover:bg-neutral-50 disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
