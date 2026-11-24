import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/prisma/generated/enums";
import { can } from "@/app/lib/auth/can";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { ReportExport } from "@/app/lib/utils/report-href";
import {
  createReportCsvHandler,
  searchParamsRecord,
  type ReportFilters,
} from "./report-csv-handler";

// A handler for a caller with the given role (or no session), recording what
// it asked the data layer for. The CSV text itself is unit-tested in
// app/lib/utils/report-csv.test.ts.
const handlerFor = (role: Role | null) => {
  const built: { report: ReportExport; filters: ReportFilters }[] = [];
  const handler = createReportCsvHandler({
    getSession: async () => (role ? { user: { role } } : null),
    hasPermission: async (permission) => can(role, permission),
    loadContext: async () => ({
      range: {
        fromLabel: "2026-01-01" as CalendarDay,
        toLabel: "2026-11-22" as CalendarDay,
      },
      speciesNames: [],
      timezone: "America/New_York",
    }),
    buildCsv: async (report, filters) => {
      built.push({ report, filters });
      return "﻿Report,Outcome statistics\r\n";
    },
  });
  const get = (path: string) => {
    const url = new URL(path, "http://localhost");
    const report = url.pathname.split("/").at(-1) ?? "";
    return handler(new Request(url), report);
  };
  return { get, built };
};

test("signed out is refused with 401 and no report is read", async () => {
  const { get, built } = handlerFor(null);
  const response = await get("/api/reports/outcomes");
  assert.equal(response.status, 401);
  assert.equal(built.length, 0);
});

test("an adopter, who can't read the reports, is refused with 403", async () => {
  const { get, built } = handlerFor(Role.USER);
  const response = await get("/api/reports/outcomes");
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /Outcome statistics/);
  assert.equal(built.length, 0);
});

test("whoever reads the reports downloads one, volunteers included", async () => {
  const { get } = handlerFor(Role.VOLUNTEER);
  const response = await get("/api/reports/outcomes?from=2026-01-01");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(
    response.headers.get("Content-Disposition"),
    'attachment; filename="outcome-statistics-2026-01-01-to-2026-11-22.csv"',
  );
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("a report that doesn't exist is a 404, after the permission check", async () => {
  assert.equal((await handlerFor(Role.ADMIN).get("/api/reports/nope")).status, 404);
  assert.equal((await handlerFor(Role.USER).get("/api/reports/nope")).status, 403);
});

test("the period and species reach the fetcher as the URL gives them", async () => {
  const { get, built } = handlerFor(Role.ADMIN);
  await get("/api/reports/intakes?from=2026-02-01&to=2026-02-28&species=abc,def");
  assert.deepEqual(built, [
    {
      report: "intakes",
      filters: { from: "2026-02-01", to: "2026-02-28", species: "abc,def" },
    },
  ]);
});

test("a mangled or repeated filter falls back to the defaults, as on the page", async () => {
  const { get, built } = handlerFor(Role.ADMIN);
  await get("/api/reports/outcomes?from=yesterday");
  await get("/api/reports/outcomes?species=abc&species=def");
  assert.deepEqual(
    built.map((b) => b.filters),
    [{}, {}],
  );
});

test("a repeated key becomes an array, as in a page's searchParams", () => {
  assert.deepEqual(
    searchParamsRecord(new URLSearchParams("species=a&species=b&from=2026-01-01")),
    { species: ["a", "b"], from: "2026-01-01" },
  );
});

test("a failing fetch answers 500 without the report", async () => {
  const handler = createReportCsvHandler({
    getSession: async () => ({ user: { role: Role.ADMIN } }),
    hasPermission: async () => true,
    loadContext: async () => {
      throw new Error("database down");
    },
    buildCsv: async () => "",
  });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await handler(
      new Request("http://localhost/api/reports/outcomes"),
      "outcomes",
    );
    assert.equal(response.status, 500);
  } finally {
    console.error = original;
  }
});

test("the Shelter Animals Count report takes a month, and no period or species", async () => {
  const { get, built } = handlerFor(Role.VOLUNTEER);
  const response = await get(
    "/api/reports/sac?month=2026-10&from=2026-01-01&species=abc",
  );
  assert.equal(response.status, 200);
  await get("/api/reports/sac?month=October");
  // A month means nothing to the other reports.
  await get("/api/reports/outcomes?month=2026-10&from=2026-01-01");
  assert.deepEqual(built, [
    { report: "sac", filters: { month: "2026-10" } },
    { report: "sac", filters: {} },
    { report: "outcomes", filters: { from: "2026-01-01" } },
  ]);
});
