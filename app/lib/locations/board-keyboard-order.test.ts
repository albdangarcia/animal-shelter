import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextDropTarget,
  type BoardDirection,
  type BoardTarget,
} from "./board-keyboard-order";

// A board in the wide layout: location A has five tiles, three a row, so the
// fifth wraps; location B, below it after its heading, has three. The
// Unplaced tray is a column to the right, as tall as its contents.
//
//   A1 A2 A3   TRAY
//   A4 A5      TRAY
//
//   B1 B2 B3
const TILE = { width: 200, height: 100 };
const column = (n: number) => n * 212;
const tile = (id: string, col: number, top: number): BoardTarget<string> => ({
  id,
  left: column(col),
  top,
  ...TILE,
});

const ROW_A1 = 0;
const ROW_A2 = 112;
const ROW_B1 = 264;

const tiles = [
  tile("A1", 0, ROW_A1),
  tile("A2", 1, ROW_A1),
  tile("A3", 2, ROW_A1),
  tile("A4", 0, ROW_A2),
  tile("A5", 1, ROW_A2),
  tile("B1", 0, ROW_B1),
  tile("B2", 1, ROW_B1),
  tile("B3", 2, ROW_B1),
];

const wideTray: BoardTarget<string> = {
  id: "TRAY",
  left: 660,
  top: 0,
  width: 320,
  height: 150,
};
const wide = [...tiles, wideTray];

// The narrow layout puts the tray below the board, the full width.
const narrowTray: BoardTarget<string> = {
  id: "TRAY",
  left: 0,
  top: 400,
  width: 636,
  height: 150,
};
const narrow = [...tiles, narrowTray];

const from = (
  id: string,
  direction: BoardDirection,
  board: BoardTarget<string>[] = wide,
) => {
  const current = board.find((target) => target.id === id);
  assert.ok(current, `no target ${id}`);
  return nextDropTarget(direction, current, board, "TRAY");
};

test("Right walks along the row", () => {
  assert.equal(from("A1", "right"), "A2");
  assert.equal(from("A2", "right"), "A3");
  assert.equal(from("A4", "right"), "A5");
  assert.equal(from("B1", "right"), "B2");
});

test("Left walks back along the row and stops at its start", () => {
  assert.equal(from("A3", "left"), "A2");
  assert.equal(from("A2", "left"), "A1");
  assert.equal(from("A1", "left"), null);
  assert.equal(from("A4", "left"), null);
  assert.equal(from("B1", "left"), null);
});

test("Left and Right never return the target the chip is over", () => {
  for (const target of wide) {
    for (const direction of ["left", "right", "up", "down"] as const) {
      assert.notEqual(from(target.id, direction), target.id);
    }
  }
});

test("Right from the end of a row goes to the tray in the wide layout", () => {
  assert.equal(from("A3", "right"), "TRAY");
  assert.equal(from("A5", "right"), "TRAY");
  // B's row is below the tray, which still is the column to the right.
  assert.equal(from("B3", "right"), "TRAY");
});

test("Left from the tray goes to the nearest tile beside it", () => {
  assert.equal(from("TRAY", "left"), "A3");
});

test("Right from the end of a row stops in the narrow layout", () => {
  assert.equal(from("A3", "right", narrow), null);
  assert.equal(from("B3", "right", narrow), null);
});

test("Down picks the tile below in the same column", () => {
  assert.equal(from("A1", "down"), "A4");
  assert.equal(from("A2", "down"), "A5");
});

test("Down from a column the next row lacks picks the nearest tile in it", () => {
  assert.equal(from("A3", "down"), "A5");
});

test("Down from a location's last row goes to the next location's first row", () => {
  assert.equal(from("A4", "down"), "B1");
  assert.equal(from("A5", "down"), "B2");
});

test("Down from the last location reaches the tray only in the narrow layout", () => {
  assert.equal(from("B2", "down"), null);
  assert.equal(from("B2", "down", narrow), "TRAY");
});

test("Up from a location's top row goes to the previous location, or nowhere", () => {
  assert.equal(from("A1", "up"), null);
  assert.equal(from("A3", "up"), null);
  assert.equal(from("B1", "up"), "A4");
  assert.equal(from("B3", "up"), "A5");
});

test("Up picks the tile above in the same column", () => {
  assert.equal(from("A4", "up"), "A1");
  assert.equal(from("A5", "up"), "A2");
});

test("Up and Down skip the tray beside the rows in the wide layout", () => {
  assert.equal(from("TRAY", "up"), null);
  assert.equal(from("TRAY", "down"), "B3");
});

test("Up from the tray goes to the last location in the narrow layout", () => {
  assert.equal(from("TRAY", "up", narrow), "B2");
});

// A tray holding one or two animals ends partway down the board, between
// two rows, beside the tiles rather than above any of them.
const shortTray = (height: number) => [...tiles, { ...wideTray, height }];

test("Up never goes to a short tray beside the rows", () => {
  assert.equal(from("A4", "up", shortTray(108)), "A1");
  assert.equal(from("B1", "up", shortTray(240)), "A4");
  assert.equal(from("B3", "up", shortTray(240)), "A5");
});

test("Down never goes to a short tray beside the rows", () => {
  assert.equal(from("A3", "down", shortTray(60)), "A5");
  assert.equal(from("B2", "down", shortTray(60)), null);
});

test("Left from a long tray goes to the row level with its top", () => {
  const longTray = [...tiles, { ...wideTray, height: 600 }];
  assert.equal(from("TRAY", "left", longTray), "A3");
});
