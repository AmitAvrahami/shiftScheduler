import { type ButtonHTMLAttributes } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

const VARIANT_CLASSES: Record<string, string> = {
  primary: 'bg-[#056AE5] hover:bg-[#0457B8] text-white disabled:opacity-60',
  danger: 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-60',
  secondary:
    'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 disabled:opacity-60',
};

const SPINNER_COLOR: Record<string, 'white' | 'blue'> = {
  primary: 'white',
  danger: 'white',
  secondary: 'blue',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'danger' | 'secondary';
};

export function LoadingButton({
  isLoading,
  loadingText,
  variant = 'primary',
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={isLoading || disabled}
      className={`inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {isLoading && <LoadingSpinner size="sm" color={SPINNER_COLOR[variant]} />}
      {isLoading && loadingText ? loadingText : children}
    </button>
  );
}
