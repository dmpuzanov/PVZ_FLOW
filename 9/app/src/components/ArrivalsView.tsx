import React, { useState } from 'react';
import { Plus, PackageCheck, RotateCcw, Trash2, Edit2, Search, Filter, Download, Printer } from 'lucide-react';
import { ALL_ARTICLES, ARTICLE_MAP } from '../constants/initialData';
import { usePvz } from '../context/PvzContext';
import { Article, ArrivalRecord, ArrivalType } from '../types/pvz';
import { formatDateRu } from '../utils/calculations';
import { ArrivalModal } from './modals/ArrivalModal';
import { PrintHeader, PrintFooter } from './PrintHeader';

export const ArrivalsView: React.FC = () => {
  const { arrivals, deleteArrival, exportArrivalsCsv } = usePvz();
  const [filterArticle, setFilterArticle] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editItem, setEditItem] = useState<ArrivalRecord | null>(null);
  const [defaultType, setDefaultType] = useState<ArrivalType>('arrival');

  const handlePrint = () => {
    window.print();
  };

  // Filtered arrivals
  const filteredArrivals = arrivals
    .filter((item) => {
      if (filterArticle !== 'all' && item.article !== filterArticle) return false;
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const noteMatch = (item.note || '').toLowerCase().includes(query);
        const artMatch = item.article.toLowerCase().includes(query);
        if (!noteMatch && !artMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });

  // Summary counts
  const totalQty = arrivals.reduce((sum, a) => sum + a.quantity, 0);
  const totalReceptions = arrivals
    .filter((a) => a.type === 'arrival')
    .reduce((sum, a) => sum + a.quantity, 0);
  const totalReturns = arrivals
    .filter((a) => a.type === 'return')
    .reduce((sum, a) => sum + a.quantity, 0);

  const handleOpenAdd = (type: ArrivalType = 'arrival') => {
    setEditItem(null);
    setDefaultType(type);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ArrivalRecord) => {
    setEditItem(item);
    setDefaultType(item.type);
    setIsModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Top Banner / Metrics */}
      <div className="p-5 border-b border-neutral-200 bg-[#F8F8F9] shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#333333]">Журнал поступлений (Приход и Возвраты)</h2>
            <p className="text-xs text-[#6B5530]">
              Все операции увеличивают колонку «Поставка» матрицы и формируют отслеживаемые капсулы
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportArrivalsCsv}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors shadow-2xs"
              title="Экспорт журнала приёмки и возвратов в CSV"
            >
              <Download className="w-3.5 h-3.5 text-[#5A081E]" />
              <span>Экспорт в CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#EEDDB0] border border-[#BD995A] text-[#333333] hover:bg-[#e4cf99] transition-colors shadow-2xs"
              title="Печать журнала приёмки и возвратов на принтер или сохранение в PDF"
            >
              <Printer className="w-3.5 h-3.5 text-[#5A081E]" />
              <span>Печать</span>
            </button>
            <button
              onClick={() => handleOpenAdd('arrival')}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#5A081E] text-white hover:bg-[#460617] transition-colors shadow-xs"
            >
              <PackageCheck className="w-4 h-4 text-emerald-400" />
              <span>+ Приёмка от селлера</span>
            </button>
            <button
              onClick={() => handleOpenAdd('return')}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors shadow-xs"
            >
              <RotateCcw className="w-4 h-4 text-[#5A081E]" />
              <span>+ Возврат (невыкуп)</span>
            </button>
          </div>
        </div>

        {/* Quick summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-neutral-200/80">
          <div className="bg-white p-3 rounded-lg border border-neutral-200">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 block">Всего поступлений</span>
            <span className="text-base font-bold font-mono text-neutral-900">{totalQty} шт</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-200">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 block">Приёмка от селлера</span>
            <span className="text-base font-bold font-mono text-emerald-700">{totalReceptions} шт</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-200">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 block">Возвраты-невыкупы</span>
            <span className="text-base font-bold font-mono text-amber-700">{totalReturns} шт</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-200">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 block">Всего записей в базе</span>
            <span className="text-base font-bold font-mono text-neutral-700">{arrivals.length}</span>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Article filter */}
          <div className="flex items-center gap-1.5 text-xs text-[#6B5530]">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={filterArticle}
              onChange={(e) => setFilterArticle(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white text-[#333333] focus:outline-hidden focus:ring-1 focus:ring-[#BD995A]"
            >
              <option value="all">Все артикулы</option>
              {ALL_ARTICLES.map((art) => (
                <option key={art} value={art}>
                  {art}
                </option>
              ))}
            </select>
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 text-xs text-[#6B5530]">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white text-[#333333] focus:outline-hidden focus:ring-1 focus:ring-[#BD995A]"
            >
              <option value="all">Все типы поступлений</option>
              <option value="arrival">Только приёмка от селлера</option>
              <option value="return">Только возврат (невыкуп)</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Поиск по артикулу или примечанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#BD995A]"
          />
        </div>
      </div>

      {/* Table of records */}
      <div className="flex-1 overflow-auto p-0 print:p-0 print:overflow-visible">
        {/* Print Header conforming to section 8.6 with logo >=15mm */}
        <PrintHeader
          documentTitle="ЖУРНАЛ ПОСТУПЛЕНИЙ (ПРИЁМКА И ВОЗВРАТЫ)"
          documentSubtitle="Реестр первичных документов поступления товара от селлера и клиентских невыкупов"
        />

        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-[#F8F8F9] text-neutral-600 font-semibold border-b border-neutral-200 z-10">
            <tr>
              <th className="py-2.5 px-4 w-28">Дата</th>
              <th className="py-2.5 px-4 w-32">Тип</th>
              <th className="py-2.5 px-4 w-28">Артикул</th>
              <th className="py-2.5 px-4 w-24">Категория</th>
              <th className="py-2.5 px-4 text-right w-28">Количество</th>
              <th className="py-2.5 px-4">Примечание / Документ</th>
              <th className="py-2.5 px-4 text-right w-24">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredArrivals.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-400 font-sans">
                  Записей не найдено. Нажмите «+ Приёмка от селлера» для добавления.
                </td>
              </tr>
            ) : (
              filteredArrivals.map((item) => {
                const info = ARTICLE_MAP.get(item.article);
                const isReturn = item.type === 'return';

                return (
                  <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-medium text-neutral-900">
                      {formatDateRu(item.date)}
                    </td>
                    <td className="py-2.5 px-4">
                      {isReturn ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                          <RotateCcw className="w-3 h-3" /> Возврат
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <PackageCheck className="w-3 h-3" /> Приёмка
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-[#5A081E]">
                      {item.article}
                    </td>
                    <td className="py-2.5 px-4 text-neutral-600">
                      {info?.category} (~{info?.weightKg} кг)
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-sm text-emerald-700">
                      +{item.quantity} шт
                    </td>
                    <td className="py-2.5 px-4 text-neutral-600 truncate max-w-xs">
                      {item.note || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1 hover:bg-neutral-200 rounded text-neutral-600 hover:text-neutral-900 transition-colors"
                          title="Редактировать"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Удалить запись ${item.article} (${item.quantity} шт)?`)) {
                              deleteArrival(item.id);
                            }
                          }}
                          className="p-1 hover:bg-red-100 rounded text-neutral-400 hover:text-red-700 transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Print Footer conforming to section 8.6.4 */}
        <PrintFooter />
      </div>

      {/* Modal */}
      <ArrivalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editItem={editItem}
        defaultType={defaultType}
      />
    </div>
  );
};
