import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IntakeType,
  OutcomeType,
  SacSpeciesCategory,
} from "@/prisma/generated/enums";
import {
  buildSacReport,
  classifyTransfer,
  describeFosterWarning,
  describeReconciliation,
  describeTimelineBreak,
  describeTransferWarning,
  formatSacMonth,
  resolveSacMonth,
  sacAgeGroup,
  sacIntakeRow,
  sacMonthDays,
  sacMonthOptions,
  sacOutcomeRow,
  SAC_SECTIONS,
  type SacAnimalRecord,
  type SacIntakeRecord,
  type SacMonth,
  type SacOutcomeRecord,
  type SacPartner,
} from "./sac-report";
import type { CalendarDay } from "./shelter-day";

const day = (value: string) => value as CalendarDay;
const OCTOBER = "2026-10" as SacMonth;

// ---------------------------------------------------------------------------
// The month
// ---------------------------------------------------------------------------

test("the month defaults to last month, also across a new year", () => {
  assert.equal(resolveSacMonth(undefined, day("2026-11-24")), "2026-10");
  assert.equal(resolveSacMonth(undefined, day("2027-01-03")), "2026-12");
});

test("a malformed month, this month or a later one falls back to last month", () => {
  const today = day("2026-11-24");
  assert.equal(resolveSacMonth("2026-13", today), "2026-10");
  assert.equal(resolveSacMonth("2026-1", today), "2026-10");
  assert.equal(resolveSacMonth("October", today), "2026-10");
  assert.equal(resolveSacMonth("2026-12", today), "2026-10");
  // This month hasn't ended, so SAC can't be given it yet.
  assert.equal(resolveSacMonth("2026-11", today), "2026-10");
  // Any whole month is kept, however old.
  assert.equal(resolveSacMonth("2026-09", today), "2026-09");
  assert.equal(resolveSacMonth("2019-02", today), "2019-02");
});

test("a month's days run from the 1st to its last day, leap years included", () => {
  assert.deepEqual(sacMonthDays(OCTOBER), {
    first: "2026-10-01",
    last: "2026-10-31",
    dayBefore: "2026-09-30",
  });
  assert.equal(sacMonthDays("2028-02" as SacMonth).last, "2028-02-29");
  assert.equal(sacMonthDays("2026-02" as SacMonth).last, "2026-02-28");
  assert.equal(sacMonthDays("2026-01" as SacMonth).dayBefore, "2025-12-31");
});

test("the picker offers the last whole months, newest first", () => {
  const options = sacMonthOptions(day("2026-02-10"), undefined, 3);
  assert.deepEqual(options, [
    { value: "2026-01", label: "January 2026" },
    { value: "2025-12", label: "December 2025" },
    { value: "2025-11", label: "November 2025" },
  ]);
  assert.equal(formatSacMonth(OCTOBER), "October 2026");
});

test("an older month a link asked for is offered last, so the picker shows it", () => {
  const today = day("2026-02-10");
  const old = "2019-06" as SacMonth;
  assert.deepEqual(sacMonthOptions(today, old, 2), [
    { value: "2026-01", label: "January 2026" },
    { value: "2025-12", label: "December 2025" },
    { value: "2019-06", label: "June 2019" },
  ]);
  // One already listed isn't listed twice.
  assert.equal(sacMonthOptions(today, "2025-12" as SacMonth, 2).length, 2);
});

// ---------------------------------------------------------------------------
// Age groups
// ---------------------------------------------------------------------------

test("an animal is up to 5 months until the day it turns 5 months", () => {
  assert.equal(sacAgeGroup("2026-05-15", day("2026-10-14")), "young");
  assert.equal(sacAgeGroup("2026-05-15", day("2026-10-15")), "adult");
  assert.equal(sacAgeGroup("2020-01-01", day("2026-10-15")), "adult");
});

test("a birthday on a day the fifth month lacks turns 5 months at its end", () => {
  // Five months after Sep 30 is Feb 28 (Feb 29 in a leap year).
  assert.equal(sacAgeGroup("2025-09-30", day("2026-02-27")), "young");
  assert.equal(sacAgeGroup("2025-09-30", day("2026-02-28")), "adult");
  assert.equal(sacAgeGroup("2027-09-30", day("2028-02-28")), "young");
  assert.equal(sacAgeGroup("2027-09-30", day("2028-02-29")), "adult");
});

test("a birth date that isn't a day is age unknown", () => {
  assert.equal(sacAgeGroup("", day("2026-10-15")), "unknown");
  assert.equal(sacAgeGroup("2026-02-30", day("2026-10-15")), "unknown");
});

