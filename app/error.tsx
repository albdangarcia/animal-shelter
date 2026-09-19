'use client';

import ErrorFallback, { type ErrorFallbackProps } from '@/components/ErrorFallback';

export default function Error(props: ErrorFallbackProps) {
  return <ErrorFallback {...props} />;
}
