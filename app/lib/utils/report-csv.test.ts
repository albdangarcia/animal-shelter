import { test } from "node:test";
import assert from "node:assert/strict";
import { IntakeType, OutcomeType } from "@/prisma/generated/enums";
import {
  csvCell,
  intakeReportCsv,
  lengthOfStayReportCsv,
  outcomeReportCsv,
  reportCsvFileName,
  reportsOverviewCsv,
  toCsv,
  type ReportCsvContext,
} from "./report-csv";
import type { CalendarDay } from "./shelter-day";
import { pickedSpeciesNames, speciesLabel } from "./report-href";

const context: ReportCsvContext = {
  range: {
    fromLabel: "2026-01-01" as CalendarDay,
    toLabel: "2026-11-22" as CalendarDay,
  },
  speciesNames: [],
  timezone: "America/New_York",
};

/** The file's lines, without the byte order mark and the last line end. */
const lines = (csv: string) => csv.slice(1).replace(/\r\n$/, "").split("\r\n");

test("a cell with a comma, quote or line break is quoted", () => {
  assert.equal(csvCell("Paws, Inc."), '"Paws, Inc."');
  assert.equal(csvCell('The "Big" Rescue'), '"The ""Big"" Rescue"');
  assert.equal(csvCell("Two\nlines"), '"Two\nlines"');
  assert.equal(csvCell("Plain"), "Plain");
});

test("a text cell a spreadsheet would run as a formula is made plain text", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-Rex"), "'-Rex");
  assert.equal(csvCell("@Rex"), "'@Rex");
  assert.equal(csvCell('=A1,"x"'), `"'=A1,""x"""`);
});

test("numbers are written as numbers, negative ones too", () => {
  assert.equal(csvCell(-3), "-3");
  assert.equal(csvCell(12.5), "12.5");
});

test("a missing value reads as the screen's dash", () => {
  assert.equal(csvCell(null), "—");
});

test("the file starts with a byte order mark and ends lines with CRLF", () => {
  const csv = toCsv([["a", 1], ["b", 2]]);
  assert.equal(csv, "﻿a,1\r\nb,2\r\n");
});

test("the file name names the report and its period", () => {
  assert.equal(
    reportCsvFileName("outcomes", context.range),
    "outcome-statistics-2026-01-01-to-2026-11-22.csv",
  );
  assert.equal(
    reportCsvFileName("overview", context.range),
    "reports-overview-2026-01-01-to-2026-11-22.csv",
  );
});

test("the file says what it covers before its tables", () => {
  const csv = outcomeReportCsv(
    {
      total: 0,
      liveCount: 0,
      nonLiveCount: 0,
      liveReleaseRate: null,
      rows: [],
      fromLabel: "2026-01-01",
      toLabel: "2026-11-22",
    },
    { ...context, speciesNames: ["Cat", "Dog"] },
  );
  assert.deepEqual(lines(csv).slice(0, 6), [
    "Report,Outcome statistics",
    "From,2026-01-01",
    "To,2026-11-22",
    'Species,"Cat, Dog"',
    "Times counted in,America/New_York",
    "",
  ]);
});

test("every species reads as All species", () => {
  const csv = outcomeReportCsv(
    {
      total: 0,
      liveCount: 0,
      nonLiveCount: 0,
      liveReleaseRate: null,
      rows: [],
      fromLabel: "2026-01-01",
      toLabel: "2026-11-22",
    },
    context,
  );
  assert.ok(lines(csv).includes("Species,All species"));
});

test("the outcomes file has the page's figures and percentages", () => {
  const csv = outcomeReportCsv(
    {
      total: 97,
      liveCount: 86,
      nonLiveCount: 11,
      liveReleaseRate: 86 / 97,
      rows: [
        {
          type: OutcomeType.ADOPTION,
          count: 80,
          isLive: true,
          percentOfTotal: 80 / 97,
          percentOfLive: 80 / 86,
        },
        {
          type: OutcomeType.TRANSFER_OUT,
          count: 6,
          isLive: true,
          percentOfTotal: 6 / 97,
          percentOfLive: 6 / 86,
        },
        {
          type: OutcomeType.EUTHANIZED,
          count: 11,
          isLive: false,
          percentOfTotal: 11 / 97,
          percentOfLive: null,
        },
      ],
      fromLabel: "2026-01-01",
      toLabel: "2026-11-22",
    },
    context,
  );
  assert.deepEqual(lines(csv).slice(6), [
    "Summary",
    "Measure,Value",
    "Live release rate,88.7%",
    "Total outcomes,97",
    "Live outcomes,86",
    "Non-live outcomes,11",
    "",
    "Outcome detail",
    "Outcome type,Count,% of total,% of live",
    "Adoption,80,82.5%,93.0%",
    "Transfer Out,6,6.2%,7.0%",
    "Euthanized,11,11.3%,—",
  ]);
});

test("return to field and other live outcome read as live, lost in care as non-live", () => {
  const csv = outcomeReportCsv(
    {
      total: 10,
      liveCount: 7,
      nonLiveCount: 3,
      liveReleaseRate: 7 / 10,
      rows: [
        {
          type: OutcomeType.RETURN_TO_FIELD,
          count: 5,
          isLive: true,
          percentOfTotal: 5 / 10,
          percentOfLive: 5 / 7,
        },
        {
          type: OutcomeType.OTHER,
          count: 2,
          isLive: true,
          percentOfTotal: 2 / 10,
          percentOfLive: 2 / 7,
        },
        {
          type: OutcomeType.LOST_IN_CARE,
          count: 3,
          isLive: false,
          percentOfTotal: 3 / 10,
          percentOfLive: null,
        },
      ],
      fromLabel: "2026-01-01",
      toLabel: "2026-11-22",
    },
    context,
  );
  assert.deepEqual(lines(csv).slice(-3), [
    "Return To Field,5,50.0%,71.4%",
    "Other Live Outcome,2,20.0%,28.6%",
    "Lost In Care,3,30.0%,—",
  ]);
});

