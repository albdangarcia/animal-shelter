"use client";

import * as React from "react";
import {
  formatDateOrNA,
  formatUtcDateOrNA,
} from "@/app/lib/utils/date-utils";

const subscribe = () => () => {};

interface FormattedDateProps extends React.ComponentPropsWithoutRef<"span"> {
  date: string | Date | undefined | null;
}

/**
 * Renders a formatted date string for an instant that is safe to hydrate.
 *
 * The first render uses UTC on both the server and during hydration. React
 * then switches to the viewer's local timezone after hydration.
 */
export const FormattedDate = React.forwardRef<
  HTMLSpanElement,
  FormattedDateProps
>(({ date, ...props }, ref) => {
  const text = React.useSyncExternalStore(
    subscribe,
    () => formatDateOrNA(date),
    () => formatUtcDateOrNA(date),
  );

  return (
    <span ref={ref} {...props}>{text}</span>
  );
});
FormattedDate.displayName = "FormattedDate";
