"use client";

import * as React from "react";
import { formatTimeAgo, formatUtcDateOrNA } from "@/app/lib/utils/date-utils";

const subscribe = () => () => {};

interface TimeAgoProps extends React.ComponentPropsWithoutRef<"span"> {
  date: string | Date | undefined | null;
}

/**
 * Renders a relative "time ago" string that is safe to hydrate.
 *
 * The first render uses a stable UTC date on both the server and during
 * hydration. React then replaces it with relative text using the browser's
 * current time.
 */
export const TimeAgo = React.forwardRef<HTMLSpanElement, TimeAgoProps>(
  ({ date, ...props }, ref) => {
    const text = React.useSyncExternalStore(
      subscribe,
      () => formatTimeAgo(date),
      () => formatUtcDateOrNA(date),
    );

    return (
      <span ref={ref} {...props}>{text}</span>
    );
  },
);
TimeAgo.displayName = "TimeAgo";
