import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeReadiness,
  type ComputeReadinessInputs,
  type ReadinessAssessment,
  type ReadinessCharacteristicClaim,
  type ReadinessExam,
} from "./compute-readiness";
import {
  shelterDayKey,
  shelterDaysBetween,
  shiftDayKey,
  type CalendarDay,
} from "../utils/shelter-day";

const NOW = new Date(2026, 8, 12, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY);
const IN_CARE_SINCE = daysBefore(40);

const day = (value: string) => value as CalendarDay;

// The stay's first day on the shelter's calendar (Aug 3, 40 days before
// Sep 12, read in Los Angeles whatever the machine's timezone). Its intake
// exam was done that day, with no concerns.
const STAY_DAY = shelterDayKey(IN_CARE_SINCE, "America/Los_Angeles");
const exam = (overrides: Partial<ReadinessExam> = {}): ReadinessExam => ({
  entryId: "exam-intake",
  examType: "INTAKE",
  completedDate: STAY_DAY,
  overallResult: "NO_CONCERNS",
  reproductiveStatus: null,
  createdAt: IN_CARE_SINCE,
  ...overrides,
});

const baseInputs: ComputeReadinessInputs = {
  requirements: [],
  assessments: [],
  claims: [],
  spayNeuter: {
    status: "ALTERED",
    entryId: "e1",
    procedure: "SPAY",
    completedDate: null,
  },
  exams: [exam()],
  hasPhoto: true,
  openEpisode: null,
  inCareSince: IN_CARE_SINCE,
  timezone: "America/Los_Angeles",
};
const UNKNOWN = { status: "UNKNOWN", lapsedOn: null } as const;

const assessment = (
  overrides: Partial<ReadinessAssessment> = {},
): ReadinessAssessment => ({
  id: "a1",
  templateKey: "INTAKE_BEHAVIORAL",
  templateName: "Intake Behavioral",
  observedAt: NOW,
  signal: "NO_CONCERNS",
  ...overrides,
});

const claim = (
  overrides: Partial<ReadinessCharacteristicClaim> = {},
): ReadinessCharacteristicClaim => ({
  characteristicId: "c1",
  characteristicName: "Good with cats",
  assignedAt: daysBefore(30),
  contradictedAt: null,
  sourceDeletedAt: null,
  supportLostAt: null,
  ...overrides,
});

test("an animal with nothing wrong has no blockers", () => {
  assert.deepEqual(computeReadiness(baseInputs), []);
});

test("a requirement with no matching assessment is missing", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    requirements: [{ templateKey: "INTAKE_BEHAVIORAL", templateName: "Intake Behavioral" }],
  });
  assert.deepEqual(blockers, [
    {
      kind: "MISSING_ASSESSMENT",
      templateKey: "INTAKE_BEHAVIORAL",
      templateName: "Intake Behavioral",
      since: IN_CARE_SINCE,
    },
  ]);
});

test("a satisfied one-time requirement, however old, is not missing", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    requirements: [{ templateKey: "INTAKE_BEHAVIORAL", templateName: "Intake Behavioral" }],
    assessments: [assessment({ observedAt: new Date(2020, 0, 1) })],
  });
  assert.deepEqual(blockers, []);
});

test("multiple unmet requirements each produce their own blocker", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    requirements: [
      { templateKey: "INTAKE_BEHAVIORAL", templateName: "Intake Behavioral" },
      { templateKey: "CAT_TEST", templateName: "Cat Test" },
    ],
  });
  assert.equal(blockers.length, 2);
  assert.ok(blockers.every((b) => b.kind === "MISSING_ASSESSMENT"));
});

test("a live escalated finding blocks", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [assessment({ signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test" })],
  });
  assert.deepEqual(blockers, [
    { kind: "ESCALATED_FINDING", assessmentId: "a1", templateName: "Cat Test", observedAt: NOW, since: NOW },
  ]);
});

test("an escalation superseded by a later, calmer check of the same template does not block", () => {
  const earlier = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [
      assessment({ id: "old", signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test", observedAt: earlier }),
      assessment({ id: "new", signal: "NO_CONCERNS", templateKey: "CAT_TEST", templateName: "Cat Test", observedAt: NOW }),
    ],
  });
  assert.deepEqual(blockers, []);
});

