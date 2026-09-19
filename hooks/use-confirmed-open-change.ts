"use client";

import { useState } from "react";

export interface DirtyFormHandle {
  isDirty: () => boolean;
}

/**
 * Compares react-hook-form's getValues() snapshots by value rather than via
 * formState.isDirty/dirtyFields. Those are computed off an internal Proxy
 * that React Compiler can optimize away when read from outside render (e.g.
 * a ref's isDirty() call) - see note-form.tsx. getValues() is a plain
 * synchronous read, so it isn't affected.
 */
export function haveFormValuesChanged(
  current: Record<string, unknown>,
  initial: Record<string, unknown>,
): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}

interface UseConfirmedOpenChangeResult {
  guardedOnOpenChange: (open: boolean) => void;
  isConfirmOpen: boolean;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
}

/**
 * Wraps a dialog's onOpenChange so that closing it while getIsDirty() is
 * true opens a confirmation prompt instead of closing immediately. Opening
 * is always passed through unconditionally since it's never destructive.
 *
 * Takes a getter rather than a plain boolean so callers can back it with a
 * ref (e.g. a react-hook-form instance's formState.isDirty) without needing
 * to re-render on every keystroke just to keep a snapshot fresh.
 */
export function useConfirmedOpenChange(
  getIsDirty: () => boolean,
  onOpenChange: (open: boolean) => void,
): UseConfirmedOpenChangeResult {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const guardedOnOpenChange = (open: boolean) => {
    if (open) {
      onOpenChange(true);
      return;
    }
    if (getIsDirty()) {
      setIsConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const confirmDiscard = () => {
    setIsConfirmOpen(false);
    onOpenChange(false);
  };

  const cancelDiscard = () => {
    setIsConfirmOpen(false);
  };

  return { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard };
}
