import { useRef, useState } from 'react';
import type { AvailabilityType, ConstraintEntry, ShiftDefinition } from '../../types/constraint';
import MaterialIcon from '../MaterialIcon';
import { PartialAvailabilityPopover, type PartialValue } from './PartialAvailabilityPopover';

interface AvailabilityCellProps {
  def: ShiftDefinition;
  entry?: ConstraintEntry;
  isOverride?: boolean;
  onSetStatus: (status: AvailabilityType, partial?: PartialValue) => void;
}

const STATUS_OPTIONS: { value: AvailabilityType; label: string }[] = [
  { value: 'available', label: 'זמין' },
  { value: 'unavailable', label: 'לא זמין' },
  { value: 'partial', label: 'חלקי' },
];

const STATUS_STYLES: Record<AvailabilityType, string> = {
  available: 'border-green-200 bg-green-50 text-green-800',
  unavailable: 'border-red-200 bg-red-50 text-red-800',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
};

function deriveStatus(entry?: ConstraintEntry): AvailabilityType {
  if (!entry) return 'available';
  if (entry.availabilityType) return entry.availabilityType;
  return entry.canWork === false ? 'unavailable' : 'available';
}

const POPOVER_WIDTH = 320;

export function AvailabilityCell({ def, entry, isOverride, onSetStatus }: AvailabilityCellProps) {
  const status = deriveStatus(entry);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  function openPopover() {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(rect.left, 8), window.innerWidth - POPOVER_WIDTH - 8);
    setAnchor({ top: rect.bottom + 4, left });
  }

  function handleSelect(value: AvailabilityType) {
    if (value === 'partial') {
      openPopover();
      return;
    }
    onSetStatus(value);
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <select
          aria-label={`זמינות עבור ${def.name}`}
          value={status}
          onChange={(e) => handleSelect(e.target.value as AvailabilityType)}
          className={`w-full p-1.5 rounded-lg border-2 text-sm font-bold focus:outline-none ${STATUS_STYLES[status]}`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {isOverride && (
          <span
            title="עקיפת הגשת עובד"
            className="shrink-0 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200"
          >
            עקיפה
          </span>
        )}
      </div>

      {status === 'partial' && entry?.startTime && entry?.endTime && (
        <button
          onClick={openPopover}
          className="flex items-center justify-center gap-1 text-[11px] text-amber-700 hover:text-amber-900"
        >
          <MaterialIcon name="schedule" className="text-xs" />
          {entry.startTime}–{entry.endTime}
        </button>
      )}

      {anchor && (
        <PartialAvailabilityPopover
          def={def}
          anchor={anchor}
          initial={
            entry?.startTime && entry?.endTime
              ? { startTime: entry.startTime, endTime: entry.endTime, note: entry.note }
              : undefined
          }
          onApply={(value) => {
            setAnchor(null);
            onSetStatus('partial', value);
          }}
          onCancel={() => setAnchor(null)}
        />
      )}
    </div>
  );
}