test("an escalation is not superseded by a later check of a different template", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [
      assessment({ id: "cat", signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test", observedAt: new Date(2026, 0, 1) }),
      assessment({ id: "dog", signal: "NO_CONCERNS", templateKey: "DOG_INTRO", templateName: "Dog-to-Dog Introduction", observedAt: NOW }),
    ],
  });
  assert.deepEqual(blockers, [
    {
      kind: "ESCALATED_FINDING",
      assessmentId: "cat",
      templateName: "Cat Test",
      observedAt: new Date(2026, 0, 1),
      since: new Date(2026, 0, 1),
    },
  ]);
});

test("escalations are ordered deterministically by template key", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    assessments: [
      assessment({ id: "dog", signal: "ESCALATE", templateKey: "DOG_INTRO", templateName: "Dog-to-Dog Introduction" }),
      assessment({ id: "cat", signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test" }),
    ],
  });
  assert.deepEqual(
    blockers.map((b) => (b.kind === "ESCALATED_FINDING" ? b.assessmentId : null)),
    ["cat", "dog"],
  );
});

test("a contradicted characteristic blocks", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ contradictedAt: daysBefore(9) })],
  });
  assert.deepEqual(blockers, [
    {
      kind: "UNSUPPORTED_CHARACTERISTIC",
      characteristicId: "c1",
      characteristicName: "Good with cats",
      issue: "CONTRADICTED",
      since: daysBefore(9),
    },
  ]);
});

test("a trait citing a deleted assessment blocks with SOURCE_DELETED", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ sourceDeletedAt: daysBefore(6) })],
  });
  assert.deepEqual(blockers, [
    {
      kind: "UNSUPPORTED_CHARACTERISTIC",
      characteristicId: "c1",
      characteristicName: "Good with cats",
      issue: "SOURCE_DELETED",
      since: daysBefore(6),
    },
  ]);
});

test("a trait whose source no longer supports it blocks with NO_LONGER_SUPPORTED", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ supportLostAt: daysBefore(2) })],
  });
  assert.deepEqual(blockers, [
    {
      kind: "UNSUPPORTED_CHARACTERISTIC",
      characteristicId: "c1",
      characteristicName: "Good with cats",
      issue: "NO_LONGER_SUPPORTED",
      since: daysBefore(2),
    },
  ]);
});

test("a claim made over older evidence is undermined only from when it was made", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ assignedAt: daysBefore(3), contradictedAt: daysBefore(21) })],
  });
  assert.deepEqual(
    blockers.map((b) => b.since),
    [daysBefore(3)],
  );
});

test("SOURCE_DELETED wins over NO_LONGER_SUPPORTED — a deleted source's answers aren't a separate problem", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ sourceDeletedAt: daysBefore(6), supportLostAt: daysBefore(8) })],
  });
  assert.deepEqual(
    blockers.map((b) => (b.kind === "UNSUPPORTED_CHARACTERISTIC" ? b.issue : null)),
    ["SOURCE_DELETED"],
  );
});

test("a deleted source and a separate live contradiction are two distinct problems", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    claims: [claim({ sourceDeletedAt: daysBefore(6), contradictedAt: daysBefore(9) })],
  });
  assert.deepEqual(
    blockers.map((b) => (b.kind === "UNSUPPORTED_CHARACTERISTIC" ? b.issue : null)).sort(),
    ["CONTRADICTED", "SOURCE_DELETED"],
  );
});

test("an unassigned, unproblematic claim is never passed in — no blocker from an empty claim", () => {
  const blockers = computeReadiness({ ...baseInputs, claims: [claim()] });
  assert.deepEqual(blockers, []);
});

test("no spay or neuter on record blocks from the start of the stay", () => {
  const blockers = computeReadiness({ ...baseInputs, spayNeuter: UNKNOWN });
  assert.deepEqual(blockers, [{ kind: "NOT_SPAYED_NEUTERED", since: IN_CARE_SINCE }]);
});

test("an exemption in force does not block, with or without a review day", () => {
  for (const reviewDate of [day("2026-10-01"), null]) {
    const blockers = computeReadiness({
      ...baseInputs,
      spayNeuter: {
        status: "EXEMPT",
        entryId: "e1",
        reason: "TOO_YOUNG_OR_UNDERWEIGHT",
        reviewDate,
      },
    });
    assert.deepEqual(blockers, []);
  }
});

