import { useEffect } from 'react';
import MaterialIcon from '../MaterialIcon';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  busy?: boolean;
  autoDismissMs?: number;
}

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  busy = false,
  autoDismissMs = 8000,
}: UndoToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [message, autoDismissMs, onDismiss]);

  return (
    <div
      dir="rtl"
      className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center gap-3 bg-blue-50 text-blue-700 border border-blue-200"
    >
      <MaterialIcon name="info" />
      <span className="font-medium">{message}</span>
      <button
        onClick={onUndo}
        disabled={busy}
        className="px-3 py-1 rounded-full bg-white border border-blue-200 text-blue-700 font-bold text-xs hover:bg-blue-100 transition-colors disabled:opacity-50"
      >
        בטל
      </button>
      <button
        onClick={onDismiss}
        className="opacity-50 hover:opacity-100 transition-opacity"
        aria-label="סגור"
      >
        <MaterialIcon name="close" className="text-[16px]" />
      </button>
    </div>
  );
}
