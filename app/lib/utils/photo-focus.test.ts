import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOCUS_INVALID_MESSAGE,
  clampFocus,
  describeFocus,
  focusAfterDrag,
  focusPosition,
  parseFocusY,
} from "./photo-focus";

test("a photo with no focus is left centred", () => {
  assert.equal(focusPosition(null), undefined);
  assert.equal(focusPosition(undefined), undefined);
});

test("a focus is the vertical object-position", () => {
  assert.equal(focusPosition(0), "50% 0%");
  assert.equal(focusPosition(0.5), "50% 50%");
  assert.equal(focusPosition(1), "50% 100%");
  assert.equal(focusPosition(0.123), "50% 12.3%");
  // Out of range can't reach a row (the column has a check), but a page
  // never draws it outside the photo anyway.
  assert.equal(focusPosition(1.4), "50% 100%");
});

test("a focus is kept to 0..1 and three places", () => {
  assert.equal(clampFocus(-0.2), 0);
  assert.equal(clampFocus(1.2), 1);
  assert.equal(clampFocus(0.33333), 0.333);
});

test("dragging the photo down shows more of its top", () => {
  // A 200 × 100 frame over a square drawn 200 high: 100 to move through.
  assert.equal(focusAfterDrag(0.5, 25, 200, 100), 0.25);
  assert.equal(focusAfterDrag(0.5, -25, 200, 100), 0.75);
  // From centred (null), and past the edges.
  assert.equal(focusAfterDrag(null, 10, 200, 100), 0.4);
  assert.equal(focusAfterDrag(0.1, 500, 200, 100), 0);
  assert.equal(focusAfterDrag(0.9, -500, 200, 100), 1);
});

test("a square frame has nothing to drag", () => {
  assert.equal(focusAfterDrag(0.3, 40, 100, 100), 0.3);
  assert.equal(focusAfterDrag(null, 40, 100, 100), null);
});

test("a focus reads as words", () => {
  assert.equal(describeFocus(null), "Centred");
  assert.equal(describeFocus(0), "Top");
  assert.equal(describeFocus(1), "Bottom");
  assert.equal(describeFocus(0.32), "32% from the top");
  // As the slider's value reads it (a whole percent): a drag can stop a hair
  // from either end.
  assert.equal(describeFocus(0.004), "Top");
  assert.equal(describeFocus(0.996), "Bottom");
});

test("a focus from a form", () => {
  assert.deepEqual(parseFocusY(null), { focusY: null });
  assert.deepEqual(parseFocusY(""), { focusY: null });
  assert.deepEqual(parseFocusY("0"), { focusY: 0 });
  assert.deepEqual(parseFocusY("1"), { focusY: 1 });
  assert.deepEqual(parseFocusY("0.25"), { focusY: 0.25 });
  assert.deepEqual(parseFocusY("0.12345"), { focusY: 0.123 });
});

test("a focus out of range, or not a number, is refused", () => {
  for (const value of ["1.2", "-0.1", "abc", "1e-1", "NaN", "Infinity", "0.5.5", "."]) {
    assert.deepEqual(parseFocusY(value), { error: FOCUS_INVALID_MESSAGE }, value);
  }
  assert.deepEqual(parseFocusY(new File([], "x")), { error: FOCUS_INVALID_MESSAGE });
});
