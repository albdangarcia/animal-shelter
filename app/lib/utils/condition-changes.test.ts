import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeConditionChanges,
  formatConditionFieldValue,
} from "./condition-changes";
import {
  describeCareEpisodeChanges,
  formatCareEpisodeFieldValue,
} from "./care-episode-changes";

const names = {
  entry1: "Heartworm antigen test of Sep 3, 2026",
  trait1: "Heartworm Positive",
  clinic1: "Downtown Veterinary Clinic",
};

test("formatConditionFieldValue: enums, days and ids read as words", () => {
  assert.equal(formatConditionFieldValue("type", "ALLERGY", names), "Allergy");
  assert.equal(formatConditionFieldValue("status", "CHRONIC", names), "Chronic");
  assert.equal(formatConditionFieldValue("onsetDate", "2026-09-03", names), "Sep 3, 2026");
  assert.equal(formatConditionFieldValue("resolvedDate", null, names), "none");
  assert.equal(
    formatConditionFieldValue("sourceEntryId", "entry1", names),
    "Heartworm antigen test of Sep 3, 2026",
  );
  assert.equal(formatConditionFieldValue("characteristicId", "trait1", names), "Heartworm Positive");
  assert.equal(
    formatConditionFieldValue("characteristicId", "gone", names),
    "a record that no longer exists",
  );
  assert.equal(formatConditionFieldValue("diagnosedBy", "Dr. Patel", names), "Dr. Patel");
  assert.equal(formatConditionFieldValue("notes", "", names), "none");
});

test("describeConditionChanges: a resolve with a correction, in the form's order", () => {
  assert.deepEqual(
    describeConditionChanges(
      { notes: null, resolvedDate: null, status: "ACTIVE", sourceEntryId: null },
      { notes: "Cleared on retest.", resolvedDate: "2026-10-08", status: "RESOLVED", sourceEntryId: "entry1" },
      names,
    ),
    [
      { field: "status", label: "Status", from: "Active", to: "Resolved" },
      { field: "resolvedDate", label: "Resolved date", from: "none", to: "Oct 8, 2026" },
      {
        field: "sourceEntryId",
        label: "Found on",
        from: "none",
        to: "Heartworm antigen test of Sep 3, 2026",
      },
      { field: "notes", label: "Notes", from: "none", to: "Cleared on retest." },
    ],
  );
});

test("formatCareEpisodeFieldValue: an episode with no end day reads as open", () => {
  assert.equal(formatCareEpisodeFieldValue("endDate", null, names), "open");
  assert.equal(formatCareEpisodeFieldValue("endDate", "2026-10-09", names), "Oct 9, 2026");
  assert.equal(formatCareEpisodeFieldValue("partnerId", null, names), "none");
  assert.equal(
    formatCareEpisodeFieldValue("partnerId", "clinic1", names),
    "Downtown Veterinary Clinic",
  );
  assert.equal(
    formatCareEpisodeFieldValue("type", "HOSPITALISED_OFF_SITE", names),
    "Hospitalised off site",
  );
  assert.equal(formatCareEpisodeFieldValue("reason", "Not eating.", names), "Not eating.");
});

test("describeCareEpisodeChanges: a close, and a correction in the form's order", () => {
  assert.deepEqual(
    describeCareEpisodeChanges({ endDate: null }, { endDate: "2026-10-09" }, names),
    [{ field: "endDate", label: "End date", from: "open", to: "Oct 9, 2026" }],
  );
  assert.deepEqual(
    describeCareEpisodeChanges(
      { reason: "Cough.", partnerId: null, type: "UNDER_VET_CARE" },
      { reason: "Pneumonia.", partnerId: "clinic1", type: "HOSPITALISED_OFF_SITE" },
      names,
    ).map((change) => [change.label, change.from, change.to]),
    [
      ["Type", "Under vet care", "Hospitalised off site"],
      ["Clinic", "none", "Downtown Veterinary Clinic"],
      ["Reason", "Cough.", "Pneumonia."],
    ],
  );
});