// ---------------------------------------------------------------------------
// Transfer direction and rows
// ---------------------------------------------------------------------------

const partner = (
  state: string | null,
  country: string | null = null,
  name = "Partner",
): SacPartner => ({ name, state, country });

test("a transfer is in state, out of state or international by its partner", () => {
  assert.deepEqual(classifyTransfer(partner("NY"), "NY"), {
    direction: "inState",
    problem: null,
  });
  assert.deepEqual(classifyTransfer(partner("NJ"), "NY"), {
    direction: "outOfState",
    problem: null,
  });
  assert.deepEqual(classifyTransfer(partner(null, "CA"), "NY"), {
    direction: "international",
    problem: null,
  });
  // A territory is a state of its own.
  assert.equal(classifyTransfer(partner("PR"), "NY").direction, "outOfState");
  assert.equal(classifyTransfer(partner("PR"), "PR").direction, "inState");
});

test("a transfer that can't be placed counts as in state and names why", () => {
  assert.deepEqual(classifyTransfer(null, "NY"), {
    direction: "inState",
    problem: "missing-partner",
  });
  assert.deepEqual(classifyTransfer(partner(null), "NY"), {
    direction: "inState",
    problem: "no-location",
  });
  // With no shelter state, a US partner is in state; the report warns once.
  assert.deepEqual(classifyTransfer(partner("NJ"), null), {
    direction: "inState",
    problem: null,
  });
  // A country needs no shelter state.
  assert.equal(
    classifyTransfer(partner(null, "MX"), null).direction,
    "international",
  );
});

test("each intake type counts in its SAC row, and a service intake in none", () => {
  assert.equal(sacIntakeRow(IntakeType.STRAY, "inState"), "strayAtLarge");
  assert.equal(sacIntakeRow(IntakeType.ACO_IMPOUND, "inState"), "strayAtLarge");
  assert.equal(
    sacIntakeRow(IntakeType.OWNER_SURRENDER, "inState"),
    "relinquishedByOwner",
  );
  assert.equal(sacIntakeRow(IntakeType.SEIZE, "inState"), "impoundSeizure");
  assert.equal(sacIntakeRow(IntakeType.BORN_IN_CARE, "inState"), "otherIntakes");
  assert.equal(sacIntakeRow(IntakeType.SERVICE_IN, "inState"), null);
  assert.equal(
    sacIntakeRow(IntakeType.TRANSFER_IN, "inState"),
    "transferInInState",
  );
  assert.equal(
    sacIntakeRow(IntakeType.TRANSFER_IN, "outOfState"),
    "transferInOutOfState",
  );
  assert.equal(
    sacIntakeRow(IntakeType.TRANSFER_IN, "international"),
    "transferInInternational",
  );
});

test("each outcome type counts in its SAC row", () => {
  const rows = Object.values(OutcomeType).map((type) => [
    type,
    sacOutcomeRow(type, "outOfState"),
  ]);
  assert.deepEqual(Object.fromEntries(rows), {
    ADOPTION: "adoption",
    TRANSFER_OUT: "transferOutOutOfState",
    RETURN_TO_OWNER: "returnedToOwner",
    DECEASED: "diedInCare",
    EUTHANIZED: "shelterEuthanasia",
    OTHER: "otherLiveOutcomes",
    RETURN_TO_FIELD: "returnedToField",
    LOST_IN_CARE: "lostInCare",
  });
  assert.equal(
    sacOutcomeRow(OutcomeType.TRANSFER_OUT, "inState"),
    "transferOutInState",
  );
  assert.equal(
    sacOutcomeRow(OutcomeType.TRANSFER_OUT, "international"),
    "transferOutInternational",
  );
});

test("the form's rows, in SAC's order", () => {
  assert.deepEqual(
    SAC_SECTIONS.map((s) => [s.title, s.rows.length, s.totalLabel]),
    [
      ["Live intakes", 8, "Total live intakes"],
      ["Live outcomes", 7, "Total live outcomes"],
      ["Other outcomes", 4, "Total other outcomes"],
    ],
  );
});

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

let nextId = 0;
const id = () => `r${(nextId += 1)}`;

const intake = (
  date: string,
  type: IntakeType = IntakeType.STRAY,
  from: SacPartner | null = null,
): SacIntakeRecord => ({ id: id(), date, type, partner: from });

const outcome = (
  date: string,
  type: OutcomeType = OutcomeType.ADOPTION,
  to: SacPartner | null = null,
): SacOutcomeRecord => ({ id: id(), date, type, partner: to });

