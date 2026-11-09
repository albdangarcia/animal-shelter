import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeDocumentChanges,
  formatDocumentFieldValue,
} from "./medical-document-changes";

const names = {
  entry1: "Heartworm antigen test on Oct 12, 2026",
  entry2: "Heartworm antigen test due Oct 20, 2026",
};

test("formatDocumentFieldValue: the type, the day and the entry read as words", () => {
  assert.equal(formatDocumentFieldValue("type", "LAB_RESULT", names), "Lab result");
  assert.equal(formatDocumentFieldValue("type", "CONSENT_FORM", names), "Consent form");
  assert.equal(formatDocumentFieldValue("documentDate", "2026-10-12", names), "Oct 12, 2026");
  assert.equal(formatDocumentFieldValue("documentDate", null, names), "none");
  assert.equal(
    formatDocumentFieldValue("entryId", "entry1", names),
    "Heartworm antigen test on Oct 12, 2026",
  );
  assert.equal(
    formatDocumentFieldValue("entryId", "gone", names),
    "an entry that no longer exists",
  );
  assert.equal(formatDocumentFieldValue("name", "Heartworm panel", names), "Heartworm panel");
  assert.equal(formatDocumentFieldValue("notes", "", names), "none");
});

test("describeDocumentChanges: every field of a correction, in the form's order", () => {
  assert.deepEqual(
    describeDocumentChanges(
      { notes: null, entryId: "entry1", type: "OTHER", name: "scan", documentDate: null },
      {
        notes: "Retest.",
        entryId: "entry2",
        type: "LAB_RESULT",
        name: "Heartworm panel",
        documentDate: "2026-10-12",
      },
      names,
    ),
    [
      { field: "name", label: "Name", from: "scan", to: "Heartworm panel" },
      { field: "type", label: "Type", from: "Other", to: "Lab result" },
      { field: "documentDate", label: "Document date", from: "none", to: "Oct 12, 2026" },
      {
        field: "entryId",
        label: "Entry",
        from: "Heartworm antigen test on Oct 12, 2026",
        to: "Heartworm antigen test due Oct 20, 2026",
      },
      { field: "notes", label: "Notes", from: "none", to: "Retest." },
    ],
  );
  // An entry unlinked reads as none.
  assert.deepEqual(describeDocumentChanges({ entryId: "entry1" }, { entryId: null }, names), [
    { field: "entryId", label: "Entry", from: "Heartworm antigen test on Oct 12, 2026", to: "none" },
  ]);
});
