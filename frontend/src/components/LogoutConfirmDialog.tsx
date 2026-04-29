import type { CSSProperties } from 'react';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmDialog({ open, onCancel, onConfirm }: Props) {
  if (!open) return null;

  const backdropStyle: CSSProperties = {
    background: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(2px)',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={backdropStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      dir="rtl"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-800 mb-1">האם אתה בטוח שברצונך להתנתק?</h3>
            <p className="text-sm text-slate-500">לאחר ההתנתקות תועבר לדף הכניסה.</p>
          </div>

          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              לא, הישאר
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#ef4444] text-white hover:bg-red-600 transition-colors shadow-sm"
            >
              כן, התנתק
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
