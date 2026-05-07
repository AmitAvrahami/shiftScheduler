import { useNavigate } from 'react-router-dom';
import MaterialIcon from '../../../components/MaterialIcon';
import type { GenerateResult } from '../../../lib/api';
import type { Toast } from '../types';

interface QuickActionsPanelProps {
  weekId: string;
  onToast: (t: Toast) => void;
  onGenerate: () => Promise<GenerateResult | undefined>;
  isGenerating: boolean;
}

export function QuickActionsPanel({
  weekId,
  onToast,
  onGenerate,
  isGenerating,
}: QuickActionsPanelProps) {
  const navigate = useNavigate();

  async function handleGenerate() {
    if (isGenerating) return;
    const result = await onGenerate();
    if (result) {
      onToast({ message: 'לוח שיבוץ הופק בהצלחה!', type: 'success' });
    }
  }

  const actions = [
    {
      id: 'generate',
      label: 'ייצור סידור עבודה',
      icon: 'bolt',
      onClick: handleGenerate,
      subtitle: 'אוטומציה מלאה',
      isPrimary: true,
    },
    {
      id: 'view_week',
      label: 'צפייה בסידור השבועי',
      icon: 'calendar_view_week',
      onClick: () => navigate(`/schedules/${weekId}`),
      subtitle: 'לוח שיבוץ מלא',
      isPrimary: false,
    },
    {
      id: 'leaves',
      label: 'אישור חופשות',
      icon: 'check',
      onClick: () => onToast({ message: 'אישור חופשות (בקרוב)', type: 'info' }),
      subtitle: 'ניהול היעדרויות',
      isPrimary: false,
    },
    {
      id: 'emergency',
      label: 'משמרת חירום',
      icon: 'warning',
      onClick: () => onToast({ message: 'הוספת משמרת חירום (בקרוב)', type: 'info' }),
      subtitle: 'שיבוץ דחוף',
      isPrimary: false,
    },
  ];

  return (
    <section className="flex flex-col w-full">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
          פעולות מהירות
        </h2>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-lg p-md shadow-bezeq-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {actions.map((a) => {
            const isGenerate = a.id === 'generate';
            const isEmergency = a.id === 'emergency';
            const isLoading = isGenerate && isGenerating;

            return (
              <button
                key={a.id}
                onClick={a.onClick}
                disabled={isLoading}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all border font-bold min-h-[56px] ${
                  isLoading
                    ? 'bg-[#056AE5]/80 text-white border-transparent cursor-wait'
                    : isGenerate
                      ? 'bg-[#056AE5] text-white border-transparent hover:bg-[#0457B8] shadow-md'
                      : isEmergency
                        ? 'bg-white text-error border-error/40 hover:bg-error/5 hover:border-error'
                        : 'bg-white text-[#2B358F] border-[#e2e8f0] hover:bg-[#F1F8FF] hover:border-[#056AE5]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isLoading || isGenerate
                      ? 'bg-white/20 text-white'
                      : isEmergency
                        ? 'bg-error/10 text-error'
                        : 'bg-[#056AE5]/10 text-[#056AE5]'
                  }`}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <MaterialIcon name={a.icon} className="text-[18px]" />
                  )}
                </div>
                <div className="flex flex-col items-start text-right overflow-hidden">
                  <span className="text-sm font-bold whitespace-nowrap">
                    {isLoading ? 'מעבד...' : a.label}
                  </span>
                  <span
                    className={`text-[10px] font-medium opacity-70 ${isGenerate && !isLoading ? 'text-white' : 'text-on-surface-variant'}`}
                  >
                    {a.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
