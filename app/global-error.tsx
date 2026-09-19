'use client';

import { useEffect } from 'react';

// Replaces the root layout when it throws, so it can't use the app's theme,
// fonts or providers. Everything it needs is inline.
const styles = `
  body { margin: 0; }
  .global-error {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    text-align: center;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: oklch(1 0 0);
    color: oklch(0.145 0 0);
  }
  .global-error p { margin: 0; }
  .global-error .code {
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }
  .global-error h1 {
    margin: 0.5rem 0 0;
    font-size: 2.25rem;
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  .global-error .description {
    margin-top: 0.75rem;
    max-width: 32rem;
    color: oklch(0.556 0 0);
  }
  .global-error button {
    margin-top: 2rem;
    padding: 0.5rem 1rem;
    border: 0;
    border-radius: 0.375rem;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    background: oklch(0.205 0 0);
    color: oklch(0.985 0 0);
  }
  .global-error button:hover { opacity: 0.9; }
  .global-error button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    .global-error { background: oklch(0.145 0 0); color: oklch(0.985 0 0); }
    .global-error .description { color: oklch(0.708 0 0); }
    .global-error button { background: oklch(0.922 0 0); color: oklch(0.205 0 0); }
  }
`;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <style>{styles}</style>
        <div className="global-error">
          <div>
            <p className="code">Error</p>
            <h1>Something Went Wrong</h1>
            <p className="description">
              We&apos;ve encountered an unexpected error. Please try refreshing the page or click the button below to try again.
            </p>
            <button onClick={() => retry()}>Try again</button>
          </div>
        </div>
      </body>
    </html>
  );
}
