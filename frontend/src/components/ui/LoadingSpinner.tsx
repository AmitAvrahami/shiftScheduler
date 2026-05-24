const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-4',
  lg: 'w-10 h-10 border-4',
};

const COLOR_CLASSES: Record<string, string> = {
  white: 'border-white',
  blue: 'border-[#056AE5]',
  current: 'border-current',
};

type Props = {
  size?: 'sm' | 'md' | 'lg';
  color?: 'white' | 'blue' | 'current';
};

export function LoadingSpinner({ size = 'md', color = 'blue' }: Props) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} ${COLOR_CLASSES[color]} border-t-transparent rounded-full animate-spin flex-shrink-0`}
    />
  );
}
