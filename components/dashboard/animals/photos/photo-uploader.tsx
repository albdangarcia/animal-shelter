"use client";

// The Photos tab's "Upload New Images": staff choose or drop photos, crop
// each one in a dialog (photo-crop-editor.tsx), and Save uploads the cropped
// square to POST /api/animal-photos. Only the crop is saved, never the
// original.
//
// Each photo is opened once when it is added, to check the browser can draw
// it (a HEIC photo outside Safari can't be cropped), to learn its size and to
// make a small thumbnail for the list, then let go. Only the photo being
// cropped is shown at full size, and it is opened again for the moment it is
// saved. A phone holds a dozen photos this way: the files, not a dozen
// decoded photos.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { initialCrop, type Crop } from "@/app/lib/utils/photo-crop";
import PhotoCropEditor from "./photo-crop-editor";
import { makeThumbnail, openPhoto } from "./crop-photo";
import { UNREADABLE_PHOTO_MESSAGE } from "./upload-errors";
import { saveCrop } from "./save-crop";

export const PHOTO_UPLOAD_ENDPOINT = "/api/animal-photos";
export const PHOTO_SAVED_MESSAGE = "Photo saved.";

/**
 * Where the uploader's messages show: not the page's usual bottom right,
 * which is where the dialog's Save button is.
 */
const TOAST_POSITION = "top-center" as const;

/**
 * What the file picker offers. Not `image/*`: an iPhone then hands over a
 * JPEG copy of a HEIC photo, which every browser can crop.
 */
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

interface PhotoUploaderProps {
  animalId: string;
  canManage: boolean;
}

interface BatchPhoto {
  id: string;
  file: File;
  /**
   * An object URL of the file, for the editor and its previews. Only the
   * photo being cropped is drawn from it, so only that one is decoded.
   */
  url: string;
  /** An object URL of a small thumbnail, for the list; null if none. */
  thumbnailUrl: string | null;
  width: number;
  height: number;
  crop: Crop;
  saved: boolean;
}

const UploadDisabledPlaceholder = () => {
  return (
    <div className="disabledUploader-root">
      <div className="disabledUploader-inner">
        <div className="disabledUploader-hint">
          <div className="disabledUploader-icon">
            <Lock size={22} strokeWidth={2} />
          </div>
          <span className="disabledUploader-title">Uploading is disabled</span>
          <span className="disabledUploader-subtext">
            You don&apos;t have permission to upload images
          </span>
        </div>
      </div>

      <style jsx>{`
        .disabledUploader-inner {
          position: relative;
          width: 100%;
          height: 250px;
          background-color: var(--muted);
          border-radius: 8px;
          overflow: hidden;
          cursor: not-allowed;
          background-image: repeating-linear-gradient(
            -45deg,
            var(--border) 0px,
            var(--border) 8px,
            var(--muted) 8px,
            var(--muted) 16px
          );
        }
        .disabledUploader-inner::before {
          content: "";
          position: absolute;
          inset: 8px;
          border: 2px dotted var(--border);
          border-radius: 5px;
          pointer-events: none;
        }
        .disabledUploader-hint {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          height: 100%;
          padding: 0 24px;
          text-align: center;
        }
        .disabledUploader-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background-color: var(--accent);
          color: var(--muted-foreground);
          margin-bottom: 6px;
        }
        .disabledUploader-title {
          color: var(--muted-foreground);
          font-size: 16px;
          font-weight: 600;
        }
        .disabledUploader-subtext {
          color: var(--muted-foreground);
          font-size: 13px;
          font-weight: 400;
          max-width: 320px;
        }
      `}</style>
    </div>
  );
};

/** Keys that belong to a focused control, not to the batch's shortcuts. */
const isControl = (target: EventTarget) =>
  target instanceof Element &&
  target.closest("button, input, textarea, select, a, [role='slider']") !==
    null;

let nextPhotoId = 0;

const revokeUrls = (photos: BatchPhoto[]) => {
  for (const photo of photos) {
    URL.revokeObjectURL(photo.url);
    if (photo.thumbnailUrl) URL.revokeObjectURL(photo.thumbnailUrl);
  }
};

/** A selector for the crop box, to give it the keyboard back after a save. */
const CROP_BOX = "[data-testid='crop-box']";

