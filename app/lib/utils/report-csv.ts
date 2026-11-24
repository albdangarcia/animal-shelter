// The reports as CSV files. Each builder takes the object its page draws and
// lays the same tables out as text, formatted with the page's own helpers
// (`formatPercent`, `formatSingleEnumOption`, `formatOutcomeType`), so a cell reads as the screen
// does: "88.7%", "Owner Surrender", "—". Nothing is counted here; the counting
// stays in app/lib/data/reports, and the route that serves these files
// (app/api/reports/[report]/route.ts) calls the same fetchers as the pages.
//
// Pure, with no Prisma, auth or `next/*` imports, so it is unit-tested
// (report-csv.test.ts). The `import type`s below are erased at runtime.

import type { OutcomeReport } from "@/app/lib/data/reports/outcome-report.data";
import { formatOutcomeType } from "@/app/lib/utils/outcome-types";
import type { IntakeReport } from "@/app/lib/data/reports/intake-report.data";
import type { LengthOfStayReport } from "@/app/lib/data/reports/length-of-stay-report.data";
import type {
  BalanceSummary,
  IntakeSummary,
  LengthOfStaySummary,
  OutcomeSummary,
} from "@/app/lib/data/reports/reports-overview.data";
import type { ReportRange } from "./report-date-utils";
import { speciesLabel, type ReportExport } from "./report-href";
import { formatPercent } from "./report-rate-utils";
import { formatSingleEnumOption } from "./enum-formatter";
import {
  describeFosterWarning,
  describeReconciliation,
  describeTimelineBreak,
  describeTransferWarning,
  formatSacMonth,
  SAC_SECTIONS,
  SHELTER_STATE_MISSING_WARNING,
  type SacAgeCounts,
  type SacReport,
} from "./sac-report";
import { SAC_SPECIES_CATEGORY_LABELS } from "@/app/lib/constants/sac-species";

export type CsvCell = string | number | null;

/** One table of a report: a title row, a header row, then its rows. */
export type CsvSection = {
  title: string;
  header: string[];
  rows: CsvCell[][];
};

/** What the file is about, written above its tables. */
export type ReportCsvContext = {
  range: ReportRange;
  /** The species picked, by name; empty for every species. */
  speciesNames: string[];
  timezone: string;
};

// Excel reads a file without this mark as the local code page, which turns
// "—" and accented partner names into mojibake.
const BYTE_ORDER_MARK = "﻿";

