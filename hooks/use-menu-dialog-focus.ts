import { useRef } from "react";

/**
 * For a dialog opened from a dropdown menu item. The item is gone by the time
 * the dialog closes, so focus goes back to the menu's button rather than to
 * the page. Put triggerRef on the menu's button and pass returnFocus to the
 * dialog content's onCloseAutoFocus.
 */
export function useMenuDialogFocus() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };
  return { triggerRef, returnFocus };
}
