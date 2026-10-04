import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_OPERATOR_TARIFFS,
  DEFAULT_SELLER_TARIFFS,
  DEFAULT_SETTINGS,
} from '../constants/initialData';
import {
  Article,
  ArrivalRecord,
  AdjustmentRecord,
  CapsuleItem,
  DailyStockRow,
  OperatorFulfillment,
  OperatorName,
  OperatorTariff,
  ProblematicStockItem,
  ScheduleMap,
  SellerTariff,
  Settings,
  ShipmentRecord,
} from '../types/pvz';
import {
  calculateCapsules,
  calculateMatrix,
  calculateOperatorPayroll,
  calculateSellerFulfillment,
  exportMatrixToCsv,
  getAllMatrixDates,
  getDateRange,
  simulateNegativeStockCheck,
} from '../utils/calculations';
import {
  downloadFile,
  generateArrivalsCsv,
  generateMatrixCsv,
  generateMatrixWideCsv,
  generateShipmentsCsv,
} from '../utils/exportHelpers';
import { exportFullWorkbookXlsx } from '../utils/xlsxExport';
import { ApiError, api, type AppState, type ReverseFlowUnit } from '../utils/api';

interface ToastState {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning';
}

interface PendingNegativeAction {
  type: string;
  run: () => void;
  problems: ProblematicStockItem[];
}

interface PvzContextType {
  ready: boolean;
  loadError: string;
  health: AppState['meta'] | null;
  refresh: () => Promise<void>;

  arrivals: ArrivalRecord[];
  shipments: ShipmentRecord[];
  adjustments: AdjustmentRecord[];
  schedule: ScheduleMap;
  settings: Settings;
  sellerTariffs: Record<Article, SellerTariff>;
  operatorTariffs: Record<Article, OperatorTariff>;
  reverseFlowUnits: ReverseFlowUnit[];

  // Computed
  allDates: string[];
  matrix: DailyStockRow[];
  capsules: CapsuleItem[];
  sellerFulfillment: ReturnType<typeof calculateSellerFulfillment>;
  operatorPayroll: ReturnType<typeof calculateOperatorPayroll>;

  // Modals & Pending Checks
  pendingNegativeAction: PendingNegativeAction | null;
  setPendingNegativeAction: (action: PendingNegativeAction | null) => void;
  confirmPendingAction: () => void;

  // Actions — every one of these writes through the API (§4.2)
  addArrival: (record: Omit<ArrivalRecord, 'id' | 'createdAt'>) => void;
  editArrival: (id: string, record: Partial<Omit<ArrivalRecord, 'id' | 'createdAt'>>) => void;
  deleteArrival: (id: string) => void;

  addShipment: (record: Omit<ShipmentRecord, 'id' | 'createdAt'>) => void;
  editShipment: (id: string, record: Partial<Omit<ShipmentRecord, 'id' | 'createdAt'>>) => void;
  deleteShipment: (id: string) => void;

  addAdjustment: (record: Omit<AdjustmentRecord, 'id' | 'createdAt'>) => void;
  editAdjustment: (id: string, record: Partial<Omit<AdjustmentRecord, 'id' | 'createdAt'>>) => void;
  deleteAdjustment: (id: string) => void;

  setScheduleForDate: (date: string, operator: OperatorName) => void;
  fillSchedulePattern: (pattern: '2/2' | '1/1' | 'puzanov' | 'zavalishin') => void;

  updateSettings: (partial: Partial<Settings>) => void;
  updateSellerTariff: (article: Article, field: keyof SellerTariff, val: number) => void;
  updateOperatorTariff: (article: Article, field: keyof OperatorTariff, val: number) => void;

  saveReverseUnits: (units: ReverseFlowUnit[]) => Promise<void>;
  saveReverseUnit: (unit: ReverseFlowUnit) => Promise<void>;

  createBackup: () => Promise<void>;
  syncNow: (dryRun?: boolean) => Promise<void>;
  reconcileNow: () => Promise<void>;

  exportMatrixCsv: (format?: 'wide' | 'vertical') => void;
  exportArrivalsCsv: () => void;
  exportShipmentsCsv: () => void;
  exportAllToExcel: () => void;

  // Toasts
  toasts: ToastState[];
  addToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
  removeToast: (id: string) => void;
}

const PvzContext = createContext<PvzContextType | undefined>(undefined);

