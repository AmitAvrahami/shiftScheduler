import { useEffect, useState } from 'react';
import { constraintApi, shiftDefinitionApi } from '../lib/api';
import type { AvailabilityType, ConstraintEntry, ShiftDefinition } from '../types/constraint';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import ShiftCardConstraint, { type PartialValue } from '../components/ShiftCardConstraint';
import SuccessOverlay from '../components/SuccessOverlay';
import { validatePartialRange } from '../utils/availabilityPreview';
import { getAllowedWeekId, getWeekDates, toDateKey } from '../utils/weekUtils';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type CellValue = {
  status: AvailabilityType;
  startTime?: string;
  endTime?: string;
  note?: string;
};

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function ConstraintPage() {
  const weekId = getAllowedWeekId();
  const weekDates = getWeekDates(weekId);

  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  // key = "definitionId:YYYY-MM-DD". Absence of a key means available (default).
  const [cells, setCells] = useState<Record<string, CellValue>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState<'deadline' | 'schedule' | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [validationError, setValidationError] = useState('');
  const [notes, setNotes] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    Promise.all([shiftDefinitionApi.getActive(), constraintApi.getConstraints(weekId)])
      .then(([defsRes, constraintRes]) => {
        let definitions = defsRes.definitions;

        // If no definitions exist, inject mock data for testing/demo purposes
        if (definitions.length === 0) {
          definitions = [
            {
              _id: 'mock-1',
              name: 'משמרת בוקר',
              startTime: '08:00',
              endTime: '16:00',
              color: '#E3F2FD',
              orderNumber: 1,
              durationMinutes: 480,
              crossesMidnight: false,
              isActive: true,
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              requiredStaffCount: 2,
            },
            {
              _id: 'mock-2',
              name: 'משמרת צהריים',
              startTime: '16:00',
              endTime: '00:00',
              color: '#FFF3E0',
              orderNumber: 2,
              durationMinutes: 480,
              crossesMidnight: false,
              isActive: true,
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              requiredStaffCount: 2,
            },
            {
              _id: 'mock-3',
              name: 'משמרת לילה',
              startTime: '00:00',
              endTime: '08:00',
              color: '#F3E5F5',
              orderNumber: 3,
              durationMinutes: 480,
              crossesMidnight: false,
              isActive: true,
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              requiredStaffCount: 1,
            },
          ];
        }

        setDefinitions(definitions);
        setIsLocked(constraintRes.isLocked);
        if (constraintRes.isLocked) {
          setLockReason(
            constraintRes.weekStatus && constraintRes.weekStatus !== 'open'
              ? 'schedule'
              : 'deadline'
          );
        } else {
          setLockReason(null);
        }
        setDeadline(new Date(constraintRes.deadline));

        if (constraintRes.constraint) {
          const initial: Record<string, CellValue> = {};
          for (const entry of constraintRes.constraint.entries) {
            const key = `${entry.definitionId}:${entry.date}`;
            if (entry.availabilityType === 'partial') {
              initial[key] = {
                status: 'partial',
                startTime: entry.startTime,
                endTime: entry.endTime,
                note: entry.note,
              };
            } else if (!entry.canWork) {
              // Legacy entries (no availabilityType) and explicit unavailable both load as unavailable.
              initial[key] = { status: 'unavailable' };
            }
            // Available entries (canWork true, not partial) are omitted — absence = available.
          }
          setCells(initial);
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים'));
  }, [weekId]);

  function handleCellChange(
    definitionId: string,
    dateKey: string,
    status: AvailabilityType,
    partial?: PartialValue
  ) {
    if (isLocked) return;
    const key = `${definitionId}:${dateKey}`;
    setCells((prev) => {
      const next = { ...prev };
      if (status === 'available') {
        delete next[key];
      } else if (status === 'partial') {
        next[key] = {
          status: 'partial',
          startTime: partial?.startTime,
          endTime: partial?.endTime,
          note: partial?.note,
        };
      } else {
        next[key] = { status: 'unavailable' };
      }
      return next;
    });
    setSaveStatus('idle');
    setValidationError('');
  }

  function handleClear() {
    if (isLocked) return;
    setCells({});
    setNotes('');
    setSaveStatus('idle');
    setValidationError('');
  }

  function handleSubmit() {
    if (isLocked) return;

    const entries: ConstraintEntry[] = [];
    for (const [key, value] of Object.entries(cells)) {
      const [definitionId, date] = key.split(':');
      if (value.status === 'unavailable') {
        entries.push({ definitionId, date, canWork: false, availabilityType: 'unavailable' });
      } else if (value.status === 'partial') {
        const def = definitions.find((d) => d._id === definitionId);
        const validation = def
          ? validatePartialRange(value.startTime, value.endTime, def)
          : { error: 'יש לבחור שעת התחלה ושעת סיום' };
        if (validation.error) {
          setValidationError(validation.error);
          setSaveStatus('error');
          return;
        }
        entries.push({
          definitionId,
          date,
          canWork: true,
          availabilityType: 'partial',
          startTime: value.startTime,
          endTime: value.endTime,
          note: value.note?.trim() || undefined,
        });
      }
    }

    setValidationError('');
    setSaveStatus('saving');

    constraintApi
      .upsertConstraints(weekId, entries)
      .then(() => {
        setSaveStatus('saved');
        setShowSuccessModal(true);
      })
      .catch(() => setSaveStatus('error'));
  }

  const formattedDeadline = deadline
    ? new Intl.DateTimeFormat('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jerusalem',
      }).format(deadline)
    : null;

  return (
    <MainLayout title="הגשת אילוצים שבועית" subtitle="שבוע נוכחי">
      <div className="max-w-[1200px] mx-auto pb-12">
        {/* Deadline Banner */}
        {isLocked ? (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-5 py-4 flex items-center gap-3">
            <MaterialIcon name="lock" className="text-red-600" />
            <div>
              <p className="font-semibold text-red-700">הגשת האילוצים נעולה</p>
              {lockReason === 'schedule' ? (
                <p className="text-sm text-red-500">
                  השבוע עבר לשלב הבא — לא ניתן עוד לשנות אילוצים
                </p>
              ) : (
                formattedDeadline && (
                  <p className="text-sm text-red-500">הדדליין עבר: {formattedDeadline}</p>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 px-5 py-4 flex items-center gap-3 shadow-sm">
            <MaterialIcon name="info" className="text-blue-600" />
            <div>
              <p className="font-semibold text-blue-700">הגשת אילוצים פתוחה</p>
              {formattedDeadline && (
                <p className="text-sm text-blue-500">יש להגיש עד: {formattedDeadline}</p>
              )}
            </div>
          </div>
        )}

        {/* Header Section */}
        <div className="mb-xl flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h2 className="text-2xl font-black text-on-surface mb-xs">סמן את זמינותך למשמרות</h2>
            <p className="text-on-surface-variant opacity-70">
              לכל משמרת בחר/י: זמין, לא זמין או זמין חלקית לשבוע הקרוב.
            </p>
          </div>
          <div className="flex gap-sm w-full md:w-auto">
            <button
              onClick={handleClear}
              disabled={isLocked}
              className="flex-1 md:flex-none bg-surface-container-high hover:bg-surface-variant text-on-surface font-bold py-sm px-md rounded-lg transition-colors h-12 disabled:opacity-50"
            >
              ניקוי בחירות
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLocked || saveStatus === 'saving'}
              className="flex-1 md:flex-none bg-gradient-to-r from-[#101B79] to-[#056AE5] hover:opacity-90 text-white font-bold py-sm px-lg rounded-lg transition-all shadow-bezeq-float h-12 flex items-center justify-center gap-xs disabled:opacity-50"
            >
              <MaterialIcon name="send" />
              {saveStatus === 'saving' ? 'שולח...' : 'שלח אילוצים'}
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            {loadError}
          </div>
        )}

        {saveStatus === 'saved' && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-700 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <MaterialIcon name="check_circle" className="text-green-600" />
            האילוצים נשמרו בהצלחה
          </div>
        )}

        {validationError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm flex items-center gap-2">
            <MaterialIcon name="error" className="text-red-600" />
            {validationError}
          </div>
        )}

        {saveStatus === 'error' && !validationError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            שגיאה בשמירת האילוצים. נסה שוב.
          </div>
        )}

        {/* Vertical Day Cards Layout */}
        <div className="flex flex-col gap-md">
          {weekDates.map((date, dayIdx) => {
            const dateKey = toDateKey(date);
            return (
              <div
                key={dateKey}
                className="bg-surface-container-lowest rounded-xl shadow-bezeq-card border border-outline-variant p-md flex flex-col md:flex-row items-center gap-lg"
              >
                <div className="w-full md:w-32 shrink-0 border-b md:border-b-0 md:border-l border-outline-variant pb-md md:pb-0 md:pl-md">
                  <h3 className="text-lg font-black text-primary">{DAY_LABELS[dayIdx]}</h3>
                  <p className="text-xs text-on-surface-variant font-bold opacity-60">
                    {new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(
                      date
                    )}
                  </p>
                </div>
                <div className="flex-1 w-full flex flex-col sm:flex-row gap-md">
                  {definitions.map((def) => {
                    const cellKey = `${def._id}:${dateKey}`;
                    const cell = cells[cellKey];
                    return (
                      <ShiftCardConstraint
                        key={def._id}
                        def={def}
                        status={cell?.status ?? 'available'}
                        partial={
                          cell?.status === 'partial'
                            ? {
                                startTime: cell.startTime ?? def.startTime,
                                endTime: cell.endTime ?? def.endTime,
                                note: cell.note,
                              }
                            : undefined
                        }
                        isLocked={isLocked}
                        onChange={(status, partial) =>
                          handleCellChange(def._id, dateKey, status, partial)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Remarks Section */}
        <div className="mt-xl bg-surface-container-lowest rounded-xl shadow-bezeq-card border border-outline-variant p-lg">
          <h3 className="text-lg font-black text-on-surface mb-md">הערות לבקשה</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isLocked}
            className="w-full bg-surface-container-low border border-outline-variant rounded-xl p-md text-on-surface focus:ring-4 focus:ring-[#056AE5]/20 focus:border-[#056AE5] transition-all resize-none h-24 disabled:opacity-50"
            placeholder="הוסף הערות מיוחדות כאן (למשל: אירוע משפחתי, לימודים...)"
          />
        </div>
      </div>
      {showSuccessModal && <SuccessOverlay onClose={() => setShowSuccessModal(false)} />}
    </MainLayout>
  );
}