test("a lapsed exemption blocks from the start of the day after its review day", () => {
  // Reviewed Sep 5 in Los Angeles, so needed from midnight Sep 6 there
  // (07:00 UTC, daylight time), well after this stay began.
  const blockers = computeReadiness({
    ...baseInputs,
    spayNeuter: { status: "UNKNOWN", lapsedOn: day("2026-09-05") },
  });
  assert.deepEqual(blockers, [
    { kind: "NOT_SPAYED_NEUTERED", since: new Date("2026-09-06T07:00:00Z") },
  ]);
});

test("an exemption that lapsed before this stay began blocks from the stay", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    spayNeuter: { status: "UNKNOWN", lapsedOn: day("2026-01-10") },
  });
  assert.deepEqual(blockers, [{ kind: "NOT_SPAYED_NEUTERED", since: IN_CARE_SINCE }]);
});

test("an exam that found the animal intact blocks as Unknown does: from the stay, or after a lapse", () => {
  const intact = (lapsedOn: CalendarDay | null) =>
    ({
      status: "INTACT",
      examEntryId: "exam-1",
      examDate: day("2026-08-20"),
      lapsedOn,
    }) as const;
  assert.deepEqual(computeReadiness({ ...baseInputs, spayNeuter: intact(null) }), [
    { kind: "NOT_SPAYED_NEUTERED", since: IN_CARE_SINCE },
  ]);
  assert.deepEqual(
    computeReadiness({ ...baseInputs, spayNeuter: intact(day("2026-09-05")) }),
    [{ kind: "NOT_SPAYED_NEUTERED", since: new Date("2026-09-06T07:00:00Z") }],
  );
});

test("no intake exam blocks from the start of the stay", () => {
  assert.deepEqual(computeReadiness({ ...baseInputs, exams: [] }), [
    { kind: "NO_INTAKE_EXAM", since: IN_CARE_SINCE },
  ]);
  // Another type of exam doesn't stand in for it.
  assert.deepEqual(
    computeReadiness({ ...baseInputs, exams: [exam({ examType: "VET" })] }),
    [{ kind: "NO_INTAKE_EXAM", since: IN_CARE_SINCE }],
  );
});

test("an intake exam counts for the stay it was done in", () => {
  // From an earlier stay: the day before this one began.
  assert.deepEqual(
    computeReadiness({
      ...baseInputs,
      exams: [exam({ completedDate: shiftDayKey(STAY_DAY, -1) })],
    }),
    [{ kind: "NO_INTAKE_EXAM", since: IN_CARE_SINCE }],
  );
  // On the stay's first day, it counts.
  assert.deepEqual(
    computeReadiness({ ...baseInputs, exams: [exam({ completedDate: STAY_DAY })] }),
    [],
  );
});

test("the stay's latest exam asking for a vet's review blocks from its day", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    exams: [
      exam(),
      exam({
        entryId: "exam-recheck",
        examType: "RECHECK",
        completedDate: day("2026-09-05"),
        overallResult: "NEEDS_VET_REVIEW",
      }),
    ],
  });
  // Midnight Sep 5 in Los Angeles is 07:00 UTC, daylight time.
  assert.deepEqual(blockers, [
    {
      kind: "NEEDS_VET_REVIEW",
      entryId: "exam-recheck",
      examType: "RECHECK",
      examDate: day("2026-09-05"),
      since: new Date("2026-09-05T07:00:00Z"),
    },
  ]);
});

test("a later exam with another result clears the review", () => {
  const needsReview = exam({ overallResult: "NEEDS_VET_REVIEW" });
  const cleared = exam({
    entryId: "exam-vet",
    examType: "VET",
    completedDate: shiftDayKey(STAY_DAY, 7),
  });
  assert.deepEqual(
    computeReadiness({ ...baseInputs, exams: [needsReview, cleared] }),
    [],
  );
  // On one day, the one recorded later speaks.
  const sameDay = exam({
    entryId: "exam-same-day",
    examType: "VET",
    createdAt: new Date(IN_CARE_SINCE.getTime() + 60_000),
  });
  assert.deepEqual(
    computeReadiness({ ...baseInputs, exams: [needsReview, sameDay] }),
    [],
  );
});

