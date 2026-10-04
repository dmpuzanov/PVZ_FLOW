import React, { useState } from 'react';
import { PvzProvider } from './context/PvzContext';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { MatrixView } from './components/MatrixView';
import { ArrivalsView } from './components/ArrivalsView';
import { ShipmentsView } from './components/ShipmentsView';
import { ScheduleView } from './components/ScheduleView';
import { ReportsView } from './components/ReportsView';
import { AnalyticsView } from './components/AnalyticsView';
import { SettingsView } from './components/SettingsView';
import { ReconciliationView } from './components/ReconciliationView';
import { ReverseFlowView } from './components/ReverseFlowView';
import { ArrivalModal } from './components/modals/ArrivalModal';
import { ShipmentModal } from './components/modals/ShipmentModal';
import { NegativeStockModal } from './components/modals/NegativeStockModal';
import { ToastContainer } from './components/Toast';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isArrivalModalOpen, setIsArrivalModalOpen] = useState(false);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);

  const getPageTitle = (tab: NavTab): string => {
    switch (tab) {
      case 'dashboard':
        return 'Главная';
      case 'matrix':
        return 'Матрица движения и остатков';
      case 'arrivals':
        return 'Журнал приёмки и возвратов';
      case 'shipments':
        return 'Журнал отгрузок в Wildberries';
      case 'reverse':
        return 'Управление товарами обратного потока';
      case 'schedule':
        return 'График операторов склада';
      case 'reports':
        return 'Отчётность и печатные формы';
      case 'analytics':
        return 'Сводная аналитика и показатели';
      case 'reconciliation':
        return 'Сверка оперативных отгрузок с данными селлера';
      case 'settings':
        return 'Настройки и тарифная сетка';
      default:
        return 'PVZ.FLOW';
    }
  };

  return (
    <div className="flex h-screen w-full bg-white text-[#333333] font-sans antialiased overflow-hidden select-none">
      {/* 250px Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <Header title={getPageTitle(activeTab)} />

        {/* View content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'matrix' && (
            <MatrixView
              onOpenArrivalModal={() => setIsArrivalModalOpen(true)}
              onOpenShipmentModal={() => setIsShipmentModalOpen(true)}
            />
          )}
          {activeTab === 'arrivals' && <ArrivalsView />}
          {activeTab === 'shipments' && <ShipmentsView />}
          {activeTab === 'reverse' && <ReverseFlowView />}
          {activeTab === 'schedule' && <ScheduleView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'reconciliation' && <ReconciliationView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Global Modals */}
      <ArrivalModal
        isOpen={isArrivalModalOpen}
        onClose={() => setIsArrivalModalOpen(false)}
      />
      <ShipmentModal
        isOpen={isShipmentModalOpen}
        onClose={() => setIsShipmentModalOpen(false)}
      />
      <NegativeStockModal />

      {/* Notifications */}
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <PvzProvider>
      <AppContent />
    </PvzProvider>
  );
}
