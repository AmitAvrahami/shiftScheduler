import { TIME_OPTIONS } from '../../utils/availabilityPreview';

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export function TimeSelect({ value, onChange, ariaLabel }: TimeSelectProps) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="p-2 rounded-lg border-2 border-slate-100 bg-slate-50 text-slate-800 text-sm focus:border-slate-300 focus:outline-none"
    >
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
