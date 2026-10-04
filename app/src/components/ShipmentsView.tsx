import React, { useState } from 'react';
import { Plus, Truck, Trash2, Edit2, Search, Filter, Download, Printer } from 'lucide-react';
import { ALL_ARTICLES, ARTICLE_MAP } from '../constants/initialData';
import { usePvz } from '../context/PvzContext';
import { Article, ShipmentRecord } from '../types/pvz';
import { formatDateRu } from '../utils/calculations';
import { ShipmentModal } from './modals/ShipmentModal';
import { PrintHeader, PrintFooter } from './PrintHeader';

export const ShipmentsView: React.FC = () => {
  const { shipments, deleteShipment, exportShipmentsCsv } = usePvz();
  const [filterArticle, setFilterArticle] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editItem, setEditItem] = useState<ShipmentRecord | null>(null);

  const handlePrint = () => {
    window.print();
  };

  // Filtered shipments
  const filteredShipments = shipments
    .filter((item) => {
      if (filterArticle !== 'all' && item.article !== filterArticle) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (!item.article.toLowerCase().includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });

  // Summary
  const totalShippedQty = shipments.reduce((sum, s) => sum + s.quantity, 0);

  const handleOpenAdd = () => {
    setEditItem(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ShipmentRecord) => {
    setEditItem(item);
    setIsModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Top Banner / Metrics */}
      <div className="p-5 border-b border-neutral-200 bg-[#F8F8F9] shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#333333]">Журнал отгрузок (Отправка в Wildberries)</h2>
            <p className="text-xs text-[#6B5530]">
              Отгрузки списываются из капсул по алгоритму FIFO и формируют расчёт сборки, упаковки и брендирования
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportShipmentsCsv}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors shadow-2xs"
              title="Экспорт журнала отгрузок в CSV"
            >
              <Download className="w-3.5 h-3.5 text-[#5A081E]" />
              <span>Экспорт в CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#EEDDB0] border border-[#BD995A] text-[#333333] hover:bg-[#e4cf99] transition-colors shadow-2xs"
              title="Печать журнала отгрузок на принтер или сохранение в PDF"
            >
              <Printer className="w-3.5 h-3.5 text-[#5A081E]" />
              <span>Печать</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#BD995A] text-[#1c1917] hover:bg-[#a8864b] transition-colors shadow-xs"
            >
              <Truck className="w-4 h-4 text-[#5A081E]" />
              <span>+ Новая отгрузка</span>
            </button>
          </div>
        </div>

        {/* Quick summary stats */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-neutral-200/80">
          <div className="bg-white p-3 rounded-lg border border-neutral-200">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 block">Всего отгружено</span>
            <span className="text-base font-bold font-mono text-[#5A081E]">{totalShippedQty} шт</span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-neutral-200">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 block">Количество отгрузок</span>
            <span className="text-base font-bold font-mono text-neutral-900">{shipments.length} операций</span>
          </div>

        </div>
      </div>

      {/* Filter toolbar */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
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
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Поиск по артикулу..."
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
          documentTitle="ЖУРНАЛ ОТГРУЗОК В WILDBERRIES"
          documentSubtitle="Реестр отправленных партий товара со склада ПВЗ"
        />

        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-[#F8F8F9] text-neutral-600 font-semibold border-b border-neutral-200 z-10">
            <tr>
              <th className="py-2.5 px-4 w-32">Дата отгрузки</th>
              <th className="py-2.5 px-4 w-36">Артикул</th>
              <th className="py-2.5 px-4 w-44">Номер поставки WB</th>
              <th className="py-2.5 px-4 w-28">Категория</th>
              <th className="py-2.5 px-4 w-32">Брендирование</th>
              <th className="py-2.5 px-4 text-right w-32">Количество</th>
              <th className="py-2.5 px-4">Статус распределения</th>
              <th className="py-2.5 px-4 text-right w-24">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredShipments.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-neutral-400 font-sans">
                  Записей отгрузок не найдено. Нажмите «+ Новая отгрузка» для регистрации.
                </td>
              </tr>
            ) : (
              filteredShipments.map((item) => {
                const info = ARTICLE_MAP.get(item.article);

                return (
                  <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-medium text-neutral-900">
                      {formatDateRu(item.date)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-[#5A081E]">
                      {item.article}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-neutral-700">{item.supplyId ?? 'Из Google Sheets'}</td>
                    <td className="py-2.5 px-4 text-neutral-600">
                      {info?.category} (~{info?.weightKg} кг)
                    </td>
                    <td className="py-2.5 px-4">
                      {info?.hasBranding ? (
                        <span className="text-[11px] font-semibold text-emerald-700">Да</span>
                      ) : (
                        <span className="text-[11px] text-neutral-400">Нет (Ми)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-sm text-[#5A081E]">
                      −{item.quantity} шт
                    </td>
                    <td className="py-2.5 px-4 text-neutral-500">
                      Списано по FIFO из капсул партии
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
                            if (window.confirm(`Удалить отгрузку ${item.article} (${item.quantity} шт)?`)) {
                              deleteShipment(item.id);
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
      <ShipmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editItem={editItem}
      />
    </div>
  );
};
