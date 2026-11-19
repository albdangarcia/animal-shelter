"use client";

// One preview of a photo in a shape the site shows it in, drawn as a CSS
// background (no canvas, so a saved photo on another host needs no CORS).
// While cropping it shows the square that will be saved from the photo; for
// a saved photo, the photo as it is.
// Used by the crop editor for each shape, and by the "Adjust framing" dialog
// for the two wide ones.
//
// A frame wider than tall cuts the square's top and bottom. Given
// `onFocusChange`, such a preview can be dragged up or down, or moved with the
// arrow keys, to choose which part stays in frame (the photo's `focusY`; see
// app/lib/utils/photo-focus.ts). Square and round frames show the whole
// square and ignore it.

import { useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { previewLayout, type Crop } from "@/app/lib/utils/photo-crop";
import {
  FOCUS_STEP,
  clampFocus,
  describeFocus,
  focusAfterDrag,
} from "@/app/lib/utils/photo-focus";

export interface PreviewShape {
  label: string;
  width: number;
  height: number;
  className: string;
}

/**
 * The shapes a photo is shown in, at a small size: the frame's own shape
 * matters, not its size. Each is what `object-cover` does to the square.
 */
export const PREVIEW_SHAPES = {
  // components/public-pages/home/spotlight-hero.tsx
  home: { label: "Home page", width: 88, height: 88, className: "rounded-full" },
  // components/public-pages/pets/pet-card.tsx: 280 × 210 on a desktop
  listing: { label: "Listing", width: 112, height: 84, className: "rounded-lg" },
  // components/public-pages/pets/pet-gallery.tsx: full width × 300 (h-75).
  // Its widest is about 704 × 300, on a tablet (one column below 1024px), so
  // the preview has that shape: what it keeps, every width keeps.
  page: { label: "Animal's page", width: 176, height: 75, className: "rounded-lg" },
  // Thumbnails, the Photos tab, the dashboard card
  square: { label: "Square", width: 72, height: 72, className: "rounded-md" },
} satisfies Record<string, PreviewShape>;

type PhotoPreviewProps = {
  shape: PreviewShape;
  focusY: number | null;
  /** Makes a wide preview adjustable. */
  onFocusChange?: (focusY: number | null) => void;
} & (
  | {
      /** A photo being cropped, and the square that will be saved from it. */
      photo: { src: string; width: number; height: number };
      crop: Crop;
    }
  | {
      /** A saved photo: drawn as the pages draw it, whatever its shape. */
      photo: { src: string };
      crop?: undefined;
    }
);

type Drag = { pointerId: number; startY: number; startFocus: number | null };

export default function PhotoPreview({
  shape,
  photo,
  crop,
  focusY,
  onFocusChange,
}: PhotoPreviewProps) {
  const dragRef = useRef<Drag | null>(null);
  const wide = shape.width > shape.height;
  const adjustable = wide && onFocusChange !== undefined;
  let size: string;
  let position: string;
  if (crop && "width" in photo) {
    const layout = previewLayout(
      crop,
      photo.width,
      photo.height,
      shape.width,
      shape.height,
      focusY,
    );
    size = `${layout.width}px ${layout.height}px`;
    position = `${layout.left}px ${layout.top}px`;
  } else {
    // `cover` and a percentage do for a background what `object-cover` and
    // `object-position` do on the pages.
    size = "cover";
    position = `50% ${(focusY ?? 0.5) * 100}%`;
  }
  const style: CSSProperties = {
    width: shape.width,
    height: shape.height,
    backgroundImage: `url("${photo.src}")`,
    backgroundSize: size,
    backgroundPosition: position,
  };
  const testId = `crop-preview-${shape.label}`;
  const frameClass = cn("bg-muted bg-no-repeat", shape.className);

  if (!adjustable) {
    return (
      <figure className="flex flex-col gap-1">
        <div
          role="img"
          aria-label={`Preview: ${shape.label}`}
          data-testid={testId}
          className={frameClass}
          style={style}
        />
        <figcaption className="text-xs text-muted-foreground">
          {shape.label}
        </figcaption>
      </figure>
    );
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startFocus: focusY,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the drag still works inside.
    }
    event.preventDefault();
    event.currentTarget.focus();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      dragRef.current = null;
      return;
    }
    onFocusChange(
      focusAfterDrag(
        drag.startFocus,
        event.clientY - drag.startY,
        shape.width,
        shape.height,
      ),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const now = focusY ?? 0.5;
    // Up moves the photo up, so more of its bottom shows, as dragging it up
    // does; Home and End go to the top and the bottom.
    const next: Record<string, number> = {
      ArrowUp: now + FOCUS_STEP,
      ArrowRight: now + FOCUS_STEP,
      ArrowDown: now - FOCUS_STEP,
      ArrowLeft: now - FOCUS_STEP,
      Home: 0,
      End: 1,
    };
    if (event.key in next) {
      event.preventDefault();
      onFocusChange(clampFocus(next[event.key]));
    }
  };

  return (
    <figure className="flex flex-col gap-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Framing: ${shape.label}`}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((focusY ?? 0.5) * 100)}
        aria-valuetext={describeFocus(focusY)}
        data-testid={testId}
        className={cn(
          frameClass,
          "cursor-grab touch-none outline-offset-2 select-none focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing",
        )}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      />
      <figcaption className="text-xs text-muted-foreground">
        {shape.label}
      </figcaption>
    </figure>
  );
}
