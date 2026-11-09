import { test } from "node:test";
import assert from "node:assert/strict";
import { switchItem } from "./medical-item-fills";

type Fills = {
  doseAmount: number | null;
  doseUnit: string | null;
  results: { analyteId: string; result: string }[];
};

const recorded: Fills = { doseAmount: 3, doseUnit: "ML", results: [] };
const defaultsB: Fills = { doseAmount: 7, doseUnit: "MG", results: [] };

test("switchItem: an item picked for the first time takes what it fills in", () => {
  const drafts = new Map<string, Fills>();
  assert.deepEqual(switchItem(drafts, recorded, "a", "b", defaultsB), defaultsB);
  assert.deepEqual(drafts.get("a"), recorded);
});

test("switchItem: coming back to an item puts back what it held, even a value equal to another item's default", () => {
  const drafts = new Map<string, Fills>();
  // 3 corrected to 7, which happens to be b's default.
  const corrected = { ...recorded, doseAmount: 7 };
  const onB = switchItem(drafts, corrected, "a", "b", defaultsB);
  assert.deepEqual(switchItem(drafts, onB, "b", "a", recorded), corrected);
});

test("switchItem: each item keeps its own changes, results included", () => {
  const drafts = new Map<string, Fills>();
  const testA: Fills = {
    doseAmount: null,
    doseUnit: null,
    results: [{ analyteId: "felv", result: "POSITIVE" }],
  };
  const testB: Fills = {
    doseAmount: null,
    doseUnit: null,
    results: [{ analyteId: "hw", result: "" }],
  };
  const onB = switchItem(drafts, testA, "a", "b", testB);
  const changedB = {
    ...onB,
    results: [{ analyteId: "hw", result: "NEGATIVE" }],
  };
  assert.deepEqual(switchItem(drafts, changedB, "b", "a", testB), testA);
  assert.deepEqual(switchItem(drafts, testA, "a", "b", testB), changedB);
});

test("switchItem: the first pick keeps what was typed and fills the rest", () => {
  const drafts = new Map<string, Fills>();
  assert.deepEqual(
    switchItem(
      drafts,
      { doseAmount: 5, doseUnit: "", results: [] },
      "",
      "b",
      { ...defaultsB, results: [{ analyteId: "hw", result: "" }] },
    ),
    { doseAmount: 5, doseUnit: "MG", results: [{ analyteId: "hw", result: "" }] },
  );
  assert.equal(drafts.size, 0);
});
