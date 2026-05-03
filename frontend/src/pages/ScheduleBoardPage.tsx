import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi, scheduleApi } from '../lib/api';
import type { Shift, Assignment, AdminDashboardData } from '../lib/api';
import type { User } from '../types/auth';
import type { ShiftDefinition } from '../types/constraint';
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

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

function avatarBg(idx: number): string {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

// ─── Shift Cell ──────────────────────────────────────────────────────────────

interface ShiftCellProps {
  shift?: Shift;
  assignments: Assignment[];
  users: User[];
  definition: ShiftDefinition;
  onAddAssignment?: (shiftId: string) => void;
}

function ShiftCell({ shift, assignments, users, definition, onAddAssignment }: ShiftCellProps) {
  if (!shift) {
    return (
      <div className="h-full min-h-[100px] flex items-center justify-center bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
        <span className="text-[10px] text-slate-400">אין משמרת</span>
      </div>
    );
  }

  const staff = assignments.map(a => {
    const user = users.find(u => u._id === a.userId);
    return {
      id: a._id,
      name: user?.name ?? 'עובד לא ידוע',
    };
  });

  const emptySlotsCount = Math.max(0, shift.requiredCount - staff.length);

  return (
    <div 
      className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col gap-2 min-h-[100px]"
      style={{ borderRightWidth: '4px', borderRightColor: definition.color }}
    >
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-700">{definition.name}</span>
        <span className="text-[9px] text-slate-400" style={{ direction: 'ltr' }}>{shift.startTime} - {shift.endTime}</span>
      </div>

      <div className="flex flex-col gap-1.5 flex-1">
        {staff.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 p-1.5 rounded-md bg-slate-50 border border-slate-100 group">
            <div 
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              style={{ background: avatarBg(i) }}
            >
              {avatarInitials(s.name)}
            </div>
            <span className="text-xs font-medium text-slate-700 truncate flex-1">{s.name}</span>
          </div>
        ))}

        {Array.from({ length: emptySlotsCount }).map((_, i) => (
          <button
            key={`empty-${i}`}
            onClick={() => onAddAssignment?.(shift._id)}
            className="flex items-center gap-2 p-1.5 rounded-md border border-dashed border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors text-slate-400 hover:text-slate-600 group"
          >
            <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 flex items-center justify-center shrink-0 group-hover:border-slate-400">
              <MaterialIcon name="add" className="text-[12px]" />
            </div>
            <span className="text-[10px] font-medium italic">הוסף עובד</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ScheduleBoardPage() {
  const { weekId: paramWeekId } = useParams<{ weekId: string }>();
  const navigate = useNavigate();
  
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const weekId = paramWeekId || getCurrentWeekId();
  const weekDates = useMemo(() => getWeekDates(weekId), [weekId]);

  useEffect(() => {
    loadData();
  }, [weekId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getDashboard(weekId);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      await scheduleApi.generate(weekId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'שגיאה בהפקת הסידור');
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!data?.currentWeek.schedule) return;
    try {
      await scheduleApi.update(data.currentWeek.schedule._id, 'published');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'שגיאה בפרסום הסידור');
    }
  }

  const formattedWeekRange = useMemo(() => {
    if (weekDates.length < 7) return '';
    const start = weekDates[0];
    const end = weekDates[6];
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `${start.toLocaleDateString('he-IL', options)} - ${end.toLocaleDateString('he-IL', options)}, ${start.getFullYear()}`;
  }, [weekDates]);

  if (loading && !data) {
    return (
      <MainLayout title="סידור עבודה" subtitle={weekId}>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-medium">טוען סידור עבודה...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout title="סידור עבודה" subtitle={weekId}>
        <div className="p-8 bg-red-50 border border-red-100 rounded-2xl text-center">
          <MaterialIcon name="error" className="text-red-500 text-5xl mb-4" />
          <h3 className="text-xl font-bold text-red-900 mb-2">אופס! משהו השתבש</h3>
          <p className="text-red-700 mb-6">{error}</p>
          <button onClick={loadData} className="px-6 py-2 bg-red-600 text-white rounded-full font-bold hover:bg-red-700 transition-colors">
            נסה שוב
          </button>
        </div>
      </MainLayout>
    );
  }

  const schedule = data?.currentWeek.schedule;
  const shifts = data?.currentWeek.shifts || [];
  const assignments = data?.currentWeek.assignments || [];
  const users = data?.users.all || [];
  const definitions = data?.shiftDefinitions || [];

  return (
    <MainLayout 
      title="סידור עבודה" 
      subtitle={`שבוע ${weekId.split('-W')[1]} (${formattedWeekRange})`}
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-full border border-slate-200">
            <button 
              onClick={() => navigate(`/schedules/${getPrevWeekId(weekId)}`)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all"
            >
              <MaterialIcon name="chevron_right" />
            </button>
            <div className="px-3 font-bold text-slate-700 text-xs">
              {weekId}
            </div>
            <button 
              onClick={() => navigate(`/schedules/${getNextWeekId(weekId)}`)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all"
            >
              <MaterialIcon name="chevron_left" />
            </button>
          </div>

          {schedule?.status === 'draft' && (
            <button
              onClick={handlePublish}
              className="flex items-center gap-2 px-4 py-2 bg-[#056AE5] text-white rounded-full font-bold text-sm hover:bg-[#0457B8] transition-all shadow-md"
            >
              <MaterialIcon name="send" className="text-[18px]" />
              פרסם סידור
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-[#101B79] text-white rounded-full font-bold text-sm hover:bg-[#0c1461] transition-all shadow-md disabled:opacity-50"
          >
            {generating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <MaterialIcon name="auto_awesome" className="text-[18px]" />
            )}
            ייצור אוטומטי
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6" dir="rtl">
        {!schedule && !loading && (
          <div className="p-12 bg-slate-50 border border-slate-200 border-dashed rounded-3xl text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <MaterialIcon name="calendar_today" className="text-slate-400 text-4xl" />
            </div>
            <h3 className="text-2xl font-black text-[#010636] mb-3">אין סידור עבודה לשבוע זה</h3>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">טרם נוצר סידור עבודה לשבוע שנבחר. ניתן לייצר סידור חדש המבוסס על תבניות המשמרות הקבועות.</p>
            <button 
              onClick={() => adminApi.initialize(weekId).then(() => loadData())}
              className="px-8 py-3 bg-[#056AE5] text-white rounded-full font-black hover:bg-[#0457B8] transition-all shadow-xl hover:scale-105 active:scale-95"
            >
              צור סידור חדש
            </button>
          </div>
        )}

        {schedule && (
          <div className="bg-white shadow-bezeq-card rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 font-black text-[#010636] border-l border-slate-200 w-32 sticky right-0 bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">משמרת</th>
                    {weekDates.map((date, i) => (
                      <th key={i} className={`p-4 font-bold text-slate-800 border-l border-slate-200 min-w-[160px] ${toDateKey(new Date()) === toDateKey(date) ? 'bg-blue-50/50' : ''}`}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-black">{DAY_LABELS[i]}</span>
                          <span className="text-[10px] font-medium text-slate-500">{date.getDate()}/{date.getMonth() + 1}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((def) => (
                    <tr key={def._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/30 transition-colors">
                      <td className="p-4 border-l border-slate-200 bg-slate-50/10 sticky right-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: def.color }} />
                            <span className="font-bold text-[#010636] text-sm">{def.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-medium" style={{ direction: 'ltr' }}>{def.startTime} - {def.endTime}</span>
                        </div>
                      </td>
                      {weekDates.map((date) => {
                        const dateKey = toDateKey(date);
                        const shift = shifts.find(s => toDateKey(new Date(s.date)) === dateKey && s.definitionId === def._id);
                        const shiftAssignments = shift ? assignments.filter(a => a.shiftId === shift._id) : [];
                        
                        return (
                          <td key={dateKey} className={`p-2 border-l border-slate-100 align-top ${toDateKey(new Date()) === dateKey ? 'bg-blue-50/20' : ''}`}>
                            <ShiftCell 
                              shift={shift} 
                              assignments={shiftAssignments} 
                              users={users} 
                              definition={def}
                              onAddAssignment={(shiftId) => alert(`הוספת עובד למשמרת ${shiftId} — בקרוב`)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
