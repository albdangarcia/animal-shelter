'use client';

import { useEffect } from 'react';
import StatusPage from '@/components/StatusPage';
import { Button } from '@/components/ui/button';

export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// The body of every `error.tsx`. Each boundary file stays (Next requires one
// per segment) but only forwards its props here, so the UI and any logging
// live in one place. `retry` re-fetches the segment's server data, which is
// what a transient server error needs; `reset` would only clear client state.
const ErrorFallback = ({ error, retry }: ErrorFallbackProps) => {
  useEffect(() => {
    console.error(error, { digest: error.digest });
  }, [error]);

  const actionButton = (
    <Button
      onClick={() => retry()}
      className="mt-8"
    >
      Try again
    </Button>
  );

  return (
    <StatusPage
      type="genericError"
      actionButton={actionButton}
    />
  );
};

export default ErrorFallback;
