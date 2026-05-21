import { TIME_OPTIONS } from '../../utils/availabilityPreview';

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export function TimeSelect({ value, onChange, ariaLabel }: TimeSelectProps) {
  // Keep an off-grid current value (e.g. a shift time not on the 15-minute grid) selectable.
  const options = value && !TIME_OPTIONS.includes(value) ? [value, ...TIME_OPTIONS] : TIME_OPTIONS;
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="p-2 rounded-lg border-2 border-slate-100 bg-slate-50 text-slate-800 text-sm focus:border-slate-300 focus:outline-none"
    >
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
