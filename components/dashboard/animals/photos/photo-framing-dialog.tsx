"use client";

// "Adjust framing" on a saved photo: where it sits in the two wide frames
// (the listing card and the animal's page), without replacing it. Staff drag
// either preview up or down, or use the arrow keys on it; Save stores the
// photo's `focusY` through `setAnimalImageFocus`. The photo itself is not
// changed, so this works for the seed photos too, which have no original to
// crop again.
//
// The gallery passes the action in, as it imports the other photo actions,
// so this file has no server imports and its tests no module stand-ins.
//
// A hook, as `usePhotoReplacer` is: the gallery renders `element` beside its
// grid, never inside a tile, whose dnd-kit listeners would take the dialog's
// drags and keys through its portal.

import { useRef, useState } from "react";
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
import PhotoPreview, { type PreviewShape } from "./photo-preview";

export interface FramedPhoto {
  id: string;
  url: string;
  focusY: number | null;
}

const TOAST_POSITION = "top-center" as const;

export const FRAMING_SAVED_MESSAGE = "Framing saved.";

export const FRAMING_UNREACHABLE_MESSAGE =
  "Couldn't reach the server, so the framing wasn't saved. Check your connection and try again.";

/** `setAnimalImageFocus` in app/lib/actions/animal.actions.ts. */
export type SaveFocus = (
  animalId: string,
  imageId: string,
  expectedUrl: string,
  focusY: number | null,
) => Promise<{ success: boolean; message: string }>;

/** The two wide frames, bigger than in the crop editor: the dialog has room. */
const SHAPES: PreviewShape[] = [
  { label: "Listing", width: 168, height: 126, className: "rounded-lg" },
  // The animal's page at its widest, a tablet's 704 × 300: see PREVIEW_SHAPES.
  { label: "Animal's page", width: 282, height: 120, className: "rounded-lg" },
];

export function usePhotoFramer(animalId: string, saveFocus: SaveFocus) {
  const router = useRouter();
  const [photo, setPhoto] = useState<FramedPhoto | null>(null);
  const [focusY, setFocusY] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const adjust = (image: FramedPhoto) => {
    setPhoto(image);
    setFocusY(image.focusY);
  };

  const save = async () => {
    if (!photo || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveFocus(animalId, photo.id, photo.url, focusY);
      if (!result.success) {
        toast.error(result.message, { position: TOAST_POSITION });
        return;
      }
      toast.success(FRAMING_SAVED_MESSAGE, { position: TOAST_POSITION });
      setPhoto(null);
      router.refresh();
    } catch {
      toast.error(FRAMING_UNREACHABLE_MESSAGE, { position: TOAST_POSITION });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const element = (
    <Dialog
      open={photo !== null}
      onOpenChange={(wantsOpen) => {
        // Nothing is saved until Save, so closing needs no question; but not
        // in the middle of a save.
        if (!wantsOpen && !savingRef.current) setPhoto(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust framing</DialogTitle>
          <DialogDescription>
            The website&apos;s listing and the animal&apos;s page show this
            photo wider than it is, so its top or bottom is cut off. Drag a
            preview up or down to keep the animal in frame. The photo itself
            isn&apos;t changed.
          </DialogDescription>
        </DialogHeader>

        {photo && (
          <div className="flex flex-wrap items-end gap-4">
            {SHAPES.map((shape) => (
              <PhotoPreview
                key={shape.label}
                shape={shape}
                photo={{ src: photo.url }}
                focusY={focusY}
                onFocusChange={setFocusY}
              />
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={focusY === null || saving}
            onClick={() => setFocusY(null)}
          >
            Centre
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setPhoto(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save framing"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { adjust, element };
}
