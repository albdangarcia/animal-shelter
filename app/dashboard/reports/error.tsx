'use client';

import PageNotFoundOrAccessDenied from '@/components/PageNotFoundOrAccessDenied';
import { Button } from '@/components/ui/button';

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
}
