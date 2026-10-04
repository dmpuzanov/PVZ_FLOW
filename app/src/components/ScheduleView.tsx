import React from 'react';
import { Calendar, UserCheck, Users, Check, RefreshCw } from 'lucide-react';
import { usePvz } from '../context/PvzContext';
import { OperatorName } from '../types/pvz';
import { formatDateRu, getDateRange } from '../utils/calculations';

export const ScheduleView: React.FC = () => {
  const { schedule, settings, setScheduleForDate, fillSchedulePattern } = usePvz();

  const periodDates = getDateRange(settings.reportDateFrom, settings.reportDateTo);

  // Stats
  let puzanovDays = 0;
  let zavalishinDays = 0;

  periodDates.forEach((d) => {
    const op = schedule[d] || 'Пузанов Д.В.';
    if (op === 'Пузанов Д.В.') puzanovDays++;
    else zavalishinDays++;
  });

  const operators: OperatorName[] = ['Пузанов Д.В.', 'Завалишин Д.Л.'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Header banner */}
      <div className="p-5 border-b border-neutral-200 bg-[#F8F8F9] shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#333333]">График работы операторов склада</h2>
            <p className="text-xs text-[#6B5530]">
              Назначенный оператор получает начисление сдельной заработной платы за все операции приёмки, брендирования, упаковки и сборки за свой рабочий день
            </p>
          </div>

          {/* Quick fill buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 mr-1">Заполнить шаблон:</span>
            <button
              onClick={() => fillSchedulePattern('2/2')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors"
            >
              2 через 2
            </button>
            <button
              onClick={() => fillSchedulePattern('1/1')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors"
            >
              1 через 1
            </button>
            <button
              onClick={() => fillSchedulePattern('puzanov')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors"
            >
              Все дни Пузанов
            </button>
            <button
              onClick={() => fillSchedulePattern('zavalishin')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-[#333333] hover:bg-neutral-50 transition-colors"
            >
              Все дни Завалишин
            </button>
          </div>
        </div>

        {/* Operator summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-neutral-200/80">
          <div className="p-4 bg-white rounded-lg border border-neutral-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#5A081E]/10 text-[#5A081E] flex items-center justify-center font-bold text-sm">
                ПД
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Пузанов Д.В.</h4>
                <p className="text-xs text-neutral-500">Оператор склада #1</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider text-neutral-400 block">Рабочих смен</span>
              <span className="text-xl font-bold font-mono text-[#5A081E]">{puzanovDays} дн.</span>
            </div>
          </div>

          <div className="p-4 bg-white rounded-lg border border-neutral-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#BD995A]/20 text-[#8c6b2d] flex items-center justify-center font-bold text-sm">
                ЗД
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Завалишин Д.Л.</h4>
                <p className="text-xs text-neutral-500">Оператор склада #2</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider text-neutral-400 block">Рабочих смен</span>
              <span className="text-xl font-bold font-mono text-[#BD995A]">{zavalishinDays} дн.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Date table */}
      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-3xl mx-auto border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-[#F8F8F9] text-xs font-semibold text-[#5A081E] border-b border-neutral-200">
              <tr>
                <th className="py-3 px-4 w-36">Дата</th>
                <th className="py-3 px-4 w-32">День недели</th>
                <th className="py-3 px-4">Назначенный оператор смены</th>
                <th className="py-3 px-4 text-center w-40">Быстрое переключение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {periodDates.map((date) => {
                const assigned = schedule[date] || 'Пузанов Д.В.';
                const dateObj = new Date(date);
                const dayName = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(dateObj);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                return (
                  <tr key={date} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-neutral-900">
                      {formatDateRu(date)}
                    </td>
                    <td className={`py-3 px-4 capitalize text-xs ${isWeekend ? 'text-amber-700 font-medium' : 'text-neutral-600'}`}>
                      {dayName}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={assigned}
                        onChange={(e) => setScheduleForDate(date, e.target.value as OperatorName)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-[#BD995A] ${
                          assigned === 'Пузанов Д.В.'
                            ? 'border-[#5A081E]/30 bg-[#5A081E]/5 text-[#5A081E]'
                            : 'border-[#BD995A]/40 bg-[#BD995A]/10 text-[#7a5818]'
                        }`}
                      >
                        {operators.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() =>
                          setScheduleForDate(
                            date,
                            assigned === 'Пузанов Д.В.' ? 'Завалишин Д.Л.' : 'Пузанов Д.В.'
                          )
                        }
                        className="px-2.5 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-medium transition-colors"
                      >
                        Переключить смену
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
