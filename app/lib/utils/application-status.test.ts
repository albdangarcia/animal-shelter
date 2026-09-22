import { test } from "node:test";
import assert from "node:assert/strict";
import { ApplicationStatus } from "@/prisma/generated/enums";
import {
  ACTIVE_APPLICATION_STATUSES,
  ALLOWED_APPLICATION_TRANSITIONS,
  APPLICANT_EDITABLE_STATUSES,
  BLOCKING_APPLICATION_STATUSES,
  REACTIVATION_BLOCKING_STATUSES,
  STAFF_EDITABLE_STATUSES,
  STAFF_OVERRIDABLE_APPLICATION_STATUSES,
  allowedNextStatuses,
  formatStatusList,
  isAllowedTransition,
} from "./application-status";
import { isReviewStatus } from "./derive-application-status";

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
    assert.ok(allowedNextStatuses(status).length > 0, status);
  }
});

// A transition is a review decision. Nobody decides that an application was
// adopted or closed, so staff can neither move one there nor out again.
test("a transition only ever leads to a review decision", () => {
  for (const targets of Object.values(ALLOWED_APPLICATION_TRANSITIONS)) {
    for (const target of targets) {
      assert.ok(isReviewStatus(target), target);
    }
  }
});

test("an application an outcome has adopted or closed has nothing left to review", () => {
  for (const status of [ApplicationStatus.ADOPTED, ApplicationStatus.CLOSED]) {
    assert.deepEqual(allowedNextStatuses(status), [], status);
    for (const target of Object.values(ApplicationStatus)) {
      assert.ok(!isAllowedTransition(status, target), `${status} -> ${target}`);
    }
  }
});

test("a review decision's next statuses are the transition map's", () => {
  for (const [status, targets] of Object.entries(ALLOWED_APPLICATION_TRANSITIONS)) {
    assert.deepEqual(
      allowedNextStatuses(status as ApplicationStatus),
      targets,
      status,
    );
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

test("a closed application never stands in the way of a new one", () => {
  assert.ok(!BLOCKING_APPLICATION_STATUSES.includes(ApplicationStatus.CLOSED));
  assert.ok(!ACTIVE_APPLICATION_STATUSES.includes(ApplicationStatus.CLOSED));
});

test("only the statuses staff may override separate active from blocking", () => {
  assert.deepEqual(
    BLOCKING_APPLICATION_STATUSES.filter(
      (status) => !ACTIVE_APPLICATION_STATUSES.includes(status),
    ),
    STAFF_OVERRIDABLE_APPLICATION_STATUSES,
  );
});

test("every status an application can be worked in is active", () => {
  for (const status of [
    ApplicationStatus.PENDING,
    ApplicationStatus.REVIEWING,
    ApplicationStatus.WAITLISTED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.ADOPTED,
  ]) {
    assert.ok(ACTIVE_APPLICATION_STATUSES.includes(status), status);
  }
});

test("a rejection is not undone by reviving an older withdrawn application", () => {
  assert.ok(
    REACTIVATION_BLOCKING_STATUSES.includes(ApplicationStatus.REJECTED),
  );
  for (const status of ACTIVE_APPLICATION_STATUSES) {
    assert.ok(REACTIVATION_BLOCKING_STATUSES.includes(status), status);
  }
});

test("a withdrawn application never blocks reviving another one", () => {
  assert.ok(
    !REACTIVATION_BLOCKING_STATUSES.includes(ApplicationStatus.WITHDRAWN),
  );
  assert.ok(!REACTIVATION_BLOCKING_STATUSES.includes(ApplicationStatus.CLOSED));
});
