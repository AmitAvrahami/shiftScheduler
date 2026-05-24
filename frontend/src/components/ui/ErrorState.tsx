import MaterialIcon from '../MaterialIcon';

type Props = {
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ message = 'אירעה שגיאה בטעינת הנתונים', onRetry }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-error">
      <MaterialIcon name="error" className="text-4xl" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-semibold text-white bg-error rounded-lg hover:opacity-90 transition-opacity"
        >
          נסה שוב
        </button>
      )}
    </div>
  );
}
