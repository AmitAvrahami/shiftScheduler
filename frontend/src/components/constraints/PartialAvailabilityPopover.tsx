import { useState } from 'react';
import type { ShiftDefinition } from '../../types/constraint';
import { getPartialPreview, validatePartialRange } from '../../utils/availabilityPreview';
import MaterialIcon from '../MaterialIcon';
import { TimeSelect } from './TimeSelect';

export interface PartialValue {
  startTime: string;
  endTime: string;
  note?: string;
}

interface PartialAvailabilityPopoverProps {
  def: ShiftDefinition;
  anchor: { top: number; left: number };
  initial?: PartialValue;
  onApply: (value: PartialValue) => void;
  onCancel: () => void;
}

const MEANING_STYLES: Record<string, string> = {
  forbidden: 'text-red-700 bg-red-50 border-red-200',
  partial_warning: 'text-amber-700 bg-amber-50 border-amber-200',
  available: 'text-green-700 bg-green-50 border-green-200',
};

export function PartialAvailabilityPopover({
  def,
  anchor,
  initial,
  onApply,
  onCancel,
}: PartialAvailabilityPopoverProps) {
  const [startTime, setStartTime] = useState(initial?.startTime ?? def.startTime);
  const [endTime, setEndTime] = useState(initial?.endTime ?? def.endTime);
  const [note, setNote] = useState(initial?.note ?? '');

  const validation = validatePartialRange(startTime, endTime, def);
  const preview = getPartialPreview(startTime, endTime, def);
  const canApply = !validation.error;

  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onCancel} />
      <div
        dir="rtl"
        className="fixed z-[80] w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 flex flex-col gap-3"
        style={{ top: anchor.top, left: anchor.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-black text-[#000654]">זמינות חלקית — {def.name}</span>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-full">
            <MaterialIcon name="close" className="text-base" />
          </button>
        </div>

        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-700">
            התחלה
            <TimeSelect value={startTime} onChange={setStartTime} ariaLabel="שעת התחלה" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-700">
            סיום
            <TimeSelect value={endTime} onChange={setEndTime} ariaLabel="שעת סיום" />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-bold text-slate-700">
          הערה (לא חובה)
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה..."
            className="p-2 rounded-lg border-2 border-slate-100 bg-slate-50 text-slate-800 text-sm font-normal focus:border-slate-300 focus:outline-none"
          />
        </label>

        {preview && (
          <div className={`rounded-lg border p-3 text-xs ${MEANING_STYLES[preview.meaning]}`}>
            <div className="flex justify-between font-bold">
              <span>{preview.rangeLabel}</span>
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

        <div className="flex gap-2 pt-1">
          <button
            disabled={!canApply}
            onClick={() => onApply({ startTime, endTime, note: note.trim() || undefined })}
            className="flex-1 bg-[#101B79] hover:bg-[#000654] text-white font-bold py-2 rounded-lg transition-all disabled:opacity-50"
          >
            החל
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2 rounded-lg hover:bg-slate-50 transition-all"
          >
            ביטול
          </button>
        </div>
      </div>
    </>
  );
}
