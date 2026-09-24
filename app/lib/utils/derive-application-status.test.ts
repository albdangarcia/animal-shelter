import { test } from "node:test";
import assert from "node:assert/strict";
import { ApplicationStatus, OutcomeType } from "@/prisma/generated/enums";
import {
  ApplicationConsequence,
  deriveApplicationConsequence,
  deriveApplicationStatus,
  toDerivationOutcome,
  type DerivationApplication,
  type DerivationOutcome,
} from "./derive-application-status";

const at = (iso: string) => new Date(iso);

const application = (
  id: string,
  reviewStatus: ApplicationStatus,
  submittedAt: string,
): DerivationApplication => ({ id, reviewStatus, submittedAt: at(submittedAt) });

const outcome = (
  createdAt: string,
  overrides: Partial<DerivationOutcome> = {},
): DerivationOutcome => ({
  createdAt: at(createdAt),
  type: OutcomeType.TRANSFER_OUT,
  adoptionApplicationId: null,
  reversed: false,
  ...overrides,
});

const adoptionOf = (
  applicationId: string,
  createdAt: string,
  reversed = false,
): DerivationOutcome =>
  outcome(createdAt, {
    type: OutcomeType.ADOPTION,
    adoptionApplicationId: applicationId,
    reversed,
  });

test("an application on an animal with no outcome keeps its review status", () => {
  for (const status of [
    ApplicationStatus.PENDING,
    ApplicationStatus.REVIEWING,
    ApplicationStatus.WAITLISTED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ] as const) {
    assert.equal(
      deriveApplicationStatus(application("a", status, "2026-09-01T10:00Z"), []),
      status,
    );
  }
});

test("the application an adoption links to is adopted", () => {
  const winner = application("a", ApplicationStatus.APPROVED, "2026-09-01T10:00Z");
  assert.equal(
    deriveApplicationStatus(winner, [adoptionOf("a", "2026-09-10T10:00Z")]),
    ApplicationConsequence.ADOPTED,
  );
});

test("every other open application on the animal is closed by the adoption", () => {
  const outcomes = [adoptionOf("winner", "2026-09-10T10:00Z")];
  for (const status of [
    ApplicationStatus.PENDING,
    ApplicationStatus.REVIEWING,
    ApplicationStatus.WAITLISTED,
    ApplicationStatus.APPROVED,
  ] as const) {
    assert.equal(
      deriveApplicationStatus(
        application("other", status, "2026-09-02T10:00Z"),
        outcomes,
      ),
      ApplicationConsequence.CLOSED,
      status,
    );
  }
});

test("any outcome type closes open applications, not only an adoption", () => {
  for (const type of Object.values(OutcomeType)) {
    if (type === OutcomeType.ADOPTION) continue;
    assert.equal(
      deriveApplicationStatus(
        application("a", ApplicationStatus.REVIEWING, "2026-09-02T10:00Z"),
        [outcome("2026-09-10T10:00Z", { type })],
      ),
      ApplicationConsequence.CLOSED,
      type,
    );
  }
});

test("a rejection or withdrawal made before the animal left stands", () => {
  const outcomes = [adoptionOf("winner", "2026-09-10T10:00Z")];
  for (const status of [
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ] as const) {
    assert.equal(
      deriveApplicationStatus(
        application("other", status, "2026-09-02T10:00Z"),
        outcomes,
      ),
      status,
    );
  }
});

// A link is only ever written by an adoption. A link on any other type is not
// an adoption of that application; the outcome still closes it like any other.
test("a link on an outcome that is not an adoption does not adopt", () => {
  assert.equal(
    deriveApplicationStatus(
      application("a", ApplicationStatus.APPROVED, "2026-09-01T10:00Z"),
      [outcome("2026-09-10T10:00Z", { adoptionApplicationId: "a" })],
    ),
    ApplicationConsequence.CLOSED,
  );
});

test("the re-intake case: closed stays closed, and a later application is live", () => {
  // Adopted out on the 10th, returned on the 20th. The return is an intake,
  // not an outcome, so it is not an input here at all — which is the point.
  const outcomes = [adoptionOf("winner", "2026-09-10T10:00Z")];

  const closedBeforeReturn = application(
    "before",
    ApplicationStatus.REVIEWING,
    "2026-09-03T10:00Z",
  );
  assert.equal(
    deriveApplicationStatus(closedBeforeReturn, outcomes),
    ApplicationConsequence.CLOSED,
  );

  const submittedAfterReturn = application(
    "after",
    ApplicationStatus.PENDING,
    "2026-09-22T10:00Z",
  );
  assert.equal(
    deriveApplicationStatus(submittedAfterReturn, outcomes),
    ApplicationStatus.PENDING,
  );

  // The first adopter is still adopted: their adoption happened, and the
  // animal coming back does not undo it.
  assert.equal(
    deriveApplicationStatus(
      application("winner", ApplicationStatus.APPROVED, "2026-09-01T10:00Z"),
      outcomes,
    ),
    ApplicationConsequence.ADOPTED,
  );
});

test("an application submitted between two stays' outcomes is closed by the second", () => {
  const outcomes = [
    adoptionOf("first", "2026-09-10T10:00Z"),
    adoptionOf("second", "2026-09-30T10:00Z"),
  ];
  assert.equal(
    deriveApplicationStatus(
      application("between", ApplicationStatus.WAITLISTED, "2026-09-22T10:00Z"),
      outcomes,
    ),
    ApplicationConsequence.CLOSED,
  );
});

