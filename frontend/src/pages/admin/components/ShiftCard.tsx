import MaterialIcon from '../../../components/MaterialIcon';
import { avatarBg, avatarInitials } from '../utils/avatarUtils';
import type { AdminDashboardDTO, ShiftType } from '../types';

export interface ShiftDef {
  id: Exclude<ShiftType, 'unknown'>;
  label: string;
  start: string;
  end: string;
  color: string;
  dimBg: string;
  icon: string;
}

export interface StaffEntry {
  id: string;
  name: string;
  isFixed: boolean;
}

type DashboardShift = AdminDashboardDTO['shifts'][number];

interface ShiftCardProps {
  shift: ShiftDef;
  instance?: DashboardShift;
  staff: StaffEntry[];
  requiredCount: number;
  type: 'prev' | 'current' | 'next';
}

export function ShiftCard({ shift, instance, staff, requiredCount, type }: ShiftCardProps) {
  const isCurrent = type === 'current';
  const isPrev = type === 'prev';
  const isNext = type === 'next';

  const emptySlotsCount = Math.max(0, requiredCount - staff.length);
  const timeLabel = `${shift.start} - ${shift.end}`;

  if (isCurrent) {
    return (
      <div
        className="text-white rounded-xl p-md flex flex-col gap-sm relative overflow-hidden h-full"
        style={{
          background: 'linear-gradient(135deg, #010636 0%, #2B358F 100%)',
          boxShadow: 'rgba(61, 83, 222, 0.35) 0px 8px 24px 0px',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        <div className="flex justify-between items-center text-[10px] font-bold opacity-90 relative z-10">
          <span style={{ direction: 'ltr' }}>{timeLabel}</span>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>פעיל</span>
          </div>
        </div>
        {instance && (
          <span className="relative z-10 inline-flex w-fit items-center px-2 py-0.5 rounded-full border text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200">
            מוגדרת
          </span>
        )}
        <h3 className="text-lg font-bold text-white relative z-10">משמרת נוכחית</h3>
        <p className="text-sm opacity-90 relative z-10">{shift.label}</p>
        <div className="mt-auto pt-sm relative z-10 flex items-center justify-between">
          <span className="text-xs font-medium">
            {staff.length}/{requiredCount} עובדים
          </span>
          <div className="flex -space-x-1.5 space-x-reverse">
            {staff.map((s, i) => (
              <div
                key={s.id}
                className="w-5 h-5 rounded-full ring-1 ring-white/30 bg-white/10 flex items-center justify-center text-[7px] font-bold"
                style={{ background: avatarBg(i) }}
              >
                {avatarInitials(s.name)}
              </div>
            ))}
            {Array.from({ length: emptySlotsCount }).map((_, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-full ring-1 ring-dashed ring-white/50 bg-white/5 flex items-center justify-center"
              >
                <MaterialIcon name="add" className="text-[10px] text-white/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border border-[#e2e8f0] rounded-xl p-md flex flex-col gap-sm h-full ${isPrev ? 'opacity-70' : 'hover:shadow-md transition-shadow shadow-bezeq-card'}`}
    >
      <div
        className={`flex justify-between items-center text-[10px] font-bold ${isNext ? 'text-[#056AE5]' : 'text-on-surface-variant'}`}
      >
        <span style={{ direction: 'ltr' }}>{timeLabel}</span>
        <MaterialIcon name={isPrev ? 'history' : 'calendar_today'} className="text-[16px]" />
      </div>
      {instance && (
        <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full border text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200">
          מוגדרת
        </span>
      )}
      <h3 className="text-lg font-bold text-on-surface">{isPrev ? 'משמרת קודמת' : 'משמרת הבאה'}</h3>
      <p className="text-sm text-on-surface-variant">{shift.label}</p>
      <div className="mt-auto pt-sm flex items-center justify-between">
        <div className="flex -space-x-2 space-x-reverse">
          {staff.length === 0 && emptySlotsCount === 0 ? (
            <span className="text-[10px] text-on-surface-variant opacity-50">אין משובצים</span>
          ) : (
            <>
              {staff.map((s, i) => (
                <div
                  key={s.id}
                  className="inline-block h-6 w-6 rounded-full ring-2 ring-white overflow-hidden bg-surface-container-high"
                  title={s.name}
                >
                  <div
                    className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ background: avatarBg(i) }}
                  >
                    {avatarInitials(s.name)}
                  </div>
                </div>
              ))}
              {Array.from({ length: emptySlotsCount }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center"
                  title="הוספת עובד"
                >
                  <MaterialIcon name="add" className="text-[12px] text-slate-400" />
                </div>
              ))}
            </>
          )}
        </div>
        {isNext && staff.length < requiredCount && (
          <span className="text-[10px] font-bold text-error bg-error-container text-on-error-container px-2 py-1 rounded">
            חסר עובד
          </span>
        )}
      </div>
    </div>
  );
}
