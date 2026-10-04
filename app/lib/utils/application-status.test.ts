import { test } from "node:test";
import assert from "node:assert/strict";
import { ApplicationStatus } from "@/prisma/generated/enums";
import {
  ACTIVE_APPLICATION_STATUSES,
  ALLOWED_APPLICATION_TRANSITIONS,
  APPLICANT_EDITABLE_STATUSES,
  BLOCKING_APPLICATION_STATUSES,
  MY_APPLICATION_STATUS_MESSAGES,
  NON_WITHDRAWABLE_STATUSES,
  REACTIVATION_BLOCKING_STATUSES,
  STAFF_EDITABLE_STATUSES,
  STAFF_OVERRIDABLE_APPLICATION_STATUSES,
  STATUS_SORT_RANK,
  allowedNextStatuses,
  formatStatusList,
  isAllowedTransition,
  statusChangeNeedsReason,
} from "./application-status";
import {
  EffectiveApplicationStatus,
  isReviewStatus,
} from "./derive-application-status";

test("an applicant can only edit an application nobody has picked up yet", () => {
  assert.deepEqual(APPLICANT_EDITABLE_STATUSES, [ApplicationStatus.PENDING]);
});

// The animal has left, so there is nothing to withdraw from and nothing to
// change. Reactivate is offered only at WITHDRAWN, so CLOSED never reaches it.
test("a closed application offers no withdraw or edit", () => {
  assert.ok(NON_WITHDRAWABLE_STATUSES.includes(EffectiveApplicationStatus.CLOSED));
  assert.ok(!APPLICANT_EDITABLE_STATUSES.includes(EffectiveApplicationStatus.CLOSED));
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
  for (const status of [EffectiveApplicationStatus.ADOPTED, EffectiveApplicationStatus.CLOSED]) {
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
    EffectiveApplicationStatus.ADOPTED,
    EffectiveApplicationStatus.CLOSED,
  ]) {
    assert.ok(!STAFF_EDITABLE_STATUSES.includes(status), status);
  }
});

test("a closed application never stands in the way of a new one", () => {
  assert.ok(!BLOCKING_APPLICATION_STATUSES.includes(EffectiveApplicationStatus.CLOSED));
  assert.ok(!ACTIVE_APPLICATION_STATUSES.includes(EffectiveApplicationStatus.CLOSED));
});

// A rejection is a decision, and re-applying is not the way to appeal it: the
// animal's page sends the applicant to their application instead of the form.
test("a rejection blocks a new application for the same animal", () => {
  assert.ok(BLOCKING_APPLICATION_STATUSES.includes(ApplicationStatus.REJECTED));
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
    EffectiveApplicationStatus.ADOPTED,
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
  assert.ok(!REACTIVATION_BLOCKING_STATUSES.includes(EffectiveApplicationStatus.CLOSED));
});

test("a status change needs a reason unless nothing changes or review starts", () => {
  const { PENDING, REVIEWING, REJECTED, APPROVED } = ApplicationStatus;
  assert.equal(statusChangeNeedsReason(PENDING, undefined), false);
  assert.equal(statusChangeNeedsReason(PENDING, PENDING), false);
  assert.equal(statusChangeNeedsReason(PENDING, REVIEWING), false);
  assert.equal(statusChangeNeedsReason(PENDING, REJECTED), true);
  assert.equal(statusChangeNeedsReason(REVIEWING, APPROVED), true);
});

// The status message is the only place a status change is explained to the
// applicant, so no two statuses may read alike. Waitlisted must not read as a
// slower Pending, and Closed must not read as a rejection.
test("every status has its own message; Waitlisted is not Pending, Closed is not Rejected", () => {
  const titles = Object.values(MY_APPLICATION_STATUS_MESSAGES).map(
    (message) => message.title,
  );
  assert.equal(titles.length, Object.values(EffectiveApplicationStatus).length);
  assert.equal(new Set(titles).size, titles.length, titles.join(" | "));

  const { PENDING, WAITLISTED, REJECTED, CLOSED } = MY_APPLICATION_STATUS_MESSAGES;
  assert.notEqual(WAITLISTED.title, PENDING.title);
  assert.notEqual(CLOSED.title, REJECTED.title);
  assert.match(
    CLOSED.description,
    /It is not a decision about you or your application/,
  );
});

// A status sort walks the review in the order staff move through it, then the
// two statuses an outcome causes. No two statuses may tie: tied rows fall back
// to newest first, which would mix them on the page. The input is reversed so
// that a tie, or a rank that compares as one, cannot leave it in order.
test("a status sort puts the review stages in order, then the decisions, then adopted and closed", () => {
  const ranks = Object.values(EffectiveApplicationStatus).map(
    (status) => STATUS_SORT_RANK[status],
  );
  assert.ok(ranks.every(Number.isInteger), ranks.join(", "));
  assert.equal(new Set(ranks).size, ranks.length, ranks.join(", "));
  assert.deepEqual(
    Object.values(EffectiveApplicationStatus)
      .reverse()
      .sort((a, b) => STATUS_SORT_RANK[a] - STATUS_SORT_RANK[b]),
    [
      EffectiveApplicationStatus.PENDING,
      EffectiveApplicationStatus.REVIEWING,
      EffectiveApplicationStatus.WAITLISTED,
      EffectiveApplicationStatus.APPROVED,
      EffectiveApplicationStatus.REJECTED,
      EffectiveApplicationStatus.WITHDRAWN,
      EffectiveApplicationStatus.ADOPTED,
      EffectiveApplicationStatus.CLOSED,
    ],
  );
});
