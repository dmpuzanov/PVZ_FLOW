import React, { useState } from 'react';
import { X, Truck } from 'lucide-react';
import { ALL_ARTICLES, ARTICLE_MAP } from '../../constants/initialData';
import { usePvz } from '../../context/PvzContext';
import { Article, ShipmentRecord } from '../../types/pvz';
import { parseSupplyId } from '../../utils/api';

/** Must match SUPPLY_ID_RE in server/productMap.mjs. */
const SUPPLY_ID_RE = /^WB-GI-\d{6,}$/;

interface ShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  editItem?: ShipmentRecord | null;
}

export const ShipmentModal: React.FC<ShipmentModalProps> = ({
  isOpen,
  onClose,
  editItem,
}) => {
  const { addShipment, editShipment, matrix, shipments } = usePvz();

  const [date, setDate] = useState<string>(
    editItem ? editItem.date : new Date().toLocaleDateString('sv-SE')
  );
  const [article, setArticle] = useState<Article>(editItem ? editItem.article : 'АК-10');
  const [quantity, setQuantity] = useState<number>(editItem ? editItem.quantity : 1);
  const [supplyId, setSupplyId] = useState<string>(editItem?.supplyId ?? 'WB-GI-');

  /**
   * §9 — a scanner may deliver the barcode in several shapes, including two
   * labels on one line: «ЦИ-ПШ-286725844 WB-GI-286725844». Anything that looks
   * like a supply number is normalised live so the user sees the canonical form.
   */
  const readSupplyCode = (raw: string) => parseSupplyId(raw) ?? raw.trim().toUpperCase();

  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  // Find current available stock on this date
  const currentRow = matrix.find((r) => r.date === date);
  const currentAvailable = currentRow?.byArticle[article]?.balanceEnd ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setError('Укажите дату отгрузки');
      return;
    }
    if (!quantity || quantity <= 0) {
      setError('Количество должно быть больше нуля');
      return;
    }
    const normalizedSupplyId = parseSupplyId(supplyId) ?? '';
    if (!SUPPLY_ID_RE.test(normalizedSupplyId)) {
      setError('Укажите номер поставки в формате WB-GI-XXXXXXXXX (не менее 6 цифр)');
      return;
    }
    if (shipments.some((item)=>item.id!==editItem?.id && item.supplyId?.toUpperCase()===normalizedSupplyId)) {
      setError('Этот номер поставки уже зарегистрирован. Повторная отгрузка заблокирована.');
      return;
    }

    if (editItem) {
      editShipment(editItem.id, {
        date,
        article,
        quantity: Math.floor(quantity),
        supplyId: normalizedSupplyId,
        source: 'manual',
      });
    } else {
      addShipment({
        date,
        article,
        quantity: Math.floor(quantity),
        supplyId: normalizedSupplyId,
        source: 'manual',
      });
    }

    onClose();
  };

  const selectedInfo = ARTICLE_MAP.get(article);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-neutral-200">
        {/* Header */}
        <div className="bg-[#5A081E] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg text-white">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {editItem ? 'Редактировать отгрузку' : 'Регистрация отгрузки в WB'}
              </h3>
              <p className="text-xs text-white/70">
                Списывает остаток из колонки «Отгрузка» матрицы по FIFO
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Date & Article */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Дата отгрузки
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#BD995A] focus:border-[#BD995A]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Артикул товара
              </label>
              <select
                value={article}
                onChange={(e) => setArticle(e.target.value as Article)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-[#BD995A] focus:border-[#BD995A]"
              >
                {ALL_ARTICLES.map((art) => (
                  <option key={art} value={art}>
                    {art}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Article Info & Current Remainder */}
          <div className="px-3 py-2.5 bg-[#F8F8F9] rounded-lg border border-neutral-200 text-xs text-[#6B5530] flex items-center justify-between">
            <div>
              Категория: <strong>{selectedInfo?.category}</strong>, Вес:{' '}
              <strong>~{selectedInfo?.weightKg} кг</strong>
            </div>
            <div className="text-right">
              Остаток на {date}:{' '}
              <span className={`font-mono font-bold ${currentAvailable < 0 ? 'text-red-600' : 'text-neutral-900'}`}>
                {currentAvailable} шт
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">Номер поставки WB</label>
            <input
              value={supplyId}
              onChange={(e)=>setSupplyId(readSupplyCode(e.target.value))}
              required
              autoFocus
              placeholder="Отсканируйте код или введите WB-GI-123456789"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-[#BD995A]"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Можно сканировать строку целиком: «ЦИ-ПШ-286725844 WB-GI-286725844».
              Номер WB-GI будет выделен автоматически и защитит от повторной регистрации.
            </p>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
              Количество к отгрузке (штук)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={quantity || ''}
              onChange={(e) => setQuantity(Number(e.target.value))}
              placeholder="10"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono tabular-nums focus:outline-hidden focus:ring-2 focus:ring-[#BD995A] focus:border-[#BD995A]"
            />
          </div>

          {/* Footer buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#F8F8F9] text-[#333333] hover:bg-neutral-200 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#BD995A] text-[#1c1917] hover:bg-[#a8864b] transition-colors shadow-xs"
            >
              {editItem ? 'Сохранить изменения' : 'Зарегистрировать отгрузку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
