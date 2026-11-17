"use client";

// The square crop staff draw over a photo, ported from the crop tool the
// seed photos were made with. It takes a photo and a crop and reports the
// crop as staff change it; it knows nothing about uploading, so the Photos
// tab's uploader (photo-uploader.tsx) and a later "replace this photo" both
// use it.
//
// Drag the square to move it, drag its corner to resize it (the top-left
// stays put), or use the zoom slider or the scroll wheel (both keep the
// centre). With the square focused: arrow keys move it (Shift for bigger
// steps), + and - resize it. The previews beside it show the saved photo in
// each shape the site shows photos in, cut as `object-cover` cuts it.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  maxCropSize,
  minCropSize,
  moveCrop,
  nudgeStep,
  previewLayout,
  resizeCrop,
  resizeFromCorner,
  resizeStep,
  sizeFromZoom,
  wheelResize,
  zoomFromSize,
  type Crop,
} from "@/app/lib/utils/photo-crop";

/** A photo to crop: a URL the page can show, and its size in pixels. */
export interface CropPhoto {
  src: string;
  width: number;
  height: number;
}

interface PhotoCropEditorProps {
  photo: CropPhoto;
  crop: Crop;
  onCropChange: (crop: Crop) => void;
  /**
   * Puts the keyboard on the crop box as soon as it is drawn, so the arrow
   * keys work without clicking it first.
   */
  autoFocus?: boolean;
}

/**
 * The shapes a photo is shown in, at a small size: the frame's own shape
 * matters, not its size. Each is what `object-cover` does to the square.
 */
const PREVIEWS = [
  // components/public-pages/home/spotlight-hero.tsx
  { label: "Home page", width: 88, height: 88, className: "rounded-full" },
  // components/public-pages/pets/pet-card.tsx: 280 × 210
  { label: "Listing", width: 112, height: 84, className: "rounded-lg" },
  // components/public-pages/pets/pet-gallery.tsx: full width × 300 (h-75)
  { label: "Animal's page", width: 154, height: 88, className: "rounded-lg" },
  // Thumbnails, the Photos tab, the dashboard card
  { label: "Square", width: 72, height: 72, className: "rounded-md" },
] as const;

type Drag = {
  pointerId: number;
  mode: "move" | "corner";
  pointerX: number;
  pointerY: number;
  start: Crop;
};

