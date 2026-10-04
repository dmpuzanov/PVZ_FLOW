import React from 'react';
import { ALL_ARTICLES } from '../constants/initialData';
import type { Article, DailyStockRow } from '../types/pvz';

export function AdjustmentRow({ row, articles = ALL_ARTICLES, printHidden = false }: { row: DailyStockRow; articles?: Article[]; printHidden?: boolean }) {
  const hasAdjustment = articles.some(a => (row.byArticle[a]?.adjustment ?? 0) !== 0);
  if (!hasAdjustment) return null;
  return (
    <tr className={`bg-[#EEE5D6] border-y-2 border-[#BD995A] text-[#5A081E] font-bold ${printHidden ? 'print:hidden' : ''}`}>
      <td className="sticky left-0 z-10 bg-[#EEE5D6] py-2 px-3 whitespace-nowrap">КОРРЕКТИРОВКА</td>
      {articles.map(article => {
        const value = row.byArticle[article]?.adjustment ?? 0;
        return (
          <React.Fragment key={`adjustment_${row.date}_${article}`}>
            <td colSpan={3} className="py-2 px-2 text-center text-xs">{value ? 'Техническое событие' : ''}</td>
            <td className="py-2 px-2 text-right border-r border-[#BD995A]">
              {value > 0 ? `+${value}` : value < 0 ? value : '—'}
            </td>
          </React.Fragment>
        );
      })}
    </tr>
  );
}
