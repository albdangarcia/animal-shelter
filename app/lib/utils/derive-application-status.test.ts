import { test } from "node:test";
import assert from "node:assert/strict";
import { ApplicationStatus, OutcomeType } from "@/prisma/generated/enums";
import {
  deriveApplicationStatus,
  type DerivationApplication,
  type DerivationOutcome,
  type ReviewStatus,
} from "./derive-application-status";

const at = (iso: string) => new Date(iso);

const application = (
  id: string,
  reviewStatus: ReviewStatus,
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
    ApplicationStatus.ADOPTED,
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
      ApplicationStatus.CLOSED,
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
      ApplicationStatus.CLOSED,
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
    ApplicationStatus.CLOSED,
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
    ApplicationStatus.CLOSED,
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
    ApplicationStatus.ADOPTED,
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
    ApplicationStatus.CLOSED,
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
    ApplicationStatus.CLOSED,
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
    ApplicationStatus.ADOPTED,
  );
  assert.equal(
    deriveApplicationStatus(
      application("other", ApplicationStatus.PENDING, "2026-09-02T10:00Z"),
      outcomes,
    ),
    ApplicationStatus.CLOSED,
  );
});