export const PvzProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [healthMeta, setHealthMeta] = useState<AppState['meta'] | null>(null);

  const [arrivals, setArrivals] = useState<ArrivalRecord[]>([]);
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [schedule, setSchedule] = useState<ScheduleMap>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sellerTariffs, setSellerTariffs] = useState<Record<Article, SellerTariff>>(DEFAULT_SELLER_TARIFFS);
  const [operatorTariffs, setOperatorTariffs] = useState<Record<Article, OperatorTariff>>(DEFAULT_OPERATOR_TARIFFS);
  const [reverseFlowUnits, setReverseFlowUnits] = useState<ReverseFlowUnit[]>([]);

  const [pendingNegativeAction, setPendingNegativeAction] = useState<PendingNegativeAction | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const addToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const describe = (err: unknown) =>
    err instanceof ApiError ? err.message : `Не удалось выполнить операцию: ${String(err)}`;

  /** Pull the authoritative ledger from SQLite and replace local render state. */
  const refresh = useCallback(async () => {
    const state = await api.state();
    setArrivals(state.arrivals ?? []);
    setShipments(state.shipments ?? []);
    setAdjustments(state.adjustments ?? []);
    setSchedule(state.schedule ?? {});
    setSettings({ ...DEFAULT_SETTINGS, ...(state.settings ?? {}) });
    setSellerTariffs({ ...DEFAULT_SELLER_TARIFFS, ...(state.sellerTariffs ?? {}) });
    setOperatorTariffs({ ...DEFAULT_OPERATOR_TARIFFS, ...(state.operatorTariffs ?? {}) });
    setReverseFlowUnits(state.reverseFlowUnits ?? []);
    setHealthMeta(state.meta ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) {
          setLoadError('');
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(describe(err));
          setReady(true); // still render, so the user can see the failure
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // --- Computed -----------------------------------------------------------

  const allDates = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE');
    const eventDates = [
      ...arrivals.map((item) => item.date),
      ...shipments.map((item) => item.date),
      ...adjustments.map((item) => item.date),
    ].filter(Boolean).sort();
    const from = [settings.reportDateFrom, eventDates[0]].filter(Boolean).sort()[0] || today;
    const to = [today, settings.reportDateTo, eventDates.at(-1)].filter(Boolean).sort().at(-1) || today;
    return getAllMatrixDates(arrivals, shipments, { ...settings, reportDateFrom: from, reportDateTo: to });
  }, [arrivals, shipments, adjustments, settings]);

  const matrix = useMemo(() => calculateMatrix(allDates, arrivals, shipments, adjustments), [
    allDates, arrivals, shipments, adjustments,
  ]);

  const capsules = useMemo(
    () => calculateCapsules(arrivals, shipments, settings, sellerTariffs, adjustments),
    [arrivals, shipments, adjustments, settings, sellerTariffs],
  );

  const sellerFulfillment = useMemo(
    () => calculateSellerFulfillment(arrivals, shipments, settings, sellerTariffs, capsules),
    [arrivals, shipments, settings, sellerTariffs, capsules],
  );

  const operatorPayroll = useMemo(
    () => calculateOperatorPayroll(arrivals, shipments, settings, schedule, operatorTariffs),
    [arrivals, shipments, settings, schedule, operatorTariffs],
  );

  // --- Mutations ----------------------------------------------------------
  // Each one writes to SQLite first and only then updates what is on screen, so
  // the interface can never show a row the database does not have.

  const guardNegative = (problems: ProblematicStockItem[], run: () => void) => {
    if (problems.length) setPendingNegativeAction({ type: 'confirm', run, problems });
    else run();
  };

  const addArrival = (record: Omit<ArrivalRecord, 'id' | 'createdAt'>) => {
    guardNegative([], async () => {
      try {
        const { id } = await api.createArrival(record);
        setArrivals((prev) => [...prev, { ...record, id, createdAt: new Date().toISOString() }]);
        addToast(
          record.type === 'return'
            ? `Возврат по ${record.article} (+${record.quantity} шт) добавлен`
            : `Приёмка ${record.article} (+${record.quantity} шт) добавлена`,
        );
      } catch (err) {
        addToast(describe(err), 'error');
      }
    });
  };

  const editArrival = (id: string, record: Partial<Omit<ArrivalRecord, 'id' | 'createdAt'>>) => {
    const candidate = arrivals.map((a) => (a.id === id ? { ...a, ...record } : a));
    guardNegative(simulateNegativeStockCheck(candidate, shipments, matrix, settings), async () => {
      try {
        await api.updateArrival(id, record);
        setArrivals(candidate);
        addToast('Запись прихода обновлена');
      } catch (err) {
        addToast(describe(err), 'error');
      }
    });
  };

  const deleteArrival = (id: string) => {
    const candidate = arrivals.filter((a) => a.id !== id);
    guardNegative(simulateNegativeStockCheck(candidate, shipments, matrix, settings), async () => {
      try {
        await api.deleteArrival(id);
        setArrivals(candidate);
        addToast('Запись прихода удалена');
      } catch (err) {
        addToast(describe(err), 'error');
      }
    });
  };

  const addShipment = (record: Omit<ShipmentRecord, 'id' | 'createdAt'>) => {
    const run = async () => {
      try {
        const { id } = await api.createShipment(record);
        setShipments((prev) => [...prev, { ...record, id, createdAt: new Date().toISOString() }]);
        addToast(record.supplyId
          ? `Отгрузка ${record.article} (−${record.quantity} шт), WB-GI ${record.supplyId}`
          : `Отгрузка ${record.article} (−${record.quantity} шт) добавлена`);
      } catch (err) {
        addToast(describe(err), 'error');
      }
    };
    // The new row does not exist yet, so the check runs against the candidate list.
    const optimistic = { ...record, id: 'pending', createdAt: new Date().toISOString() };
    guardNegative(
      simulateNegativeStockCheck(arrivals, [...shipments, optimistic], matrix, settings),
      run,
    );
  };

  const editShipment = (id: string, record: Partial<Omit<ShipmentRecord, 'id' | 'createdAt'>>) => {
    const candidate = shipments.map((s) => (s.id === id ? { ...s, ...record } : s));
    guardNegative(simulateNegativeStockCheck(arrivals, candidate, matrix, settings), async () => {
      try {
        await api.updateShipment(id, record);
        setShipments(candidate);
        addToast('Запись отгрузки обновлена');
      } catch (err) {
        // §6: a google-origin row is immutable and the server refuses the change.
        addToast(describe(err), 'error');
      }
    });
  };

  const deleteShipment = (id: string) => {
    const candidate = shipments.filter((s) => s.id !== id);
    guardNegative(simulateNegativeStockCheck(arrivals, candidate, matrix, settings), async () => {
      try {
        await api.deleteShipment(id);
        setShipments(candidate);
        addToast('Запись отгрузки удалена');
      } catch (err) {
        addToast(describe(err), 'error');
      }
    });
  };

  const addAdjustment = (record: Omit<AdjustmentRecord, 'id' | 'createdAt'>) => {
    guardNegative([], async () => {
      try {
        const { id } = await api.createAdjustment(record);
        setAdjustments((prev) => [...prev, { ...record, id, createdAt: new Date().toISOString() }]);
        addToast('Корректировка сохранена');
      } catch (err) {
        addToast(describe(err), 'error');
      }
    });
  };

  const editAdjustment = (id: string, record: Partial<Omit<AdjustmentRecord, 'id' | 'createdAt'>>) => {
    guardNegative([], async () => {
      try {
        await api.updateAdjustment(id, record);
        setAdjustments((prev) => prev.map((a) => (a.id === id ? { ...a, ...record } : a)));
        addToast('Корректировка обновлена');
      } catch (err) {
        addToast(describe(err), 'error');
      }
    });
  };

  const deleteAdjustment = (id: string) => {
    guardNegative([], async () => {
      try {
        await api.deleteAdjustment(id);
        setAdjustments((prev) => prev.filter((a) => a.id !== id));
        addToast('Корректировка удалена');
      } catch (err) {
        addToast(describe(err), 'error');
      }
    });
  };

  const confirmPendingAction = () => {
    pendingNegativeAction?.run();
    setPendingNegativeAction(null);
  };

  // --- Schedule / settings ------------------------------------------------

  const setScheduleForDate = (date: string, operator: OperatorName) => {
    setSchedule((prev) => ({ ...prev, [date]: operator }));
    api.setSchedule(date, operator).catch((err) => addToast(describe(err), 'error'));
  };

  const fillSchedulePattern = (pattern: '2/2' | '1/1' | 'puzanov' | 'zavalishin') => {
    const dates = getDateRange(settings.reportDateFrom, settings.reportDateTo);
    const updated: ScheduleMap = { ...schedule };
    dates.forEach((d, idx) => {
      if (pattern === 'puzanov') updated[d] = 'Пузанов Д.В.';
      else if (pattern === 'zavalishin') updated[d] = 'Завалишин Д.Л.';
      else if (pattern === '1/1') updated[d] = idx % 2 === 0 ? 'Пузанов Д.В.' : 'Завалишин Д.Л.';
      else updated[d] = Math.floor(idx / 2) % 2 === 0 ? 'Пузанов Д.В.' : 'Завалишин Д.Л.';
    });
    setSchedule(updated);
    Promise.all(dates.map((d) => api.setSchedule(d, updated[d])))
      .then(() => addToast(`График заполнен по шаблону: ${pattern}`))
      .catch((err) => addToast(describe(err), 'error'));
  };

  const updateSettings = (partial: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    api.saveSettings(partial).catch((err) => addToast(describe(err), 'error'));
  };

  const updateSellerTariff = (article: Article, field: keyof SellerTariff, val: number) => {
    const next = { ...sellerTariffs, [article]: { ...sellerTariffs[article], [field]: Number(val) } };
    setSellerTariffs(next);
    api.saveSellerTariffs({ [article]: next[article] }).catch((err) => addToast(describe(err), 'error'));
  };

  const updateOperatorTariff = (article: Article, field: keyof OperatorTariff, val: number) => {
    const next = { ...operatorTariffs, [article]: { ...operatorTariffs[article], [field]: Number(val) } };
    setOperatorTariffs(next);
    api.saveOperatorTariffs({ [article]: next[article] }).catch((err) => addToast(describe(err), 'error'));
  };

  // --- Reverse flow (§8) --------------------------------------------------

  const saveReverseUnit = async (unit: ReverseFlowUnit) => {
    try {
      await api.saveReverseUnit(unit);
      setReverseFlowUnits((prev) => {
        const idx = prev.findIndex((u) => u.id === unit.id);
        if (idx < 0) return [...prev, unit];
        const copy = [...prev];
        copy[idx] = unit;
        return copy;
      });
    } catch (err) {
      addToast(describe(err), 'error');
    }
  };

  const saveReverseUnits = async (units: ReverseFlowUnit[]) => {
    try {
      await Promise.all(units.map((u) => api.saveReverseUnit(u)));
      setReverseFlowUnits(units);
    } catch (err) {
      addToast(describe(err), 'error');
    }
  };

  // --- Maintenance --------------------------------------------------------

  const createBackup = async () => {
    try {
      const { file } = await api.createBackup();
      addToast(`Резервная копия создана: ${file}`);
    } catch (err) {
      addToast(describe(err), 'error');
    }
  };

  const syncNow = async (dryRun = false) => {
    try {
      const result = (await api.syncPvz(dryRun)) as {
        unitsAdded: number;
        daysWithDiff: number;
        lastDataDate: string | null;
      };
      await refresh();
      addToast(
        dryRun
          ? `Пробная синхронизация: расхождений ${result.daysWithDiff}, добавить ${result.unitsAdded}`
          : `Синхронизация завершена: добавлено ${result.unitsAdded} шт. Данные по ${result.lastDataDate ?? '—'}`,
      );
    } catch (err) {
      addToast(describe(err), 'error');
    }
  };

  const reconcileNow = async () => {
    try {
      const result = (await api.reconcile()) as { discrepancies: number; disputedMappings?: unknown[] };
      await refresh();
      const extra = result.disputedMappings?.length
        ? `, требуют подтверждения соответствия: ${result.disputedMappings.length}`
        : '';
      addToast(`Сверка завершена: расхождений ${result.discrepancies}${extra}`);
    } catch (err) {
      addToast(describe(err), 'error');
    }
  };

  // --- Exports ------------------------------------------------------------

  const exportMatrixCsv = (format: 'wide' | 'vertical' = 'wide') => {
    const csv = format === 'wide' ? generateMatrixWideCsv(matrix) : generateMatrixCsv(matrix);
    downloadFile(csv, `pvz_matrix_${settings.reportDateFrom}_${settings.reportDateTo}.csv`);
    addToast('Матрица остатков экспортирована в CSV');
  };
  const exportArrivalsCsv = () => {
    downloadFile(generateArrivalsCsv(arrivals), `pvz_arrivals_${settings.reportDateFrom}.csv`);
    addToast('Журнал приёмки и возвратов экспортирован в CSV');
  };
  const exportShipmentsCsv = () => {
    downloadFile(generateShipmentsCsv(shipments), `pvz_shipments_${settings.reportDateFrom}.csv`);
    addToast('Журнал отгрузок экспортирован в CSV');
  };
  const exportAllToExcel = () => {
    exportFullWorkbookXlsx({
      matrix, arrivals, shipments, capsules,
      filename: `pvz_flow_${settings.reportDateFrom}_${settings.reportDateTo}.xlsx`,
    });
    addToast('Данные выгружены в Excel (.xlsx)');
  };

  return (
    <PvzContext.Provider
      value={{
        ready, loadError, health: healthMeta, refresh,
        arrivals, shipments, adjustments, schedule, settings, sellerTariffs, operatorTariffs,
        reverseFlowUnits,
        allDates, matrix, capsules, sellerFulfillment, operatorPayroll,
        pendingNegativeAction, setPendingNegativeAction, confirmPendingAction,
        addArrival, editArrival, deleteArrival,
        addShipment, editShipment, deleteShipment,
        addAdjustment, editAdjustment, deleteAdjustment,
        setScheduleForDate, fillSchedulePattern,
        updateSettings, updateSellerTariff, updateOperatorTariff,
        saveReverseUnits, saveReverseUnit,
        createBackup, syncNow, reconcileNow,
        exportMatrixCsv, exportArrivalsCsv, exportShipmentsCsv, exportAllToExcel,
        toasts, addToast, removeToast,
      }}
    >
      {children}
    </PvzContext.Provider>
  );
};

export const usePvz = () => {
  const context = useContext(PvzContext);
  if (!context) throw new Error('usePvz must be used within a PvzProvider');
  return context;
};
