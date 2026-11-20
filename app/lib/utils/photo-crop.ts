// The square crop staff draw over a photo before it is saved, as numbers.
//
// The Photos tab's crop editor (components/dashboard/animals/photos/
// photo-crop-editor.tsx) keeps a Crop in the photo's own pixels, whatever
// size the photo is shown at, and moves and resizes it through these
// functions. No DOM here, so the rules are unit-tested.

/** A square inside the photo: its top-left corner and side, in photo pixels. */
export type Crop = { x: number; y: number; size: number };

/** The smallest crop staff can draw, unless the photo itself is smaller. */
export const MIN_CROP_SIZE = 200;

/** The side of a saved photo. A smaller crop keeps its size: never enlarged. */
export const CROP_OUTPUT_SIZE = 1200;

/** How much of the photo's short side a new crop covers, centred. */
const INITIAL_CROP_SHARE = 0.9;

/** The smallest side a crop of this photo may have. */
export function minCropSize(width: number, height: number): number {
  return Math.min(MIN_CROP_SIZE, width, height);
}

/** The biggest side a crop of this photo may have: its short side. */
export function maxCropSize(width: number, height: number): number {
  return Math.min(width, height);
}

/** `crop` moved and sized to fit inside the photo, in whole pixels. */
export function clampCrop(crop: Crop, width: number, height: number): Crop {
  const size = Math.round(
    Math.min(
      maxCropSize(width, height),
      Math.max(minCropSize(width, height), crop.size),
    ),
  );
  return {
    size,
    x: Math.round(Math.min(width - size, Math.max(0, crop.x))),
    y: Math.round(Math.min(height - size, Math.max(0, crop.y))),
  };
}

/** The crop a photo starts with: 90% of its short side, in the middle. */
export function initialCrop(width: number, height: number): Crop {
  const size = Math.round(
    Math.max(
      minCropSize(width, height),
      maxCropSize(width, height) * INITIAL_CROP_SHARE,
    ),
  );
  return clampCrop(
    { size, x: (width - size) / 2, y: (height - size) / 2 },
    width,
    height,
  );
}

/** `crop` moved by `dx`, `dy` photo pixels, stopping at the photo's edges. */
export function moveCrop(
  crop: Crop,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Crop {
  return clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }, width, height);
}

/**
 * `crop` at a new side, about the same centre: the slider, the scroll wheel
 * and the `+`/`-` keys. Near an edge the centre gives way so the crop stays
 * inside the photo.
 */
export function resizeCrop(
  crop: Crop,
  size: number,
  width: number,
  height: number,
): Crop {
  const fitted = clampCrop({ ...crop, size }, width, height).size;
  const centreX = crop.x + crop.size / 2;
  const centreY = crop.y + crop.size / 2;
  return clampCrop(
    { size: fitted, x: centreX - fitted / 2, y: centreY - fitted / 2 },
    width,
    height,
  );
}

/**
 * `crop` at a new side with its top-left corner kept: dragging the corner
 * handle. It grows only as far as the photo's right and bottom edges.
 */
export function resizeFromCorner(
  crop: Crop,
  size: number,
  width: number,
  height: number,
): Crop {
  const room = Math.min(width - crop.x, height - crop.y);
  const limited = Math.min(size, room);
  return clampCrop({ ...crop, size: limited }, width, height);
}

/**
 * How far one arrow key press moves the crop: 1% of the photo's short side,
 * 10% with Shift, so a step looks the same on a small photo and a big one.
 */
export function nudgeStep(
  width: number,
  height: number,
  large: boolean,
): number {
  const short = Math.min(width, height);
  return Math.max(1, Math.round(short * (large ? 0.1 : 0.01)));
}

/**
 * How much one `+`/`-` press changes the crop's side: 4% of it, at least 8
 * pixels. Not bigger with Shift: on many keyboards `+` is typed with Shift.
 */
export function resizeStep(size: number): number {
  return Math.max(8, Math.round(size * 0.04));
}

/**
 * The crop's side after a turn of the scroll wheel or a trackpad swipe of
 * `deltaY` pixels: in proportion to how far it scrolled, so a trackpad's
 * stream of small events resizes smoothly, not in a jump each. Scrolling
 * down (positive) makes the crop bigger, as the crop tool did.
 */
export function wheelResize(size: number, deltaY: number): number {
  return size * Math.exp(deltaY * 0.002);
}

/**
 * The zoom slider's value for a crop of `size`: 0 is the biggest crop the
 * photo allows, 100 the smallest. Mapped, not stepped in pixels, so both
 * ends are always reachable whatever the photo's size.
 */
export function zoomFromSize(size: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((max - size) / (max - min)) * 100;
}

/** The crop side for a zoom slider value: the reverse of zoomFromSize. */
export function sizeFromZoom(zoom: number, min: number, max: number): number {
  return max - (zoom / 100) * (max - min);
}

/** The side, in pixels, of the photo saved from `crop`. */
export function cropOutputSize(crop: Crop): number {
  return Math.min(CROP_OUTPUT_SIZE, crop.size);
}

/**
 * How to draw a preview of the saved photo in a `frameWidth` ×
 * `frameHeight` frame, as the site shows it there (`object-cover`: the
 * square scaled to fill the frame, the overflow cut off), from the whole
 * photo: the size to draw the photo at and where its top-left corner goes,
 * relative to the frame. Used as a CSS background, so a preview follows the
 * crop without drawing anything.
 *
 * Side to side the square is centred; top to bottom it sits at `focusY`, as
 * `object-position` puts it (null is centred: see `photo-focus.ts`).
 */
export function previewLayout(
  crop: Crop,
  photoWidth: number,
  photoHeight: number,
  frameWidth: number,
  frameHeight: number,
  focusY: number | null = null,
): { width: number; height: number; left: number; top: number } {
  const side = Math.max(frameWidth, frameHeight);
  const scale = side / crop.size;
  return {
    width: photoWidth * scale,
    height: photoHeight * scale,
    left: (frameWidth - side) / 2 - crop.x * scale,
    top: (frameHeight - side) * (focusY ?? 0.5) - crop.y * scale,
  };
}
