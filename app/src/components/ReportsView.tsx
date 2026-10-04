import React, { useState } from 'react';
import { Printer, FileText, Receipt, Users, Calendar } from 'lucide-react';
import { ALL_ARTICLES, ARTICLE_MAP } from '../constants/initialData';
import { usePvz } from '../context/PvzContext';
import { Article } from '../types/pvz';
import { formatCurrency, formatDateRu, formatNumber, getDateRange } from '../utils/calculations';
import { printDocument } from '../utils/printDocument';

type ReportTab = 'seller' | 'invoice' | 'payroll';

export const ReportsView: React.FC = () => {
  const {
    settings,
    sellerFulfillment,
    operatorPayroll,
    capsules,
    sellerTariffs,
    operatorTariffs,
    schedule,
    arrivals,
    shipments,
    matrix,
    reverseFlowUnits,
  } = usePvz();

  const [activeTab, setActiveTab] = useState<ReportTab>('seller');
  const [selectedOperator, setSelectedOperator] = useState('Пузанов Д.В.');

  const periodDates = getDateRange(settings.reportDateFrom, settings.reportDateTo);
  const printDateStr = formatDateRu(new Date().toISOString().split('T')[0]);

  const handlePrint = () => {
    const section = activeTab === 'seller' ? 'ОТЧЕТ_ФУЛФИЛМЕНТ' : activeTab === 'invoice' ? 'СЧЕТ_СЕЛЛЕРУ' : `РАСЧЕТНЫЙ_ЛИСТОК_${selectedOperator.replaceAll(' ', '_')}`;
    printDocument(section, settings.reportDateFrom, settings.reportDateTo);
  };

  const periodRows = matrix.filter((row) => row.date >= settings.reportDateFrom && row.date <= settings.reportDateTo);
  const articleTurnover = ALL_ARTICLES.map((article) => {
    const shipped = shipments.filter((x) => x.article === article && x.date >= settings.reportDateFrom && x.date <= settings.reportDateTo).reduce((sum, x) => sum + x.quantity, 0);
    const averageStock = periodRows.length
      ? periodRows.reduce((sum, row) => sum + Math.max(0, row.byArticle[article]?.balanceEnd ?? 0), 0) / periodRows.length
      : 0;
    return { article, shipped, ratio: averageStock > 0 ? shipped / averageStock : 0 };
  });
  const rankedTurnover = [...articleTurnover].filter((x) => x.shipped > 0).sort((a, b) => b.ratio - a.ratio);
  const highestTurnover = rankedTurnover[0];
  const lowestTurnover = rankedTurnover.at(-1);
  const processedQty = arrivals.filter((x) => x.date >= settings.reportDateFrom && x.date <= settings.reportDateTo).reduce((sum, x) => sum + x.quantity, 0)
    + shipments.filter((x) => x.date >= settings.reportDateFrom && x.date <= settings.reportDateTo).reduce((sum, x) => sum + x.quantity, 0);

  type ReverseStage = 'intake' | 'inspection' | 'repair' | 'packaging';
  type ReverseUnit = { id:string; article:Article; status:string; defects:string[]; closedDate?:string|null; events:Array<{stage:ReverseStage;date:string;operator:string}> };
  // §4.2 — reverse-flow cards and their events come from SQLite, not the browser.
  const reverseUnits: ReverseUnit[] = reverseFlowUnits.map(unit => ({
    ...unit,
    events: unit.events.map(event => ({ ...event, stage: event.stage as ReverseStage })),
  }));
  const reverseStaffRates: Record<ReverseStage, number[]> = { intake:[1,2,3,2], inspection:[5,8,13,15], repair:[15,15,18,20], packaging:[9,11,13,15] };
  const reverseSellerRates: Record<ReverseStage, number[]> = { intake:[5,5,10,5], inspection:[20,20,35,45], repair:[60,45,45,55], packaging:[35,30,35,45] };
  const reverseWeight = (article:Article) => article === 'Г-3500' ? 2 : (article === 'Г-1800' || article === 'Г-800') ? 1 : 0;
  const reverseStageNames: Record<ReverseStage,string> = { intake:'Приёмка, осмотр', inspection:'Проверка', repair:'Восстановление', packaging:'Упаковка и стикерование' };
  const reverseEvents = reverseUnits.flatMap(unit => unit.events.map(event => ({...event, article:unit.article, unitId:unit.id})))
    .filter(event => event.date >= settings.reportDateFrom && event.date <= settings.reportDateTo);
  const reverseSummary = (Object.keys(reverseStageNames) as ReverseStage[]).map(stage => {
    const events = reverseEvents.filter(event => event.stage === stage);
    return { stage, qty:events.length, seller:events.reduce((sum,event)=>sum+reverseSellerRates[stage][reverseWeight(event.article)],0) };
  });
  const reverseSellerTotal = reverseSummary.reduce((sum,row)=>sum+row.seller,0);
  const reverseStaffFor = (operator:string) => reverseEvents.filter(event=>event.operator===operator)
    .reduce((sum,event)=>sum+reverseStaffRates[event.stage][reverseWeight(event.article)],0);
  const reverseWrittenOff = reverseUnits.filter(unit=>unit.status==='written_off' && unit.closedDate && unit.closedDate>=settings.reportDateFrom && unit.closedDate<=settings.reportDateTo);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100">
      {/* Top Toolbar (Hidden when printing) */}
      <div className="p-4 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-4 shrink-0 print:hidden">
        {/* Report Sub-tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F8F8F9] rounded-lg border border-neutral-200">
          <button
            onClick={() => setActiveTab('seller')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'seller'
                ? 'bg-white text-[#5A081E] shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Отчёт для селлера</span>
          </button>
          <button
            onClick={() => setActiveTab('invoice')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'invoice'
                ? 'bg-white text-[#5A081E] shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Счёт на оплату</span>
          </button>
          <button
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'payroll'
                ? 'bg-white text-[#5A081E] shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Расчётный листок персонала</span>
          </button>
        </div>

        {/* Print & Export Actions (Styled with #EEDDB0, border #BD995A per 8.6.3) */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-500 mr-2 hidden sm:block">
            Период: <strong>{formatDateRu(settings.reportDateFrom)} — {formatDateRu(settings.reportDateTo)}</strong>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-[#EEDDB0] text-[#333333] border border-[#BD995A] hover:bg-[#e4cf99] transition-all shadow-xs"
          >
            <Printer className="w-4 h-4 text-[#5A081E]" />
            <span>Печать / Экспорт в PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Sheet Viewport */}
      <div className="flex-1 overflow-auto p-4 lg:p-6 print:p-0 print:m-0 print:overflow-visible">
        {/* Рабочий интерфейс занимает доступную ширину; печатная геометрия применяется только при печати. */}
        <div className="bg-white max-w-[1500px] mx-auto w-full p-5 lg:p-7 rounded-xl border border-neutral-200 print:border-none print:shadow-none print:p-0 print:max-w-none print:w-full">
          {/* 8.6.1 Mandatory Header */}
          <div className="flex items-start justify-between pb-6 border-b border-[#E6E6E6]">
            {/* Logo >= 15mm (~60px) in #5A081E */}
            <div className="flex items-center gap-3">
              <img src="./branding/pvz-flow-primary.png" alt="PVZ.FLOW" className="h-16 w-auto object-contain" />
            </div>

            {/* Document Title */}
            <div className="text-right">
              <h2 className="text-xl sm:text-2xl font-bold text-[#5A081E] tracking-tight">
                {activeTab === 'seller' && 'ОТЧЁТ ПО СКЛАДУ И ФУЛФИЛМЕНТУ'}
                {activeTab === 'invoice' && 'СЧЁТ НА ОПЛАТУ УСЛУГ'}
                {activeTab === 'payroll' && 'РАСЧЁТНЫЙ ЛИСТОК ПЕРСОНАЛА'}
              </h2>
              <p className="text-xs text-[#6B5530] mt-1 font-medium">
                {activeTab === 'seller' && 'Фулфилмент, брендирование и капсульное хранение'}
                {activeTab === 'invoice' && `Счёт № ${settings.reportDateTo.replace(/-/g, '')}-01`}
                {activeTab === 'payroll' && 'Сдельная заработная плата операторов склада'}
              </p>
            </div>
          </div>

          {/* 8.6.3 Meta Block: Background #EEE5D6 (cream), no borders */}
          <div className="my-5 p-4 bg-[#EEE5D6] text-xs text-[#333333] grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <span className="text-[#6B5530] font-semibold block">Склад / ПВЗ:</span>
              <span className="font-bold text-[#333333]">{settings.pvzName}</span>
            </div>
            <div>
              <span className="text-[#6B5530] font-semibold block">Селлер / Заказчик:</span>
              <span className="font-bold text-[#333333]">{settings.sellerName}</span>
            </div>
            <div>
              <span className="text-[#6B5530] font-semibold block">Отчётный период:</span>
              <span className="font-bold text-[#333333]">
                {formatDateRu(settings.reportDateFrom)} — {formatDateRu(settings.reportDateTo)}
              </span>
            </div>
          </div>

          {/* ======================================================== */}
          {/* TAB 1: ОТЧЁТ ДЛЯ СЕЛЛЕРА */}
          {/* ======================================================== */}
          {activeTab === 'seller' && (
            <div className="space-y-8">
              <div className="grid grid-cols-3 gap-3 print:gap-2">
                <div className="border border-[#E6E6E6] p-3 print:p-2"><span className="text-[11px] text-[#6B5530] block">Обработано за период</span><b className="text-xl text-[#5A081E]">{formatNumber(processedQty)} шт.</b><p className="text-[10px] text-neutral-500">приходы и отгрузки</p></div>
                <div className="border border-[#E6E6E6] p-3 print:p-2"><span className="text-[11px] text-[#6B5530] block">Самая высокая оборачиваемость</span><b className="text-lg text-emerald-700">{highestTurnover?.article ?? '—'}</b><p className="text-[10px] text-neutral-500">{highestTurnover ? `${highestTurnover.ratio.toFixed(2)} оборота` : 'нет данных'}</p></div>
                <div className="border border-[#E6E6E6] p-3 print:p-2"><span className="text-[11px] text-[#6B5530] block">Самая низкая оборачиваемость</span><b className="text-lg text-amber-700">{lowestTurnover?.article ?? '—'}</b><p className="text-[10px] text-neutral-500">{lowestTurnover ? `${lowestTurnover.ratio.toFixed(2)} оборота` : 'нет данных'}</p></div>
              </div>
              {/* 1. Fulfillment Services Table */}
              <div className="report-page-break">
                <h3 className="text-sm font-bold text-[#5A081E] mb-2 uppercase tracking-wide">
                  1. Услуги фулфилмента по артикулам за период
                </h3>
                {/* STRICT PRINT RULE: All table cells white background, borders #E6E6E6 */}
                <table className="w-full border-collapse border border-[#E6E6E6] text-xs">
                  <thead>
                    <tr className="border-b border-[#E6E6E6]">
                      <th className="p-2 text-left font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                        Артикул
                      </th>
                      <th className="p-2 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                        Количество (шт)
                      </th>
                      <th className="p-2 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                        Сумма приёмки (₽)
                      </th>
                      <th className="p-2 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                        Возврат (шт)
                      </th>
                      <th className="p-2 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                        Сборка (шт / руб)
                      </th>
                      <th className="p-2 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                        Брендирование (шт / руб)
                      </th>
                      <th className="p-2 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                        Упаковка (шт / руб)
                      </th>
                      <th className="p-2 text-right font-bold text-[#5A081E] bg-white">
                        Итого операции
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellerFulfillment.items.map((item) => {
                      const opTotal =
                        item.receptionCost +
                        item.assemblyCost +
                        item.brandingCost +
                        item.packagingCost;

                      return (
                        <tr key={item.article} className="border-b border-[#E6E6E6]">
                          <td className="p-2 font-bold text-[#333333] border-r border-[#E6E6E6] bg-white">
                            {item.article}
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                            {item.receptionQty > 0 ? item.receptionQty : '—'}
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                            {item.receptionCost > 0 ? formatCurrency(item.receptionCost) : '—'}
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                            {item.returnsQty > 0 ? `${item.returnsQty} шт` : '—'}
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                            {item.assemblyQty > 0 ? `${item.assemblyQty} шт / ${formatCurrency(item.assemblyCost)}` : '—'}
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                            {item.brandingQty > 0 ? `${item.brandingQty} шт / ${formatCurrency(item.brandingCost)}` : '—'}
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                            {item.packagingQty > 0 ? `${item.packagingQty} шт / ${formatCurrency(item.packagingCost)}` : '—'}
                          </td>
                          <td className="p-2 text-right font-mono font-bold tabular-nums text-[#333333] bg-white">
                            {formatCurrency(opTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Summary row with thick #5A081E border */}
                  <tfoot>
                    <tr className="border-t-2 border-[#5A081E] font-bold text-[#333333]">
                      <td className="p-2.5 font-bold border-r border-[#E6E6E6] bg-white">
                        Итого фулфилмент
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                        {sellerFulfillment.items.reduce((sum, i) => sum + i.receptionQty, 0)} шт
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                        {formatCurrency(sellerFulfillment.totalReceptionCost)}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                        {sellerFulfillment.items.reduce((sum, i) => sum + i.returnsQty, 0)} шт
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                        {formatCurrency(sellerFulfillment.totalAssemblyCost)}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                        {formatCurrency(sellerFulfillment.totalBrandingCost)}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                        {formatCurrency(sellerFulfillment.totalPackagingCost)}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-sm font-extrabold text-[#5A081E] bg-white">
                        {formatCurrency(
                          sellerFulfillment.totalReceptionCost +
                            sellerFulfillment.totalAssemblyCost +
                            sellerFulfillment.totalBrandingCost +
                            sellerFulfillment.totalPackagingCost
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#5A081E] mb-2 uppercase tracking-wide">2. Обратный поток</h3>
                <table className="w-full border-collapse border border-[#E6E6E6] text-xs">
                  <thead><tr className="border-b"><th className="p-2 text-left">Этап</th><th className="p-2 text-right">Операций</th><th className="p-2 text-right">Начислено селлеру</th></tr></thead>
                  <tbody>{reverseSummary.map(row=><tr key={row.stage} className="border-b"><td className="p-2">{reverseStageNames[row.stage]}</td><td className="p-2 text-right">{row.qty}</td><td className="p-2 text-right font-mono">{formatCurrency(row.seller)}</td></tr>)}</tbody>
                  <tfoot><tr className="border-t-2 border-[#5A081E] font-bold"><td className="p-2">Итого обратный поток</td><td className="p-2 text-right">{reverseEvents.length}</td><td className="p-2 text-right font-mono text-[#5A081E]">{formatCurrency(reverseSellerTotal)}</td></tr></tfoot>
                </table>
                {reverseWrittenOff.length>0&&<div className="mt-3"><h4 className="font-bold text-sm">Списания</h4>{reverseWrittenOff.map(unit=><div key={unit.id} className="text-xs border-b py-1">{formatDateRu(unit.closedDate!)} · {unit.article} · 1 шт. · {unit.defects.join(', ')||'повреждения не указаны'}</div>)}</div>}
              </div>

              {/* 3. Storage Table by Capsules (Section 5.6 & 5.7) */}
              <div>
                <h3 className="text-sm font-bold text-[#5A081E] mb-2 uppercase tracking-wide">
                  2. Расчёт хранения по партиям (капсулам) за период (FIFO)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-[#E6E6E6] text-[11px]">
                    <thead>
                      <tr className="border-b border-[#E6E6E6]">
                        <th className="p-2 text-left font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Партия / Дата
                        </th>
                        <th className="p-2 text-left font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Артикул
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Приёмка
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Отгружено
                        </th>
                        {/* Daily columns */}
                        {periodDates.map((d) => (
                          <th
                            key={d}
                            className="p-1 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white w-9"
                          >
                            {formatDateRu(d, false)}
                          </th>
                        ))}
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Шт-дни
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Тариф
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] bg-white">
                          Сумма
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {capsules.map((cap, idx) => {
                        const tariff = sellerTariffs[cap.article]?.storage ?? 0;
                        return (
                          <tr key={`${cap.id}_${idx}`} className="border-b border-[#E6E6E6]">
                            <td className="p-2 font-mono border-r border-[#E6E6E6] bg-white text-neutral-800">
                              {formatDateRu(cap.date)} {cap.type === 'return' ? '(Возврат)' : ''}
                            </td>
                            <td className="p-2 font-bold border-r border-[#E6E6E6] bg-white text-neutral-900">
                              {cap.article}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white text-neutral-700">
                              {cap.initialQuantity}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white text-neutral-700">
                              {cap.shippedQuantity}
                            </td>
                            {/* Daily balances */}
                            {periodDates.map((d) => (
                              <td
                                key={d}
                                className="p-1 text-center font-mono tabular-nums border-r border-[#E6E6E6] bg-white text-neutral-800"
                              >
                                {cap.dailyBalances[d] ?? 0}
                              </td>
                            ))}
                            <td className="p-2 text-right font-mono font-bold tabular-nums border-r border-[#E6E6E6] bg-white text-[#5A081E]">
                              {cap.unitDaysInPeriod}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white text-neutral-600">
                              {tariff.toFixed(2)} ₽
                            </td>
                            <td className="p-2 text-right font-mono font-bold tabular-nums bg-white text-[#333333]">
                              {formatCurrency(cap.storageCost)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#5A081E] font-bold text-[#333333]">
                        <td colSpan={4 + periodDates.length} className="p-2 text-right border-r border-[#E6E6E6] bg-white">
                          Итого шт-дней хранения:
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white font-extrabold text-[#5A081E]">
                          {capsules.reduce((sum, c) => sum + c.unitDaysInPeriod, 0)}
                        </td>
                        <td className="p-2 text-right border-r border-[#E6E6E6] bg-white">—</td>
                        <td className="p-2 text-right font-mono tabular-nums font-extrabold text-sm text-[#5A081E] bg-white">
                          {formatCurrency(sellerFulfillment.totalStorageCost)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 3. Summary Block */}
              <div className="pt-4 border-t-2 border-[#5A081E] flex flex-col items-end">
                <div className="w-full sm:w-80 space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#E6E6E6]">
                    <span className="text-[#6B5530]">Услуги фулфилмента:</span>
                    <span className="font-mono font-semibold text-[#333333]">
                      {formatCurrency(
                        sellerFulfillment.totalReceptionCost +
                          sellerFulfillment.totalAssemblyCost +
                          sellerFulfillment.totalBrandingCost +
                          sellerFulfillment.totalPackagingCost
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E6E6E6]">
                    <span className="text-[#6B5530]">Обратный поток:</span>
                    <span className="font-mono font-semibold text-[#333333]">{formatCurrency(reverseSellerTotal)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E6E6E6]">
                    <span className="text-[#6B5530]">Ответственное хранение (FIFO):</span>
                    <span className="font-mono font-semibold text-[#333333]">
                      {formatCurrency(sellerFulfillment.totalStorageCost)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 text-base font-extrabold text-[#5A081E]">
                    <span>ИТОГО К ОПЛАТЕ:</span>
                    <span className="font-mono">{formatCurrency(sellerFulfillment.grandTotal + reverseSellerTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: СЧЁТ НА ОПЛАТУ */}
          {/* ======================================================== */}
          {activeTab === 'invoice' && (
            <div className="space-y-3 invoice-sheet">
              <div className="p-2 bg-white border border-[#E6E6E6] text-xs space-y-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[#6B5530] font-semibold block">Исполнитель:</span>
                    <span className="font-bold text-[#333333] text-sm">{settings.pvzName}</span>
                    <p className="text-neutral-500 mt-0.5">Услуги фулфилмента и складского хранения</p>
                  </div>
                  <div>
                    <span className="text-[#6B5530] font-semibold block">Заказчик (Плательщик):</span>
                    <span className="font-bold text-[#333333] text-sm">{settings.sellerName}</span>
                    <p className="text-neutral-500 mt-0.5">Договор обслуживания склада Wildberries</p>
                  </div>
                </div>
              </div>

              {/* Invoice table */}
              <table className="w-full border-collapse border border-[#E6E6E6] text-xs">
                <thead>
                  <tr className="border-b border-[#E6E6E6]">
                    <th className="p-2.5 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white w-10">
                      №
                    </th>
                    <th className="p-2.5 text-left font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                      Наименование услуги
                    </th>
                    <th className="p-2.5 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white w-24">
                      Кол-во
                    </th>
                    <th className="p-2.5 text-center font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white w-20">
                      Ед.
                    </th>
                    <th className="p-2.5 text-right font-bold text-[#5A081E] bg-white w-32">
                      Сумма, руб.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#E6E6E6]">
                    <td className="p-2.5 text-center font-mono border-r border-[#E6E6E6] bg-white">1</td>
                    <td className="p-2.5 font-medium border-r border-[#E6E6E6] bg-white">
                      Приёмка товара от поставщика (7 артикулов)
                    </td>
                    <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                      {sellerFulfillment.items.reduce((sum, i) => sum + i.receptionQty, 0)}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#E6E6E6] bg-white">шт</td>
                    <td className="p-2.5 text-right font-mono tabular-nums font-semibold bg-white">
                      {formatCurrency(sellerFulfillment.totalReceptionCost)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E6E6E6]">
                    <td className="p-2.5 text-center font-mono border-r border-[#E6E6E6] bg-white">2</td>
                    <td className="p-2.5 font-medium border-r border-[#E6E6E6] bg-white">
                      Брендирование товара (категории АК и Г)
                    </td>
                    <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                      {sellerFulfillment.items.reduce((sum, i) => sum + i.brandingQty, 0)}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#E6E6E6] bg-white">шт</td>
                    <td className="p-2.5 text-right font-mono tabular-nums font-semibold bg-white">
                      {formatCurrency(sellerFulfillment.totalBrandingCost)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E6E6E6]">
                    <td className="p-2.5 text-center font-mono border-r border-[#E6E6E6] bg-white">3</td>
                    <td className="p-2.5 font-medium border-r border-[#E6E6E6] bg-white">
                      Индивидуальная упаковка заказов
                    </td>
                    <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                      {sellerFulfillment.items.reduce((sum, i) => sum + i.packagingQty, 0)}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#E6E6E6] bg-white">шт</td>
                    <td className="p-2.5 text-right font-mono tabular-nums font-semibold bg-white">
                      {formatCurrency(sellerFulfillment.totalPackagingCost)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E6E6E6]">
                    <td className="p-2.5 text-center font-mono border-r border-[#E6E6E6] bg-white">4</td>
                    <td className="p-2.5 font-medium border-r border-[#E6E6E6] bg-white">
                      Сборка и подготовка к отправке в Wildberries
                    </td>
                    <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                      {sellerFulfillment.items.reduce((sum, i) => sum + i.assemblyQty, 0)}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#E6E6E6] bg-white">шт</td>
                    <td className="p-2.5 text-right font-mono tabular-nums font-semibold bg-white">
                      {formatCurrency(sellerFulfillment.totalAssemblyCost)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E6E6E6]">
                    <td className="p-2.5 text-center font-mono border-r border-[#E6E6E6] bg-white">5</td>
                    <td className="p-2.5 font-medium border-r border-[#E6E6E6] bg-white">
                      Ответственное складское хранение (партии-капсулы FIFO)
                    </td>
                    <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                      {capsules.reduce((sum, c) => sum + c.unitDaysInPeriod, 0)}
                    </td>
                    <td className="p-2.5 text-center border-r border-[#E6E6E6] bg-white">шт-дн</td>
                    <td className="p-2.5 text-right font-mono tabular-nums font-semibold bg-white">
                      {formatCurrency(sellerFulfillment.totalStorageCost)}
                    </td>
                  </tr>
                  <tr className="border-b border-[#E6E6E6]">
                    <td className="p-2.5 text-center font-mono border-r border-[#E6E6E6] bg-white">6</td>
                    <td className="p-2.5 font-medium border-r border-[#E6E6E6] bg-white">Обработка товаров обратного потока</td>
                    <td className="p-2.5 text-right font-mono border-r border-[#E6E6E6] bg-white">{reverseEvents.length}</td>
                    <td className="p-2.5 text-center border-r border-[#E6E6E6] bg-white">операций</td>
                    <td className="p-2.5 text-right font-mono font-semibold bg-white">{formatCurrency(reverseSellerTotal)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#5A081E] font-bold text-sm text-[#333333]">
                    <td colSpan={4} className="p-3 text-right border-r border-[#E6E6E6] bg-white font-extrabold">
                      Всего к оплате:
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-base text-[#5A081E] bg-white">
                      {formatCurrency(sellerFulfillment.grandTotal + reverseSellerTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: РАСЧЁТНЫЙ ЛИСТОК ПЕРСОНАЛА */}
          {/* ======================================================== */}
          {activeTab === 'payroll' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 print:hidden">
                <span className="text-sm font-semibold text-[#6B5530]">Сотрудник:</span>
                {operatorPayroll.operators.map((op)=><button key={op.operator} onClick={()=>setSelectedOperator(op.operator)} className={`px-3 py-2 rounded-lg border text-sm font-bold ${selectedOperator===op.operator?'bg-[#5A081E] text-white border-[#5A081E]':'bg-white text-[#5A081E] border-neutral-300'}`}>{op.operator}</button>)}
              </div>
              {operatorPayroll.operators.filter((op)=>op.operator===selectedOperator).map((op) => (
                <div key={op.operator} className="space-y-3 payroll-sheet">
                  <div className="flex items-center justify-between pb-2 border-b border-[#5A081E]">
                    <div>
                      <h4 className="text-base font-extrabold text-[#5A081E]">{op.operator}</h4>
                      <p className="text-xs text-[#6B5530]">
                        Отработано смен: <strong>{op.workDaysCount} дн.</strong> ({op.dates.map((d) => formatDateRu(d, false)).join(', ') || 'нет смен'})
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-neutral-500 block uppercase tracking-wider">К выплате:</span>
                      <span className="text-base font-bold font-mono text-[#5A081E]">
                        {formatCurrency(op.totalPay + reverseStaffFor(op.operator))}
                      </span>
                    </div>
                  </div>

                  <table className="w-full border-collapse border border-[#E6E6E6] text-xs">
                    <thead>
                      <tr className="border-b border-[#E6E6E6]">
                        <th className="p-2 text-left font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Артикул
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Приёмка (руб)
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Брендирование (руб)
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Упаковка (руб)
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] border-r border-[#E6E6E6] bg-white">
                          Сборка (руб)
                        </th>
                        <th className="p-2 text-right font-bold text-[#5A081E] bg-white">
                          Итого по артикулу
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_ARTICLES.map((art) => {
                        const row = op.byArticle[art] || { reception: 0, branding: 0, packaging: 0, assembly: 0, total: 0 };
                        return (
                          <tr key={art} className="border-b border-[#E6E6E6]">
                            <td className="p-2 font-bold text-[#333333] border-r border-[#E6E6E6] bg-white">
                              {art}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                              {row.reception > 0 ? formatCurrency(row.reception) : '—'}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                              {row.branding > 0 ? formatCurrency(row.branding) : '—'}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                              {row.packaging > 0 ? formatCurrency(row.packaging) : '—'}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                              {row.assembly > 0 ? formatCurrency(row.assembly) : '—'}
                            </td>
                            <td className="p-2 text-right font-mono font-bold tabular-nums text-[#333333] bg-white">
                              {formatCurrency(row.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#5A081E] font-bold text-[#333333]">
                        <td className="p-2.5 font-bold border-r border-[#E6E6E6] bg-white">Итого:</td>
                        <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                          {formatCurrency(op.receptionPay)}
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                          {formatCurrency(op.brandingPay)}
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                          {formatCurrency(op.packagingPay)}
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums border-r border-[#E6E6E6] bg-white">
                          {formatCurrency(op.assemblyPay)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-extrabold text-sm text-[#5A081E] bg-white">
                          {formatCurrency(op.totalPay)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="border border-[#E6E6E6] p-3 text-xs">
                    <div className="flex justify-between font-bold text-[#5A081E]"><span>Обратный поток</span><span>{formatCurrency(reverseStaffFor(op.operator))}</span></div>
                    {(Object.keys(reverseStageNames) as ReverseStage[]).map(stage=>{const events=reverseEvents.filter(event=>event.operator===op.operator&&event.stage===stage);const amount=events.reduce((sum,event)=>sum+reverseStaffRates[stage][reverseWeight(event.article)],0);return <div key={stage} className="flex justify-between border-t mt-1 pt-1"><span>{reverseStageNames[stage]} — {events.length}</span><span>{formatCurrency(amount)}</span></div>})}
                  </div>
                </div>
              ))}

              <div className="pt-4 border-t-2 border-[#5A081E] flex justify-between items-center text-sm font-bold text-[#5A081E]">
                <span>К ВЫПЛАТЕ СОТРУДНИКУ:</span>
                <span className="text-base font-extrabold font-mono">
                  {formatCurrency((operatorPayroll.operators.find((op)=>op.operator===selectedOperator)?.totalPay ?? 0) + reverseStaffFor(selectedOperator))}
                </span>
              </div>
            </div>
          )}

          {/* 8.6.4 Mandatory Footer for Print Forms */}
          <div className="mt-8 pt-3 border-t border-[#E6E6E6] flex flex-wrap items-center justify-between text-[9pt] text-[#6B5530] print:hidden">
            <div>PVZ.FLOW — Система учёта фулфилмента ПВЗ</div>
            <div>Документ сформирован: {printDateStr}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
