import { test } from "node:test";
import assert from "node:assert/strict";
import { ApplicationStatus } from "@/prisma/generated/enums";
import {
  ALLOWED_APPLICATION_TRANSITIONS,
  APPLICANT_EDITABLE_STATUSES,
  STAFF_EDITABLE_STATUSES,
  formatStatusList,
} from "./application-status";

test("an applicant can only edit an application nobody has picked up yet", () => {
  assert.deepEqual(APPLICANT_EDITABLE_STATUSES, [ApplicationStatus.PENDING]);
});

test("staff can edit at every status the applicant can", () => {
  for (const status of APPLICANT_EDITABLE_STATUSES) {
    assert.ok(STAFF_EDITABLE_STATUSES.includes(status), status);
  }
});

// A status with no way forward is a closed-out record; rewriting the snapshot
// behind it would leave the decision resting on text that no longer says what
// it said. This fails when a status is added to the staff list carelessly.
test("staff can only edit applications that can still move forward", () => {
  for (const status of STAFF_EDITABLE_STATUSES) {
    assert.ok(ALLOWED_APPLICATION_TRANSITIONS[status].length > 0, status);
  }
});

// The refusal messages read their status list from the arrays above rather
// than spelling it out, so widening a list cannot leave a message behind
// claiming the old, narrower rule.
test("a status list reads as a sentence at every length", () => {
  assert.equal(formatStatusList([ApplicationStatus.PENDING]), "pending");
  assert.equal(
    formatStatusList([ApplicationStatus.PENDING, ApplicationStatus.WAITLISTED]),
    "pending or waitlisted",
  );
  assert.equal(
    formatStatusList(STAFF_EDITABLE_STATUSES),
    "pending, reviewing, waitlisted or approved",
  );
});

test("the applicant refusal message names today's allow-list", () => {
  assert.equal(formatStatusList(APPLICANT_EDITABLE_STATUSES), "pending");
});

test("staff cannot edit rejected, withdrawn, adopted or closed applications", () => {
  for (const status of [
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ADOPTED,
    ApplicationStatus.CLOSED,
  ]) {
    assert.ok(!STAFF_EDITABLE_STATUSES.includes(status), status);
  }
});
