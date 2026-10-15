import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldErrorsByPath } from "./form-result-utils";

test("fieldErrorsByPath: keys each message by its whole path", () => {
  assert.deepEqual(
    fieldErrorsByPath([
      { path: ["name"], message: "Name is required." },
      { path: ["steps", 2, "itemId"], message: "Pick the item." },
      { path: ["steps", 2, "itemId"], message: "Another." },
      { path: ["steps"], message: "A protocol needs at least one step." },
    ]),
    {
      name: ["Name is required."],
      "steps.2.itemId": ["Pick the item.", "Another."],
      steps: ["A protocol needs at least one step."],
    },
  );
});

test("fieldErrorsByPath: an issue on the whole form has no field", () => {
  assert.deepEqual(fieldErrorsByPath([{ path: [], message: "Invalid." }]), {});
});
