import React, { useState } from 'react';
import { CalendarRange, Printer } from 'lucide-react';
import { ALL_ARTICLES } from '../constants/initialData';
import { usePvz } from '../context/PvzContext';
import { formatDateRu, formatNumber } from '../utils/calculations';
import { PrintFooter, PrintHeader } from './PrintHeader';
import { printDocument } from '../utils/printDocument';

export const DashboardView: React.FC = () => {
  const { matrix, settings, updateSettings } = usePvz();
  const [orientation, setOrientation] = useState<'portrait'|'landscape'>('portrait');
  const today = new Date().toLocaleDateString('sv-SE');
  const periodRows = matrix.filter((x) => x.date >= settings.reportDateFrom && x.date <= settings.reportDateTo);
  const first = periodRows[0];
  const last = periodRows.at(-1);
  const periodStart = first ? ALL_ARTICLES.reduce((s,a)=>s+(first.byArticle[a]?.balanceStart??0),0) : 0;
  const periodArrival = periodRows.reduce((s,r)=>s+r.totalArrival,0);
  const periodShipment = periodRows.reduce((s,r)=>s+r.totalShipment,0);
  const periodEnd = last?.totalBalanceEnd ?? 0;
  const recordedToday = matrix.find((x)=>x.date===today);
  const priorRow = matrix.filter((x)=>x.date<today).at(-1);
  const todayRow = recordedToday ?? (priorRow ? {
    ...priorRow,
    date: today,
    byArticle: Object.fromEntries(ALL_ARTICLES.map((a)=>[a,{balanceStart:priorRow.byArticle[a]?.balanceEnd??0,arrival:0,shipment:0,balanceEnd:priorRow.byArticle[a]?.balanceEnd??0}])) as typeof priorRow.byArticle,
  } : undefined);
  const totals = ALL_ARTICLES.reduce((t,a)=>{const c=todayRow?.byArticle[a];return {start:t.start+(c?.balanceStart??0),arrival:t.arrival+(c?.arrival??0),shipment:t.shipment+(c?.shipment??0),end:t.end+(c?.balanceEnd??0)}},{start:0,arrival:0,shipment:0,end:0});
  const print = () => { localStorage.setItem('pvz_print_orientation',orientation); printDocument('ЕЖЕДНЕВНЫЙ_ОТЧЕТ',today,today); };

  return <div className={`flex-1 overflow-auto bg-[#F8F8F9] p-6 print:bg-white print:p-0 print-${orientation}`}>
    <PrintHeader documentTitle="ЕЖЕДНЕВНЫЙ ОТЧЁТ PVZ.FLOW" documentSubtitle={`Движение товара за ${formatDateRu(today)}`} />
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden"><div><h2 className="text-2xl font-extrabold text-[#5A081E]">Главная</h2><p className="text-sm text-[#6B5530]">Актуальные данные на {formatDateRu(today)}</p></div><div className="flex flex-wrap items-center gap-2 bg-white border rounded-xl p-2"><CalendarRange className="w-4 h-4 text-[#BD995A]"/><input type="date" value={settings.reportDateFrom} onChange={e=>updateSettings({reportDateFrom:e.target.value})}/><span>—</span><input type="date" value={settings.reportDateTo} onChange={e=>updateSettings({reportDateTo:e.target.value})}/><select value={orientation} onChange={e=>setOrientation(e.target.value as 'portrait'|'landscape')} className="border rounded p-1 text-sm"><option value="portrait">Книжная</option><option value="landscape">Альбомная</option></select><button onClick={print} className="px-3 py-2 bg-[#5A081E] text-white rounded-lg text-sm font-bold"><Printer className="inline w-4 h-4 mr-1"/>Печать</button></div></div>

      <section className="bg-white border rounded-xl p-4 print:hidden"><h3 className="font-bold text-[#5A081E] mb-3">Свод за выбранный период</h3><div className="grid grid-cols-4 gap-3">{[['На начало',periodStart],['Поступило',periodArrival],['Выбыло',periodShipment],['На конец',periodEnd]].map(([l,v])=><div key={String(l)} className="bg-[#F8F8F9] p-3 rounded-lg"><div className="text-xs text-neutral-500">{l}</div><b className="text-2xl">{formatNumber(Number(v))} шт.</b></div>)}</div></section>

      <section className="bg-white border rounded-xl overflow-hidden"><div className="px-5 py-4 border-b"><h3 className="font-bold text-[#5A081E]">Движение товара за сегодня</h3><p className="text-xs text-neutral-500">{formatDateRu(today)} · ежедневный отчёт селлеру</p></div><table className="w-full text-sm"><thead className="bg-[#EEE5D6] text-[#5A081E]"><tr><th className="text-left p-3">Артикул</th><th className="text-right p-3">Было</th><th className="text-right p-3">Получено</th><th className="text-right p-3">Отправлено</th><th className="text-right p-3">Остаток</th></tr></thead><tbody>{ALL_ARTICLES.map(a=>{const c=todayRow?.byArticle[a];return <tr key={a} className="border-t"><td className="p-3 font-bold">{a}</td><td className="p-3 text-right">{c?.balanceStart??0}</td><td className="p-3 text-right text-emerald-700">{c?.arrival??0}</td><td className="p-3 text-right text-[#5A081E]">{c?.shipment??0}</td><td className="p-3 text-right font-bold">{c?.balanceEnd??0}</td></tr>})}</tbody><tfoot><tr className="border-t-2 border-[#5A081E] font-extrabold"><td className="p-3">Итого за день</td><td className="p-3 text-right">{totals.start}</td><td className="p-3 text-right">{totals.arrival}</td><td className="p-3 text-right">{totals.shipment}</td><td className="p-3 text-right">{totals.end}</td></tr></tfoot></table>{!recordedToday&&todayRow&&<div className="p-3 text-center text-amber-800 bg-amber-50">На сегодня движения пока нет; показан перенесённый остаток предыдущего дня.</div>}</section>
    </div><PrintFooter />
  </div>;
};
