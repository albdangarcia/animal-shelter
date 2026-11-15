import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftsLine,
  fosterToAdoptLine,
  inCareLine,
  spaceLine,
  summariseUnits,
} from "./headcounts";

test("units are summed, and each is full, over capacity or neither, as on the board", () => {
  const summary = summariseUnits([
    { capacity: 2, occupants: 0 }, // empty
    { capacity: 3, occupants: 1 }, // has space
    { capacity: 1, occupants: 1 }, // at capacity
    { capacity: 2, occupants: 2 }, // at capacity
    { capacity: 1, occupants: 3 }, // over capacity, not also full
  ]);
  assert.deepEqual(summary, {
    units: 5,
    occupied: 7,
    capacity: 9,
    full: 2,
    over: 1,
  });
});

test("no units sum to nothing", () => {
  assert.deepEqual(summariseUnits([]), {
    units: 0,
    occupied: 0,
    capacity: 0,
    full: 0,
    over: 0,
  });
});

test("an empty unit of no capacity is not full", () => {
  assert.equal(summariseUnits([{ capacity: 0, occupants: 0 }]).full, 0);
});

test("In care's sub-line names all three places, zeros included", () => {
  assert.equal(inCareLine(32, 5, 2), "32 on site · 5 in foster · 2 not housed");
  assert.equal(inCareLine(0, 0, 0), "0 on site · 0 in foster · 0 not housed");
});

test("Available's sub-line counts the drafts", () => {
  assert.equal(draftsLine(0), "No drafts waiting to be published");
  assert.equal(draftsLine(1), "1 draft not yet published");
  assert.equal(draftsLine(4), "4 drafts not yet published");
});

test("Pending adoption's sub-line counts the foster-to-adopt placements", () => {
  assert.equal(fosterToAdoptLine(0), "None in a foster-to-adopt placement");
  assert.equal(fosterToAdoptLine(1), "1 in a foster-to-adopt placement");
  assert.equal(fosterToAdoptLine(3), "3 in a foster-to-adopt placement");
});

test("Space's sub-line counts full and over-capacity units, leaving out a zero", () => {
  const units = (full: number, over: number) => ({
    units: 10,
    occupied: 0,
    capacity: 0,
    full,
    over,
  });
  assert.equal(spaceLine(units(3, 1)), "3 units full · 1 over capacity");
  assert.equal(spaceLine(units(1, 0)), "1 unit full");
  assert.equal(spaceLine(units(0, 2)), "2 over capacity");
  assert.equal(spaceLine(units(0, 0)), "Every unit has space");
  assert.equal(
    spaceLine({ units: 0, occupied: 0, capacity: 0, full: 0, over: 0 }),
    "No units set up",
  );
});
