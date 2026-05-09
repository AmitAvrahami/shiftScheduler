import MaterialIcon from '../../../components/MaterialIcon';
import { formatIsraelTime } from '../../../utils/weekUtils';
import type { AdminDashboardDTO } from '../types';

type DashboardAuditLog = AdminDashboardDTO['auditLogs'][number];

type AuditType = 'publish' | 'override' | 'user' | 'edit';

const ACTION_LABELS: Record<string, string> = {
  schedule_created: 'לוח שיבוץ נוצר',
  schedule_generated: 'לוח שיבוץ הופק',
  schedule_regenerated: 'לוח שיבוץ הופק מחדש',
  schedule_published: 'לוח שיבוץ פורסם',
  schedule_updated: 'לוח שיבוץ עודכן',
  schedule_deleted: 'לוח שיבוץ נמחק',
  constraint_override: 'עקיפת אילוץ',
  constraint_exception_consumed: 'חריגת אילוץ מומשה',
  user_created: 'משתמש נוצר',
  user_updated: 'משתמש עודכן',
  shift_created: 'משמרת נוצרה',
};

function actionToType(action: string): AuditType {
  if (action.includes('publish')) return 'publish';
  if (action.includes('override') || action.includes('exception')) return 'override';
  if (action.includes('user')) return 'user';
  return 'edit';
}

const AUDIT_COLORS: Record<AuditType, string> = {
  publish: '#10b981',
  override: '#f59e0b',
  user: '#3b82f6',
  edit: '#8b5cf6',
};

const AUDIT_ICONS: Record<AuditType, string> = {
  publish: 'check',
  override: 'warning',
  user: 'group',
  edit: 'settings',
};

export function AuditLogPanel({ logs }: { logs: DashboardAuditLog[] | null }) {
  const loading = logs === null;

  return (
    <section className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
          פעילות אחרונה
        </h2>
        <button className="text-[12px] text-secondary hover:underline font-bold transition-colors">
          צפה בהכל
        </button>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden shadow-bezeq-card">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-md py-3 ${i < 3 ? 'border-b border-outline-variant/30' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-surface-container animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 rounded bg-surface-container-high animate-pulse w-3/4" />
                <div className="h-2 rounded bg-surface-container animate-pulse w-1/2" />
              </div>
            </div>
          ))
        ) : logs.length === 0 ? (
          <div className="px-md py-lg text-sm text-center text-on-surface-variant">
            אין פעילות עדיין
          </div>
        ) : (
          logs.map((entry, i) => {
            const type = actionToType(entry.action);
            const label = ACTION_LABELS[entry.action] ?? entry.action;
            const performer = 'מערכת';
            const timeStr = formatIsraelTime(entry.createdAt);
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 px-md py-3 hover:bg-surface-container-low transition-colors ${i < logs.length - 1 ? 'border-b border-outline-variant/30' : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${AUDIT_COLORS[type]}15`,
                    border: `1px solid ${AUDIT_COLORS[type]}30`,
                  }}
                >
                  <MaterialIcon
                    name={AUDIT_ICONS[type]}
                    className="text-[14px]"
                    style={{ color: AUDIT_COLORS[type] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate text-on-surface">{label}</div>
                  <div className="text-[10px] truncate text-on-surface-variant opacity-70">
                    {performer}
                  </div>
                </div>
                <span className="text-[10px] font-medium flex-shrink-0 text-on-surface-variant">
                  {timeStr}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
