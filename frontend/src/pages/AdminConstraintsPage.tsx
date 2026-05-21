import { useMemo } from 'react';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { ConstraintAvailabilityTable } from '../components/constraints/ConstraintAvailabilityTable';
import { useAdminConstraints } from '../hooks/useAdminConstraints';

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function AdminConstraintsPage() {
  const {
    currentViewWeek,
    weekDates,
    selectedDayIndex,
    setSelectedDayIndex,
    dayDefs,
    filteredEmployees,
    searchQuery,
    setSearchQuery,
    isLocked,
    isScheduleFinalized,
    error,
    saving,
    isDirty,
    canSave,
    getEntry,
    isOverrideCell,
    setStatus,
    save,
    revert,
    goPrevWeek,
    goNextWeek,
    toggleLock,
  } = useAdminConstraints();

  const formattedWeekRange = useMemo(() => {
    if (weekDates.length < 7) return '';
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `${weekDates[0].toLocaleDateString('he-IL', opts)} - ${weekDates[6].toLocaleDateString(
      'he-IL',
      opts
    )}, ${weekDates[0].getFullYear()}`;
  }, [weekDates]);

  return (
    <MainLayout title="אילוצי עובדים">
      <div className="flex flex-col gap-6" dir="rtl">
        <div className="bg-white p-6 shadow-sm rounded-xl border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-4 order-2 md:order-1">
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

            <div className="flex items-center bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button
                onClick={goNextWeek}
                className="p-2 hover:bg-white hover:shadow-sm rounded-md transition-all"
              >
                <MaterialIcon name="chevron_right" />
              </button>
              <div className="px-4 font-bold text-slate-900">
                {currentViewWeek.replace('-W', ' / ')}
              </div>
              <button
                onClick={goPrevWeek}
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

        {/* Day tabs */}
        <div className="flex flex-wrap gap-2">
          {weekDates.map((date, i) => (
            <button
              key={i}
              onClick={() => setSelectedDayIndex(i)}
              className={`flex flex-col items-center px-4 py-2 rounded-xl border-2 transition-all min-w-[84px] ${
                selectedDayIndex === i
                  ? 'border-[#101B79] bg-[#101B79] text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="font-bold">{DAY_LABELS[i]}</span>
              <span className="text-xs opacity-80">
                {date.getDate()}/{date.getMonth() + 1}
              </span>
            </button>
          ))}
        </div>

        {/* Search + save controls */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative max-w-md w-full">
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

          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-sm font-bold text-amber-600">יש שינויים שלא נשמרו</span>
            )}
            <button
              onClick={revert}
              disabled={!isDirty || saving}
              className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
              בטל שינויים
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className={`px-5 py-2 text-sm font-bold rounded-lg shadow-sm transition-colors ${
                canSave
                  ? 'bg-[#101B79] hover:bg-[#000654] text-white'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">{error}</div>
        )}

        {isScheduleFinalized && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
            <MaterialIcon name="warning" className="text-amber-600" />
            <span className="font-bold">
              הסידור כבר פורסם. שינויי אילוצים לא ישפיעו על הסידור שפורסם עד להרצת Generate מחדש.
            </span>
          </div>
        )}

        <ConstraintAvailabilityTable
          employees={filteredEmployees}
          dayDefs={dayDefs}
          getEntry={getEntry}
          isOverrideCell={isOverrideCell}
          onSetStatus={(userId, def, status, partial) => setStatus(userId, def, status, partial)}
        />
      </div>
    </MainLayout>
  );
}
