"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import { loadMedicalEntryFormOptions } from "@/app/lib/actions/medical-entry.actions";

/**
 * A dialog holding an entry form, opened from a row. On one animal's page
 * the form's options are given. On a page that lists many animals' care they
 * are left out, and read each time the dialog opens, so what the form offers
 * (whether the next dose is already planned, say) is as it is now.
 *
 * The dialog opens at once, whether or not the options are here: it holds
 * the page while they load, so no other row's form can open meanwhile. A
 * read that answers after its dialog closed, or after it was opened again,
 * is dropped. A failed read says so and closes the dialog.
 *
 * Pass `setOpen` to the dialog (through any unsaved-changes guard), and show
 * `<EntryFormLoading />` until `formOptions` is there.
 */
export function useEntryFormOptions(
  animalId: string,
  options?: MedicalEntryFormOptions,
) {
  const [open, setOpenState] = useState(false);
  // The options the open form uses: the ones given, or the ones read when it
  // opened.
  const [formOptions, setFormOptions] = useState(options);
  // Counts the openings, so a late read can tell it is stale.
  const opening = useRef(0);

  const setOpen = (next: boolean) => {
    if (!next) opening.current++;
    setOpenState(next);
  };

  const openDialog = () => {
    setOpenState(true);
    if (options) {
      setFormOptions(options);
      return;
    }
    setFormOptions(undefined);
    const thisOpening = ++opening.current;
    void (async () => {
      let message: string;
      try {
        const result = await loadMedicalEntryFormOptions(animalId);
        if (thisOpening !== opening.current) return;
        if (result.ok) {
          setFormOptions(result.options);
          return;
        }
        message = result.message;
      } catch {
        if (thisOpening !== opening.current) return;
        message = "Could not load the form. Try again.";
      }
      toast.error(message);
      setOpen(false);
    })();
  };

  return { open, setOpen, openDialog, formOptions };
}

/** What a dialog shows while its form's options load. */
export function EntryFormLoading() {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" />
      Loading the form…
    </p>
  );
}