const animal = (
  fields: Partial<SacAnimalRecord> & { intakes: SacIntakeRecord[] },
): SacAnimalRecord => ({
  id: id(),
  name: "Rex",
  birthDate: "2020-01-01",
  category: SacSpeciesCategory.CANINE,
  outcomes: [],
  fosterPlacements: [],
  ...fields,
});

const report = (animals: SacAnimalRecord[], shelterState: string | null = "NY") =>
  buildSacReport({
    month: OCTOBER,
    shelterState,
    categories: [SacSpeciesCategory.CANINE],
    animals,
  });

test("intakes and outcomes count in the month by age at their own date", () => {
  const puppy = animal({
    birthDate: "2026-06-10",
    // Under 5 months at intake; 5 months by the adoption on Nov 10.
    intakes: [intake("2026-10-05")],
    outcomes: [outcome("2026-10-31")],
  });
  const dog = animal({
    intakes: [intake("2026-10-01", IntakeType.OWNER_SURRENDER)],
  });
  const before = animal({ intakes: [intake("2026-09-30")] });
  const after = animal({ intakes: [intake("2026-11-01")] });

  const [table] = report([puppy, dog, before, after]).tables;
  assert.deepEqual(table.rows.strayAtLarge, {
    adult: 0,
    young: 1,
    unknown: 0,
    total: 1,
  });
  assert.deepEqual(table.rows.relinquishedByOwner, {
    adult: 1,
    young: 0,
    unknown: 0,
    total: 1,
  });
  assert.equal(table.totals.liveIntakes.total, 2);
  // The puppy turned 5 months on Nov 10, so it is still young on Oct 31.
  assert.deepEqual(table.rows.adoption, {
    adult: 0,
    young: 1,
    unknown: 0,
    total: 1,
  });
  assert.equal(table.totals.liveOutcomes.total, 1);
  assert.equal(table.totals.outcomes.total, 1);
});

test("an animal that grows up in care is counted young in and adult out", () => {
  const pup = animal({
    birthDate: "2026-05-20",
    intakes: [intake("2026-10-02")],
    outcomes: [outcome("2026-10-25", OutcomeType.EUTHANIZED)],
  });
  const [table] = report([pup]).tables;
  assert.equal(table.rows.strayAtLarge.young, 1);
  assert.equal(table.rows.shelterEuthanasia.adult, 1);
  assert.equal(table.totals.otherOutcomes.total, 1);
  assert.equal(table.totals.outcomes.total, 1);
});

test("owner intended euthanasia rows are always 0", () => {
  const [table] = report([
    animal({
      intakes: [intake("2026-10-02", IntakeType.OWNER_SURRENDER)],
      outcomes: [outcome("2026-10-03", OutcomeType.EUTHANIZED)],
    }),
  ]).tables;
  assert.equal(table.rows.intakeOwnerIntendedEuthanasia.total, 0);
  assert.equal(table.rows.outcomeOwnerIntendedEuthanasia.total, 0);
  assert.equal(table.rows.shelterEuthanasia.total, 1);
});

test("a service intake, its stay and the outcome closing it count nowhere", () => {
  const boarder = animal({
    intakes: [intake("2026-09-20", IntakeType.SERVICE_IN)],
    outcomes: [outcome("2026-10-04", OutcomeType.RETURN_TO_OWNER)],
  });
  const boarderInMonth = animal({
    intakes: [intake("2026-10-10", IntakeType.SERVICE_IN)],
  });
  // Boarded, went home, then came back as a stray: only the stray stay counts.
  const laterStray = animal({
    intakes: [
      intake("2026-09-01", IntakeType.SERVICE_IN),
      intake("2026-10-20", IntakeType.STRAY),
    ],
    outcomes: [outcome("2026-09-05", OutcomeType.RETURN_TO_OWNER)],
  });

  const result = report([boarder, boarderInMonth, laterStray]);
  const [table] = result.tables;
  assert.equal(table.beginning.inCare, 0);
  assert.equal(table.rows.returnedToOwner.total, 0);
  assert.equal(table.totals.liveIntakes.total, 1);
  assert.equal(table.rows.strayAtLarge.total, 1);
  assert.equal(table.ending.inCare, 1);
  assert.equal(table.difference, 0);
  assert.deepEqual(result.warnings.timelineBreaks, []);
});

