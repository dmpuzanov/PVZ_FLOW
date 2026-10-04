import React from 'react';
import { usePvz } from '../context/PvzContext';
import { formatDateRu } from '../utils/calculations';

interface PrintHeaderProps {
  documentTitle: string;
  documentSubtitle?: string;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  documentTitle,
  documentSubtitle,
}) => {
  const { settings } = usePvz();
  const printDateStr = formatDateRu(new Date().toISOString().split('T')[0]);

  return (
    <div className="hidden print:block mb-6 print-header-root">
      {/* 8.6.1 Mandatory Header */}
      <div className="flex items-start justify-between pb-4 border-b border-[#E6E6E6]">
        {/* Logo >= 15mm (~60px) in #5A081E */}
        <div className="flex items-center gap-3">
          <img src="./branding/pvz-flow-primary.png" alt="PVZ.FLOW" className="h-16 w-auto object-contain" />
        </div>

        {/* Document Title */}
        <div className="text-right">
          <h2 className="text-xl font-bold text-[#5A081E] tracking-tight">
            {documentTitle}
          </h2>
          {documentSubtitle && (
            <p className="text-xs text-[#6B5530] mt-0.5 font-medium">
              {documentSubtitle}
            </p>
          )}
        </div>
      </div>

      {/* 8.6.3 Meta Block: Background #EEE5D6 (cream), no borders */}
      <div className="my-3 p-3 bg-[#EEE5D6] text-xs text-[#333333] grid grid-cols-3 gap-2 rounded-xs">
        <div>
          <span className="text-[#6B5530] font-semibold block">Склад / ПВЗ:</span>
          <span className="font-bold text-[#333333]">{settings.pvzName}</span>
        </div>
        <div>
          <span className="text-[#6B5530] font-semibold block">Селлер / Заказчик:</span>
          <span className="font-bold text-[#333333]">{settings.sellerName}</span>
        </div>
        <div>
          <span className="text-[#6B5530] font-semibold block">Период / Дата:</span>
          <span className="font-bold text-[#333333]">
            {formatDateRu(settings.reportDateFrom)} — {formatDateRu(settings.reportDateTo)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const PrintFooter: React.FC = () => {
  const printDateStr = formatDateRu(new Date().toISOString().split('T')[0]);

  return (
    <div className="hidden print:flex mt-8 pt-3 border-t border-[#E6E6E6] items-center justify-between text-[9pt] text-[#6B5530]">
      <div>PVZ.FLOW — Система учёта фулфилмента ПВЗ</div>
      <div>Сформировано: {printDateStr}</div>
    </div>
  );
};
