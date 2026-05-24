import { LoadingSpinner } from './LoadingSpinner';

type Props = {
  text?: string;
};

export function PageLoader({ text = 'טוען נתונים...' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <LoadingSpinner size="lg" color="blue" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
