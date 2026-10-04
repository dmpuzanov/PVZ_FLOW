import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { usePvz } from '../context/PvzContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = usePvz();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => {
        let bg = 'bg-[#5A081E] text-white';
        let Icon = CheckCircle2;

        if (toast.type === 'error') {
          bg = 'bg-[#dc2626] text-white';
          Icon = XCircle;
        } else if (toast.type === 'warning') {
          bg = 'bg-[#b45309] text-white';
          Icon = AlertTriangle;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-lg shadow-xl border border-white/10 ${bg} transition-all duration-200`}
            role="alert"
          >
            <div className="flex items-center gap-2.5 text-sm font-medium">
              <Icon className="w-5 h-5 shrink-0" />
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