// A cell starting with one of these is run as a formula by a spreadsheet.
// Partner and animal names are typed by staff, so a leading apostrophe makes
// such a cell plain text. Numbers are written as numbers and never guarded.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell as CSV text: quoted when it holds a comma, quote or line break. */
export function csvCell(value: CsvCell): string {
  if (value === null) return "—";
  if (typeof value === "number") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows as CSV text, with CRLF line ends and the byte order mark. */
export function toCsv(rows: CsvCell[][]): string {
  return (
    BYTE_ORDER_MARK +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

/**
 * A whole report: what it covers (name, period, species, time zone), then
 * each table with a blank line before it.
 */
export function reportCsv(
  title: string,
  context: ReportCsvContext,
  sections: CsvSection[],
): string {
  const rows: CsvCell[][] = [
    ["Report", title],
    ["From", context.range.fromLabel],
    ["To", context.range.toLabel],
    ["Species", speciesLabel(context.speciesNames)],
    ["Times counted in", context.timezone],
  ];
  for (const section of sections) {
    rows.push([], [section.title], section.header, ...section.rows);
  }
  return toCsv(rows);
}

const REPORT_FILE_NAMES: Record<ReportExport, string> = {
  overview: "reports-overview",
  outcomes: "outcome-statistics",
  intakes: "intake-sources",
  "length-of-stay": "length-of-stay",
  sac: "shelter-animals-count",
};

/**
 * e.g. `outcome-statistics-2026-01-01-to-2026-11-22.csv`, or
 * `shelter-animals-count-2026-10.csv` for the SAC report's one month.
 */
export function reportCsvFileName(
  report: ReportExport,
  range: ReportRange,
): string {
  if (report === "sac") {
    return `${REPORT_FILE_NAMES.sac}-${range.fromLabel.slice(0, 7)}.csv`;
  }
  return `${REPORT_FILE_NAMES[report]}-${range.fromLabel}-to-${range.toLabel}.csv`;
}

const MEASURE_HEADER = ["Measure", "Value"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The outcomes report: its four figures, then the outcome detail table. */
export function outcomeReportCsv(
  report: OutcomeReport,
  context: ReportCsvContext,
): string {
  return reportCsv("Outcome statistics", context, [
    {
      title: "Summary",
      header: MEASURE_HEADER,
      rows: [
        ["Live release rate", formatPercent(report.liveReleaseRate)],
        ["Total outcomes", report.total],
        ["Live outcomes", report.liveCount],
        ["Non-live outcomes", report.nonLiveCount],
      ],
    },
    {
      title: "Outcome detail",
      header: ["Outcome type", "Count", "% of total", "% of live"],
      rows: report.rows.map((row) => [
        formatOutcomeType(row.type),
        row.count,
        formatPercent(row.percentOfTotal),
        row.isLive ? formatPercent(row.percentOfLive) : null,
      ]),
    },
  ]);
}

/** The intake report: its figures, the monthly trend, sources and partners. */
export function intakeReportCsv(
  report: IntakeReport,
  context: ReportCsvContext,
): string {
  return reportCsv("Intake sources", context, [
    {
      title: "Summary",
      header: MEASURE_HEADER,
      rows: [
        ["Total intakes", report.total],
        [
          "Largest source",
          report.largestSource
            ? formatSingleEnumOption(report.largestSource.type)
            : null,
        ],
        ["Largest source intakes", report.largestSource?.count ?? null],
        ["Transfers in", report.transfersIn],
      ],
    },
    {
      // Year and month apart: a spreadsheet turns "Mar 2026" into a date and
      // shows it as "Mar-26", but leaves a month's name alone.
      title: "Monthly intake trend",
      header: ["Year", "Month", "Intakes"],
      rows: report.monthlySeries.map((point) => {
        const [year, month] = point.month.split("-").map(Number);
        return [year, MONTH_NAMES[month - 1], point.count];
      }),
    },
    {
      title: "Intakes by source type",
      header: ["Intake type", "Count", "% of total"],
      rows: report.byType.map((row) => [
        formatSingleEnumOption(row.type),
        row.count,
        formatPercent(row.percentOfTotal),
      ]),
    },
    {
      title: "Top transfer-in partners",
      header: ["Partner", "Transfers in"],
      rows: report.topPartners.map((partner) => [partner.name, partner.count]),
    },
  ]);
}

/**
 * The length of stay report: the period's completed stays, then the animals
 * in care today (the worklist reflects today whatever the period, as on the
 * page).
 */
export function lengthOfStayReportCsv(
  report: LengthOfStayReport,
  context: ReportCsvContext,
): string {
  return reportCsv("Length of stay", context, [
    {
      title: "Summary",
      header: MEASURE_HEADER,
      rows: [
        ["Median days in care", report.medianDays],
        ["Longest completed stay (days)", report.longestCompletedDays],
        ["Completed stays", report.completedCount],
        ["Animals in care now", report.inCareNow],
        ["In care over 90 days", report.over90],
      ],
    },
    {
      title: "Completed-stay length distribution",
      header: ["Days", "Stays"],
      rows: report.histogram.map((bucket) => [bucket.label, bucket.count]),
    },
    {
      title: "Longest current stays",
      header: [
        "Animal",
        "Species",
        "Current stay (days)",
        "Cumulative (days)",
        "Intake date",
      ],
      rows: report.worklist.map((row) => [
        row.name,
        row.speciesName,
        row.currentStayDays,
        row.hasPriorStays ? row.cumulativeDays : "same",
        row.intakeDate,
      ]),
    },
  ]);
}

export type ReportsOverview = {
  outcomes: OutcomeSummary;
  balance: BalanceSummary;
  lengthOfStay: LengthOfStaySummary;
  intakes: IntakeSummary;
};

/** The overview: one table per card, in the cards' order. */
export function reportsOverviewCsv(
  overview: ReportsOverview,
  context: ReportCsvContext,
): string {
  const { outcomes, balance, lengthOfStay, intakes } = overview;
  return reportCsv("Reports overview", context, [
    {
      title: "Outcome statistics",
      header: MEASURE_HEADER,
      rows: [
        ["Live release rate", formatPercent(outcomes.liveReleaseRate)],
        ["Total outcomes", outcomes.total],
        ["Live outcomes", outcomes.liveCount],
        ...outcomes.topTypes.map((t): CsvCell[] => [
          formatOutcomeType(t.type),
          t.count,
        ]),
      ],
    },
    {
      title: "Intake vs outcome",
      header: MEASURE_HEADER,
      rows: [
        ["Intakes", balance.intakes],
        ["Outcomes", balance.outcomes],
        ["Net change in care", balance.net],
      ],
    },
    {
      title: "Length of stay",
      header: MEASURE_HEADER,
      rows: [
        ["Median days in care", lengthOfStay.medianDays],
        ["In care over 90 days", lengthOfStay.over90],
        ["Animals in care now", lengthOfStay.inCareNow],
      ],
    },
    {
      title: "Intake sources",
      header: MEASURE_HEADER,
      rows: [
        ["Total intakes", intakes.total],
        ...intakes.topTypes.map((t): CsvCell[] => [
          formatSingleEnumOption(t.type),
          t.count,
        ]),
      ],
    },
  ]);
}

const SAC_AGE_HEADER = ["Adult", "Up to 5 months", "Age unknown", "Total"];

const sacAgeCells = (counts: SacAgeCounts): CsvCell[] => [
  counts.adult,
  counts.young,
  counts.unknown,
  counts.total,
];

/**
 * The Shelter Animals Count monthly report, laid out like SAC's form (Intake
 * & Outcome Database, VRS 1.2021) row for row, one block per species
 * category, then the warnings. SAC's own upload template is only offered
 * inside a SAC account, so its column names are not known; the file is for
 * copying the numbers into SAC, not for uploading as it is.
 */
export function sacReportCsv(
  report: SacReport,
  context: ReportCsvContext,
): string {
  const rows: CsvCell[][] = [
    ["Report", "Shelter Animals Count monthly report"],
    ["Month", formatSacMonth(report.month)],
    ["From", report.first],
    ["To", report.last],
    ["Shelter state", report.shelterState],
    ["Times counted in", context.timezone],
    [
      "Layout",
      "Rows follow SAC's Intake & Outcome Database form (VRS 1.2021). Not SAC's upload template.",
    ],
  ];

  for (const table of report.tables) {
    rows.push([], [table.label]);
    for (const section of SAC_SECTIONS) {
      rows.push([section.title, ...SAC_AGE_HEADER]);
      for (const row of section.rows) {
        rows.push([row.label, ...sacAgeCells(table.rows[row.key])]);
      }
      rows.push([section.totalLabel, ...sacAgeCells(table.totals[section.key])]);
    }
    rows.push(
      ["Total outcomes", ...sacAgeCells(table.totals.outcomes)],
      ["Animal counts", "Total in care", "In foster care"],
      ["Beginning count", table.beginning.inCare, table.beginning.inFoster],
      ["Ending count", table.ending.inCare, table.ending.inFoster],
      ["Check", describeReconciliation(table)],
    );
  }

  const { warnings } = report;
  rows.push([], ["Warnings"], ["Animal", "Species category", "Warning"]);
  if (warnings.shelterStateMissing) {
    rows.push(["", "", SHELTER_STATE_MISSING_WARNING]);
  }
  for (const warning of warnings.timelineBreaks) {
    rows.push([
      warning.animalName,
      SAC_SPECIES_CATEGORY_LABELS[warning.category],
      describeTimelineBreak(warning),
    ]);
  }
  for (const warning of warnings.transfers) {
    rows.push([
      warning.animalName,
      SAC_SPECIES_CATEGORY_LABELS[warning.category],
      describeTransferWarning(warning),
    ]);
  }
  for (const warning of warnings.fosters) {
    rows.push([
      warning.animalName,
      SAC_SPECIES_CATEGORY_LABELS[warning.category],
      describeFosterWarning(warning),
    ]);
  }
  if (
    !warnings.shelterStateMissing &&
    warnings.timelineBreaks.length === 0 &&
    warnings.transfers.length === 0 &&
    warnings.fosters.length === 0
  ) {
    rows.push(["None"]);
  }
  return toCsv(rows);
}
