import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createdEventVerb,
  declineText,
  describeEntryChanges,
  formatEntryFieldValue,
} from "./medical-entry-changes";

const names = { item1: "DHPP", clinic1: "Downtown Veterinary Clinic", p1: "Olivia Chen" };

test("formatEntryFieldValue: ids read as names, and a missing one says so", () => {
  assert.equal(formatEntryFieldValue("itemId", "item1", names), "DHPP");
  assert.equal(
    formatEntryFieldValue("vetPartnerId", "clinic1", names),
    "Downtown Veterinary Clinic",
  );
  assert.equal(formatEntryFieldValue("administeredById", "p1", names), "Olivia Chen");
  assert.equal(
    formatEntryFieldValue("itemId", "gone", names),
    "a record that no longer exists",
  );
});

test("formatEntryFieldValue: days, enums, durations and results read as words", () => {
  assert.equal(formatEntryFieldValue("completedDate", "2026-09-01", names), "Sep 1, 2026");
  assert.equal(formatEntryFieldValue("completedDate", null, names), "unknown");
  assert.equal(formatEntryFieldValue("lotExpiryDate", null, names), "none");
  assert.equal(formatEntryFieldValue("source", "BEFORE_INTAKE", names), "Before intake");
  assert.equal(formatEntryFieldValue("route", "SUBCUTANEOUS", names), "Subcutaneous (SQ)");
  assert.equal(formatEntryFieldValue("doseUnit", "ML", names), "mL");
  assert.equal(formatEntryFieldValue("durationMonths", 12, names), "12 months");
  assert.equal(formatEntryFieldValue("doseAmount", 2.5, names), "2.5");
  assert.equal(
    formatEntryFieldValue(
      "results",
      [
        { analyteId: "a", analyteName: "FeLV antigen", result: "NEGATIVE" },
        { analyteId: "b", analyteName: "FIV antibody", result: "POSITIVE" },
      ],
      names,
    ),
    "FeLV antigen negative, FIV antibody positive",
  );
});

test("describeEntryChanges: one row per changed field, in form order", () => {
  assert.deepEqual(
    describeEntryChanges(
      { lotNumber: "A123", completedDate: "2026-09-01" },
      { lotNumber: "B456", completedDate: "2026-09-02" },
      names,
    ),
    [
      { field: "completedDate", label: "Date given", from: "Sep 1, 2026", to: "Sep 2, 2026" },
      { field: "lotNumber", label: "Lot number", from: "A123", to: "B456" },
    ],
  );
});

test("formatEntryFieldValue: statuses read as words, and due dates as dates", () => {
  assert.equal(formatEntryFieldValue("status", "SCHEDULED", names), "Scheduled");
  assert.equal(formatEntryFieldValue("status", "COMPLETED", names), "Given");
  assert.equal(formatEntryFieldValue("status", "DECLINED", names), "Declined");
  assert.equal(formatEntryFieldValue("dueDate", "2026-10-14", names), "Oct 14, 2026");
  assert.equal(formatEntryFieldValue("dueDate", null, names), "none");
  assert.equal(
    formatEntryFieldValue("declineReason", "Reaction noted last time.", names),
    "Reaction noted last time.",
  );
});

test("describeEntryChanges: a reschedule reads as the due date before and after", () => {
  assert.deepEqual(
    describeEntryChanges({ dueDate: "2026-10-14" }, { dueDate: "2026-10-20" }, names),
    [{ field: "dueDate", label: "Due date", from: "Oct 14, 2026", to: "Oct 20, 2026" }],
  );
});

test("formatEntryFieldValue: surgery, chip and exemption fields read as words", () => {
  assert.equal(formatEntryFieldValue("procedure", "MASS_REMOVAL", names), "Mass removal");
  assert.equal(formatEntryFieldValue("evidence", "VET_RECORDS", names), "Vet records");
  assert.equal(
    formatEntryFieldValue("exemptionReason", "PARTNER_WILL_ALTER", names),
    "Partner will alter",
  );
  assert.equal(formatEntryFieldValue("reviewDate", "2026-11-03", names), "Nov 3, 2026");
  assert.equal(formatEntryFieldValue("reviewDate", null, names), "none");
  assert.equal(
    formatEntryFieldValue("chipNumber", "985141000100003", names),
    "985141000100003",
  );
  assert.equal(formatEntryFieldValue("brand", null, names), "none");
});

test("describeEntryChanges: a corrected surgery and chip read in form order", () => {
  assert.deepEqual(
    describeEntryChanges(
      { findings: null, procedure: "NEUTER", surgeon: "Dr. Lee" },
      { findings: "Small hernia.", procedure: "SPAY", surgeon: "Dr. Park" },
      names,
    ),
    [
      { field: "procedure", label: "Procedure", from: "Neuter", to: "Spay" },
      { field: "surgeon", label: "Surgeon", from: "Dr. Lee", to: "Dr. Park" },
      { field: "findings", label: "Findings", from: "none", to: "Small hernia." },
    ],
  );
  assert.deepEqual(
    describeEntryChanges(
      { brand: "HomeAgain", chipNumber: "985141000100001" },
      { brand: "Datamars", chipNumber: "985141000100002" },
      names,
    ).map((change) => change.label),
    ["Chip number", "Brand"],
  );
});

