import { test } from "node:test";
import assert from "node:assert/strict";
import { VetVisitReportSchema } from "./vet-visit-report.schemas";
import { reportCareDefaults } from "../utils/vet-visit-report";

const visit = { visitDate: "2026-10-14", vetPartnerId: null, vetName: " Dr. Patel ", summary: " Ear check " };
test("the visit form needs a real day, a summary, and one clinic or vet's name", () => {
  assert.deepEqual(VetVisitReportSchema.parse(visit), { ...visit, vetName: "Dr. Patel", summary: "Ear check" });
  for (const values of [{ ...visit, visitDate: "2026-02-30" }, { ...visit, summary: "  " }, { ...visit, summary: "x".repeat(2001) }, { ...visit, vetName: " " }, { ...visit, vetName: "x".repeat(121) }, { ...visit, vetPartnerId: "clh3w4i8m0000p3b0w6j7q1x2" }]) assert.equal(VetVisitReportSchema.safeParse(values).success, false);
  assert.equal(VetVisitReportSchema.safeParse({ ...visit, vetPartnerId: "clh3w4i8m0000p3b0w6j7q1x2", vetName: "" }).success, true);
});
test("report recording starts on its visit day with its outside vet, while ordinary forms keep their defaults", () => {
  assert.deepEqual(reportCareDefaults(), {});
  assert.deepEqual(reportCareDefaults({ id: "report", visitDate: "2026-10-14", vetPartnerId: "clinic", vetName: null }), { completedDate: "2026-10-14", dateUnknown: false, source: "OUTSIDE_VET", vetPartnerId: "clinic", vetName: "" });
  assert.equal(reportCareDefaults({ id: "report", visitDate: "2026-10-14", vetPartnerId: null, vetName: "Dr. Patel" }).vetName, "Dr. Patel");
});