test("needs treatment doesn't block", () => {
  assert.deepEqual(
    computeReadiness({
      ...baseInputs,
      exams: [exam({ overallResult: "NEEDS_TREATMENT" })],
    }),
    [],
  );
});

test("an earlier stay's exam asking for review doesn't block this stay", () => {
  const earlier = exam({
    entryId: "exam-earlier",
    completedDate: day("2026-05-01"),
    overallResult: "NEEDS_VET_REVIEW",
  });
  assert.deepEqual(
    computeReadiness({ ...baseInputs, exams: [exam(), earlier] }),
    [],
  );
  // Even when it is the only exam on record.
  assert.deepEqual(
    computeReadiness({ ...baseInputs, exams: [earlier] }),
    [{ kind: "NO_INTAKE_EXAM", since: IN_CARE_SINCE }],
  );
});

test("no photo blocks from the start of the stay", () => {
  const blockers = computeReadiness({ ...baseInputs, hasPhoto: false });
  assert.deepEqual(blockers, [{ kind: "NO_PHOTO", since: IN_CARE_SINCE }]);
});

test("an open care episode blocks from the start of its first day on the shelter's calendar", () => {
  const blockers = computeReadiness({
    ...baseInputs,
    openEpisode: {
      id: "episode-1",
      type: "HOSPITALISED_OFF_SITE",
      startDate: day("2026-09-05"),
      clinicName: "Downtown Veterinary Clinic",
    },
  });
  assert.deepEqual(blockers, [
    {
      kind: "UNDER_CARE",
      episodeId: "episode-1",
      episodeType: "HOSPITALISED_OFF_SITE",
      startDate: "2026-09-05",
      partnerName: "Downtown Veterinary Clinic",
      // Midnight in Los Angeles, on daylight time.
      since: new Date("2026-09-05T07:00:00Z"),
    },
  ]);
});

test("an episode starting on a day whose midnight the clocks skip is dated on that day", () => {
  // Santiago springs forward at midnight on Sep 6, 2026: that day begins at
  // 01:00, and read at the old offset its 00:00 is 23:00 on Sep 5.
  const timezone = "America/Santiago";
  const [blocker] = computeReadiness({
    ...baseInputs,
    timezone,
    openEpisode: {
      id: "episode-1",
      type: "HOSPITALISED_IN_HOUSE",
      startDate: day("2026-09-06"),
      clinicName: null,
    },
  });
  assert.equal(blocker.kind, "UNDER_CARE");
  assert.equal(shelterDayKey(blocker.since, timezone), "2026-09-06");
  assert.equal(
    shelterDaysBetween(blocker.since, new Date("2026-09-06T12:00:00Z"), timezone),
    0,
  );
});

test("no open care episode blocks nothing", () => {
  assert.deepEqual(computeReadiness({ ...baseInputs, openEpisode: null }), []);
});

test("every blocker kind can appear together on one animal", () => {
  const blockers = computeReadiness({
    requirements: [{ templateKey: "INTAKE_BEHAVIORAL", templateName: "Intake Behavioral" }],
    assessments: [assessment({ signal: "ESCALATE", templateKey: "CAT_TEST", templateName: "Cat Test" })],
    claims: [claim({ contradictedAt: daysBefore(1) })],
    spayNeuter: UNKNOWN,
    // A vet exam asked for review, and there is no intake exam this stay.
    exams: [exam({ examType: "VET", overallResult: "NEEDS_VET_REVIEW" })],
    hasPhoto: false,
    openEpisode: {
      id: "episode-1",
      type: "UNDER_VET_CARE",
      startDate: STAY_DAY,
      clinicName: null,
    },
    inCareSince: IN_CARE_SINCE,
    timezone: "America/Los_Angeles",
  });
  const kinds = blockers.map((b) => b.kind).sort();
  assert.deepEqual(kinds, [
    "ESCALATED_FINDING",
    "MISSING_ASSESSMENT",
    "NEEDS_VET_REVIEW",
    "NOT_SPAYED_NEUTERED",
    "NO_INTAKE_EXAM",
    "NO_PHOTO",
    "UNDER_CARE",
    "UNSUPPORTED_CHARACTERISTIC",
  ]);
});
