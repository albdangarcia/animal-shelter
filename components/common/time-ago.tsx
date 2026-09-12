"use client";

import * as React from "react";
import { formatTimeAgo } from "@/app/lib/utils/date-utils";

interface TimeAgoProps extends React.ComponentPropsWithoutRef<"span"> {
  date: string | Date | undefined | null;
}

/**
 * Renders a relative "time ago" string that is safe to hydrate.
 *
 * `formatTimeAgo` depends on the current instant, so the value computed
 * during SSR almost always differs from the value computed on the client a
 * moment later. Rendering it directly causes a hydration mismatch. Instead,
 * the DOM keeps the server-rendered text through hydration
 * (`suppressHydrationWarning`) and it's corrected to the client's current
 * time in an effect right after mount.
 */
export const TimeAgo = React.forwardRef<HTMLSpanElement, TimeAgoProps>(
  ({ date, ...props }, ref) => {
    const [text, setText] = React.useState(() => formatTimeAgo(date));

    React.useEffect(() => {
      setText(formatTimeAgo(date));
    }, [date]);

    return (
      <span ref={ref} suppressHydrationWarning {...props}>
        {text}
      </span>
    );
  },
);
TimeAgo.displayName = "TimeAgo";
