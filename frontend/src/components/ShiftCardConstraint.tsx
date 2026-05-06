import MaterialIcon from './MaterialIcon';

interface ShiftCardConstraintProps {
  shiftName: string;
  startTime: string;
  endTime: string;
  isChecked: boolean;
  isLocked: boolean;
  onToggle: () => void;
}

export default function ShiftCardConstraint({
  shiftName,
  startTime,
  endTime,
  isChecked,
  isLocked,
  onToggle,
}: ShiftCardConstraintProps) {
  function getShiftIcon(name: string) {
    const n = name.toLowerCase();
    if (n.includes('בוקר')) return 'wb_sunny';
    if (n.includes('צהריים') || n.includes('אחה')) return 'light_mode';
    if (n.includes('לילה')) return 'dark_mode';
    return 'schedule';
  }

  return (
    <button
      onClick={onToggle}
      disabled={isLocked}
      className={`flex-1 rounded-lg p-3 transition-all flex flex-col justify-start gap-3 min-h-[100px] w-full ${
        isChecked
          ? 'bg-[#056AE5]/5 shadow-sm ring-2 ring-inset ring-[#056AE5]'
          : 'ring-1 ring-inset ring-outline-variant hover:bg-surface-container-low bg-white'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="w-full flex justify-between items-start">
        {/* Selection Indicator */}
        <div
          className={`w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 ${
            isChecked ? 'bg-[#056AE5] text-white' : 'border border-outline bg-white'
          }`}
        >
          {isChecked && <MaterialIcon name="check" className="text-[14px] font-bold" />}
        </div>

        {/* Shift Icon */}
        <MaterialIcon
          name={getShiftIcon(shiftName)}
          className={isChecked ? 'text-[#056AE5]' : 'text-outline'}
        />
      </div>

      <div className="w-full flex flex-col items-end gap-1">
        <div
          className={`w-full text-right text-base leading-normal break-words font-['Arimo Hebrew Subset'] ${isChecked ? 'text-[#101B79] font-bold' : 'text-on-surface font-bold'}`}
        >
          {shiftName}
        </div>
        <div
          className={`w-full text-right text-sm leading-normal break-words font-['Work Sans'] ${isChecked ? 'text-[#767683]' : 'text-on-surface-variant'}`}
        >
          {startTime} - {endTime}
        </div>
      </div>
    </button>
  );
}
