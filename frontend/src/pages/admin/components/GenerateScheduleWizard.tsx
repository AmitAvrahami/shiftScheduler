import { useEffect, useState, useCallback } from 'react';
import MaterialIcon from '../../../components/MaterialIcon';
import { WeekLabel } from '../../../components/WeekLabel';
import { LoadingButton } from '../../../components/ui/LoadingButton';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { adminApi } from '../../../lib/api';
import type { GenerateResult } from '../../../lib/api';
import { isScheduleManuallyEdited } from '../../../utils/scheduleManualEdit';
import { getNextWeekId, getPrevWeekId } from '../../../utils/weekUtils';

interface GenerateScheduleWizardProps {
  open: boolean;
  initialWeekId: string;
  onClose: () => void;
  onGenerate: (weekId: string) => Promise<GenerateResult>;
  onGenerated: (result: GenerateResult) => void;
}

type ReviewSummary = {
  employeesCount: number;
  missingConstraintsCount: number;
  warnings: string[];
  hasExistingSchedule: boolean;
  hasManualEdits: boolean;
};

export function GenerateScheduleWizard({
  open,
  initialWeekId,
  onClose,
  onGenerate,
  onGenerated,
}: GenerateScheduleWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedWeekId, setSelectedWeekId] = useState(initialWeekId);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setStep(1);
      setSelectedWeekId(initialWeekId);
      setReviewSummary(null);
      setReviewLoading(false);
      setReviewError(null);
      setIsGenerating(false);
      setGenerateError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, initialWeekId]);

  const fetchReview = useCallback(async (weekId: string) => {
    setReviewLoading(true);
    setReviewError(null);
    setReviewSummary(null);
    try {
      const dto = await adminApi.getDashboard(weekId);
      setReviewSummary({
        employeesCount: dto.employees.filter((e) => e.isActive).length,
        missingConstraintsCount: dto.missingConstraints.length,
        warnings: dto.readiness.warnings,
        hasExistingSchedule: dto.scheduleId !== null,
        hasManualEdits: isScheduleManuallyEdited(dto.auditLogs),
      });
    } catch {
      setReviewError('לא ניתן לטעון נתוני שבוע. נסה שנית.');
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && step === 2) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      fetchReview(selectedWeekId);
    }
  }, [open, step, selectedWeekId, fetchReview]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isGenerating) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isGenerating, onClose]);

  async function handleGenerate() {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await onGenerate(selectedWeekId);
      onGenerated(result);
    } catch {
      setGenerateError('לא ניתן ליצור סידור עבודה כרגע. נסה שוב בעוד רגע.');
    } finally {
      setIsGenerating(false);
    }
  }

  if (!open) return null;

  const STEP_TITLES: Record<number, string> = {
    1: 'בחירת שבוע ליצירת סידור',
    2: 'בדיקת נתונים ואילוצים',
    3: 'אישור יצירת סידור עבודה',
  };

  const STEP_SUBTITLES: Record<number, string> = {
    1: 'בחר את השבוע שעבורו תרצה ליצור סידור עבודה.',
    2: 'לפני יצירת הסידור, ודא שהעובדים, המשמרות והאילוצים לשבוע הנבחר מוכנים.',
    3: 'המערכת תיצור סידור עבודה חדש לפי העובדים, המשמרות והאילוצים הקיימים.',
  };

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !isGenerating) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
      dir="rtl"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#056AE5]/10 flex items-center justify-center shrink-0">
              <MaterialIcon name="bolt" className="text-[#056AE5] text-[20px]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">{STEP_TITLES[step]}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{STEP_SUBTITLES[step]}</p>
            </div>
          </div>
          <button
            onClick={() => !isGenerating && onClose()}
            disabled={isGenerating}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MaterialIcon name="close" className="text-[18px]" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-3 border-b border-slate-50">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                s === step
                  ? 'bg-[#056AE5] text-white'
                  : s < step
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {s < step ? <MaterialIcon name="check" className="text-[14px]" /> : s}
            </div>
          ))}
          <span className="text-[11px] text-slate-400 font-medium mr-1">שלב {step} מתוך 3</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="flex flex-col items-center gap-6">
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setSelectedWeekId(getPrevWeekId(selectedWeekId))}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                  >
                    <MaterialIcon name="chevron_right" className="text-[20px]" />
                  </button>
                  <div className="flex-1 text-center text-sm font-bold text-slate-800">
                    <WeekLabel weekId={selectedWeekId} />
                  </div>
                  <button
                    onClick={() => setSelectedWeekId(getNextWeekId(selectedWeekId))}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                  >
                    <MaterialIcon name="chevron_left" className="text-[20px]" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center">השתמש בחצים לניווט בין שבועות</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {reviewLoading && (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner size="md" color="blue" />
                </div>
              )}

              {reviewError && !reviewLoading && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-red-700">
                    <MaterialIcon name="error" className="text-[16px]" />
                    {reviewError}
                  </div>
                  <button
                    onClick={() => fetchReview(selectedWeekId)}
                    className="text-xs font-bold text-red-700 hover:underline"
                  >
                    נסה שנית
                  </button>
                </div>
              )}

              {reviewSummary && !reviewLoading && (
                <div className="space-y-3">
                  <ReviewRow
                    label="שבוע נבחר"
                    icon="calendar_today"
                    value={<WeekLabel weekId={selectedWeekId} />}
                  />
                  <ReviewRow
                    label="עובדים זמינים"
                    icon="group"
                    value={
                      reviewSummary.employeesCount > 0
                        ? `${reviewSummary.employeesCount} עובדים פעילים`
                        : 'אין עובדים פעילים'
                    }
                    status={reviewSummary.employeesCount > 0 ? 'ok' : 'warn'}
                  />
                  <ReviewRow
                    label="אילוצים חסרים"
                    icon="assignment_late"
                    value={
                      reviewSummary.missingConstraintsCount === 0
                        ? 'כל הצוות הגיש'
                        : `${reviewSummary.missingConstraintsCount} עובדים לא הגישו`
                    }
                    status={reviewSummary.missingConstraintsCount === 0 ? 'ok' : 'warn'}
                  />
                  {reviewSummary.warnings.length > 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-700 mb-2">
                        <MaterialIcon name="warning" className="text-[14px]" />
                        אזהרות
                      </div>
                      <ul className="space-y-1">
                        {reviewSummary.warnings.map((w, i) => (
                          <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                            <span className="mt-0.5">•</span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <ReviewRow
                      label="אזהרות"
                      icon="check_circle"
                      value="אין אזהרות קריטיות"
                      status="ok"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">שבוע</span>
                  <span className="font-bold text-slate-800">
                    <WeekLabel weekId={selectedWeekId} />
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-3 text-xs text-slate-600 leading-relaxed">
                  המערכת תיצור סידור עבודה חדש לפי העובדים, המשמרות והאילוצים הקיימים.
                </div>
              </div>

              {reviewSummary?.hasManualEdits ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <MaterialIcon
                    name="warning"
                    className="text-red-600 text-[16px] mt-0.5 shrink-0"
                  />
                  <p className="text-xs text-red-800 font-medium leading-relaxed">
                    בסידור הקיים יש שינויים ידניים. יצירה מחדש תמחק את כל השיבוצים — כולל השינויים
                    הידניים — ותחליף אותם בסידור חדש מהמערכת.
                  </p>
                </div>
              ) : (
                reviewSummary?.hasExistingSchedule && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                    <MaterialIcon
                      name="info"
                      className="text-amber-600 text-[16px] mt-0.5 shrink-0"
                    />
                    <p className="text-xs text-amber-800">
                      שים לב: קיים כבר סידור לשבוע זה. מומלץ לבדוק לפני יצירה מחדש.
                    </p>
                  </div>
                )
              )}

              {generateError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <MaterialIcon name="error" className="text-red-500 text-[16px] mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700">{generateError}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-between gap-3">
          {step === 1 && (
            <>
              <button
                onClick={() => !isGenerating && onClose()}
                className="px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-[#056AE5] text-white hover:bg-[#0457B8] transition-colors shadow-sm"
              >
                הבא
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                הקודם
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={reviewLoading || !!reviewError}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-[#056AE5] text-white hover:bg-[#0457B8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                הבא
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                onClick={() => setStep(2)}
                disabled={isGenerating}
                className="px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                הקודם
              </button>
              <LoadingButton
                onClick={handleGenerate}
                isLoading={isGenerating}
                loadingText="יוצר סידור..."
                variant="primary"
                className="px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm"
              >
                צור סידור עבודה
              </LoadingButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  icon,
  value,
  status,
}: {
  label: string;
  icon: string;
  value: React.ReactNode;
  status?: 'ok' | 'warn';
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <MaterialIcon name={icon} className="text-[16px]" />
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        {status === 'ok' && (
          <MaterialIcon name="check_circle" className="text-emerald-500 text-[14px]" />
        )}
        {status === 'warn' && (
          <MaterialIcon name="warning" className="text-amber-500 text-[14px]" />
        )}
        <span className="text-sm font-bold text-slate-800">{value}</span>
      </div>
    </div>
  );
}
