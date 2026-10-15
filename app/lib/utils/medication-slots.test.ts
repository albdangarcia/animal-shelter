import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultStart,
  expectedSlots,
  orderLastDay,
  orderState,
  slotDoseIssue,
  slotEnded,
  slotState,
  slotsFor,
  type DoseSlotEnds,
  type SlotOrder,
} from "./medication-slots";
import { calendarDay as day, type ShelterClock } from "./shelter-day";

const ENDS: DoseSlotEnds = { AM: "10:00", MIDDAY: "14:00", PM: "20:00" };

const order = (overrides: Partial<SlotOrder> = {}): SlotOrder => ({
  frequency: "BID",
  intervalDays: null,
  startDate: day("2026-10-12"),
  firstSlot: "AM",
  endDate: null,
  discontinuedDate: null,
  voided: false,
  ...overrides,
});

const clock = (on: string, time: string): ShelterClock => ({ day: day(on), time });

/** Expected slots as "day slot" strings, for short assertions. */
const slots = (o: SlotOrder, from: string, to: string) =>
  expectedSlots(o, day(from), day(to)).map(({ slotDate, slot }) => `${slotDate} ${slot}`);

test("each frequency's slots, in the day's order", () => {
  assert.deepEqual(slotsFor("SID"), ["AM"]);
  assert.deepEqual(slotsFor("BID"), ["AM", "PM"]);
  assert.deepEqual(slotsFor("TID"), ["AM", "MIDDAY", "PM"]);
  assert.deepEqual(slotsFor("EVERY_N_DAYS"), ["AM"]);
  assert.deepEqual(slotsFor("PRN"), []);
});

test("expected slots: every day from the start, in day then slot order", () => {
  assert.deepEqual(slots(order({ frequency: "TID" }), "2026-10-12", "2026-10-13"), [
    "2026-10-12 AM",
    "2026-10-12 MIDDAY",
    "2026-10-12 PM",
    "2026-10-13 AM",
    "2026-10-13 MIDDAY",
    "2026-10-13 PM",
  ]);
  assert.deepEqual(slots(order({ frequency: "SID" }), "2026-10-12", "2026-10-13"), [
    "2026-10-12 AM",
    "2026-10-13 AM",
  ]);
  // Nothing before the start, whatever the range asks for.
  assert.deepEqual(slots(order(), "2026-10-10", "2026-10-12"), [
    "2026-10-12 AM",
    "2026-10-12 PM",
  ]);
  assert.deepEqual(slots(order(), "2026-10-01", "2026-10-11"), []);
});

test("expected slots: the start day's slots begin at the first slot", () => {
  assert.deepEqual(slots(order({ firstSlot: "PM" }), "2026-10-12", "2026-10-13"), [
    "2026-10-12 PM",
    "2026-10-13 AM",
    "2026-10-13 PM",
  ]);
  assert.deepEqual(
    slots(order({ frequency: "TID", firstSlot: "MIDDAY" }), "2026-10-12", "2026-10-12"),
    ["2026-10-12 MIDDAY", "2026-10-12 PM"],
  );
  // A range that starts after the start day takes every slot of its days.
  assert.deepEqual(slots(order({ firstSlot: "PM" }), "2026-10-13", "2026-10-13"), [
    "2026-10-13 AM",
    "2026-10-13 PM",
  ]);
});

test("expected slots: every few days falls on whole intervals after the start", () => {
  const everyTwo = order({ frequency: "EVERY_N_DAYS", intervalDays: 2 });
  assert.deepEqual(slots(everyTwo, "2026-10-12", "2026-10-18"), [
    "2026-10-12 AM",
    "2026-10-14 AM",
    "2026-10-16 AM",
    "2026-10-18 AM",
  ]);
  // A range starting between two due days begins at the next one.
  const everyThree = order({ frequency: "EVERY_N_DAYS", intervalDays: 3 });
  assert.deepEqual(slots(everyThree, "2026-10-13", "2026-10-21"), [
    "2026-10-15 AM",
    "2026-10-18 AM",
    "2026-10-21 AM",
  ]);
  assert.deepEqual(slots(everyThree, "2026-10-16", "2026-10-17"), []);
  const monthly = order({ frequency: "EVERY_N_DAYS", intervalDays: 31 });
  assert.deepEqual(slots(monthly, "2026-10-12", "2026-12-31"), [
    "2026-10-12 AM",
    "2026-11-12 AM",
    "2026-12-13 AM",
  ]);
});

test("expected slots: the end day is the last, inclusive", () => {
  const ending = order({ endDate: day("2026-10-14") });
  assert.deepEqual(slots(ending, "2026-10-14", "2026-10-20"), [
    "2026-10-14 AM",
    "2026-10-14 PM",
  ]);
  assert.equal(orderLastDay(ending), "2026-10-14");
  // A one-day order ending on its start day.
  assert.deepEqual(
    slots(order({ firstSlot: "PM", endDate: day("2026-10-12") }), "2026-10-01", "2026-10-31"),
    ["2026-10-12 PM"],
  );
});

