import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { usePvz } from '../context/PvzContext';
import { formatDateRu } from '../utils/calculations';

export const Header: React.FC<{ title: string }> = ({ title }) => {
  const { settings } = usePvz();
  const [orientation,setOrientation]=useState(()=>localStorage.getItem('pvz_print_orientation')||'portrait');
  const changeOrientation=(value:string)=>{setOrientation(value);localStorage.setItem('pvz_print_orientation',value)};
  return <header className="min-h-16 px-6 py-3 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10 print:hidden">
    <div className="flex items-center gap-3"><h1 className="text-xl font-bold text-[#333333]">{title}</h1><span className="text-[10px] font-bold px-2 py-1 rounded bg-[#5A081E] text-white">6.6.2</span><span className="hidden sm:inline-block text-xs px-2.5 py-1 rounded bg-[#F8F8F9] text-[#6B5530] border">{settings.pvzName}</span></div>
    <div className="flex items-center gap-2"><div className="flex items-center gap-2 px-3 py-1.5 bg-[#F8F8F9] border rounded-lg text-xs text-[#6B5530]"><Calendar className="w-4 h-4 text-[#BD995A]"/><span>Период:</span><b className="text-[#333333]">{formatDateRu(settings.reportDateFrom)} — {formatDateRu(settings.reportDateTo)}</b></div><select title="Ориентация печати" value={orientation} onChange={e=>changeOrientation(e.target.value)} className="px-2 py-1.5 border rounded-lg text-xs bg-white"><option value="portrait">Печать: книжная</option><option value="landscape">Печать: альбомная</option></select></div>
  </header>;
};
