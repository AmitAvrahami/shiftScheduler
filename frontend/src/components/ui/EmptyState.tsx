import MaterialIcon from '../MaterialIcon';

type Props = {
  message?: string;
  icon?: string;
};

export function EmptyState({ message = 'לא נמצאו נתונים', icon = 'inbox' }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
      <MaterialIcon name={icon} className="text-4xl" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
