import React, { useState } from 'react';
import { X, Plus, PackageCheck, RotateCcw } from 'lucide-react';
import { ALL_ARTICLES, ARTICLE_MAP } from '../../constants/initialData';
import { usePvz } from '../../context/PvzContext';
import { Article, ArrivalRecord, ArrivalType } from '../../types/pvz';

interface ArrivalModalProps {
  isOpen: boolean;
  onClose: () => void;
  editItem?: ArrivalRecord | null;
  defaultType?: ArrivalType;
}

export const ArrivalModal: React.FC<ArrivalModalProps> = ({
  isOpen,
  onClose,
  editItem,
  defaultType = 'arrival',
}) => {
  const { addArrival, editArrival } = usePvz();

  const [date, setDate] = useState<string>(
    editItem ? editItem.date : new Date().toLocaleDateString('sv-SE')
  );
  const [article, setArticle] = useState<Article>(editItem ? editItem.article : 'АК-10');
  const [type, setType] = useState<ArrivalType>(editItem ? editItem.type : defaultType);
  const [quantity, setQuantity] = useState<number>(editItem ? editItem.quantity : 100);
  const [note, setNote] = useState<string>(editItem?.note || '');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setError('Укажите дату');
      return;
    }
    if (!quantity || quantity <= 0) {
      setError('Количество должно быть больше нуля');
      return;
    }

    if (editItem) {
      editArrival(editItem.id, {
        date,
        article,
        type,
        quantity: Math.floor(quantity),
        note: note.trim() || undefined,
      });
    } else {
      addArrival({
        date,
        article,
        type,
        quantity: Math.floor(quantity),
        note: note.trim() || undefined,
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
              {type === 'return' ? <RotateCcw className="w-5 h-5" /> : <PackageCheck className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {editItem
                  ? 'Редактировать поступление'
                  : type === 'return'
                  ? 'Регистрация возврата (невыкупа)'
                  : 'Регистрация приёмки от селлера'}
              </h3>
              <p className="text-xs text-white/70">
                Поступает в колонку «Поставка» матрицы и формирует партию
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

          {/* Type selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
              Тип поступления
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('arrival')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-2 transition-all ${
                  type === 'arrival'
                    ? 'border-[#5A081E] bg-[#5A081E]/5 text-[#5A081E] ring-1 ring-[#5A081E]'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <PackageCheck className="w-4 h-4" />
                Приёмка от селлера
              </button>
              <button
                type="button"
                onClick={() => setType('return')}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-2 transition-all ${
                  type === 'return'
                    ? 'border-[#5A081E] bg-[#5A081E]/5 text-[#5A081E] ring-1 ring-[#5A081E]'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                Возврат (невыкуп)
              </button>
            </div>
          </div>

          {/* Date & Article */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
                Дата операции
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

          {/* Article Info Hint */}
          {selectedInfo && (
            <div className="px-3 py-2 bg-[#F8F8F9] rounded-lg border border-neutral-200 text-xs text-[#6B5530] flex items-center justify-between">
              <span>Категория: <strong>{selectedInfo.category}</strong></span>
              <span>Вес: <strong>~{selectedInfo.weightKg} кг</strong></span>
              <span>
                Брендирование:{' '}
                <strong className={selectedInfo.hasBranding ? 'text-emerald-700' : 'text-neutral-500'}>
                  {selectedInfo.hasBranding ? 'ДА' : 'НЕТ (Кат. Ми)'}
                </strong>
              </span>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
              Количество (штук)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={quantity || ''}
              onChange={(e) => setQuantity(Number(e.target.value))}
              placeholder="100"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono tabular-nums focus:outline-hidden focus:ring-2 focus:ring-[#BD995A] focus:border-[#BD995A]"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-1.5">
              Примечание (номер накладной, комментарий)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Партия 100 шт, паллета #3"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#BD995A] focus:border-[#BD995A]"
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
              {editItem ? 'Сохранить изменения' : 'Зарегистрировать приход'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