export default function PhotoCropEditor({
  photo,
  crop,
  onCropChange,
  autoFocus = false,
}: PhotoCropEditorProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // The photo's width on screen, so the box can be drawn over it.
  const [shownWidth, setShownWidth] = useState(0);
  const scale = shownWidth / photo.width;

  const { width, height } = photo;
  const minSize = minCropSize(width, height);
  const maxSize = maxCropSize(width, height);

  // The wheel listener is added once, outside React (it must not be
  // passive, to stop the page scrolling), so it reads the latest props here.
  const latest = useRef({ crop, onCropChange, width, height });
  useEffect(() => {
    latest.current = { crop, onCropChange, width, height };
  });

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const measure = () => setShownWidth(image.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    return () => observer.disconnect();
  }, []);

  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!autoFocus || scale <= 0 || focusedOnce.current) return;
    focusedOnce.current = true;
    boxRef.current?.focus({ preventScroll: true });
  }, [autoFocus, scale]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // A sideways swipe on a trackpad: nothing to resize.
      if (event.deltaY === 0) return;
      const { crop, onCropChange, width, height } = latest.current;
      // Lines or pages, from some mice: about 16 pixels a line.
      const pixels =
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
          ? event.deltaY
          : event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 400);
      const size = wheelResize(crop.size, pixels);
      const next = resizeCrop(crop, size, width, height);
      // A trackpad sends many events between renders: the next one builds
      // on this one, not on the crop of the last render.
      latest.current = { ...latest.current, crop: next };
      onCropChange(next);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A second finger while one is dragging would restart the drag from
    // where it touched, and the box would jump.
    if (event.button !== 0 || dragRef.current) return;
    const onHandle = (event.target as Element).closest("[data-crop-handle]");
    dragRef.current = {
      pointerId: event.pointerId,
      mode: onHandle ? "corner" : "move",
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: crop,
    };
    try {
      // Keeps the drag going when the pointer leaves the box or the photo.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the drag still works inside.
    }
    event.preventDefault();
    // preventDefault stops the box taking focus, and the keys need it.
    boxRef.current?.focus();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !scale) return;
    // The button was let go without a pointerup reaching the box.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      dragRef.current = null;
      return;
    }
    const dx = (event.clientX - drag.pointerX) / scale;
    const dy = (event.clientY - drag.pointerY) / scale;
    onCropChange(
      drag.mode === "corner"
        ? resizeFromCorner(
            drag.start,
            drag.start.size + Math.max(dx, dy),
            width,
            height,
          )
        : moveCrop(drag.start, dx, dy, width, height),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = nudgeStep(width, height, event.shiftKey);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      onCropChange(moveCrop(crop, move[0], move[1], width, height));
      return;
    }
    // By the character typed, with or without Shift: `+` needs Shift on
    // many keyboards, so Shift doesn't change the step here.
    const grow = resizeStep(crop.size);
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      onCropChange(resizeCrop(crop, crop.size + grow, width, height));
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      onCropChange(resizeCrop(crop, crop.size - grow, width, height));
    }
  };

  const boxStyle: CSSProperties = {
    left: crop.x * scale,
    top: crop.y * scale,
    width: crop.size * scale,
    height: crop.size * scale,
  };

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-3">
        <div
          ref={stageRef}
          data-testid="crop-stage"
          className="relative mx-auto w-fit max-w-full touch-none overflow-hidden rounded-md bg-muted leading-none select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, drawn at its own size for the crop box */}
          <img
            ref={imageRef}
            src={photo.src}
            alt=""
            draggable={false}
            onLoad={(event) => setShownWidth(event.currentTarget.clientWidth)}
            className="block max-h-[45dvh] max-w-full md:max-h-[60dvh]"
          />
          {scale > 0 && (
            <div
              ref={boxRef}
              role="group"
              aria-roledescription="crop area"
              aria-label="Crop. Drag it, or use the arrow keys, to move it. Press plus or minus to resize it."
              tabIndex={0}
              data-testid="crop-box"
              data-crop={`${crop.x},${crop.y},${crop.size}`}
              style={boxStyle}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onKeyDown={onKeyDown}
              className="absolute cursor-grab shadow-[0_0_0_9999px_rgb(0_0_0/0.6)] outline-2 outline-white focus:outline-3 focus:outline-dashed active:cursor-grabbing"
            >
              {/* The corner handle: drawn 16px, touched across 44px. */}
              <div
                data-crop-handle
                aria-hidden="true"
                className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-sm border border-black/30 bg-white before:absolute before:-inset-3.5 before:content-['']"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 px-1">
          <span className="text-sm text-muted-foreground" aria-hidden="true">
            Zoom
          </span>
          <Slider
            aria-label="Zoom"
            // 0 is the biggest crop, 100 the smallest: right zooms in.
            value={[Math.round(zoomFromSize(crop.size, minSize, maxSize))]}
            min={0}
            max={100}
            step={1}
            disabled={minSize >= maxSize}
            onValueChange={([zoom]) => {
              let next = resizeCrop(
                crop,
                sizeFromZoom(zoom, minSize, maxSize),
                width,
                height,
              );
              // On a photo whose short side is under about 250px, a step of
              // the slider is less than half a pixel and rounds back to the
              // same crop: move a whole pixel the way the slider went.
              if (next.size === crop.size) {
                const shown = Math.round(zoomFromSize(crop.size, minSize, maxSize));
                if (zoom !== shown) {
                  const step = zoom > shown ? -1 : 1;
                  next = resizeCrop(crop, crop.size + step, width, height);
                }
              }
              onCropChange(next);
            }}
            className="max-w-72"
          />
        </div>
      </div>

      <div className="flex flex-wrap content-start items-end gap-3 md:w-44 md:flex-col md:items-start">
        <p className="w-full text-sm font-medium">How it will look</p>
        {PREVIEWS.map((preview) => {
          const layout = previewLayout(
            crop,
            width,
            height,
            preview.width,
            preview.height,
          );
          return (
            <figure key={preview.label} className="flex flex-col gap-1">
              <div
                role="img"
                aria-label={`Preview: ${preview.label}`}
                data-testid={`crop-preview-${preview.label}`}
                className={cn("bg-muted bg-no-repeat", preview.className)}
                style={{
                  width: preview.width,
                  height: preview.height,
                  backgroundImage: `url("${photo.src}")`,
                  backgroundSize: `${layout.width}px ${layout.height}px`,
                  backgroundPosition: `${layout.left}px ${layout.top}px`,
                }}
              />
              <figcaption className="text-xs text-muted-foreground">
                {preview.label}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
