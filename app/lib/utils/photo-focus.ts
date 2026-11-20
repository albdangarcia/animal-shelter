// Where a photo sits in a frame wider than it: its "focus", a fraction from 0
// (the top of the photo shows) to 1 (the bottom shows), stored as
// `AnimalImage.focusY`. Null is centred, as `object-cover` is on its own.
//
// It is the vertical CSS `object-position`, not a point to centre on: the
// photo's line at `focusY` is put on the frame's line at `focusY`, so that line
// is in frame however wide the frame is, and what staff see in one preview is
// what every wide frame shows. Photos are square, so square and round frames
// show the whole photo and ignore it.

/** How far one arrow key moves the focus. */
export const FOCUS_STEP = 0.05;

/** A focus kept to 0..1 and rounded to three places, as it is stored. */
export function clampFocus(focusY: number): number {
  return Math.round(Math.min(1, Math.max(0, focusY)) * 1000) / 1000;
}

/**
 * The `object-position` for a photo with this focus, or undefined to leave a
 * centred photo to the stylesheet.
 */
export function focusPosition(focusY: number | null | undefined): string | undefined {
  if (focusY === null || focusY === undefined) return undefined;
  return `50% ${Math.round(clampFocus(focusY) * 1000) / 10}%`;
}

/**
 * The focus after dragging a photo `dy` pixels down in a frame `frameWidth` ×
 * `frameHeight` that it covers. Dragging down shows more of the top. A frame
 * the square photo fits exactly has nothing to move, so the focus stays.
 */
export function focusAfterDrag(
  start: number | null,
  dy: number,
  frameWidth: number,
  frameHeight: number,
): number | null {
  const overflow = Math.max(frameWidth, frameHeight) - frameHeight;
  if (overflow <= 0) return start;
  return clampFocus((start ?? 0.5) - dy / overflow);
}

/**
 * How a focus reads to a screen reader: in whole percents, as the slider's
 * `aria-valuenow` has it, so a focus a hair from the top reads "Top".
 */
export function describeFocus(focusY: number | null): string {
  if (focusY === null) return "Centred";
  const percent = Math.round(focusY * 100);
  if (percent === 0) return "Top";
  if (percent === 100) return "Bottom";
  return `${percent}% from the top`;
}

export const FOCUS_INVALID_MESSAGE =
  "The photo's framing wasn't understood. Reload the page and try again.";

/**
 * A focus sent in a form: missing or empty is centred (null); a number from 0
 * to 1 is kept, rounded to three places; anything else is refused.
 */
export function parseFocusY(
  value: FormDataEntryValue | null | undefined,
): { focusY: number | null } | { error: string } {
  if (value === null || value === undefined || value === "") return { focusY: null };
  if (typeof value !== "string" || !/^\s*[0-9.]+\s*$/.test(value)) {
    return { error: FOCUS_INVALID_MESSAGE };
  }
  const focusY = Number(value);
  if (!Number.isFinite(focusY) || focusY < 0 || focusY > 1) {
    return { error: FOCUS_INVALID_MESSAGE };
  }
  return { focusY: clampFocus(focusY) };
}
