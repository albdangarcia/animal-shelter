import { test } from "node:test";
import assert from "node:assert/strict";
import { MedicalEntrySource } from "@/prisma/generated/enums";
import { haveFormValuesChanged } from "@/hooks/use-confirmed-open-change";
import {
  nextDoseItem,
  withoutInactiveNextDose,
  type NextDoseCandidate,
  type NextDoseState,
} from "./medical-next-dose";

const dhpp: NextDoseCandidate = {
  id: "dhpp",
  repeatIntervalDays: 14,
  scheduledEntryIds: [],
};
const lepto: NextDoseCandidate = {
  id: "lepto",
  repeatIntervalDays: null,
  scheduledEntryIds: [],
};
const given: NextDoseState = {
  itemId: "dhpp",
  source: MedicalEntrySource.IN_HOUSE,
  completedDate: "2026-10-11",
  dateUnknown: false,
};
const inCare = { inCare: true, items: [dhpp, lepto] };

test("nextDoseItem: offered for a repeating item given on a known day", () => {
  assert.equal(nextDoseItem(given, inCare, undefined), dhpp);
  assert.equal(
    nextDoseItem({ ...given, source: MedicalEntrySource.OUTSIDE_VET }, inCare, undefined),
    dhpp,
  );
});

test("nextDoseItem: not offered once the animal has left care", () => {
  assert.equal(nextDoseItem(given, { ...inCare, inCare: false }, undefined), null);
});

test("nextDoseItem: not offered for an item that doesn't repeat, or can't be picked", () => {
  assert.equal(nextDoseItem({ ...given, itemId: "lepto" }, inCare, undefined), null);
  // Retired, or narrowed to other species, since the care was scheduled.
  assert.equal(nextDoseItem({ ...given, itemId: "retired" }, inCare, undefined), null);
  assert.equal(nextDoseItem({ ...given, itemId: "" }, inCare, undefined), null);
});

test("nextDoseItem: not offered for care before intake, or with no day given", () => {
  assert.equal(
    nextDoseItem({ ...given, source: MedicalEntrySource.BEFORE_INTAKE }, inCare, undefined),
    null,
  );
  assert.equal(
    nextDoseItem({ ...given, completedDate: null, dateUnknown: true }, inCare, undefined),
    null,
  );
  assert.equal(nextDoseItem({ ...given, completedDate: null }, inCare, undefined), null);
});

test("nextDoseItem: an open entry for the item hides it, unless it is the one being recorded", () => {
  const scheduled = { ...inCare, items: [{ ...dhpp, scheduledEntryIds: ["e1"] }] };
  assert.equal(nextDoseItem(given, scheduled, undefined), null);
  assert.equal(nextDoseItem(given, scheduled, "e1")?.id, "dhpp");
  const two = { ...inCare, items: [{ ...dhpp, scheduledEntryIds: ["e1", "e2"] }] };
  assert.equal(nextDoseItem(given, two, "e1"), null);
});

const state = (overrides: Partial<{ itemId: string; scheduleNextOn: boolean; dueDate: string | null }> = {}) => ({
  itemId: overrides.itemId ?? "lepto",
  scheduleNextOn: overrides.scheduleNextOn ?? true,
  scheduleNext: { dueDate: overrides.dueDate ?? null },
});

const changed = (
  current: ReturnType<typeof state>,
  initial: ReturnType<typeof state>,
  offered: (s: ReturnType<typeof state>) => boolean,
) =>
  haveFormValuesChanged(
    withoutInactiveNextDose(current, offered(current)),
    withoutInactiveNextDose(initial, offered(initial)),
  );

test("withoutInactiveNextDose: a day suggested for an item since left behind is no change", () => {
  // Lepto doesn't repeat; picking DHPP suggested a day, and picking Lepto
  // again left it in the hidden field.
  const offered = (s: ReturnType<typeof state>) => s.itemId === "dhpp";
  assert.equal(
    changed(state({ dueDate: "2026-10-25" }), state(), offered),
    false,
  );
});

test("withoutInactiveNextDose: while offered, unticking or picking another day is a change", () => {
  const offered = () => true;
  const initial = state({ itemId: "dhpp", dueDate: "2026-10-25" });
  assert.equal(changed(initial, initial, offered), false);
  assert.equal(
    changed({ ...initial, scheduleNextOn: false }, initial, offered),
    true,
  );
  assert.equal(
    changed(state({ itemId: "dhpp", dueDate: "2026-11-01" }), initial, offered),
    true,
  );
});

test("withoutInactiveNextDose: an unticked box's day is no change", () => {
  const offered = () => true;
  assert.equal(
    changed(
      state({ itemId: "dhpp", scheduleNextOn: false, dueDate: "2026-11-01" }),
      state({ itemId: "dhpp", scheduleNextOn: false, dueDate: "2026-10-25" }),
      offered,
    ),
    false,
  );
});
