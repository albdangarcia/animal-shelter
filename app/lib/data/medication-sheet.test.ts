import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay, type ShelterClock } from "@/app/lib/utils/shelter-day";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import type { MedicalDuePlace } from "./medical-due-groups";
import {
  doseSheetCell,
  doseSheetDay,
  doseSheetRows,
  doseSheetSections,
  doseSheetView,
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
  reportedByFoster: false,
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
    runs: true,
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

test("doseSheetDay: today by default, back seven days, never ahead; anything else shows today", () => {
  const today = DAY;
  const earliest = calendarDay("2026-10-08");
  assert.deepEqual(doseSheetDay(undefined, today), { day: today, earliest, refused: false });
  assert.deepEqual(doseSheetDay("", today), { day: today, earliest, refused: false });
  assert.deepEqual(doseSheetDay("2026-10-14", today), {
    day: calendarDay("2026-10-14"),
    earliest,
    refused: false,
  });
  // Seven days back is the last day shown; eight is refused.
  assert.deepEqual(doseSheetDay("2026-10-08", today), { day: earliest, earliest, refused: false });
  assert.deepEqual(doseSheetDay("2026-10-07", today), { day: today, earliest, refused: true });
  assert.deepEqual(doseSheetDay("2026-10-15", today), { day: today, earliest, refused: false });
  assert.deepEqual(doseSheetDay("2026-10-16", today), { day: today, earliest, refused: true });
  for (const junk of ["yesterday", "2026-10-32", "2026-1-14", "2026-10-1"]) {
    assert.deepEqual(doseSheetDay(junk, today), { day: today, earliest, refused: true }, junk);
  }
  // Given twice, the first counts.
  assert.deepEqual(doseSheetDay(["2026-10-13", "2026-10-01"], today).day, "2026-10-13");
});

test("doseSheetCell: a slot takes a dose until one is recorded, an as-needed order while it runs", () => {
  const given = dose({ slot: "AM", administeredAt: new Date("2026-10-15T12:12:00Z") });
  const order = sheetOrder("o-bid", "Fido", medWing, { doses: [given] });
  const [am, pm] = doseSheetRows(order, DAY, clockAt("21:00"), ENDS);
  const amCell = doseSheetCell(am, true, DAY, DAY, "America/New_York");
  assert.deepEqual(amCell, {
    key: `o-bid:${DAY}:AM`,
    orderId: "o-bid",
    slotDate: DAY,
    slot: "AM",
    expected: true,
    state: "GIVEN",
    doses: [
      {
        id: given.id,
        result: "GIVEN",
        reason: null,
        notes: null,
        // On the shelter's clock, not UTC's.
        givenAt: "8:12 AM",
        givenBy: "Olivia Chen",
        voided: false,
        voidedBy: null,
        voidReason: null,
      },
    ],
    voidedDoses: [],
    recordable: false,
    label: "Doxycycline, AM dose on Oct 15, 2026",
  });
  const pmCell = doseSheetCell(pm, true, DAY, DAY, "America/New_York");
  const [fosterAm] = doseSheetRows(
    sheetOrder("foster-order", "Fido", medWing, { doses: [dose({ reportedByFoster: true })] }),
    DAY, clockAt("21:00"), ENDS,
  );
  assert.equal(doseSheetCell(fosterAm, true, DAY, DAY, "America/New_York").doses[0].givenBy, "Olivia Chen (foster)");
  assert.equal(pmCell.state, "MISSED");
  assert.equal(pmCell.recordable, true);
  // A slot holding a dose of an order discontinued from that day is no
  // longer expected.
  assert.equal(doseSheetCell(am, false, DAY, DAY, "America/New_York").expected, false);

  // A dose given late, on a later day, names that day.
  const yesterday = calendarDay("2026-10-14");
  const [lateAm] = doseSheetRows(order, yesterday, clockAt("21:00"), ENDS);
  assert.equal(
    doseSheetCell(lateAm, true, yesterday, DAY, "America/New_York").doses[0].givenAt,
    "Oct 15, 2026, 8:12 AM",
  );

  const [prn] = doseSheetRows(
    sheetOrder("o-prn", "Rusty", notHoused, { itemName: "Gabapentin", frequency: "PRN" }),
    DAY,
    clockAt("21:00"),
    ENDS,
  );
  const running = doseSheetCell(prn, true, DAY, DAY, "America/New_York");
  assert.equal(running.recordable, true);
  assert.equal(running.expected, false);
  assert.equal(running.label, "Gabapentin, as-needed dose on Oct 15, 2026");
  assert.equal(doseSheetCell(prn, false, DAY, DAY, "America/New_York").recordable, false);
  // Never a day ahead of today.
  assert.equal(doseSheetCell(pm, true, DAY, yesterday, "America/New_York").recordable, false);
});

test("doseSheetView: the sections, each row with its cell, read off whether its order runs", () => {
  const stopped = sheetOrder("o-stopped", "Rusty", notHoused, {
    itemName: "Gabapentin",
    frequency: "PRN",
    runs: false,
    doses: [dose({ slot: null })],
  });
  const running = sheetOrder("o-running", "Rusty", notHoused, {
    itemName: "Gabapentin",
    frequency: "PRN",
  });
  const sections = doseSheetView(
    [sheetOrder("o-bid", "Fido", medWing), stopped, running],
    DAY,
    { today: DAY, clock: clockAt("09:00") },
    ENDS,
    "America/New_York",
  );
  assert.deepEqual(
    sections.flatMap((section) =>
      section.groups.flatMap((group) =>
        group.rows.map((row) => [row.key, row.cell.key, row.cell.state, row.cell.recordable]),
      ),
    ),
    [
      ["o-bid:AM", `o-bid:${DAY}:AM`, "DUE", true],
      ["o-bid:PM", `o-bid:${DAY}:PM`, "DUE", true],
      // Each as-needed order by whether it runs: the one running takes a
      // dose, the one stopped doesn't.
      ["o-running:PRN", `o-running:${DAY}:PRN`, null, true],
      ["o-stopped:PRN", `o-stopped:${DAY}:PRN`, null, false],
    ],
  );
});
