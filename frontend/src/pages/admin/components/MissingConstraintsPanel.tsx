import { useState } from 'react';
import MaterialIcon from '../../../components/MaterialIcon';
import type { AdminDashboardMissingConstraint } from '../types';
import { avatarBg, avatarInitials } from '../utils/avatarUtils';

interface MissingConstraintsPanelProps {
  missingUsers: AdminDashboardMissingConstraint[] | null;
}

export function MissingConstraintsPanel({ missingUsers }: MissingConstraintsPanelProps) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [reminded, setReminded] = useState<string[]>([]);
  const visible = (missingUsers ?? []).filter((u) => !dismissed.includes(u.id));

  function handleRemind(id: string) {
    setReminded((r) => [...r, id]);
    setTimeout(() => setReminded((r) => r.filter((x) => x !== id)), 2000);
  }

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between mb-md">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
            אילוצים חסרים
          </h2>
          {visible.length > 0 && (
            <span className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-xs font-bold bg-error-container text-on-error-container animate-pulse">
              {visible.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-on-surface-variant font-medium">
          דדליין: שני 23:59 IST
        </span>
      </div>

      <div className="flex-1">
        {missingUsers === null ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-container animate-pulse" />
            <span className="text-xs text-on-surface-variant">טוען נתונים...</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-50">
              <MaterialIcon name="check" className="text-green-600 text-[16px]" />
            </div>
            <span className="text-xs text-on-surface-variant">
              כל הצוות הגיש אילוצים לשבוע הבא.
            </span>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="bg-surface-container-high px-md py-sm flex justify-between text-[10px] font-bold text-on-surface-variant">
              <span>שם העובד</span>
              <span>פעולות</span>
            </div>
            <div className="divide-y divide-outline-variant">
              {visible.map((u, i) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-md py-md transition-colors hover:bg-surface-container-low"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: avatarBg(i) }}
                  >
                    {avatarInitials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-on-surface font-semibold truncate">
                        {u.name}
                      </span>
                      <MaterialIcon name="error" className="text-error text-[14px]" />
                    </div>
                    <span className="text-xs text-on-surface-variant">עובד</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRemind(u.id)}
                      className={`text-[12px] px-4 py-2 rounded-full transition-all border font-bold ${
                        reminded.includes(u.id)
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-[#056AE5] text-white border-[#056AE5] hover:bg-[#0457B8]'
                      }`}
                    >
                      {reminded.includes(u.id) ? 'נשלח!' : 'תזכורת'}
                    </button>
                    <button
                      onClick={() => setDismissed((d) => [...d, u.id])}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-container text-on-surface-variant"
                    >
                      <MaterialIcon name="close" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