test("a period with no outcomes has a dash for the rate and no detail rows", () => {
  const csv = outcomeReportCsv(
    {
      total: 0,
      liveCount: 0,
      nonLiveCount: 0,
      liveReleaseRate: null,
      rows: [],
      fromLabel: "2026-01-01",
      toLabel: "2026-11-22",
    },
    context,
  );
  const body = lines(csv);
  assert.ok(body.includes("Live release rate,—"));
  assert.equal(body.at(-1), "Outcome type,Count,% of total,% of live");
});

test("the intakes file has the trend, the sources and the partners", () => {
  const csv = intakeReportCsv(
    {
      total: 5,
      transfersIn: 2,
      largestSource: { type: IntakeType.STRAY, count: 3 },
      byType: [
        { type: IntakeType.STRAY, count: 3, percentOfTotal: 0.6 },
        { type: IntakeType.TRANSFER_IN, count: 2, percentOfTotal: 0.4 },
      ],
      monthlySeries: [
        { month: "2026-10", label: "Oct 2026", count: 0 },
        { month: "2026-11", label: "Nov 2026", count: 5 },
      ],
      topPartners: [{ partnerId: "p1", name: "Paws, Inc.", count: 2 }],
      fromLabel: "2026-10-01",
      toLabel: "2026-11-22",
    },
    context,
  );
  assert.deepEqual(lines(csv).slice(6), [
    "Summary",
    "Measure,Value",
    "Total intakes,5",
    "Largest source,Stray",
    "Largest source intakes,3",
    "Transfers in,2",
    "",
    "Monthly intake trend",
    "Year,Month,Intakes",
    "2026,October,0",
    "2026,November,5",
    "",
    "Intakes by source type",
    "Intake type,Count,% of total",
    "Stray,3,60.0%",
    "Transfer In,2,40.0%",
    "",
    "Top transfer-in partners",
    "Partner,Transfers in",
    '"Paws, Inc.",2',
  ]);
});

test("the length of stay file says same for an animal's only stay", () => {
  const csv = lengthOfStayReportCsv(
    {
      medianDays: 12.5,
      longestCompletedDays: 40,
      completedCount: 4,
      histogram: [
        { label: "0–7", count: 1 },
        { label: "8–30", count: 2 },
        { label: "31–90", count: 1 },
        { label: "90+", count: 0 },
      ],
      inCareNow: 2,
      over90: 1,
      worklist: [
        {
          animalId: "a1",
          name: "Rex",
          speciesName: "Dog",
          currentStayDays: 120,
          cumulativeDays: 150,
          hasPriorStays: true,
          intakeDate: "2026-07-25" as CalendarDay,
        },
        {
          animalId: "a2",
          name: "Mittens",
          speciesName: "Cat",
          currentStayDays: 10,
          cumulativeDays: 10,
          hasPriorStays: false,
          intakeDate: "2026-11-12" as CalendarDay,
        },
      ],
      fromLabel: "2026-01-01",
      toLabel: "2026-11-22",
    },
    context,
  );
  assert.deepEqual(lines(csv).slice(6), [
    "Summary",
    "Measure,Value",
    "Median days in care,12.5",
    "Longest completed stay (days),40",
    "Completed stays,4",
    "Animals in care now,2",
    "In care over 90 days,1",
    "",
    "Completed-stay length distribution",
    "Days,Stays",
    "0–7,1",
    "8–30,2",
    "31–90,1",
    "90+,0",
    "",
    "Longest current stays",
    "Animal,Species,Current stay (days),Cumulative (days),Intake date",
    "Rex,Dog,120,150,2026-07-25",
    "Mittens,Cat,10,same,2026-11-12",
  ]);
});

test("the overview file has one table per card", () => {
  const csv = reportsOverviewCsv(
    {
      outcomes: {
        total: 4,
        liveCount: 3,
        liveReleaseRate: 0.75,
        topTypes: [{ type: OutcomeType.ADOPTION, count: 3 }],
      },
      balance: { intakes: 2, outcomes: 4, net: -2 },
      lengthOfStay: { medianDays: null, inCareNow: 7, over90: 0 },
      intakes: {
        total: 2,
        topTypes: [{ type: IntakeType.OWNER_SURRENDER, count: 2 }],
      },
    },
    context,
  );
  assert.deepEqual(lines(csv).slice(6), [
    "Outcome statistics",
    "Measure,Value",
    "Live release rate,75.0%",
    "Total outcomes,4",
    "Live outcomes,3",
    "Adoption,3",
    "",
    "Intake vs outcome",
    "Measure,Value",
    "Intakes,2",
    "Outcomes,4",
    "Net change in care,-2",
    "",
    "Length of stay",
    "Measure,Value",
    "Median days in care,—",
    "In care over 90 days,0",
    "Animals in care now,7",
    "",
    "Intake sources",
    "Measure,Value",
    "Total intakes,2",
    "Owner Surrender,2",
  ]);
});

test("the picked species are named in the list's order; unknown ids drop out", () => {
  const all = [
    { id: "cat1", name: "Cat" },
    { id: "dog1", name: "Dog" },
  ];
  assert.deepEqual(pickedSpeciesNames(all, "dog1, cat1,nope"), ["Cat", "Dog"]);
  assert.deepEqual(pickedSpeciesNames(all, undefined), []);
  assert.equal(speciesLabel([]), "All species");
  assert.equal(speciesLabel(["Cat", "Dog"]), "Cat, Dog");
});
