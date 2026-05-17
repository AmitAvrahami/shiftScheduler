import { useState, useEffect, useCallback } from 'react';
import MaterialIcon from '../../../components/MaterialIcon';
import { getWeekDates, toDateKey } from '../../../utils/weekUtils';
import {
  weeklyStaffingApi,
  constraintApi,
  shiftDefinitionApi,
  ApiError,
  type Shift,
  type Schedule,
} from '../../../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const READ_ONLY_STATUSES: Array<Schedule['status']> = ['generating', 'published', 'archived'];

// ─── Editor ───────────────────────────────────────────────────────────────────

interface WeeklyStaffingEditorProps {
  weekId: string;
}

export function WeeklyStaffingEditor({ weekId }: WeeklyStaffingEditorProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [scheduleStatus, setScheduleStatus] = useState<Schedule['status'] | null>(null);
  const [definitionNames, setDefinitionNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const isReadOnly = scheduleStatus !== null && READ_ONLY_STATUSES.includes(scheduleStatus);
  const weekDates = getWeekDates(weekId);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Fetch definitions once — non-critical, ignored on failure
  useEffect(() => {
    shiftDefinitionApi
      .getActive()
      .then((res) => {
        const map = new Map<string, string>();
        res.definitions.forEach((d) => map.set(d._id, d.name));
        setDefinitionNames(map);
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDrafts({});
    try {
      const [shiftsRes, statusRes] = await Promise.all([
        weeklyStaffingApi.getWeekShifts(weekId),
        constraintApi.getConstraints(weekId),
      ]);
      setShifts(shiftsRes.shifts);
      setScheduleStatus(statusRes.weekStatus ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, [weekId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    loadData();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadData]);

  async function handleInitialize() {
    setInitializing(true);
    try {
      await weeklyStaffingApi.initializeWeekShifts(weekId);
      await loadData();
      showToast('המשמרות אותחלו בהצלחה', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'שגיאה באתחול משמרות', 'error');
    } finally {
      setInitializing(false);
    }
  }

  async function handleSave(shiftId: string) {
    const draftStr = drafts[shiftId];
    if (draftStr === undefined) return;

    const shift = shifts.find((s) => s._id === shiftId);
    if (!shift) return;

    const trimmed = draftStr.trim();
    const parsed = parseInt(trimmed, 10);

    function clearDraft() {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[shiftId];
        return next;
      });
    }

    if (
      !trimmed ||
      !Number.isInteger(parsed) ||
      String(parsed) !== trimmed ||
      parsed < 0 ||
      parsed > 50
    ) {
      clearDraft();
      showToast('ערך לא תקין. יש להזין מספר שלם בין 0 ל-50', 'error');
      return;
    }

    if (parsed === shift.requiredCount) {
      clearDraft();
      return;
    }

    setShifts((prev) => prev.map((s) => (s._id === shiftId ? { ...s, requiredCount: parsed } : s)));
    clearDraft();
    setSavingId(shiftId);

    try {
      await weeklyStaffingApi.updateShiftRequirement(shiftId, parsed);
    } catch (err) {
      setShifts((prev) =>
        prev.map((s) => (s._id === shiftId ? { ...s, requiredCount: shift.requiredCount } : s))
      );
      showToast(err instanceof ApiError ? err.message : 'שגיאה בשמירה', 'error');
    } finally {
      setSavingId(null);
    }
  }

  const shiftsByDate = shifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    const key = toDateKey(new Date(shift.date));
    if (!acc[key]) acc[key] = [];
    acc[key].push(shift);
    return acc;
  }, {});
  for (const key of Object.keys(shiftsByDate)) {
    shiftsByDate[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <>
      {/* Read-only banner */}
      {isReadOnly && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium flex items-center gap-2">
          <MaterialIcon name="lock" className="text-amber-500 text-base shrink-0" />
          לא ניתן לערוך תקן משמרות לשבוע שנמצא בתהליך יצירה, פורסם או הועבר לארכיון
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-4 border-[#056AE5] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl text-center">
          <MaterialIcon name="error" className="text-red-400 text-4xl mb-2" />
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-red-600 text-white rounded-full font-bold hover:bg-red-700 transition-colors text-sm"
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && shifts.length === 0 && !isReadOnly && (
        <div className="flex flex-col items-center justify-center h-48 bg-white border border-slate-200 rounded-2xl gap-4">
          <MaterialIcon name="calendar_today" className="text-slate-300 text-5xl" />
          <p className="text-slate-500 font-medium">לא נמצאו משמרות לשבוע זה</p>
          <button
            onClick={handleInitialize}
            disabled={initializing}
            className="flex items-center gap-2 px-5 py-2 bg-[#056AE5] text-white rounded-full font-bold hover:bg-[#0457B8] transition-colors text-sm disabled:opacity-60 disabled:cursor-wait"
          >
            {initializing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <MaterialIcon name="add_circle" />
            )}
            אתחל משמרות לשבוע
          </button>
        </div>
      )}

      {/* Shift grid */}
      {!loading && !error && shifts.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 min-w-[700px]">
            {weekDates.map((date, i) => {
              const dateKey = toDateKey(date);
              const dayShifts = shiftsByDate[dateKey] ?? [];
              const isWeekend = i === 5 || i === 6;
              return (
                <div
                  key={dateKey}
                  className={`${i < 6 ? 'border-l border-slate-100' : ''} ${isWeekend ? 'bg-blue-50/30' : ''}`}
                >
                  {/* Day header */}
                  <div
                    className={`p-3 text-center border-b border-slate-100 ${isWeekend ? 'bg-blue-50' : 'bg-slate-50'}`}
                  >
                    <div className="text-xs font-bold text-slate-700">{HEBREW_DAYS[i]}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                    </div>
                  </div>

                  {/* Shift cells */}
                  <div className="p-2 flex flex-col gap-2">
                    {dayShifts.length === 0 ? (
                      <div className="text-center text-[11px] text-slate-300 py-4">—</div>
                    ) : (
                      dayShifts.map((shift) => (
                        <ShiftRequirementCell
                          key={shift._id}
                          shift={shift}
                          name={definitionNames.get(shift.definitionId) ?? null}
                          draft={drafts[shift._id]}
                          isSaving={savingId === shift._id}
                          isReadOnly={isReadOnly}
                          onChange={(val) => setDrafts((prev) => ({ ...prev, [shift._id]: val }))}
                          onFocus={() =>
                            setDrafts((prev) => ({
                              ...prev,
                              [shift._id]: String(shift.requiredCount),
                            }))
                          }
                          onSave={() => handleSave(shift._id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-6 z-[70] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <MaterialIcon
            name={toast.type === 'success' ? 'check_circle' : 'error'}
            className="text-base"
          />
          {toast.message}
        </div>
      )}
    </>
  );
}

// ─── Shift Requirement Cell ───────────────────────────────────────────────────

interface ShiftRequirementCellProps {
  shift: Shift;
  name: string | null;
  draft: string | undefined;
  isSaving: boolean;
  isReadOnly: boolean;
  onChange: (val: string) => void;
  onFocus: () => void;
  onSave: () => void;
}

function ShiftRequirementCell({
  shift,
  name,
  draft,
  isSaving,
  isReadOnly,
  onChange,
  onFocus,
  onSave,
}: ShiftRequirementCellProps) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
      <div className="text-[11px] font-bold text-slate-700 truncate mb-0.5">
        {name ?? `${shift.startTime}–${shift.endTime}`}
      </div>
      <div className="text-[10px] text-slate-400 mb-1.5">
        {shift.startTime}–{shift.endTime}
      </div>
      <div className="relative inline-flex items-center justify-center">
        <input
          type="number"
          min={0}
          max={50}
          value={draft ?? String(shift.requiredCount)}
          disabled={isReadOnly || isSaving}
          className="w-14 text-center text-sm font-bold border border-slate-200 rounded-md px-1 py-1 focus:outline-none focus:ring-2 focus:ring-[#056AE5]/40 focus:border-[#056AE5] disabled:bg-white disabled:text-slate-400 bg-white"
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {isSaving && (
          <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[#056AE5] border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
