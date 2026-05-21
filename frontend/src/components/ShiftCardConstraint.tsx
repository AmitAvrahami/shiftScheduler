import type { AvailabilityType, ShiftDefinition } from '../types/constraint';
import { getPartialPreview, validatePartialRange } from '../utils/availabilityPreview';
import { TimeSelect } from './constraints/TimeSelect';
import MaterialIcon from './MaterialIcon';

export interface PartialValue {
  startTime: string;
  endTime: string;
  note?: string;
}

interface ShiftCardConstraintProps {
  def: ShiftDefinition;
  status: AvailabilityType;
  partial?: PartialValue;
  isLocked: boolean;
  onChange: (status: AvailabilityType, partial?: PartialValue) => void;
}

const SEGMENTS: { value: AvailabilityType; label: string }[] = [
  { value: 'available', label: 'זמין' },
  { value: 'unavailable', label: 'לא זמין' },
  { value: 'partial', label: 'חלקית' },
];

const ACTIVE_SEGMENT_STYLES: Record<AvailabilityType, string> = {
  available: 'bg-green-600 text-white',
  unavailable: 'bg-[#056AE5] text-white',
  partial: 'bg-amber-500 text-white',
};

const CARD_STYLES: Record<AvailabilityType, string> = {
  available: 'ring-1 ring-inset ring-outline-variant bg-white',
  unavailable: 'bg-[#056AE5]/5 ring-2 ring-inset ring-[#056AE5]',
  partial: 'bg-amber-50 ring-2 ring-inset ring-amber-300',
};

const PREVIEW_STYLES: Record<string, string> = {
  forbidden: 'text-red-700 bg-red-50 border-red-200',
  partial_warning: 'text-amber-700 bg-amber-50 border-amber-200',
  available: 'text-green-700 bg-green-50 border-green-200',
};

function getShiftIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('בוקר')) return 'wb_sunny';
  if (n.includes('צהריים') || n.includes('אחה')) return 'light_mode';
  if (n.includes('לילה')) return 'dark_mode';
  return 'schedule';
}

export default function ShiftCardConstraint({
  def,
  status,
  partial,
  isLocked,
  onChange,
}: ShiftCardConstraintProps) {
  const current: PartialValue = partial ?? {
    startTime: def.startTime,
    endTime: def.endTime,
    note: '',
  };

  function handleSegment(next: AvailabilityType) {
    if (isLocked || next === status) return;
    if (next === 'partial') {
      onChange('partial', {
        startTime: def.startTime,
        endTime: def.endTime,
        note: '',
      });
      return;
    }
    onChange(next);
  }

  function updatePartial(patch: Partial<PartialValue>) {
    if (isLocked) return;
    onChange('partial', { ...current, ...patch });
  }

  const preview =
    status === 'partial' ? getPartialPreview(current.startTime, current.endTime, def) : null;
  const validation =
    status === 'partial' ? validatePartialRange(current.startTime, current.endTime, def) : {};

  return (
    <div
      className={`flex-1 rounded-lg p-3 transition-all flex flex-col gap-3 min-h-[100px] w-full ${CARD_STYLES[status]} ${isLocked ? 'opacity-50' : ''}`}
    >
      {/* Header: icon + shift name/time */}
      <div className="w-full flex justify-between items-start gap-2">
        <MaterialIcon
          name={getShiftIcon(def.name)}
          className={status === 'available' ? 'text-outline' : 'text-on-surface'}
        />
        <div className="flex flex-col items-end gap-0.5">
          <div className="text-right text-base leading-normal break-words font-bold text-on-surface">
            {def.name}
          </div>
          <div className="text-right text-sm leading-normal break-words text-on-surface-variant">
            <bdi dir="ltr">
              {def.startTime} - {def.endTime}
            </bdi>
          </div>
        </div>
      </div>

      {/* 3-state segmented control */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-container-low p-1">
        {SEGMENTS.map((seg) => {
          const active = seg.value === status;
          return (
            <button
              key={seg.value}
              type="button"
              onClick={() => handleSegment(seg.value)}
              disabled={isLocked}
              aria-pressed={active}
              className={`rounded-md py-1.5 text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                active
                  ? ACTIVE_SEGMENT_STYLES[seg.value]
                  : 'bg-white text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      {/* Inline partial editor */}
      {status === 'partial' && (
        <div className="flex flex-col gap-2 border-t border-amber-200 pt-2">
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-bold text-slate-700">
              התחלה
              <TimeSelect
                value={current.startTime}
                onChange={(v) => updatePartial({ startTime: v })}
                ariaLabel={`שעת התחלה — ${def.name}`}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-bold text-slate-700">
              סיום
              <TimeSelect
                value={current.endTime}
                onChange={(v) => updatePartial({ endTime: v })}
                ariaLabel={`שעת סיום — ${def.name}`}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-bold text-slate-700">
            הערה (לא חובה)
            <input
              type="text"
              value={current.note ?? ''}
              onChange={(e) => updatePartial({ note: e.target.value })}
              disabled={isLocked}
              placeholder="הערה..."
              className="p-2 rounded-lg border-2 border-slate-100 bg-slate-50 text-slate-800 text-sm font-normal focus:border-slate-300 focus:outline-none disabled:opacity-50"
            />
          </label>

          {preview && (
            <div className={`rounded-lg border p-2 text-xs ${PREVIEW_STYLES[preview.meaning]}`}>
              <div className="flex justify-between font-bold">
                <bdi dir="ltr">{preview.rangeLabel}</bdi>
                <span>{preview.durationLabel}</span>
              </div>
              <div className="mt-1">משמעות בשיבוץ: {preview.meaningLabel}</div>
            </div>
          )}

          {validation.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-700">
              {validation.error}
            </div>
          )}
          {!validation.error && validation.warning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-700">
              {validation.warning}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
