import type { ReactNode } from 'react';
import { PageLoader } from './PageLoader';
import { ErrorState } from './ErrorState';

type Props = {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  loadingText?: string;
  children: ReactNode;
};

/**
 * Gates a server-data region: shows a loader until critical data is loaded, an error
 * state (with optional retry) when a required API call fails, and the children once
 * the data is ready. Wrap only data-dependent regions — never static chrome.
 */
export function PageDataBoundary({ loading, error, onRetry, loadingText, children }: Props) {
  if (loading) return <PageLoader text={loadingText} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return <>{children}</>;
}