test("expected slots: none from the day an order was discontinued", () => {
  const stopped = order({ discontinuedDate: day("2026-10-14") });
  assert.equal(orderLastDay(stopped), "2026-10-13");
  assert.deepEqual(slots(stopped, "2026-10-13", "2026-10-20"), [
    "2026-10-13 AM",
    "2026-10-13 PM",
  ]);
  // The earlier of the end day and the day before discontinuing wins.
  assert.equal(
    orderLastDay(order({ endDate: day("2026-10-13"), discontinuedDate: day("2026-10-20") })),
    "2026-10-13",
  );
  assert.equal(
    orderLastDay(order({ endDate: day("2026-10-30"), discontinuedDate: day("2026-10-20") })),
    "2026-10-19",
  );
  // Discontinued on its start day: nothing was ever expected.
  assert.deepEqual(
    slots(order({ discontinuedDate: day("2026-10-12") }), "2026-10-01", "2026-10-31"),
    [],
  );
});

test("expected slots: none for a voided or an as-needed order; an open-ended one runs to the range's end", () => {
  assert.deepEqual(slots(order({ voided: true }), "2026-10-12", "2026-10-20"), []);
  assert.deepEqual(
    slots(order({ frequency: "PRN", firstSlot: null }), "2026-10-12", "2026-10-20"),
    [],
  );
  assert.equal(orderLastDay(order()), null);
  assert.equal(slots(order(), "2026-10-12", "2026-11-10").length, 60);
  assert.deepEqual(slots(order(), "2026-12-01", "2026-12-01"), [
    "2026-12-01 AM",
    "2026-12-01 PM",
  ]);
});

test("a slot ends at its end time on its own day, by the wall clock", () => {
  const am = { slotDate: day("2026-10-14"), slot: "AM" } as const;
  assert.equal(slotEnded(am, clock("2026-10-14", "09:59"), ENDS), false);
  assert.equal(slotEnded(am, clock("2026-10-14", "10:00"), ENDS), true);
  assert.equal(slotEnded(am, clock("2026-10-14", "10:01"), ENDS), true);
  // Another day: before it nothing has ended, after it everything has.
  assert.equal(slotEnded(am, clock("2026-10-13", "23:59"), ENDS), false);
  assert.equal(slotEnded(am, clock("2026-10-15", "00:00"), ENDS), true);
  const pm = { slotDate: day("2026-10-14"), slot: "PM" } as const;
  assert.equal(slotEnded(pm, clock("2026-10-14", "19:59"), ENDS), false);
  assert.equal(slotEnded(pm, clock("2026-10-14", "20:00"), ENDS), true);
  assert.equal(
    slotEnded(pm, clock("2026-10-14", "19:30"), { ...ENDS, PM: "19:00" }),
    true,
  );
});

test("a slot's state: its live dose's result, else missed once ended, else due", () => {
  const am = { slotDate: day("2026-10-14"), slot: "AM" } as const;
  const after = clock("2026-10-14", "11:00");
  const before = clock("2026-10-14", "08:00");
  assert.equal(slotState(am, { result: "GIVEN" }, after, ENDS), "GIVEN");
  assert.equal(slotState(am, { result: "REFUSED" }, after, ENDS), "REFUSED");
  assert.equal(slotState(am, { result: "NOT_GIVEN" }, after, ENDS), "NOT_GIVEN");
  // Given early, before the window ended.
  assert.equal(slotState(am, { result: "GIVEN" }, before, ENDS), "GIVEN");
  assert.equal(slotState(am, null, after, ENDS), "MISSED");
  assert.equal(slotState(am, null, before, ENDS), "DUE");
});

test("an order's state: voided, discontinued, upcoming, ended, active, in that order", () => {
  const today = day("2026-10-15");
  assert.equal(orderState(order(), today), "ACTIVE");
  assert.equal(orderState(order({ startDate: today }), today), "ACTIVE");
  assert.equal(orderState(order({ endDate: today }), today), "ACTIVE");
  assert.equal(orderState(order({ endDate: day("2026-10-14") }), today), "ENDED");
  assert.equal(orderState(order({ startDate: day("2026-10-16") }), today), "UPCOMING");
  assert.equal(
    orderState(order({ discontinuedDate: today, endDate: day("2026-10-14") }), today),
    "DISCONTINUED",
  );
  assert.equal(
    orderState(order({ discontinuedDate: today, startDate: day("2026-10-16") }), today),
    "DISCONTINUED",
  );
  assert.equal(
    orderState(order({ voided: true, discontinuedDate: today }), today),
    "VOIDED",
  );
});