// Adopted on the 1st but not entered until the 10th: the animal was still
// listed on the 5th, and that application was open when the adoption was
// recorded. Judged by the day the animal left, it would read as open.
test("a late-entered outcome closes an application submitted before it was entered", () => {
  const lateEntered = adoptionOf("winner", "2026-09-10T10:00Z");
  // `outcomeDate` would be 2026-09-01; the derivation never sees it.
  assert.equal(
    deriveApplicationStatus(
      application("a", ApplicationStatus.PENDING, "2026-09-05T10:00Z"),
      [lateEntered],
    ),
    ApplicationConsequence.CLOSED,
  );
});

// Submitting needs the animal listed and recording an outcome unlists it, so
// an application that shares the outcome's millisecond was submitted first.
test("an outcome recorded in the same instant as the submission closes it", () => {
  assert.equal(
    deriveApplicationStatus(
      application("a", ApplicationStatus.PENDING, "2026-09-10T10:00:00.000Z"),
      [outcome("2026-09-10T10:00:00.000Z")],
    ),
    ApplicationConsequence.CLOSED,
  );
});

test("an application submitted after the outcome was recorded is not closed by it", () => {
  assert.equal(
    deriveApplicationStatus(
      application("a", ApplicationStatus.PENDING, "2026-09-10T10:00:01Z"),
      [outcome("2026-09-10T10:00Z")],
    ),
    ApplicationStatus.PENDING,
  );
});

test("a reversed outcome adopts nothing and closes nothing", () => {
  const outcomes = [adoptionOf("winner", "2026-09-10T10:00Z", true)];

  assert.equal(
    deriveApplicationStatus(
      application("winner", ApplicationStatus.APPROVED, "2026-09-01T10:00Z"),
      outcomes,
    ),
    ApplicationStatus.APPROVED,
  );
  assert.equal(
    deriveApplicationStatus(
      application("other", ApplicationStatus.WAITLISTED, "2026-09-02T10:00Z"),
      outcomes,
    ),
    ApplicationStatus.WAITLISTED,
  );
  assert.equal(
    deriveApplicationStatus(
      application("a", ApplicationStatus.REVIEWING, "2026-09-02T10:00Z"),
      [outcome("2026-09-10T10:00Z", { reversed: true })],
    ),
    ApplicationStatus.REVIEWING,
  );
});

test("an adoption re-recorded after a reversal adopts the same application again", () => {
  const outcomes = [
    adoptionOf("winner", "2026-09-10T10:00Z", true),
    adoptionOf("winner", "2026-09-12T10:00Z"),
  ];
  assert.equal(
    deriveApplicationStatus(
      application("winner", ApplicationStatus.APPROVED, "2026-09-01T10:00Z"),
      outcomes,
    ),
    ApplicationConsequence.ADOPTED,
  );
  assert.equal(
    deriveApplicationStatus(
      application("other", ApplicationStatus.PENDING, "2026-09-02T10:00Z"),
      outcomes,
    ),
    ApplicationConsequence.CLOSED,
  );
});

// The status history names the outcome behind a consequence, so which outcome
// the derivation picks is as much a rule as the status it returns.
test("an application is closed by the first outcome recorded after it was submitted", () => {
  const before = outcome("2026-09-01T10:00Z", { type: OutcomeType.DECEASED });
  const first = outcome("2026-09-10T10:00Z", { type: OutcomeType.TRANSFER_OUT });
  const later = adoptionOf("winner", "2026-09-30T10:00Z");

  const consequence = deriveApplicationConsequence(
    application("a", ApplicationStatus.REVIEWING, "2026-09-05T10:00Z"),
    // Out of order on purpose: the rule is about when each was recorded.
    [later, before, first],
  );
  assert.equal(consequence?.status, ApplicationConsequence.CLOSED);
  assert.equal(consequence?.outcome, first);
});

test("a reversed outcome is never the one that closed an application", () => {
  const reversed = outcome("2026-09-10T10:00Z", { reversed: true });
  const live = outcome("2026-09-20T10:00Z");
  assert.equal(
    deriveApplicationConsequence(
      application("a", ApplicationStatus.PENDING, "2026-09-05T10:00Z"),
      [reversed, live],
    )?.outcome,
    live,
  );
});

test("an adopted application's consequence is the adoption that links to it", () => {
  const closedEarlier = outcome("2026-09-10T10:00Z");
  const adoption = adoptionOf("a", "2026-09-30T10:00Z");
  const consequence = deriveApplicationConsequence(
    application("a", ApplicationStatus.APPROVED, "2026-09-01T10:00Z"),
    [closedEarlier, adoption],
  );
  assert.equal(consequence?.status, ApplicationConsequence.ADOPTED);
  assert.equal(consequence?.outcome, adoption);
});

test("an application whose review status stands has no consequence", () => {
  const outcomes = [adoptionOf("winner", "2026-09-10T10:00Z")];
  assert.equal(
    deriveApplicationConsequence(
      application("a", ApplicationStatus.WITHDRAWN, "2026-09-01T10:00Z"),
      outcomes,
    ),
    null,
  );
  assert.equal(
    deriveApplicationConsequence(
      application("b", ApplicationStatus.PENDING, "2026-09-20T10:00Z"),
      outcomes,
    ),
    null,
  );
});

test("an outcome row is reversed exactly when reversedAt is set", () => {
  const row = {
    createdAt: new Date("2026-09-10T10:00Z"),
    type: OutcomeType.ADOPTION,
    adoptionApplicationId: "app",
  };
  assert.deepEqual(toDerivationOutcome({ ...row, reversedAt: null }), {
    ...row,
    reversed: false,
  });
  assert.deepEqual(
    toDerivationOutcome({ ...row, reversedAt: new Date("2026-09-11T10:00Z") }),
    { ...row, reversed: true },
  );
});
