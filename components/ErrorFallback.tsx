'use client';

import PageNotFoundOrAccessDenied from '@/components/PageNotFoundOrAccessDenied';
import { Button } from '@/components/ui/button';

export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// The body of every `error.tsx`. Each boundary file stays (Next requires one
// per segment) but only forwards its props here, so the UI and any logging
// live in one place.
const ErrorFallback = ({ reset }: ErrorFallbackProps) => {
  const actionButton = (
    <Button
      onClick={() => reset()}
      className="mt-8"
    >
      Try again
    </Button>
  );

  return (
    <PageNotFoundOrAccessDenied
      type="genericError"
      actionButton={actionButton}
    />
  );
};

export default ErrorFallback;
