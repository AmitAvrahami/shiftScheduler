import { useEffect, useRef, useState } from 'react';
import { constraintApi, shiftDefinitionApi } from '../lib/api';
import type { ConstraintEntry, ShiftDefinition } from '../types/constraint';

// IST = UTC+3 (fixed offset per project convention)
function getCurrentWeekId(): string {
  const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const year = nowIST.getUTCFullYear();
  const month = nowIST.getUTCMonth();
  const day = nowIST.getUTCDate();

  // ISO week number: Thursday-anchor algorithm
  const thursday = new Date(Date.UTC(year, month, day));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Returns 7 local-midnight Date objects (Sun–Sat) for the given ISO weekId.
function getWeekDates(weekId: string): Date[] {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = jan4.getTime() - (jan4Day - 1) * 86_400_000;
  const monday = new Date(week1Monday + (week - 1) * 7 * 86_400_000);
  const sundayMs = monday.getTime() - 86_400_000;

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sundayMs + i * 86_400_000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  });
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns the deadline timestamp (ms) for a given weekId: Monday 20:59:59.999 UTC = 23:59:59.999 IST
function getConstraintDeadlineMs(weekId: string): number {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = jan4.getTime() - (jan4Day - 1) * 86_400_000;
  const monday = new Date(week1Monday + (week - 1) * 7 * 86_400_000);
  return Date.UTC(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate(),
    20,
    59,
    59,
    999,
  );
}

function getNextWeekId(weekId: string): string {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = jan4.getTime() - (jan4Day - 1) * 86_400_000;
  const mondayMs = week1Monday + (week - 1) * 7 * 86_400_000;
  // next Monday + 3 days = Thursday of next ISO week
  const thursday = new Date(mondayMs + 10 * 86_400_000);
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Before Monday 23:59:59.999 IST → current week; after → next week.
function getAllowedWeekId(): string {
  const current = getCurrentWeekId();
  return Date.now() > getConstraintDeadlineMs(current) ? getNextWeekId(current) : current;
}

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function ConstraintPage() {
  const weekId = getAllowedWeekId();
  const weekDates = getWeekDates(weekId);

  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  // key = "definitionId:YYYY-MM-DD", value = true means canWork:false (checkbox checked)
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([shiftDefinitionApi.getActive(), constraintApi.getConstraints(weekId)])
      .then(([defsRes, constraintRes]) => {
        setDefinitions(defsRes.definitions);
        setIsLocked(constraintRes.isLocked);
        setDeadline(new Date(constraintRes.deadline));

        if (constraintRes.constraint) {
          const initial: Record<string, boolean> = {};
          for (const entry of constraintRes.constraint.entries) {
            if (!entry.canWork) {
              initial[`${entry.definitionId}:${entry.date}`] = true;
            }
          }
          setChecked(initial);
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים'));
  }, [weekId]);

  function buildEntries(state: Record<string, boolean>): ConstraintEntry[] {
    return Object.entries(state)
      .filter(([, val]) => val)
      .map(([key]) => {
        const [definitionId, date] = key.split(':');
        return { definitionId, date, canWork: false };
      });
  }

  function save(state: Record<string, boolean>) {
    setSaveStatus('saving');
    constraintApi
      .upsertConstraints(weekId, buildEntries(state))
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'));
  }

  function handleToggle(definitionId: string, dateKey: string) {
    if (isLocked) return;
    const key = `${definitionId}:${dateKey}`;
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) delete next[key];

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 300);

      return next;
    });
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
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Deadline banner */}
        {isLocked ? (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-5 py-4 flex items-center gap-3">
            <span className="text-red-600 text-xl">🔒</span>
            <div>
              <p className="font-semibold text-red-700">הגשת האילוצים נעולה</p>
              {formattedDeadline && (
                <p className="text-sm text-red-500">הדדליין עבר: {formattedDeadline}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 px-5 py-4 flex items-center gap-3">
            <span className="text-blue-600 text-xl">📋</span>
            <div>
              <p className="font-semibold text-blue-700">הגשת אילוצים פתוחה</p>
              {formattedDeadline && (
                <p className="text-sm text-blue-500">יש להגיש עד: {formattedDeadline}</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            הגשת אילוצים — שבוע {weekId}
          </h1>
          <span
            className={`text-sm font-medium px-3 py-1 rounded-full ${
              saveStatus === 'saving'
                ? 'bg-yellow-100 text-yellow-700'
                : saveStatus === 'saved'
                  ? 'bg-green-100 text-green-700'
                  : saveStatus === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-400'
            }`}
          >
            {saveStatus === 'saving'
              ? 'שומר...'
              : saveStatus === 'saved'
                ? 'נשמר ✓'
                : saveStatus === 'error'
                  ? 'שגיאה בשמירה'
                  : ''}
          </span>
        </div>

        {loadError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            {loadError}
          </div>
        )}

        <p className="mb-4 text-sm text-gray-500">
          סמן את המשמרות שאינך יכול/ה לעבוד בהן. השינויים נשמרים אוטומטית.
        </p>

        <div className="bg-white rounded-xl shadow-sm overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600">
                <th className="py-3 px-4 text-right font-medium border-b border-gray-200 min-w-[120px]">
                  משמרת
                </th>
                {weekDates.map((date, i) => (
                  <th
                    key={i}
                    className="py-3 px-3 text-center font-medium border-b border-gray-200 min-w-[72px]"
                  >
                    <span className="block">{DAY_LABELS[i]}</span>
                    <span className="block text-xs text-gray-400 font-normal">
                      {new Intl.DateTimeFormat('he-IL', {
                        day: 'numeric',
                        month: 'numeric',
                        timeZone: 'Asia/Jerusalem',
                      }).format(date)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {definitions.map((def, rowIdx) => (
                <tr
                  key={def._id}
                  className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="py-3 px-4 font-medium text-gray-700 border-b border-gray-100">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full ml-2"
                      style={{ backgroundColor: def.color }}
                    />
                    {def.name}
                    <span className="block text-xs text-gray-400 font-normal">
                      {def.startTime}–{def.endTime}
                    </span>
                  </td>
                  {weekDates.map((date, colIdx) => {
                    const dateKey = toDateKey(date);
                    const cellKey = `${def._id}:${dateKey}`;
                    return (
                      <td
                        key={colIdx}
                        className="py-3 px-3 text-center border-b border-gray-100"
                      >
                        <input
                          type="checkbox"
                          checked={!!checked[cellKey]}
                          onChange={() => handleToggle(def._id, dateKey)}
                          disabled={isLocked}
                          className="w-4 h-4 accent-red-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`${def.name} — יום ${DAY_LABELS[colIdx]}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {definitions.length === 0 && !loadError && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400 text-sm">
                    טוען משמרות...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