test("in care and in foster are counted at the end of the day before the 1st and of the last day", () => {
  const leftOnFirst = animal({
    intakes: [intake("2026-08-01")],
    outcomes: [outcome("2026-10-01")],
  });
  const arrivedOnLast = animal({ intakes: [intake("2026-10-31")] });
  const sameDay = animal({
    intakes: [intake("2026-10-15")],
    outcomes: [outcome("2026-10-15")],
  });
  const fostered = animal({
    intakes: [intake("2026-07-01")],
    fosterPlacements: [
      // Ended on the last day of September: not in foster at its end.
      { startDate: "2026-09-01", endDate: "2026-09-30" },
      // Open across the month's end.
      { startDate: "2026-10-10", endDate: null },
    ],
  });
  const fosteredOut = animal({
    intakes: [intake("2026-07-01")],
    fosterPlacements: [{ startDate: "2026-09-15", endDate: "2026-10-31" }],
  });

  const [table] = report([
    leftOnFirst,
    arrivedOnLast,
    sameDay,
    fostered,
    fosteredOut,
  ]).tables;
  assert.deepEqual(table.beginning, { inCare: 3, inFoster: 1 });
  assert.deepEqual(table.ending, { inCare: 3, inFoster: 1 });
  // 3 + 2 intakes − 2 outcomes = 3.
  assert.equal(table.expectedEnding, 3);
  assert.equal(table.difference, 0);
});

test("a reversed outcome, left out by the caller, keeps the stay open", () => {
  const dog = animal({ intakes: [intake("2026-09-01")], outcomes: [] });
  const [table] = report([dog]).tables;
  assert.equal(table.totals.outcomes.total, 0);
  assert.equal(table.ending.inCare, 1);
});

test("transfers count by direction and warn when the partner can't be placed", () => {
  const result = report([
    animal({
      name: "Ana",
      intakes: [intake("2026-10-02", IntakeType.TRANSFER_IN, partner("NY"))],
      outcomes: [
        outcome("2026-10-03", OutcomeType.TRANSFER_OUT, partner(null, "CA")),
      ],
    }),
    animal({
      name: "Bo",
      intakes: [intake("2026-10-04", IntakeType.TRANSFER_IN, partner("NJ"))],
      outcomes: [
        outcome(
          "2026-10-05",
          OutcomeType.TRANSFER_OUT,
          partner(null, null, "Nowhere Rescue"),
        ),
      ],
    }),
    animal({
      name: "Cy",
      intakes: [intake("2026-10-06", IntakeType.TRANSFER_IN, null)],
    }),
  ]);
  const [table] = result.tables;
  assert.equal(table.rows.transferInInState.total, 2);
  assert.equal(table.rows.transferInOutOfState.total, 1);
  assert.equal(table.rows.transferOutInternational.total, 1);
  assert.equal(table.rows.transferOutInState.total, 1);
  assert.deepEqual(
    result.warnings.transfers.map((w) => [w.animalName, w.direction, w.problem]),
    [
      ["Bo", "out", "no-location"],
      ["Cy", "in", "missing-partner"],
    ],
  );
  assert.equal(result.warnings.shelterStateMissing, false);
  assert.equal(
    describeTransferWarning(result.warnings.transfers[0]),
    "Transfer out on Oct 5, 2026 to Nowhere Rescue has no state or country. Counted as in state.",
  );
  assert.equal(
    describeTransferWarning(result.warnings.transfers[1]),
    "Transfer in on Oct 6, 2026 has no partner. Counted as in state.",
  );
});

test("with no shelter state, the report warns only when a US transfer needed it", () => {
  const foreign = report(
    [
      animal({
        intakes: [
          intake("2026-10-02", IntakeType.TRANSFER_IN, partner(null, "CA")),
        ],
      }),
      animal({ intakes: [intake("2026-10-03")] }),
    ],
    null,
  );
  assert.equal(foreign.warnings.shelterStateMissing, false);
  assert.equal(foreign.tables[0].rows.transferInInternational.total, 1);
});

test("with no shelter state, US transfers are in state and the report warns", () => {
  const result = report(
    [
      animal({
        intakes: [intake("2026-10-02", IntakeType.TRANSFER_IN, partner("NJ"))],
      }),
    ],
    null,
  );
  assert.equal(result.tables[0].rows.transferInInState.total, 1);
  assert.equal(result.warnings.shelterStateMissing, true);
  assert.deepEqual(result.warnings.transfers, []);
});

