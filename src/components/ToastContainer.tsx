import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { ToastItem } from '../types';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3.5 shadow-lg ${
                isSuccess
                  ? 'border-emerald-200'
                  : isError
                  ? 'border-red-200'
                  : 'border-blue-200'
              }`}
            >
              <span
                className={`mt-0.5 shrink-0 ${
                  isSuccess
                    ? 'text-[#137333]'
                    : isError
                    ? 'text-red-600'
                    : 'text-[#1a73e8]'
                }`}
              >
                {isSuccess ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : isError ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
              </span>
              <p className="text-sm font-medium text-slate-800 flex-1 leading-snug">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Fermer la notification"
                className="text-slate-400 hover:text-slate-700 transition-colors p-0.5 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
