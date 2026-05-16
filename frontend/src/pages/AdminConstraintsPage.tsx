import { useEffect, useState, useMemo } from 'react';
import { constraintApi, shiftDefinitionApi, userApi } from '../lib/api';
import type { Constraint, ShiftDefinition, ConstraintEntry } from '../types/constraint';
import type { User } from '../types/auth';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import {
  getCurrentWeekId,
  getNextWeekId,
  getPrevWeekId,
  getWeekDates,
  toDateKey,
} from '../utils/weekUtils';

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// Constraint entry dates round-trip through a Mongoose Date, so the API can
// return ISO strings ("2026-05-17T00:00:00.000Z"). The table/dialog key on the
// local YYYY-MM-DD form, so normalize before comparing or persisting.
function normalizeConstraintDate(date: string): string {
  return date.includes('T') ? date.split('T')[0] : date;
}

interface OverrideDialogProps {
  user: { _id: string; name: string };
  date: Date;
  weekId: string;
  definitions: ShiftDefinition[];
  initialEntries: ConstraintEntry[];
  onClose: () => void;
  onSave: () => void;
}

function ConstraintOverrideDialog({
  user,
  date,
  weekId,
  definitions,
  initialEntries,
  onClose,
  onSave,
}: OverrideDialogProps) {
  const [entries, setEntries] = useState<ConstraintEntry[]>(initialEntries);
  const [saving, setSaving] = useState(false);

  const dateKey = toDateKey(date);

  function toggleShift(defId: string) {
    setEntries((prev) => {
      const exists = prev.find(
        (e) => e.definitionId === defId && normalizeConstraintDate(e.date) === dateKey
      );
      if (exists) {
        return prev.filter(
          (e) => !(e.definitionId === defId && normalizeConstraintDate(e.date) === dateKey)
        );
      } else {
        return [...prev, { definitionId: defId, date: dateKey, canWork: false }];
      }
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = entries.map((e) => ({
        ...e,
        date: normalizeConstraintDate(e.date),
      }));
      await constraintApi.upsertForUser(weekId, user._id, payload);
      onSave();
    } catch (err) {
      alert('שגיאה בשמירת השינויים');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-black text-[#000654]">עריכת אילוצים: {user.name}</h3>
            <p className="text-sm text-slate-500">
              {date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors">
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm font-bold text-slate-700">בחר משמרות בהן העובד חסום:</p>
          <div className="grid grid-cols-1 gap-3">
            {definitions.map((def) => {
              const isBlocked = entries.some(
                (e) => e.definitionId === def._id && normalizeConstraintDate(e.date) === dateKey
              );
              return (
                <button
                  key={def._id}
                  onClick={() => toggleShift(def._id)}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                    isBlocked
                      ? 'border-red-500 bg-red-50 text-red-900 shadow-inner'
                      : 'border-slate-100 hover:border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-bold">{def.name}</span>
                    <span className="text-xs opacity-70">
                      {def.startTime} - {def.endTime}
                    </span>
                  </div>
                  <MaterialIcon
                    name={isBlocked ? 'block' : 'check_circle'}
                    className={isBlocked ? 'text-red-500' : 'text-slate-300'}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#101B79] hover:bg-[#000654] text-white font-bold py-3 rounded-xl transition-all shadow-lg disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 transition-all"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddPickerProps {
  employees: User[];
  weekDates: Date[];
  onClose: () => void;
  onConfirm: (user: { _id: string; name: string }, date: Date) => void;
}

function AddConstraintPicker({ employees, weekDates, onClose, onConfirm }: AddPickerProps) {
  const [userId, setUserId] = useState('');
  const [dateIdx, setDateIdx] = useState(0);
  const selected = employees.find((e) => e._id === userId);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-xl font-black text-[#000654]">הוסף אילוץ לעובד</h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors">
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            עובד
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-slate-800 font-normal focus:border-slate-300 focus:outline-none"
            >
              <option value="">בחר עובד...</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            יום
            <select
              value={dateIdx}
              onChange={(e) => setDateIdx(Number(e.target.value))}
              className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-slate-800 font-normal focus:border-slate-300 focus:outline-none"
            >
              {weekDates.map((d, i) => (
                <option key={i} value={i}>
                  {DAY_LABELS[i]} — {d.getDate()}/{d.getMonth() + 1}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            onClick={() =>
              selected && onConfirm({ _id: selected._id, name: selected.name }, weekDates[dateIdx])
            }
            disabled={!selected}
            className="flex-1 bg-[#101B79] hover:bg-[#000654] text-white font-bold py-3 rounded-xl transition-all shadow-lg disabled:opacity-50"
          >
            המשך
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 transition-all"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminConstraintsPage() {
  const [currentViewWeek, setCurrentViewWeek] = useState(getCurrentWeekId());
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [allConstraints, setAllConstraints] = useState<Constraint[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Dialog state
  const [editingEntry, setEditingEntry] = useState<{
    user: { _id: string; name: string };
    date: Date;
    initialEntries: ConstraintEntry[];
  } | null>(null);

  const weekDates = useMemo(() => getWeekDates(currentViewWeek), [currentViewWeek]);

  useEffect(() => {
    loadData();
  }, [currentViewWeek]);

  async function loadData() {
    setError('');
    try {
      const [defsRes, constraintsRes, usersRes] = await Promise.all([
        shiftDefinitionApi.getActive(),
        constraintApi.getAllConstraints(currentViewWeek),
        userApi.getUsers(),
      ]);

      setDefinitions(defsRes.definitions);
      setAllConstraints(constraintsRes.constraints);
      setIsLocked(constraintsRes.isLocked);
      setEmployees(
        usersRes.users.filter((u) => (u.role === 'employee' || u.role === 'manager') && u.isActive)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים');
    }
  }

  async function toggleLock() {
    try {
      // Drive off the effective lock state so unlocking works even after the
      // deadline has passed (force_unlocked overrides the deadline).
      await constraintApi.setLockState(
        currentViewWeek,
        isLocked ? 'force_unlocked' : 'force_locked'
      );
      loadData();
    } catch (err) {
      alert('שגיאה בשינוי מצב הנעילה');
    }
  }

  function handleAddPick(user: { _id: string; name: string }, date: Date) {
    const existing = allConstraints.find((c) => {
      const uid = typeof c.userId === 'object' ? c.userId._id : c.userId;
      return uid === user._id;
    });
    setShowAddPicker(false);
    setEditingEntry({ user, date, initialEntries: existing?.entries ?? [] });
  }

  function handlePrevWeek() {
    setCurrentViewWeek(getPrevWeekId(currentViewWeek));
  }

  function handleNextWeek() {
    setCurrentViewWeek(getNextWeekId(currentViewWeek));
  }

  const constraintsMap = useMemo(() => {
    const map: Record<
      string,
      Record<
        string,
        Array<{ name: string; userId: string; id: string; allEntries: ConstraintEntry[] }>
      >
    > = {};

    allConstraints.forEach((c) => {
      const userName = typeof c.userId === 'object' ? c.userId.name : 'Unknown';
      const userId = typeof c.userId === 'object' ? c.userId._id : c.userId;

      if (searchQuery && !userName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return;
      }

      c.entries.forEach((entry) => {
        if (!entry.canWork) {
          const dateKey = normalizeConstraintDate(entry.date);
          if (!map[entry.definitionId]) map[entry.definitionId] = {};
          if (!map[entry.definitionId][dateKey]) map[entry.definitionId][dateKey] = [];

          map[entry.definitionId][dateKey].push({
            name: userName,
            userId: userId,
            id: c._id,
            allEntries: c.entries,
          });
        }
      });
    });

    return map;
  }, [allConstraints, searchQuery]);

  const formattedWeekRange = useMemo(() => {
    if (weekDates.length < 7) return '';
    const start = weekDates[0];
    const end = weekDates[6];
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `${start.toLocaleDateString('he-IL', options)} - ${end.toLocaleDateString('he-IL', options)}, ${start.getFullYear()}`;
  }, [weekDates]);

  return (
    <MainLayout title="אילוצי עובדים">
      <div className="flex flex-col gap-6" dir="rtl">
        <div className="bg-white p-6 shadow-sm rounded-xl border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 order-2 md:order-1">
            <div
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${
                isLocked
                  ? 'bg-red-50 border-red-100 text-red-700'
                  : 'bg-green-50 border-green-100 text-green-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full ${isLocked ? 'bg-red-600' : 'bg-green-600'}`} />
              <span className="font-bold">{isLocked ? 'הגשה נעולה' : 'הגשה פתוחה'}</span>

              <button
                onClick={toggleLock}
                className="mr-2 px-3 py-1 bg-white border border-slate-300 rounded text-slate-800 text-xs hover:bg-slate-50 transition-colors"
              >
                {isLocked ? 'בטל נעילה' : 'נעל הגשה'}
              </button>
            </div>

            <button
              onClick={() => setShowAddPicker(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#101B79] hover:bg-[#000654] text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
            >
              <MaterialIcon name="add" className="text-base" />
              הוסף אילוץ לעובד
            </button>

            <div className="flex items-center bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button
                onClick={handleNextWeek}
                className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all"
              >
                <MaterialIcon name="chevron_right" />
              </button>
              <div className="px-4 font-bold text-slate-900">
                {currentViewWeek.replace('-W', ' / ')}
              </div>
              <button
                onClick={handlePrevWeek}
                className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all"
              >
                <MaterialIcon name="chevron_left" />
              </button>
            </div>
          </div>

          <div className="text-right order-1 md:order-2">
            <h2 className="text-2xl font-black text-[#000654]">אילוצי עובדים</h2>
            <div className="flex items-center justify-end gap-2 text-slate-500 text-sm mt-1">
              <span>{formattedWeekRange}</span>
              <MaterialIcon name="calendar_today" className="text-sm" />
            </div>
          </div>
        </div>

        <div className="relative max-w-md mr-auto md:mr-0">
          <input
            type="text"
            placeholder="חיפוש עובד..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-blue-500 transition-all"
          />
          <MaterialIcon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">{error}</div>
        )}

        <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse text-right min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-bold text-slate-900 border-l border-slate-200 w-32">
                  משמרת
                </th>
                {weekDates.map((date, i) => (
                  <th
                    key={i}
                    className="p-4 font-bold text-slate-900 border-l border-slate-200 min-w-[150px]"
                  >
                    <div className="flex flex-col">
                      <span>{DAY_LABELS[i]}</span>
                      <span className="text-xs font-normal text-slate-500">
                        {date.getDate()}/{date.getMonth() + 1}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {definitions.map((def) => (
                <tr
                  key={def._id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="p-4 border-l border-slate-200 bg-slate-50/30">
                    <div className="font-bold text-slate-900">{def.name}</div>
                    <div className="text-xs text-slate-500">
                      {def.startTime} - {def.endTime}
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const dateKey = toDateKey(date);
                    const blocked = constraintsMap[def._id]?.[dateKey] || [];
                    return (
                      <td
                        key={dateKey}
                        className={`p-2 border-l border-slate-100 align-top ${blocked.length > 0 ? 'bg-red-50/20' : ''}`}
                      >
                        <div className="flex flex-col gap-2 min-h-[100px]">
                          {blocked.map((b, idx) => (
                            <div
                              key={idx}
                              className="bg-white p-2 rounded border border-red-100 shadow-sm flex flex-col gap-1 group"
                            >
                              <div className="flex justify-between items-start">
                                <button
                                  onClick={() =>
                                    setEditingEntry({
                                      user: { _id: b.userId, name: b.name },
                                      date: date,
                                      initialEntries: b.allEntries,
                                    })
                                  }
                                  className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-600 underline transition-opacity"
                                >
                                  שנה
                                </button>
                                <span className="text-sm font-bold text-slate-900">{b.name}</span>
                              </div>
                            </div>
                          ))}
                          {blocked.length === 0 && (
                            <div className="flex-1 flex items-center justify-center text-slate-300 text-xs italic">
                              אין אילוצים
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingEntry && (
        <ConstraintOverrideDialog
          user={editingEntry.user}
          date={editingEntry.date}
          weekId={currentViewWeek}
          definitions={definitions}
          initialEntries={editingEntry.initialEntries}
          onClose={() => setEditingEntry(null)}
          onSave={() => {
            setEditingEntry(null);
            loadData();
          }}
        />
      )}

      {showAddPicker && (
        <AddConstraintPicker
          employees={employees}
          weekDates={weekDates}
          onClose={() => setShowAddPicker(false)}
          onConfirm={handleAddPick}
        />
      )}
    </MainLayout>
  );
}