test("a new order starts today at the first slot still open, or tomorrow", () => {
  assert.deepEqual(defaultStart("BID", clock("2026-10-15", "08:00"), ENDS), {
    startDate: "2026-10-15",
    firstSlot: "AM",
  });
  assert.deepEqual(defaultStart("BID", clock("2026-10-15", "10:00"), ENDS), {
    startDate: "2026-10-15",
    firstSlot: "PM",
  });
  assert.deepEqual(defaultStart("TID", clock("2026-10-15", "12:00"), ENDS), {
    startDate: "2026-10-15",
    firstSlot: "MIDDAY",
  });
  assert.deepEqual(defaultStart("TID", clock("2026-10-15", "20:00"), ENDS), {
    startDate: "2026-10-16",
    firstSlot: "AM",
  });
  // Once a day after the AM window, and every few days, wait for tomorrow.
  assert.deepEqual(defaultStart("SID", clock("2026-10-15", "10:30"), ENDS), {
    startDate: "2026-10-16",
    firstSlot: "AM",
  });
  assert.deepEqual(defaultStart("EVERY_N_DAYS", clock("2026-10-15", "23:59"), ENDS), {
    startDate: "2026-10-16",
    firstSlot: "AM",
  });
  assert.deepEqual(defaultStart("PRN", clock("2026-10-15", "23:59"), ENDS), {
    startDate: "2026-10-15",
    firstSlot: null,
  });
});

test("why a slot can't take a dose, each case", () => {
  const today = day("2026-10-15");
  const issue = (o: SlotOrder, on: string, slot: SlotOrder["firstSlot"]) =>
    slotDoseIssue(o, { slotDate: day(on), slot }, today);

  assert.equal(issue(order(), "2026-10-14", "PM"), null);
  // Today's later slots too: early is allowed.
  assert.equal(issue(order(), "2026-10-15", "PM"), null);

  assert.equal(
    issue(order({ voided: true }), "2026-10-14", "AM"),
    "This order was voided, so it takes no doses.",
  );
  const prn = order({ frequency: "PRN", firstSlot: null });
  assert.equal(issue(prn, "2026-10-14", null), null);
  assert.equal(issue(prn, "2026-10-14", "AM"), "An as-needed dose has no slot.");
  assert.equal(issue(order(), "2026-10-14", null), "A dose of this order needs its slot.");
  assert.equal(issue(order(), "2026-10-14", "MIDDAY"), "This order has no Midday dose.");
  assert.equal(
    issue(order(), "2026-10-16", "AM"),
    "A dose can't be recorded for a future day.",
  );
  assert.equal(
    issue(prn, "2026-10-16", null),
    "A dose can't be recorded for a future day.",
  );
  assert.equal(issue(order(), "2026-10-11", "PM"), "This order starts on Oct 12, 2026.");
  assert.equal(issue(prn, "2026-10-11", null), "This order starts on Oct 12, 2026.");
  assert.equal(
    issue(order({ firstSlot: "PM" }), "2026-10-12", "AM"),
    "This order's first dose is the PM dose on Oct 12, 2026.",
  );
  assert.equal(issue(order({ firstSlot: "PM" }), "2026-10-12", "PM"), null);
  assert.equal(
    issue(order({ endDate: day("2026-10-13") }), "2026-10-14", "AM"),
    "This order ended on Oct 13, 2026.",
  );
  assert.equal(issue(order({ endDate: day("2026-10-13") }), "2026-10-13", "PM"), null);
  assert.equal(
    issue(order({ discontinuedDate: day("2026-10-14") }), "2026-10-14", "AM"),
    "This order was discontinued from Oct 14, 2026.",
  );
  assert.equal(issue(order({ discontinuedDate: day("2026-10-14") }), "2026-10-13", "PM"), null);
  assert.equal(
    issue({ ...prn, discontinuedDate: day("2026-10-14") }, "2026-10-14", null),
    "This order was discontinued from Oct 14, 2026.",
  );
  // An end day before the day discontinued: the slot is past the end.
  assert.equal(
    issue(
      order({ endDate: day("2026-10-13"), discontinuedDate: day("2026-10-15") }),
      "2026-10-14",
      "AM",
    ),
    "This order ended on Oct 13, 2026.",
  );
  const everyThree = order({ frequency: "EVERY_N_DAYS", intervalDays: 3 });
  assert.equal(
    issue(everyThree, "2026-10-14", "AM"),
    "This order isn't due on Oct 14, 2026: it is given every 3 days from Oct 12, 2026.",
  );
  assert.equal(issue(everyThree, "2026-10-15", "AM"), null);
  assert.equal(issue(everyThree, "2026-10-15", "PM"), "This order has no PM dose.");
});
