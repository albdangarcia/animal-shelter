import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay, type ShelterClock } from "@/app/lib/utils/shelter-day";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import type { MedicalDuePlace } from "./medical-due-groups";
import {
  doseSheetRows,
  doseSheetSections,
  type DoseSheetDose,
  type DoseSheetOrder,
} from "./medication-sheet";

const DAY = calendarDay("2026-10-15");
const ENDS: DoseSlotEnds = { AM: "10:00", MIDDAY: "14:00", PM: "20:00" };
const clockAt = (time: string): ShelterClock => ({ day: DAY, time });

const medWing: MedicalDuePlace = {
  type: "UNIT",
  locationId: "loc-med",
  locationName: "Medical wing",
  unitId: "unit-med-1",
  unitName: "MED-1",
};
const catRoom: MedicalDuePlace = {
  type: "UNIT",
  locationId: "loc-cat",
  locationName: "Cat room",
  unitId: "unit-c-1",
  unitName: "C-1",
};
const foster: MedicalDuePlace = {
  type: "FOSTER",
  fosterPersonId: "person-sam",
  fosterName: "Sam Rivera",
};
const notHoused: MedicalDuePlace = { type: "NOT_HOUSED" };

let doseCount = 0;
const dose = (overrides: Partial<DoseSheetDose> = {}): DoseSheetDose => ({
  id: `dose-${++doseCount}`,
  slot: "AM",
  result: "GIVEN",
  reason: null,
  administeredAt: new Date("2026-10-15T12:12:00Z"),
  administeredById: "olivia",
  administeredByName: "Olivia Chen",
  notes: null,
  ...overrides,
});

const sheetOrder = (
  id: string,
  animalName: string,
  place: MedicalDuePlace,
  overrides: Partial<DoseSheetOrder> & { itemName?: string; frequency?: DoseSheetOrder["order"]["frequency"] } = {},
): DoseSheetOrder => {
  const { itemName = "Doxycycline", frequency = "BID", ...rest } = overrides;
  return {
    order: {
      id,
      itemName,
      doseAmount: 100,
      doseUnit: "MG",
      route: "ORAL",
      frequency,
      intervalDays: null,
      instructions: null,
    },
    animal: {
      id: `animal-${animalName}`,
      name: animalName,
      species: "Dog",
      sex: "MALE",
      primaryColor: "Brown",
      birthDate: "2024-01-01",
    },
    place,
    slots: frequency === "PRN" ? [] : ["AM", "PM"],
    doses: [],
    ...rest,
  };
};

test("doseSheetSections: AM, Midday, PM and As needed, leaving out empty sections", () => {
  const sections = doseSheetSections(
    [
      sheetOrder("o-prn", "Rusty", notHoused, { itemName: "Gabapentin", frequency: "PRN" }),
      sheetOrder("o-bid", "Fido", medWing),
    ],
    DAY,
    clockAt("09:00"),
    ENDS,
  );
  assert.deepEqual(
    sections.map((section) => [section.key, section.title]),
    [
      ["AM", "AM"],
      ["PM", "PM"],
      ["PRN", "As needed"],
    ],
  );
  const tid = doseSheetSections(
    [sheetOrder("o-tid", "Daisy", medWing, { frequency: "TID", slots: ["AM", "MIDDAY", "PM"] })],
    DAY,
    clockAt("09:00"),
    ENDS,
  );
  assert.deepEqual(
    tid.map((section) => section.title),
    ["AM", "Midday", "PM"],
  );
});

test("doseSheetSections: groups by place, units by location name, then fosters, then not housed", () => {
  const [am] = doseSheetSections(
    [
      sheetOrder("o-1", "Rusty", notHoused),
      sheetOrder("o-2", "Juniper", foster),
      sheetOrder("o-3", "Fido", medWing),
      sheetOrder("o-4", "Whiskers", catRoom),
    ],
    DAY,
    clockAt("09:00"),
    ENDS,
  );
  assert.deepEqual(
    am.groups.map((group) => [group.key, group.type, group.title]),
    [
      ["location:loc-cat", "UNIT", "Cat room"],
      ["location:loc-med", "UNIT", "Medical wing"],
      ["foster:person-sam", "FOSTER", "Sam Rivera"],
      ["not-housed", "NOT_HOUSED", "Not housed"],
    ],
  );
});

test("doseSheetSections: within a group, rows by animal, then medication", () => {
  const [am] = doseSheetSections(
    [
      sheetOrder("o-1", "Fido", medWing, { itemName: "Prednisolone" }),
      sheetOrder("o-2", "Daisy", medWing, { itemName: "Metronidazole" }),
      sheetOrder("o-3", "Fido", medWing, { itemName: "Doxycycline" }),
    ],
    DAY,
    clockAt("09:00"),
    ENDS,
  );
  assert.deepEqual(
    am.groups[0].rows.map((row) => [row.key, row.animal.name, row.order.itemName]),
    [
      ["o-2:AM", "Daisy", "Metronidazole"],
      ["o-3:AM", "Fido", "Doxycycline"],
      ["o-1:AM", "Fido", "Prednisolone"],
    ],
  );
});

test("doseSheetRows: a slot's state from its live dose, else missed once ended and due until then", () => {
  const given = dose({ slot: "AM" });
  const refused = dose({ slot: "MIDDAY", result: "REFUSED" });
  const order = sheetOrder("o-tid", "Daisy", medWing, {
    frequency: "TID",
    slots: ["AM", "MIDDAY", "PM"],
    doses: [given, refused],
  });
  const at = (time: string) =>
    doseSheetRows(order, DAY, clockAt(time), ENDS).map((row) => [row.slot, row.state, row.dose?.id ?? null]);
  assert.deepEqual(at("09:00"), [
    ["AM", "GIVEN", given.id],
    ["MIDDAY", "REFUSED", refused.id],
    ["PM", "DUE", null],
  ]);
  // At PM's end time it has ended: missed.
  assert.deepEqual(at("20:00")[2], ["PM", "MISSED", null]);
  assert.deepEqual(at("19:59")[2], ["PM", "DUE", null]);

  const notGiven = dose({ slot: "PM", result: "NOT_GIVEN", reason: "Out of stock" });
  const [pm] = doseSheetRows(
    { ...order, slots: ["PM"], doses: [notGiven] },
    DAY,
    clockAt("21:00"),
    ENDS,
  );
  assert.equal(pm.state, "NOT_GIVEN");
  assert.deepEqual(pm.doses, [notGiven]);

  // A day already over: every slot without a dose is missed.
  const yesterday = doseSheetRows(order, calendarDay("2026-10-14"), clockAt("08:00"), ENDS);
  assert.equal(yesterday[2].state, "MISSED");
});

test("doseSheetRows: an as-needed order is one row with every dose of the day, and no state", () => {
  const doses = [dose({ slot: null }), dose({ slot: null, result: "REFUSED" })];
  const rows = doseSheetRows(
    sheetOrder("o-prn", "Rusty", notHoused, { itemName: "Gabapentin", frequency: "PRN", doses }),
    DAY,
    clockAt("23:00"),
    ENDS,
  );
  assert.deepEqual(
    rows.map((row) => ({ key: row.key, slot: row.slot, state: row.state, dose: row.dose, doses: row.doses })),
    [{ key: "o-prn:PRN", slot: null, state: null, dose: null, doses }],
  );
});
