"use client";

import { useLayoutEffect, useRef } from "react";

/** Where focus goes when the entry it was on leaves the list. */
export const ADD_ENTRY_BUTTON_ID = "add-medical-entry";

/**
 * The due list's heading, where focus goes when a row leaves the due list
 * and the viewer has no Add entry button: one who may give scheduled care
 * but not plan it. It needs `tabIndex={-1}` to take focus.
 */
export const DUE_HEADING_ID = "due-medical-entries";

/** The Conditions page's two headings, where focus goes when a row's
 * control goes. */
export const PROBLEM_LIST_HEADING_ID = "problem-list";
export const CARE_EPISODES_HEADING_ID = "care-episodes";

/** The Medications page's headings, where focus goes when an order's menu
 * goes: after a discontinue or a void moves the order. */
export const CURRENT_MEDICATIONS_HEADING_ID = "current-medications";
export const PAST_MEDICATIONS_HEADING_ID = "past-medications";

// Where focus goes when the control a dialog opened from is gone: the given
// element, or Add entry, or the due list's heading.
const focusFallback = (fallbackId?: string) =>
  (
    (fallbackId ? document.getElementById(fallbackId) : null) ??
    document.getElementById(ADD_ENTRY_BUTTON_ID) ??
    document.getElementById(DUE_HEADING_ID)
  )?.focus();

/**
 * For a dialog opened from a control on one entry's row: the row's menu
 * button, or a button of its own. When the dialog closes, focus goes back to
 * that control rather than to the page. What the dialog did may take the row
 * away, before or after the dialog closes: a void, or a decline that takes it
 * off the due list. Then focus goes to Add entry or, for a viewer without
 * it, to the due list's heading. A list with a heading of its own (the
 * problem list, care episodes) passes that heading's id as `fallbackId`; it
 * needs `tabIndex={-1}` to take focus.
 *
 * Put triggerRef on the control and pass returnFocus to the dialog content's
 * onCloseAutoFocus.
 */
export function useEntryDialogFocus(fallbackId?: string) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = (event: Event) => {
    event.preventDefault();
    if (triggerRef.current) triggerRef.current.focus();
    else focusFallback(fallbackId);
  };
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    return () => {
      if (trigger && document.activeElement === trigger) focusFallback(fallbackId);
    };
  }, [fallbackId]);
  return { triggerRef, returnFocus };
}
