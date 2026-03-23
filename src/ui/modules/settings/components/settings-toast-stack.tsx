import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

interface Toast {
  id: number;
  msg: string;
  variant: 'ok' | 'err';
}

let toastCounter = 0;

export function useSettingsToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = (msg: string, variant: 'ok' | 'err' = 'ok') => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, msg, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  return { toasts, show };
}

export function SettingsToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg pointer-events-auto transition-all',
            t.variant === 'ok'
              ? 'bg-success/15 text-success border border-success/20'
              : 'bg-destructive/15 text-destructive border border-destructive/20',
          )}
        >
          {t.variant === 'ok' ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {t.msg}
        </div>
      ))}
    </div>
  );
}