test("declineText: the words given, or an exemption's reason, review day and words", () => {
  assert.equal(
    declineText({ status: "DECLINED", declineReason: "Reaction noted last time." }),
    "Reaction noted last time.",
  );
  assert.equal(
    declineText({
      status: "DECLINED",
      exemptionReason: "TOO_YOUNG_OR_UNDERWEIGHT",
      reviewDate: "2026-11-03",
      declineReason: null,
    }),
    "Too young or underweight, review on Nov 3, 2026.",
  );
  assert.equal(
    declineText({
      status: "DECLINED",
      exemptionReason: "OTHER",
      reviewDate: null,
      declineReason: "Not routinely done for this species.",
    }),
    "Other, no review date. Not routinely done for this species.",
  );
  assert.equal(declineText(null), "");
});

test("formatEntryFieldValue: exam fields read as words", () => {
  assert.equal(formatEntryFieldValue("examType", "PRE_ADOPTION", names), "Pre-adoption exam");
  assert.equal(formatEntryFieldValue("overallResult", "NEEDS_VET_REVIEW", names), "Needs vet review");
  assert.equal(formatEntryFieldValue("reproductiveStatus", "INTACT", names), "Intact");
  assert.equal(formatEntryFieldValue("reproductiveStatus", null, names), "none");
});

test("describeEntryChanges: a corrected exam lists each changed system in form order", () => {
  const finding = (bodySystem: string, status: string, notes: string | null = null) => ({
    bodySystem,
    status,
    notes,
  });
  assert.deepEqual(
    describeEntryChanges(
      {
        examType: "VET",
        overallResult: "NEEDS_VET_REVIEW",
        reproductiveStatus: null,
        examFindings: [
          finding("EYES", "NORMAL"),
          finding("EARS", "ABNORMAL", "Ear mites."),
          finding("HEART", "NORMAL"),
          finding("LUNGS", "NOT_EXAMINED"),
        ],
      },
      {
        examType: "RECHECK",
        overallResult: "NO_CONCERNS",
        reproductiveStatus: "INTACT",
        // Stored in any order: the rows follow the form's.
        examFindings: [
          finding("LUNGS", "NOT_EXAMINED"),
          finding("HEART", "ABNORMAL", "Grade II murmur"),
          finding("EARS", "ABNORMAL", "Ear mites, cleared."),
          finding("EYES", "NORMAL"),
        ],
      },
      names,
    ),
    [
      { field: "examType", label: "Exam type", from: "Vet exam", to: "Recheck exam" },
      {
        field: "overallResult",
        label: "Result",
        from: "Needs vet review",
        to: "No concerns",
      },
      {
        field: "examFindings.EARS",
        label: "Ears",
        from: "abnormal (Ear mites.)",
        to: "abnormal (Ear mites, cleared.)",
      },
      {
        field: "examFindings.HEART",
        label: "Heart",
        from: "normal",
        to: "abnormal (Grade II murmur)",
      },
      {
        field: "reproductiveStatus",
        label: "Reproductive status",
        from: "none",
        to: "Intact",
      },
    ],
  );
});

test("describeEntryChanges: a system missing on one side reads as none, and record links are left out", () => {
  assert.deepEqual(
    describeEntryChanges(
      { examFindings: [{ bodySystem: "HEART", status: "NORMAL", notes: null }] },
      {
        examFindings: [],
        vitalsLogId: "vitals1",
        foundOnExamId: "exam1",
      },
      names,
    ),
    [{ field: "examFindings.HEART", label: "Heart", from: "normal", to: "none" }],
  );
});

test("createdEventVerb: what the entry's first event reads, naming the protocol that scheduled it", () => {
  const names = { "step-1": "Puppy", "step-2": "Rabbit protocol" };
  assert.equal(createdEventVerb({ status: "COMPLETED" }, names), "Recorded");
  assert.equal(createdEventVerb({ status: "SCHEDULED" }, names), "Scheduled");
  assert.equal(
    createdEventVerb({ status: "SCHEDULED", protocolStepId: "step-1" }, names),
    "Scheduled from the Puppy protocol",
  );
  assert.equal(
    createdEventVerb({ status: "SCHEDULED", protocolStepId: "step-2" }, names),
    "Scheduled from the Rabbit protocol",
  );
  // A step no name was read for reads as plain scheduling.
  assert.equal(
    createdEventVerb({ status: "SCHEDULED", protocolStepId: "gone" }, names),
    "Scheduled",
  );
  assert.equal(createdEventVerb({ status: "DECLINED" }, names), "Exemption recorded");
  assert.equal(createdEventVerb(null, names), "Recorded");
});

test("describeEntryChanges: the protocol step an entry came from is never listed as a change", () => {
  assert.deepEqual(
    describeEntryChanges(
      { dueDate: "2026-10-14", protocolStepId: "step-1" },
      { dueDate: "2026-10-21", protocolStepId: "step-1" },
      {},
    ).map((change) => change.field),
    ["dueDate"],
  );
});
