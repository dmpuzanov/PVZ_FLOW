import React from 'react';
import {
  Grid3X3,
  PackageCheck,
  Truck,
  CalendarDays,
  FileSpreadsheet,
  BarChart3,
  Scale,
  Settings as SettingsIcon,
  UserCheck,
  RotateCcw,
  Home,
} from 'lucide-react';
import { usePvz } from '../context/PvzContext';
import { formatDateRu } from '../utils/calculations';

export type NavTab =
  | 'dashboard'
  | 'matrix'
  | 'arrivals'
  | 'shipments'
  | 'reverse'
  | 'schedule'
  | 'reports'
  | 'analytics'
  | 'reconciliation'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const { settings, schedule } = usePvz();

  const todayStr = new Date().toISOString().split('T')[0];
  const todayOperator = schedule[todayStr] || schedule[settings.reportDateFrom] || 'Пузанов Д.В.';

  const navItems: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Главная', icon: Home },
    { id: 'matrix', label: 'Матрица', icon: Grid3X3 },
    { id: 'arrivals', label: 'Приход', icon: PackageCheck },
    { id: 'shipments', label: 'Отгрузка', icon: Truck },
    { id: 'reverse', label: 'Обратный поток', icon: RotateCcw },
    { id: 'schedule', label: 'График операторов', icon: CalendarDays },
    { id: 'reports', label: 'Отчёты', icon: FileSpreadsheet },
    { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
    { id: 'reconciliation', label: 'Сверка с селлером', icon: Scale },
    { id: 'settings', label: 'Настройки', icon: SettingsIcon },
  ];

  return (
    <aside className="w-[250px] shrink-0 min-h-screen bg-[#5A081E] text-white flex flex-col justify-between shadow-xl z-20 print:hidden">
      <div>
        {/* Brand header */}
        <div className="p-4 border-b border-white/10">
          <img src="./branding/pvz-flow-gold-on-burgundy.jpg" alt="PVZ.FLOW" className="w-full h-14 object-contain" />
        </div>

        <div className="px-5 py-3 border-b border-white/5 bg-black/10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/60 font-semibold">Фулфилмент ПВЗ</div>
          <img src="./branding/owner-gold-on-burgundy.jpg" alt="priv.ent. puzanova" className="w-full h-10 mt-1 object-contain object-left" />
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1.5" aria-label="Основная навигация">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                  isActive
                    ? 'bg-[#BD995A] text-[#1c1917] font-semibold shadow-md'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1c1917]' : 'text-white/70'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Operator and period status footer */}
      <div className="p-4 border-t border-white/10 bg-black/15 text-xs text-white/70 space-y-2">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#BD995A] shrink-0" />
          <div className="truncate">
            <span className="text-[10px] uppercase tracking-wider text-white/50 block">Оператор смены</span>
            <span className="font-semibold text-white truncate block">{todayOperator}</span>
          </div>
        </div>
        <div className="text-[11px] text-white/60 pt-1 border-t border-white/5 flex items-center justify-between">
          <span>Период отчёта:</span>
          <span className="font-mono text-white/80">
            {formatDateRu(settings.reportDateFrom, false)}–{formatDateRu(settings.reportDateTo, false)}
          </span>
        </div>
      </div>
    </aside>
  );
};