test("a break over before the 1st isn't listed: the timeline is right again by then", () => {
  const result = report([
    animal({
      name: "Old",
      // Two outcomes in a row in 2025, then a clean stay in October.
      intakes: [intake("2025-01-01"), intake("2026-10-03")],
      outcomes: [outcome("2025-02-01"), outcome("2025-03-01")],
    }),
    animal({
      name: "Across",
      // A second intake on the 1st: the break runs into the month.
      intakes: [intake("2026-09-20"), intake("2026-10-01")],
    }),
  ]);
  assert.deepEqual(
    result.warnings.timelineBreaks.map((w) => w.animalName),
    ["Across"],
  );
});

test("a timeline break up to the month's end is listed, and the table doesn't balance", () => {
  // Two intakes with no outcome between: the second counts as an intake but
  // opens no stay.
  const duke = animal({
    name: "Duke",
    intakes: [intake("2026-09-01"), intake("2026-10-12")],
  });
  // An outcome with no intake: it counts, but closes no stay.
  const echo = animal({
    name: "Echo",
    intakes: [],
    outcomes: [outcome("2026-10-08")],
  });
  // A break after the month can't move its counts.
  const later = animal({
    name: "Later",
    intakes: [intake("2026-10-01")],
    outcomes: [outcome("2026-11-02"), outcome("2026-11-05")],
  });
  const result = report([duke, echo, later]);
  assert.deepEqual(
    result.warnings.timelineBreaks.map((w) => [w.animalName, w.kind, w.dates]),
    [
      ["Duke", "repeated-intake", ["2026-09-01", "2026-10-12"]],
      ["Echo", "leading-outcome", ["2026-10-08"]],
    ],
  );

  const [dukeTable] = report([duke]).tables;
  // Begin 1 + 1 intake − 0 outcomes = 2, but 1 is in care.
  assert.equal(dukeTable.expectedEnding, 2);
  assert.equal(dukeTable.ending.inCare, 1);
  assert.equal(dukeTable.difference, -1);
  assert.match(
    describeReconciliation(dukeTable),
    /^Doesn't balance: .* but 1 is in care at the end, 1 fewer\./,
  );
  const [echoTable] = report([echo]).tables;
  assert.equal(echoTable.difference, 1);
  assert.equal(report([later]).tables[0].difference, 0);
  assert.equal(
    describeTimelineBreak(result.warnings.timelineBreaks[0]),
    "Two intakes in a row with no outcome between them: Sep 1, 2026 and Oct 12, 2026.",
  );
  assert.equal(
    describeTimelineBreak(result.warnings.timelineBreaks[1]),
    "Outcome on Oct 8, 2026 with no intake before it.",
  );
});

test("one table per category in SAC's order, empty ones included", () => {
  const result = buildSacReport({
    month: OCTOBER,
    shelterState: "NY",
    categories: [SacSpeciesCategory.BIRD, SacSpeciesCategory.CANINE],
    animals: [
      animal({
        category: SacSpeciesCategory.FELINE,
        intakes: [intake("2026-10-02")],
      }),
    ],
  });
  assert.deepEqual(
    result.tables.map((t) => [t.label, t.totals.liveIntakes.total]),
    [
      ["Canines", 0],
      ["Felines", 1],
      ["Birds", 0],
    ],
  );
  assert.equal(
    describeReconciliation(result.tables[1]),
    "Balanced: beginning + intakes − outcomes = ending (0 + 1 − 0 = 1).",
  );
});

test("in foster is part of in care: a placement open outside a counted stay is a warning", () => {
  const result = report([
    // A boarder placed with a foster: not in care, so not in foster either.
    animal({
      name: "Boarder",
      intakes: [intake("2026-09-01", IntakeType.SERVICE_IN)],
      fosterPlacements: [{ startDate: "2026-09-10", endDate: null }],
    }),
    // Adopted on Oct 20 with the placement left open.
    animal({
      name: "Left open",
      intakes: [intake("2026-09-01")],
      outcomes: [outcome("2026-10-20")],
      fosterPlacements: [{ startDate: "2026-09-15", endDate: null }],
    }),
  ]);
  const [table] = result.tables;
  // Left open was in care and in foster at the start, and gone by the end.
  assert.deepEqual(table.beginning, { inCare: 1, inFoster: 1 });
  assert.deepEqual(table.ending, { inCare: 0, inFoster: 0 });
  assert.deepEqual(
    result.warnings.fosters.map((w) => [w.animalName, w.date]),
    [
      ["Boarder", "2026-09-30"],
      ["Boarder", "2026-10-31"],
      ["Left open", "2026-10-31"],
    ],
  );
  assert.equal(
    describeFosterWarning(result.warnings.fosters[2]),
    "In an open foster placement at the end of Oct 31, 2026 but not in care then, so not counted in foster. End the placement, or fix the intake or outcome.",
  );
});
