import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { usePvz } from '../../context/PvzContext';
import { formatDateRu } from '../../utils/calculations';

export const NegativeStockModal: React.FC = () => {
  const { pendingNegativeAction, setPendingNegativeAction, confirmPendingAction } = usePvz();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pendingNegativeAction) {
      cancelBtnRef.current?.focus();
    }
  }, [pendingNegativeAction]);

  if (!pendingNegativeAction) return null;

  const { problems } = pendingNegativeAction;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden border border-neutral-200">
        {/* Header */}
        <div className="bg-[#5A081E] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-300 rounded-lg">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Обнаружен отрицательный остаток</h3>
              <p className="text-xs text-amber-200/90">
                Операция приведёт к дефициту остатка товара на складе
              </p>
            </div>
          </div>
          <button
            onClick={() => setPendingNegativeAction(null)}
            className="text-white/70 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="text-sm text-[#333333]">
            Применение этой операции вызовет отрицательный остаток хотя бы для одной даты и артикула:
          </div>

          {/* Problem Table */}
          <div className="border border-neutral-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F8F8F9] text-xs font-semibold text-[#5A081E] border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3">Дата</th>
                  <th className="py-2.5 px-3">Артикул</th>
                  <th className="py-2.5 px-3 text-right">Осталось сейчас</th>
                  <th className="py-2.5 px-3 text-right">После операции</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {problems.map((p, idx) => (
                  <tr key={idx} className="hover:bg-red-50/40">
                    <td className="py-2.5 px-3 font-medium text-neutral-800">
                      {formatDateRu(p.date)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-neutral-900">
                      {p.article}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-neutral-700">
                      {p.currentRemainder} шт
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#dc2626]">
                      {p.projectedRemainder} шт
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Causes hint */}
          <div className="bg-[#F8F8F9] p-4 rounded-lg border border-neutral-200/80">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B5530] mb-2">
              Возможные причины расхождения:
            </div>
            <ul className="text-sm text-[#333333] space-y-1 list-disc list-inside">
              <li>Пропущена приёмка от селлера на предшествующую дату</li>
              <li>Опечатка в дате отгрузки</li>
              <li>Завышенное количество отгрузки в документе</li>
            </ul>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-[#F8F8F9] border-t border-neutral-200 flex items-center justify-end gap-3">
          <button
            ref={cancelBtnRef}
            onClick={() => setPendingNegativeAction(null)}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-neutral-200 hover:bg-neutral-300 text-[#333333] transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-neutral-400"
          >
            Отменить операцию
          </button>
          <button
            onClick={confirmPendingAction}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#5A081E] hover:bg-[#460617] text-white transition-colors shadow-sm focus:ring-2 focus:ring-offset-2 focus:ring-[#5A081E]"
          >
            Подтвердить и сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
