import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRecordedVaccination, medicalOutputProvenance, medicalOutputDayText,
  rabiesCertificateEligibility, vaccineCredentialsIssue,
  MEDICAL_HISTORY_EMPTY_TEXT, MEDICAL_HISTORY_SCOPE_TEXT, MEDICAL_OUTPUT_COPY_TEXT,
  type RabiesCertificateEntry,
} from "./medical-output";
import { calendarDay as day } from "./shelter-day";

const requested = { animalId: "animal-a", entryId: "vaccine-a" };
const certificateEntry = (): RabiesCertificateEntry => ({
  id: requested.entryId, animalId: requested.animalId, kind: "VACCINE", status: "COMPLETED",
  voidedAt: null, outcomeId: null, completedDate: day("2028-02-29"),
  vaccine: { durationMonths: 12, validUntilDate: day("2029-02-28"), veterinarianName: "Dr Vet", veterinarianLicenseNumber: "LIC-123" },
});

const reason = (entry: RabiesCertificateEntry | null) => {
  const result = rabiesCertificateEligibility(entry, requested, day("2029-02-28"));
  return result.available ? "AVAILABLE" : result.reason;
};

test("certificate eligibility requires the selected animal and entry, completed live recorded rabies", () => {
  const entry = certificateEntry();
  assert.equal(reason(entry), "AVAILABLE");
  assert.equal(reason(null), "NOT_FOUND");
  assert.equal(reason({ ...entry, id: "other-entry" }), "NOT_FOUND");
  assert.equal(reason({ ...entry, animalId: "other-animal" }), "NOT_FOUND");
  for (const kind of ["TEST", "TREATMENT", "MICROCHIP", "SURGERY", "EXAM", "EUTHANASIA", "DEATH"] as const) {
    assert.equal(reason({ ...entry, kind }), "NOT_COMPLETED_RABIES");
  }
  for (const status of ["SCHEDULED", "DECLINED"] as const) assert.equal(reason({ ...entry, status }), "NOT_COMPLETED_RABIES");
  assert.equal(reason({ ...entry, voidedAt: new Date("2028-03-01T12:00:00Z") }), "NOT_COMPLETED_RABIES");
  assert.equal(reason({ ...entry, outcomeId: "malformed-link" }), "NOT_COMPLETED_RABIES");
  assert.equal(reason({ ...entry, vaccine: null }), "NOT_COMPLETED_RABIES");
  for (const durationMonths of [null, 0, 37, 1.5, NaN]) assert.equal(reason({ ...entry, vaccine: { ...entry.vaccine!, durationMonths } }), "NOT_COMPLETED_RABIES");
});

test("certificate refuses unknown dates and incomplete credentials without blocking ordinary facts", () => {
  const entry = certificateEntry();
  assert.equal(reason({ ...entry, completedDate: null }), "DAY_UNKNOWN");
  assert.equal(reason({ ...entry, vaccine: { ...entry.vaccine!, validUntilDate: null } }), "VALIDITY_UNKNOWN");
  for (const field of ["veterinarianName", "veterinarianLicenseNumber"] as const) {
    for (const value of [null, "", "  "]) assert.equal(reason({ ...entry, vaccine: { ...entry.vaccine!, [field]: value } }), "CREDENTIALS_MISSING");
  }
  assert.equal(vaccineCredentialsIssue({ veterinarianName: null, veterinarianLicenseNumber: null }, true), null);
  assert.equal(vaccineCredentialsIssue({ veterinarianName: "Dr Vet", veterinarianLicenseNumber: null }, true), null);
  assert.equal(vaccineCredentialsIssue({ veterinarianName: null, veterinarianLicenseNumber: "LIC" }, true), null);
  assert.equal(vaccineCredentialsIssue({ veterinarianName: " ", veterinarianLicenseNumber: " " }, false), null);
  assert.equal(vaccineCredentialsIssue({ veterinarianName: "Dr Vet", veterinarianLicenseNumber: null }, false)?.field, "veterinarianName");
  assert.equal(vaccineCredentialsIssue({ veterinarianName: null, veterinarianLicenseNumber: "LIC" }, false)?.field, "veterinarianLicenseNumber");
});

test("expired historical certificates remain printable, inclusive of their stored last day", () => {
  const entry = certificateEntry();
  for (const [today, expired] of [["2029-02-27", false], ["2029-02-28", false], ["2029-03-01", true]] as const) {
    const result = rabiesCertificateEligibility(entry, requested, day(today));
    assert.ok(result.available);
    assert.equal(result.expired, expired);
    assert.equal(result.completedDate, "2028-02-29");
    assert.equal(result.validUntilDate, "2029-02-28");
  }
  // Print the selected stored day, even if today's catalog would calculate another.
  const changed = { ...entry, vaccine: { ...entry.vaccine!, durationMonths: 36, validUntilDate: day("2028-03-31"), veterinarianName: " Dr Recorded " } };
  const result = rabiesCertificateEligibility(changed, requested, day("2028-03-31"));
  assert.ok(result.available);
  assert.equal(result.validUntilDate, "2028-03-31");
  assert.equal(result.veterinarianName, "Dr Recorded");
  assert.equal(result.expired, false);
});

test("public vaccination predicate includes only completed non-voided vaccines, without day or catalog policy", () => {
  assert.equal(isRecordedVaccination({ kind: "VACCINE", status: "COMPLETED", voidedAt: null }), true);
  for (const kind of ["TEST", "TREATMENT", "SURGERY", "EXAM", "MICROCHIP", "EUTHANASIA", "DEATH"] as const) assert.equal(isRecordedVaccination({ kind, status: "COMPLETED", voidedAt: null }), false);
  for (const status of ["SCHEDULED", "DECLINED"] as const) assert.equal(isRecordedVaccination({ kind: "VACCINE", status, voidedAt: null }), false);
  assert.equal(isRecordedVaccination({ kind: "VACCINE", status: "COMPLETED", voidedAt: new Date() }), false);
});

test("output provenance prioritizes a foster report over a corrected source and hides foster identity", () => {
  const entry = { kind: "VACCINE" as const, source: "IN_HOUSE" as const, reportedByFoster: true, vetReportId: "report" };
  assert.equal(medicalOutputProvenance(entry), "Recorded from a foster's report");
  assert.equal(medicalOutputProvenance({ ...entry, kind: "TREATMENT", vetReportId: null }), "Given in foster");
  for (const [source, label] of [["IN_HOUSE", "In house"], ["OUTSIDE_VET", "Outside vet"], ["BEFORE_INTAKE", "Before intake"]] as const) {
    assert.equal(medicalOutputProvenance({ ...entry, source, vetReportId: null, reportedByFoster: false }), label);
    assert.equal(medicalOutputProvenance({ ...entry, source, vetReportId: "report", reportedByFoster: false }), "Recorded from a foster's report");
  }
});

test("output wording keeps unknown clinical days and absent records explicit", () => {
  assert.equal(medicalOutputDayText(null), "Date unknown");
  assert.equal(medicalOutputDayText(day("2028-02-29")), "Feb 29, 2028");
  assert.equal(medicalOutputDayText(day("2026-01-31")), "Jan 31, 2026");
  for (const text of Object.values(MEDICAL_HISTORY_EMPTY_TEXT)) {
    assert.match(text, /^No .* records available\.$/);
    assert.doesNotMatch(text, /healthy|no allergies|unvaccinated/i);
  }
  assert.match(MEDICAL_HISTORY_SCOPE_TEXT, /excludes internal audit history and end-of-life/i);
  assert.match(MEDICAL_OUTPUT_COPY_TEXT, /copies do not update/);
});
