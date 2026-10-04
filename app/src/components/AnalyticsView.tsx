import React from 'react';
import {
  TrendingUp,
  Package,
  Truck,
  RotateCcw,
  DollarSign,
  PieChart,
  Users,
  Layers,
  ArrowUpRight,
  Percent,
} from 'lucide-react';
import { ALL_ARTICLES, ARTICLE_MAP } from '../constants/initialData';
import { usePvz } from '../context/PvzContext';
import { formatCurrency, formatNumber } from '../utils/calculations';

export const AnalyticsView: React.FC = () => {
  const {
    matrix,
    capsules,
    sellerFulfillment,
    operatorPayroll,
    arrivals,
    shipments,
    settings,
  } = usePvz();

  // Metrics for report period
  const periodArrivals = arrivals.filter(
    (a) => a.date >= settings.reportDateFrom && a.date <= settings.reportDateTo
  );
  const periodShipments = shipments.filter(
    (s) => s.date >= settings.reportDateFrom && s.date <= settings.reportDateTo
  );

  const totalReceivedInPeriod = periodArrivals
    .filter((a) => a.type === 'arrival')
    .reduce((sum, a) => sum + a.quantity, 0);

  const totalReturnsInPeriod = periodArrivals
    .filter((a) => a.type === 'return')
    .reduce((sum, a) => sum + a.quantity, 0);

  const totalShippedInPeriod = periodShipments.reduce((sum, s) => sum + s.quantity, 0);

  // Current stock on latest matrix date
  const latestRow = matrix.length > 0 ? matrix[matrix.length - 1] : null;
  const currentTotalStock = latestRow
    ? ALL_ARTICLES.reduce((sum, art) => sum + (latestRow.byArticle[art]?.balanceEnd ?? 0), 0)
    : 0;

  // Financials
  const fulfillmentRevenue =
    sellerFulfillment.totalReceptionCost +
    sellerFulfillment.totalAssemblyCost +
    sellerFulfillment.totalBrandingCost +
    sellerFulfillment.totalPackagingCost;

  const storageRevenue = sellerFulfillment.totalStorageCost;
  const totalRevenue = sellerFulfillment.grandTotal;
  const totalPayroll = operatorPayroll.totalPayroll;

  const grossMargin = totalRevenue - totalPayroll;
  const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
  const payrollReturn = totalPayroll > 0 ? totalRevenue / totalPayroll : 0;

  // Revenue structure breakdown
  const revenueBreakdown = [
    { label: 'Приёмка товара', amount: sellerFulfillment.totalReceptionCost, color: '#10b981' },
    { label: 'Сборка заказов', amount: sellerFulfillment.totalAssemblyCost, color: '#5A081E' },
    { label: 'Брендирование', amount: sellerFulfillment.totalBrandingCost, color: '#BD995A' },
    { label: 'Упаковка', amount: sellerFulfillment.totalPackagingCost, color: '#3b82f6' },
    { label: 'Хранение (FIFO)', amount: sellerFulfillment.totalStorageCost, color: '#8b5cf6' },
  ];

  return (
    <div className="flex-1 overflow-auto bg-[#F8F8F9] p-4 space-y-4">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-[#333333]">Финансовая и складская аналитика</h2>
        <p className="text-xs text-[#6B5530]">
          Сводные показатели эффективности ПВЗ по обслуживанию селлера {settings.sellerName}
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Принято</span>
            <Package className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-neutral-900">
            {formatNumber(totalReceivedInPeriod)} <span className="text-xs font-normal text-neutral-500">шт</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">за отчётный период</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Отгружено</span>
            <Truck className="w-4 h-4 text-[#5A081E]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-[#5A081E]">
            {formatNumber(totalShippedInPeriod)} <span className="text-xs font-normal text-neutral-500">шт</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">в Wildberries</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Возвраты</span>
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-amber-700">
            {formatNumber(totalReturnsInPeriod)} <span className="text-xs font-normal text-neutral-500">шт</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">клиентские невыкупы</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Остаток склада</span>
            <Layers className="w-4 h-4 text-neutral-700" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-neutral-900">
            {formatNumber(currentTotalStock)} <span className="text-xs font-normal text-neutral-500">шт</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">на текущий день</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Партий (капсул)</span>
            <PieChart className="w-4 h-4 text-[#BD995A]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-neutral-900">
            {capsules.length} <span className="text-xs font-normal text-neutral-500">капс.</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">на учёте FIFO</div>
        </div>
      </div>

      {/* Financial Summary Banner */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#5A081E] mb-4">
          Финансовые результаты за период
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-4 bg-[#F8F8F9] rounded-lg border border-neutral-200">
            <span className="text-xs text-[#6B5530] font-semibold block">Итого доход селлера</span>
            <div className="text-2xl font-extrabold font-mono text-[#5A081E] mt-1">
              {formatCurrency(totalRevenue)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              Фулфилмент: {formatCurrency(fulfillmentRevenue)} + Хранение: {formatCurrency(storageRevenue)}
            </div>
          </div>

          <div className="p-4 bg-[#F8F8F9] rounded-lg border border-neutral-200">
            <span className="text-xs text-[#6B5530] font-semibold block">Расход (Зарплата операторам)</span>
            <div className="text-2xl font-extrabold font-mono text-neutral-800 mt-1">
              {formatCurrency(totalPayroll)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              ФОТ за выполненные складские операции
            </div>
          </div>

          <div className="p-4 bg-[#F8F8F9] rounded-lg border border-neutral-200">
            <span className="text-xs text-[#6B5530] font-semibold block">Чистая маржа ПВЗ</span>
            <div className="text-2xl font-extrabold font-mono text-emerald-700 mt-1">
              {formatCurrency(grossMargin)}
            </div>
            <div className="text-[11px] text-emerald-800 mt-1 font-semibold">
              Маржинальность: {marginPercent.toFixed(1)}%
            </div>
          </div>

          <div className="p-4 bg-[#F8F8F9] rounded-lg border border-neutral-200">
            <span className="text-xs text-[#6B5530] font-semibold block">Отдача на 1 рубль ФОТ</span>
            <div className="text-2xl font-extrabold font-mono text-[#BD995A] mt-1">
              {payrollReturn.toFixed(2)}×
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              рублей дохода на 1 рубль зарплаты
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Structure of revenue */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <h3 className="text-sm font-bold text-neutral-900 mb-3">Структура выручки фулфилмента</h3>
          <div className="space-y-3">
            {revenueBreakdown.map((item) => {
              const pct = totalRevenue > 0 ? (item.amount / totalRevenue) * 100 : 0;
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-xs font-semibold text-neutral-700 mb-1">
                    <span>{item.label}</span>
                    <span className="font-mono">
                      {formatCurrency(item.amount)} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operator payroll distribution */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <h3 className="text-sm font-bold text-neutral-900 mb-3">Начисления операторам склада</h3>
          <div className="space-y-4">
            {operatorPayroll.operators.map((op) => {
              const pct = totalPayroll > 0 ? (op.totalPay / totalPayroll) * 100 : 0;
              return (
                <div key={op.operator} className="p-3.5 bg-[#F8F8F9] rounded-lg border border-neutral-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-neutral-900">{op.operator}</div>
                      <div className="text-xs text-neutral-500">
                        {op.workDaysCount} смен(ы) · Сборка: {op.assemblyQty} шт · Приёмка: {op.receptionQty} шт
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold font-mono text-[#5A081E]">
                        {formatCurrency(op.totalPay)}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {pct.toFixed(1)}% от ФОТ
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stock Levels Breakdown Table */}
      <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
        <h3 className="text-sm font-bold text-neutral-900 mb-3">Текущий срез остатков по артикулам</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F8F9] text-neutral-600 font-semibold border-b border-neutral-200">
              <tr>
                <th className="py-2.5 px-3">Артикул</th>
                <th className="py-2.5 px-3">Категория</th>
                <th className="py-2.5 px-3">Брендирование</th>
                <th className="py-2.5 px-3">Вес единицы</th>
                <th className="py-2.5 px-3 text-right">Текущий остаток</th>
                <th className="py-2.5 px-3 text-right">Шт-дней хранения</th>
                <th className="py-2.5 px-3 text-right">Сумма хранения</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-mono tabular-nums">
              {ALL_ARTICLES.map((art) => {
                const info = ARTICLE_MAP.get(art)!;
                const rem = latestRow?.byArticle[art]?.balanceEnd ?? 0;
                const fItem = sellerFulfillment.items.find((i) => i.article === art);

                return (
                  <tr key={art} className="hover:bg-neutral-50">
                    <td className="py-2.5 px-3 font-bold font-sans text-neutral-900">{art}</td>
                    <td className="py-2.5 px-3 font-sans text-neutral-600">{info.category}</td>
                    <td className="py-2.5 px-3 font-sans">
                      {info.hasBranding ? (
                        <span className="text-emerald-700 font-semibold">Да</span>
                      ) : (
                        <span className="text-neutral-400">Нет (Ми)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-neutral-600">~{info.weightKg} кг</td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold text-sm ${
                        rem < 0 ? 'text-red-600' : 'text-neutral-900'
                      }`}
                    >
                      {rem} шт
                    </td>
                    <td className="py-2.5 px-3 text-right text-neutral-700">
                      {fItem?.storageUnitDays ?? 0}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#5A081E]">
                      {formatCurrency(fItem?.storageCost ?? 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