const PhotoUploader = ({ animalId, canManage }: PhotoUploaderProps) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [photos, setPhotos] = useState<BatchPhoto[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // What a save that finishes later reads, rather than the batch as it was
  // when Save was pressed.
  const latest = useRef({ photos, currentId });
  useEffect(() => {
    latest.current = { photos, currentId };
  });
  // Staff can leave the page (Back) in the middle of a batch, or while
  // photos are still being opened: addFiles then lets go of what it made.
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      revokeUrls(latest.current.photos);
    };
  }, []);

  const currentIndex = photos.findIndex((photo) => photo.id === currentId);
  const current = currentIndex >= 0 ? photos[currentIndex] : null;
  const unsaved = photos.filter((photo) => !photo.saved);

  if (!canManage) {
    return <UploadDisabledPlaceholder />;
  }

  const finish = () => {
    revokeUrls(photos);
    setPhotos([]);
    setCurrentId(null);
    setOpen(false);
    setConfirmingClose(false);
  };

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setOpening(true);
    const added: BatchPhoto[] = [];
    // One at a time: a decoded phone photo takes 50 to 100 MB.
    for (const file of files) {
      if (unmounted.current) break;
      const opened = await openPhoto(file);
      if (!opened) {
        toast.error(UNREADABLE_PHOTO_MESSAGE, {
          description: file.name,
          position: TOAST_POSITION,
        });
        continue;
      }
      const { width, height } = opened;
      const thumbnail = await makeThumbnail(opened);
      opened.release();
      added.push({
        id: `photo-${++nextPhotoId}`,
        file,
        url: URL.createObjectURL(file),
        thumbnailUrl: thumbnail ? URL.createObjectURL(thumbnail) : null,
        width,
        height,
        crop: initialCrop(width, height),
        saved: false,
      });
    }
    if (unmounted.current) {
      revokeUrls(added);
      return;
    }
    setOpening(false);
    if (added.length === 0) return;
    setPhotos((before) => [...before, ...added]);
    setCurrentId((id) => id ?? added[0].id);
    setOpen(true);
  };

  const setCrop = (crop: Crop) => {
    setPhotos((before) =>
      before.map((photo) => (photo.id === currentId ? { ...photo, crop } : photo)),
    );
  };

  const select = (index: number) => {
    const photo = photos[index];
    if (photo) setCurrentId(photo.id);
  };

  /** The first unsaved photo after `index`, going round, or none. */
  const nextUnsaved = (list: BatchPhoto[], index: number) => {
    for (let step = 1; step <= list.length; step++) {
      const photo = list[(index + step) % list.length];
      if (!photo.saved) return photo;
    }
    return null;
  };

  const remove = (id: string) => {
    const index = photos.findIndex((photo) => photo.id === id);
    const photo = photos[index];
    if (!photo || photo.saved) return;
    revokeUrls([photo]);
    const rest = photos.filter((other) => other.id !== id);
    if (rest.every((other) => other.saved)) {
      // Nothing left to crop.
      revokeUrls(rest);
      setPhotos([]);
      setCurrentId(null);
      setOpen(false);
      return;
    }
    setPhotos(rest);
    if (id === currentId) {
      setCurrentId(nextUnsaved(rest, index - 1)?.id ?? null);
    }
  };

  const save = async () => {
    const photo = current;
    if (!photo || photo.saved || saving) return;
    setSaving(true);
    try {
      const saved = await saveCrop(photo.file, photo.crop, PHOTO_UPLOAD_ENDPOINT, {
        animalId,
      });
      if (!saved.ok) {
        toast.error(saved.message, {
          description: photo.file.name,
          position: TOAST_POSITION,
        });
        return;
      }

      toast.success(PHOTO_SAVED_MESSAGE, {
        description: photo.file.name,
        position: TOAST_POSITION,
      });
      router.refresh();
      // The batch as it is now: staff may have moved on or changed another
      // crop while this one was uploading.
      const markSaved = (list: BatchPhoto[]) =>
        list.map((other) =>
          other.id === photo.id ? { ...other, saved: true } : other,
        );
      const now = markSaved(latest.current.photos);
      const next = nextUnsaved(
        now,
        now.findIndex((other) => other.id === photo.id),
      );
      if (next) {
        setPhotos(markSaved);
        // Move on only from the photo just saved, not from one staff picked
        // while it was uploading.
        if (latest.current.currentId === photo.id) setCurrentId(next.id);
      } else {
        revokeUrls(now);
        setPhotos([]);
        setCurrentId(null);
        setOpen(false);
      }
    } finally {
      setSaving(false);
      // The Save button was disabled while it had the keyboard, which drops
      // it on the page: hand it to the crop box, so the keys work again. A
      // photo that opens next takes it itself.
      requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        const active = document.activeElement;
        // On the page, or on the dialog's own panel (where a second click
        // on the disabled button puts it): neither moves the crop.
        if (dialog && (!dialog.contains(active) || active === dialog)) {
          dialog.querySelector<HTMLElement>(CROP_BOX)?.focus({
            preventScroll: true,
          });
        }
      });
    }
  };

  const onOpenChange = (wantsOpen: boolean) => {
    if (wantsOpen || saving) return;
    if (unsaved.length > 0) setConfirmingClose(true);
    else finish();
  };

  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isControl(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === "j") {
      event.preventDefault();
      select(currentIndex + 1);
    } else if (key === "k") {
      event.preventDefault();
      select(currentIndex - 1);
    } else if (event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      void save();
    }
  };

  const chooseFiles = () => inputRef.current?.click();

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        hidden
        aria-label="Photos to add"
        data-testid="photo-file-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Let the same file be chosen again later.
          event.target.value = "";
          void addFiles(files);
        }}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver && "border-primary bg-accent",
        )}
      >
        <ImagePlus className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {opening
            ? "Opening photos…"
            : "Drop photos here, or choose them. You'll crop each one before it's saved."}
        </p>
        <Button type="button" onClick={chooseFiles} disabled={opening}>
          Choose photos
        </Button>
        <p className="text-xs text-muted-foreground">JPEG, PNG or WebP</p>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          ref={dialogRef}
          onKeyDown={onDialogKeyDown}
          // Not the first button (the list), where J, K and Enter don't
          // work: the panel, until the crop box takes the keyboard when it
          // is drawn.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            dialogRef.current?.focus({ preventScroll: true });
          }}
          className="flex max-h-dvh flex-col gap-4 overflow-y-auto max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-h-[95dvh] sm:max-w-5xl"
        >
          <DialogHeader>
            <DialogTitle>Crop photos</DialogTitle>
            <DialogDescription>
              Move the square over the animal, then save. Only the square is
              saved.
              {photos.length > 1 &&
                ` Photo ${currentIndex + 1} of ${photos.length}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-4 md:grid-cols-[10rem_minmax(0,1fr)]">
            <ul
              aria-label="Photos to crop"
              className="flex gap-2 overflow-x-auto md:flex-col md:overflow-x-visible"
            >
              {photos.map((photo, index) => (
                <li key={photo.id} className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-current={photo.id === currentId}
                    onClick={() => select(index)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left text-xs text-muted-foreground hover:bg-accent",
                      photo.id === currentId && "bg-accent text-foreground",
                    )}
                  >
                    {photo.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local object URL
                      <img
                        src={photo.thumbnailUrl}
                        alt=""
                        className="size-9 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="size-9 shrink-0 rounded bg-muted" />
                    )}
                    <span className="max-w-24 truncate">{photo.file.name}</span>
                    {photo.saved && (
                      <Check
                        className="ml-auto size-4 shrink-0 text-primary"
                        aria-label="Saved"
                      />
                    )}
                  </button>
                  {!photo.saved && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Remove ${photo.file.name}`}
                      disabled={saving}
                      onClick={() => remove(photo.id)}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {current && (
              <PhotoCropEditor
                key={current.id}
                photo={{
                  src: current.url,
                  width: current.width,
                  height: current.height,
                }}
                crop={current.crop}
                onCropChange={setCrop}
                autoFocus
              />
            )}
          </div>

          <p className="hidden text-xs text-muted-foreground md:block">
            With the square selected: arrow keys move it (Shift moves further),
            + and − resize it. J and K go to the next and previous photo; Enter
            saves.
          </p>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={chooseFiles}
              disabled={opening || saving}
            >
              Add more photos
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={!current || current.saved || saving}
            >
              {saving ? "Saving…" : "Save photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingClose} onOpenChange={setConfirmingClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard the photos you haven&apos;t saved?</AlertDialogTitle>
            <AlertDialogDescription>
              {unsaved.length === 1
                ? "1 photo hasn't been saved. It won't be added to this animal."
                : `${unsaved.length} photos haven't been saved. They won't be added to this animal.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep cropping</AlertDialogCancel>
            <AlertDialogAction onClick={finish}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PhotoUploader;
