import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@creator-studio/ui/utils';

type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
};

const ToastContext = createContext<ToastContextValue | null>(null);

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(item => item.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      removeToast(id);
    }, 3200);
  }, [removeToast]);

  const value = {
    toast: {
      success: (msg: string) => addToast(msg, 'success'),
      error: (msg: string) => addToast(msg, 'error'),
      info: (msg: string) => addToast(msg, 'info'),
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite">
        {toasts.map(item => {
          const Icon = icons[item.type];
          return (
            <div key={item.id} className={cn('toast-item', `toast-${item.type}`)}>
              <Icon size={16} className="toast-icon" />
              <span className="toast-message">{item.message}</span>
              <button
                type="button"
                className="toast-close"
                onClick={() => removeToast(item.id)}
                aria-label="关闭提示"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue['toast'] {
  const context = useContext(ToastContext);
  if (!context) {
    // 降级对象，确保在外部调用时不报错
    return {
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return context.toast;
}
