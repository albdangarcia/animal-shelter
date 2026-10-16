import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { slotOrderOf, type DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import type { AnimalMedicationDose, AnimalMedicationOrder } from "./medication";
import {
  doseCounts,
  medicationsView,
  orderDays,
  orderSummary,
  todaysDoses,
  type MedicationViewContext,
} from "./medication-view";

const TODAY = calendarDay("2026-10-15");
const ENDS: DoseSlotEnds = { AM: "10:00", MIDDAY: "14:00", PM: "20:00" };
const day = (value: string) => calendarDay(value);

const context = (time = "12:00"): MedicationViewContext => ({
  today: TODAY,
  clock: { day: TODAY, time },
  ends: ENDS,
  timezone: "America/New_York",
  names: { olivia: "Olivia Chen", benjamin: "Benjamin Carter" },
});

let doseCount = 0;
const dose = (
  slotDate: string,
  slot: AnimalMedicationDose["slot"],
  overrides: Partial<AnimalMedicationDose> = {},
): AnimalMedicationDose => ({
  id: `dose-${++doseCount}`,
  slotDate: day(slotDate),
  slot,
  result: "GIVEN",
  reason: null,
  // 8:12 AM in New York on the slot's day.
  administeredAt: new Date(`${slotDate}T12:12:00Z`),
  administeredById: "olivia",
  notes: null,
  batchId: null,
  voided: false,
  voidedAt: null,
  voidedById: null,
  voidReason: null,
  createdById: "olivia",
  createdAt: new Date(`${slotDate}T12:12:00Z`),
  ...overrides,
});

const order = (
  overrides: Partial<Omit<AnimalMedicationOrder, "slotOrder">> = {},
): AnimalMedicationOrder => {
  const row = {
    id: "order-1",
    itemId: "doxy",
    itemName: "Doxycycline",
    doseAmount: 100,
    doseUnit: "MG" as const,
    route: "ORAL" as const,
    frequency: "BID" as const,
    intervalDays: null,
    startDate: day("2026-10-12"),
    firstSlot: "AM" as const,
    endDate: day("2026-11-10"),
    instructions: null,
    prescribedBy: null,
    discontinuedDate: null,
    discontinueReason: null,
    discontinuedById: null,
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    createdById: "olivia",
    createdAt: new Date("2026-10-12T12:00:00Z"),
    events: [],
    doses: [],
    ...overrides,
  };
  return { ...row, slotOrder: slotOrderOf(row) };
};

const states = (days: ReturnType<typeof orderDays>) =>
  days.map(({ day: d, slots }) => [d, slots.map((slot) => `${slot.slot}:${slot.state}`)]);

test("an order's line and state read as the pages show them", () => {
  const active = orderSummary(order(), TODAY);
  assert.equal(active.state, "ACTIVE");
  assert.equal(active.stateText, "Active");
  assert.equal(active.line, "Doxycycline · 100 mg oral · twice a day · Oct 12, 2026 to Nov 10, 2026");
  assert.equal(
    orderSummary(order({ endDate: null }), TODAY).line,
    "Doxycycline · 100 mg oral · twice a day · from Oct 12, 2026",
  );
  assert.equal(
    orderSummary(order({ startDate: day("2026-10-20"), endDate: day("2026-10-20") }), TODAY).line,
    "Doxycycline · 100 mg oral · twice a day · on Oct 20, 2026",
  );
  assert.equal(
    orderSummary(order({ startDate: day("2026-10-20") }), TODAY).stateText,
    "Starts Oct 20, 2026",
  );
  assert.equal(orderSummary(order({ endDate: day("2026-10-14") }), TODAY).stateText, "Ended Oct 14, 2026");
  assert.equal(
    orderSummary(order({ discontinuedDate: day("2026-10-14") }), TODAY).stateText,
    "Discontinued from Oct 14, 2026",
  );
  assert.equal(
    orderSummary(order({ voidedAt: new Date(), discontinuedDate: day("2026-10-14") }), TODAY)
      .stateText,
    "Voided",
  );
});

test("a slotted order's days: every slot of the frequency, with its state, newest first", () => {
  const given = dose("2026-10-13", "AM");
  const late = dose("2026-10-13", "PM", {
    // Given at 8:12 AM the next morning.
    administeredAt: new Date("2026-10-14T12:12:00Z"),
  });
  const refused = dose("2026-10-14", "AM", { result: "REFUSED", reason: "Spat it out" });
  const voided = dose("2026-10-12", "PM", {
    voided: true,
    voidedAt: new Date(),
    voidedById: "benjamin",
    voidReason: "Wrong day",
  });
  const days = orderDays(
    order({ firstSlot: "PM", doses: [given, late, refused, voided] }),
    day("2026-10-11"),
    TODAY,
    context("12:00"),
  );
  assert.deepEqual(states(days), [
    // Today at noon: AM's window has ended, PM's hasn't.
    ["2026-10-15", ["AM:MISSED", "PM:DUE"]],
    ["2026-10-14", ["AM:REFUSED", "PM:MISSED"]],
    ["2026-10-13", ["AM:GIVEN", "PM:GIVEN"]],
    // The start day's AM came before the first slot.
    ["2026-10-12", ["AM:null", "PM:MISSED"]],
  ]);
  const [todays, , thirteenth, start] = days;
  assert.deepEqual(todays.slots.map((slot) => slot.recordable), [true, true]);
  assert.equal(todays.slots[0].label, "Doxycycline, AM dose on Oct 15, 2026");
  assert.equal(todays.slots[0].key, "order-1:2026-10-15:AM");
  assert.deepEqual(
    thirteenth.slots.map((slot) => [slot.doses[0].givenAt, slot.doses[0].givenBy, slot.recordable]),
    [
      ["8:12 AM", "Olivia Chen", false],
      // Given on another day than the slot's, so the day is named.
      ["Oct 14, 2026, 8:12 AM", "Olivia Chen", false],
    ],
  );
  assert.equal(days[1].slots[0].doses[0].reason, "Spat it out");
  // A voided dose is kept beside the slot, which takes a dose again.
  assert.deepEqual(
    [start.slots[0].expected, start.slots[0].state, start.slots[0].recordable],
    [false, null, false],
  );
  assert.deepEqual(start.slots[1].doses, []);
  assert.deepEqual(
    start.slots[1].voidedDoses.map((d) => [d.voided, d.voidedBy, d.voidReason]),
    [[true, "Benjamin Carter", "Wrong day"]],
  );
  assert.equal(start.slots[1].recordable, true);
});

test("days before the start, after the end, between due days and after today aren't listed", () => {
  const everyThird = order({
    frequency: "EVERY_N_DAYS",
    intervalDays: 3,
    startDate: day("2026-10-06"),
    endDate: day("2026-10-14"),
  });
  assert.deepEqual(states(orderDays(everyThird, day("2026-10-01"), TODAY, context())), [
    ["2026-10-12", ["AM:MISSED"]],
    ["2026-10-09", ["AM:MISSED"]],
    ["2026-10-06", ["AM:MISSED"]],
  ]);
  // Nothing at all when the range is before the start.
  assert.deepEqual(orderDays(everyThird, day("2026-10-01"), day("2026-10-05"), context()), []);
  assert.deepEqual(orderDays(order(), TODAY, day("2026-10-14"), context()), []);
  // A day after today is due, but takes no dose yet.
  const [tomorrow] = orderDays(order(), day("2026-10-16"), day("2026-10-16"), context());
  assert.deepEqual(
    tomorrow.slots.map((slot) => [slot.state, slot.recordable]),
    [
      ["DUE", false],
      ["DUE", false],
    ],
  );
});

test("a dose kept on a day the order no longer expects still shows, with nothing to record", () => {
  // Discontinued from today, after this morning's dose.
  const stopped = order({
    discontinuedDate: TODAY,
    doses: [dose("2026-10-15", "AM")],
  });
  const [todays] = orderDays(stopped, TODAY, TODAY, context("21:00"));
  assert.deepEqual(
    todays.slots.map((slot) => [slot.slot, slot.expected, slot.state, slot.recordable]),
    [
      ["AM", false, "GIVEN", false],
      ["PM", false, null, false],
    ],
  );
  // A voided order expects nothing, so its slots take no dose.
  assert.deepEqual(
    orderDays(order({ voidedAt: new Date() }), day("2026-10-12"), TODAY, context()),
    [],
  );
});

test("an as-needed order lists its doses by day, and with idle days every day it runs", () => {
  const prn = order({
    id: "order-prn",
    itemName: "Gabapentin",
    frequency: "PRN",
    firstSlot: null,
    startDate: day("2026-10-12"),
    endDate: null,
    discontinuedDate: day("2026-10-15"),
    doses: [
      dose("2026-10-13", null),
      dose("2026-10-13", null, { result: "REFUSED", administeredAt: new Date("2026-10-13T22:00:00Z") }),
    ],
  });
  const withDoses = orderDays(prn, day("2026-10-10"), TODAY, context());
  assert.deepEqual(
    withDoses.map(({ day: d, slots }) => [d, slots[0].slot, slots[0].state, slots[0].doses.length]),
    [["2026-10-13", null, null, 2]],
  );
  assert.equal(withDoses[0].slots[0].label, "Gabapentin, as-needed dose on Oct 13, 2026");
  assert.equal(withDoses[0].slots[0].key, "order-prn:2026-10-13:PRN");
  // It ran from Oct 12 until it was discontinued from today.
  assert.deepEqual(
    orderDays(prn, day("2026-10-10"), TODAY, context(), { idleDays: true }).map(
      ({ day: d, slots }) => [d, slots[0].recordable],
    ),
    [
      ["2026-10-14", true],
      ["2026-10-13", true],
      ["2026-10-12", true],
    ],
  );
});

test("an order's doses are counted by result, with the slots missed", () => {
  const days = orderDays(
    order({
      doses: [
        dose("2026-10-12", "AM"),
        dose("2026-10-12", "PM", { result: "REFUSED" }),
        dose("2026-10-13", "AM", { result: "NOT_GIVEN", reason: "Out of stock" }),
        dose("2026-10-13", "PM", { voided: true, voidedAt: new Date() }),
        dose("2026-10-14", "AM"),
      ],
    }),
    day("2026-10-12"),
    TODAY,
    context("09:00"),
  );
  // Missed: Oct 13 PM (its dose voided) and Oct 14 PM; today's are still due.
  assert.deepEqual(doseCounts(days), { given: 2, refused: 1, notGiven: 1, missed: 2 });
});

test("the page splits current from past orders, and its sheet holds the days before today", () => {
  const active = order({ id: "active", startDate: day("2026-09-01"), endDate: null });
  const upcoming = order({ id: "upcoming", startDate: day("2026-10-20") });
  const ended = order({
    id: "ended",
    startDate: day("2026-09-20"),
    endDate: day("2026-09-25"),
    doses: [dose("2026-09-20", "AM")],
  });
  const recentlyStopped = order({
    id: "stopped",
    startDate: day("2026-10-01"),
    discontinuedDate: day("2026-10-10"),
  });
  const voided = order({ id: "voided", voidedAt: new Date(), doses: [dose("2026-10-12", "AM")] });
  const view = medicationsView(
    { orders: [upcoming, active, recentlyStopped, voided, ended], names: {} },
    context(),
  );
  assert.deepEqual([view.sheetFrom, view.sheetTo], ["2026-10-08", "2026-10-14"]);
  assert.deepEqual(view.current.map((v) => v.order.id), ["upcoming", "active"]);
  assert.deepEqual(view.past.map((v) => v.order.id), ["stopped", "voided", "ended"]);
  assert.deepEqual(view.sheet.map((v) => v.order.id), ["active", "stopped"]);

  // Today's slots are the active order's own; the sheet is the week before.
  const activeView = view.current[1];
  assert.deepEqual(activeView.today.map((slot) => slot.slotDate), [TODAY, TODAY]);
  assert.deepEqual(
    activeView.sheet.map(({ day: d }) => d),
    ["2026-10-14", "2026-10-13", "2026-10-12", "2026-10-11", "2026-10-10", "2026-10-09", "2026-10-08"],
  );
  // Its run reads today and the sheet's days only: they have controls above.
  assert.deepEqual(
    activeView.run.slice(0, 9).map(({ day: d, elsewhere }) => [d, elsewhere]),
    [
      ["2026-10-15", true],
      ["2026-10-14", true],
      ["2026-10-13", true],
      ["2026-10-12", true],
      ["2026-10-11", true],
      ["2026-10-10", true],
      ["2026-10-09", true],
      ["2026-10-08", true],
      ["2026-10-07", false],
    ],
  );
  // Upcoming: nothing today, nothing on the sheet.
  assert.deepEqual([view.current[0].today, view.current[0].sheet], [[], []]);
  // The discontinued order's last day was Oct 9.
  assert.deepEqual(view.sheet[1].sheet.map(({ day: d }) => d), ["2026-10-09", "2026-10-08"]);
  // A past order keeps its whole run and its counts.
  const endedView = view.past[2];
  assert.equal(endedView.run.length, 6);
  assert.ok(endedView.run.every((d) => !d.elsewhere));
  assert.deepEqual(endedView.counts, { given: 1, refused: 0, notGiven: 0, missed: 11 });
  // A voided order's dose stays on its run, though it expects nothing and
  // counts for nothing; it isn't on the sheet, so the run is where it shows.
  assert.equal(view.past[1].counts, null);
  assert.deepEqual(view.past[1].run.map((d) => [d.day, d.elsewhere]), [["2026-10-12", false]]);
  // Discontinued from today with this morning's dose: today is in its run
  // only, so its controls are there.
  const stoppedToday = medicationsView(
    { orders: [order({ discontinuedDate: TODAY, doses: [dose("2026-10-15", "AM")] })], names: {} },
    context(),
  ).past[0];
  assert.deepEqual(stoppedToday.today, []);
  assert.deepEqual([stoppedToday.run[0].day, stoppedToday.run[0].elsewhere], [TODAY, false]);
});

test("today's doses show when an order expects a slot today or one as needed is active", () => {
  const upcoming = order({ id: "upcoming", startDate: day("2026-10-20") });
  const ended = order({ id: "ended", endDate: day("2026-10-14") });
  assert.equal(todaysDoses({ orders: [upcoming, ended], names: {} }, context()), null);

  // Discontinued from today with this morning's dose: listed, but on its own
  // it doesn't show the section.
  const stopped = order({ id: "stopped", discontinuedDate: TODAY, doses: [dose("2026-10-15", "AM")] });
  assert.equal(todaysDoses({ orders: [stopped], names: {} }, context()), null);

  const prn = order({ id: "prn", frequency: "PRN", firstSlot: null, endDate: null });
  const rows = todaysDoses({ orders: [stopped, prn], names: {} }, context());
  assert.deepEqual(
    rows?.map(({ summary, slots }) => [summary.order.id, slots.map((slot) => slot.slot)]),
    [
      ["stopped", ["AM", "PM"]],
      ["prn", [null]],
    ],
  );

  const daily = todaysDoses({ orders: [order()], names: {} }, context("09:00"));
  assert.deepEqual(daily?.[0].slots.map((slot) => [slot.slot, slot.state]), [
    ["AM", "DUE"],
    ["PM", "DUE"],
  ]);
});

test("a dose voided before the start was corrected stays on the order's run", () => {
  // Given on Sep 21, voided, then the start corrected to Oct 12.
  const corrected = order({
    startDate: day("2026-10-12"),
    doses: [
      dose("2026-09-21", "AM", {
        voided: true,
        voidedAt: new Date(),
        voidedById: "benjamin",
        voidReason: "Started on the wrong day",
      }),
    ],
  });
  const [view] = medicationsView({ orders: [corrected], names: {} }, context()).current;
  const kept = view.run.at(-1)!;
  assert.equal(kept.day, "2026-09-21");
  assert.deepEqual(
    kept.slots[0].voidedDoses.map((d) => [d.voidedBy, d.voidReason]),
    [["Benjamin Carter", "Started on the wrong day"]],
  );
  // Nothing was expected then, and nothing is counted.
  assert.deepEqual(
    [kept.slots[0].expected, kept.slots[0].state, kept.slots[0].recordable],
    [false, null, false],
  );
  assert.equal(view.counts?.missed, 7);
  assert.equal(view.run.at(-2)!.day, "2026-10-12");
});

test("an as-needed order takes a dose on any day it ran, through today", () => {
  const prn = (overrides: Parameters<typeof order>[0] = {}) =>
    order({ frequency: "PRN", firstSlot: null, startDate: day("2026-09-20"), endDate: null, ...overrides });
  const daysOf = (o: ReturnType<typeof order>) =>
    medicationsView({ orders: [o], names: {} }, context());
  const viewOf = (o: ReturnType<typeof order>) => {
    const v = daysOf(o);
    return [...v.current, ...v.past][0];
  };
  assert.deepEqual(viewOf(prn()).asNeededDays, { from: "2026-09-20", to: TODAY });
  // A past course with no dose: its days, though its run lists none.
  const ended = viewOf(prn({ endDate: day("2026-09-25") }));
  assert.deepEqual(ended.asNeededDays, { from: "2026-09-20", to: "2026-09-25" });
  assert.deepEqual([ended.run, ended.sheet, ended.today], [[], [], []]);
  assert.deepEqual(viewOf(prn({ discontinuedDate: day("2026-09-26") })).asNeededDays, {
    from: "2026-09-20",
    to: "2026-09-25",
  });
  // None voided, not started, stopped before it began, or for a slotted order.
  assert.equal(viewOf(prn({ voidedAt: new Date() })).asNeededDays, null);
  assert.equal(viewOf(prn({ startDate: day("2026-10-20") })).asNeededDays, null);
  assert.equal(
    viewOf(prn({ startDate: day("2026-10-15"), discontinuedDate: day("2026-10-15") })).asNeededDays,
    null,
  );
  assert.equal(viewOf(order()).asNeededDays, null);
});
