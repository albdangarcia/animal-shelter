"use client";

// Replacing a photo under Current Images: staff choose a new photo (the
// original, from their phone or computer: only the cropped square of a photo
// is ever saved), crop it in the same editor as a new photo
// (photo-crop-editor.tsx), and save it in the old one's place, to
// POST /api/animal-photos/replace. The photo keeps its place in the order, so
// a primary photo stays primary, and the old one is deleted.
//
// `usePhotoReplacer` gives the gallery a `choose(image)` to call from a tile's
// Replace button (it opens the file chooser at once, while the click still
// counts as the user's), and the element to render once, outside the
// sortable tiles: a dialog inside a tile would hand its drags and keys to the
// tile, which would start dragging it.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { initialCrop, type Crop } from "@/app/lib/utils/photo-crop";
import PhotoCropEditor from "./photo-crop-editor";
import { openPhoto } from "./crop-photo";
import { UNREADABLE_REPLACEMENT_MESSAGE } from "./upload-errors";
import { focusField, saveCrop } from "./save-crop";

export const PHOTO_REPLACE_ENDPOINT = "/api/animal-photos/replace";
export const PHOTO_REPLACED_MESSAGE = "Photo replaced.";

/** As for the uploader: not the bottom right, where the Save button is. */
const TOAST_POSITION = "top-center" as const;

/** What the file chooser offers: see the uploader's ACCEPTED_TYPES. */
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

const CROP_BOX = "[data-testid='crop-box']";

/** A saved photo: its id and the URL the gallery shows. */
export interface ReplaceablePhoto {
  id: string;
  url: string;
}

interface Replacement {
  image: ReplaceablePhoto;
  file: File;
  /** An object URL of the new photo, for the editor. */
  src: string;
  width: number;
  height: number;
  crop: Crop;
  /** Where the new square sits in the wide frames; null is centred. */
  focusY: number | null;
}

/** Keys that belong to a focused control, not to the dialog's Enter. */
const isControl = (target: EventTarget) =>
  target instanceof Element &&
  target.closest("button, input, textarea, select, a, [role='slider']") !==
    null;

export function usePhotoReplacer(animalId: string) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The photo whose Replace was clicked, until a file is chosen for it.
  const chosenFor = useRef<ReplaceablePhoto | null>(null);
  // Counts the files chosen: a photo still opening when another is chosen, or
  // when the page is left, is dropped rather than opened.
  const opening = useRef(0);
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const [saving, setSaving] = useState(false);

  // Lets go of the new photo's object URL when it is done with, and when the
  // page is left with the dialog open.
  const latest = useRef(replacement);
  useEffect(() => {
    latest.current = replacement;
  });
  useEffect(
    () => () => {
      opening.current += 1;
      if (latest.current) URL.revokeObjectURL(latest.current.src);
    },
    [],
  );

  const close = () => {
    if (replacement) URL.revokeObjectURL(replacement.src);
    setReplacement(null);
  };

  const choose = (image: ReplaceablePhoto) => {
    chosenFor.current = image;
    inputRef.current?.click();
  };

  const open = async (file: File | undefined) => {
    const image = chosenFor.current;
    chosenFor.current = null;
    if (!file || !image) return;
    const attempt = ++opening.current;
    const opened = await openPhoto(file);
    if (attempt !== opening.current) {
      opened?.release();
      return;
    }
    if (!opened) {
      toast.error(UNREADABLE_REPLACEMENT_MESSAGE, {
        description: file.name,
        position: TOAST_POSITION,
      });
      return;
    }
    const { width, height } = opened;
    opened.release();
    setReplacement({
      image,
      file,
      src: URL.createObjectURL(file),
      width,
      height,
      crop: initialCrop(width, height),
      focusY: null,
    });
  };

  const save = async () => {
    const current = replacement;
    if (!current || saving) return;
    setSaving(true);
    try {
      const saved = await saveCrop(current.file, current.crop, PHOTO_REPLACE_ENDPOINT, {
        animalId,
        imageId: current.image.id,
        expectedUrl: current.image.url,
        ...focusField(current.focusY),
      });
      if (!saved.ok) {
        toast.error(saved.message, {
          description: current.file.name,
          position: TOAST_POSITION,
        });
        return;
      }
      toast.success(PHOTO_REPLACED_MESSAGE, {
        description: current.file.name,
        position: TOAST_POSITION,
      });
      URL.revokeObjectURL(current.src);
      setReplacement(null);
      router.refresh();
    } finally {
      setSaving(false);
      // As in the uploader: the disabled Save button dropped the keyboard;
      // give it back to the crop box if the dialog is still open.
      requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        const active = document.activeElement;
        if (dialog && (!dialog.contains(active) || active === dialog)) {
          dialog.querySelector<HTMLElement>(CROP_BOX)?.focus({
            preventScroll: true,
          });
        }
      });
    }
  };

  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isControl(event.target)) return;
    if (event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      void save();
    }
  };

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        hidden
        aria-label="Replacement photo"
        data-testid="replace-photo-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Let the same file be chosen again later.
          event.target.value = "";
          void open(file);
        }}
      />
      <Dialog
        open={replacement !== null}
        onOpenChange={(wantsOpen) => {
          // Nothing is saved until Replace photo, so closing needs no
          // question; but not in the middle of a save.
          if (!wantsOpen && !saving) close();
        }}
      >
        <DialogContent
          ref={dialogRef}
          onKeyDown={onDialogKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            dialogRef.current?.focus({ preventScroll: true });
          }}
          className="flex max-h-dvh flex-col gap-4 overflow-y-auto max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-h-[95dvh] sm:max-w-5xl"
        >
          <DialogHeader>
            <DialogTitle>Replace photo</DialogTitle>
            <DialogDescription>
              Move the square over the animal, then save. The new photo takes
              this one&apos;s place, and this one is deleted: it can&apos;t be
              restored.
            </DialogDescription>
          </DialogHeader>

          {replacement && (
            <div className="grid min-h-0 gap-4 md:grid-cols-[10rem_minmax(0,1fr)]">
              <figure className="flex items-center gap-2 md:flex-col md:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- a small reference copy of the saved photo */}
                <img
                  src={replacement.image.url}
                  alt="The photo being replaced"
                  className="size-20 shrink-0 rounded-md border object-cover md:size-40"
                />
                <figcaption className="text-xs text-muted-foreground">
                  Now
                </figcaption>
              </figure>
              <PhotoCropEditor
                photo={{
                  src: replacement.src,
                  width: replacement.width,
                  height: replacement.height,
                }}
                crop={replacement.crop}
                onCropChange={(crop) =>
                  setReplacement((before) => (before ? { ...before, crop } : before))
                }
                focusY={replacement.focusY}
                onFocusChange={(focusY) =>
                  setReplacement((before) => (before ? { ...before, focusY } : before))
                }
                autoFocus
              />
            </div>
          )}

          <p className="hidden text-xs text-muted-foreground md:block">
            With the square selected: arrow keys move it (Shift moves further),
            + and − resize it. Enter saves.
          </p>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={!replacement || saving}
            >
              {saving ? "Replacing…" : "Replace photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { choose, element };
}
