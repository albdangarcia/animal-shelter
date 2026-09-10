import { test } from "node:test";
import assert from "node:assert/strict";
import { FieldType } from "@/prisma/generated/enums";
import type { AssessmentTemplateFieldDef } from "./templates";
import {
  concerningFieldKeys,
  isConcerningAnswer,
  normalizeAnswerValue,
} from "./answers";

const field = (
  over: Partial<AssessmentTemplateFieldDef>,
): AssessmentTemplateFieldDef => ({
  key: "f",
  label: "F",
  fieldType: FieldType.SINGLE_SELECT,
  options: ["A", "B", "C"],
  concerningValues: ["C"],
  ...over,
});

test("normalizeAnswerValue: blank select → null", () => {
  assert.deepEqual(normalizeAnswerValue(field({}), ""), {
    value: null,
    valueNumber: null,
  });
  assert.deepEqual(normalizeAnswerValue(field({}), undefined), {
    value: null,
    valueNumber: null,
  });
});

test("normalizeAnswerValue: select value is snapshotted as a string", () => {
  assert.deepEqual(normalizeAnswerValue(field({}), "B"), {
    value: "B",
    valueNumber: null,
  });
});

test("normalizeAnswerValue: NUMBER fills the parallel numeric column", () => {
  const n = field({ fieldType: FieldType.NUMBER, options: undefined });
  assert.deepEqual(normalizeAnswerValue(n, 3200), {
    value: "3200",
    valueNumber: 3200,
  });
  assert.deepEqual(normalizeAnswerValue(n, null), {
    value: null,
    valueNumber: null,
  });
});

test("normalizeAnswerValue: text is trimmed, empty → null", () => {
  const t = field({ fieldType: FieldType.LONG_TEXT, options: undefined });
  assert.equal(normalizeAnswerValue(t, "  hi  ").value, "hi");
  assert.equal(normalizeAnswerValue(t, "   ").value, null);
});

test("normalizeAnswerValue: multi-select joins picks, empty → null", () => {
  const m = field({
    fieldType: FieldType.MULTI_SELECT,
    options: ["X", "Y", "Z"],
  });
  assert.equal(normalizeAnswerValue(m, ["X", "Z"]).value, "X, Z");
  assert.equal(normalizeAnswerValue(m, []).value, null);
});

test("isConcerningAnswer: only a concerning value trips", () => {
  assert.equal(isConcerningAnswer(field({}), "A"), false);
  assert.equal(isConcerningAnswer(field({}), "C"), true);
  assert.equal(isConcerningAnswer(field({}), ""), false);
});

test("isConcerningAnswer: a field with no concerning values never trips", () => {
  assert.equal(
    isConcerningAnswer(field({ concerningValues: [] }), "C"),
    false,
  );
});

test("concerningFieldKeys collects every flagged field", () => {
  const fields = [
    field({ key: "a", concerningValues: ["C"] }),
    field({ key: "b", concerningValues: ["C"] }),
    field({ key: "c", concerningValues: [] }),
  ];
  const keys = concerningFieldKeys(fields, {
    a: { value: "C" },
    b: { value: "A" },
    c: { value: "C" },
  });
  assert.deepEqual(keys, ["a"]);
});
