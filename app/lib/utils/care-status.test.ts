import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awaitingCare,
  careStatus,
  careStatusLines,
  isRecovering,
  openEpisodeText,
  recoveringFrom,
  type CompletedSurgery,
  type ScheduledCare,
} from "./care-status";
import { calendarDay } from "./shelter-day";

const TODAY = calendarDay("2026-10-14");
const day = calendarDay;

const surgery = (
  entryId: string,
  completedDate: string,
  procedure: CompletedSurgery["procedure"] = "NEUTER",
): CompletedSurgery => ({ entryId, procedure, completedDate: day(completedDate) });

const scheduled = (
  entryId: string,
  dueDate: string,
  care: Pick<ScheduledCare, "kind"> & Partial<ScheduledCare>,
): ScheduledCare => ({
  entryId,
  procedure: null,
  examType: null,
  dueDate: day(dueDate),
  ...care,
});

test("an animal is recovering from the surgery's day through the 14th day after", () => {
  assert.equal(isRecovering(day("2026-10-14"), TODAY), true);
  assert.equal(isRecovering(day("2026-09-30"), TODAY), true);
  assert.equal(isRecovering(day("2026-09-29"), TODAY), false);
  // A day after today is no surgery yet.
  assert.equal(isRecovering(day("2026-10-15"), TODAY), false);
});

test("recovering reads the latest surgery in the window", () => {
  assert.equal(recoveringFrom([], TODAY), null);
  assert.equal(recoveringFrom([surgery("old", "2026-09-29")], TODAY), null);
  assert.deepEqual(
    recoveringFrom(
      [
        surgery("first", "2026-10-02", "DENTAL"),
        surgery("latest", "2026-10-10", "MASS_REMOVAL"),
        surgery("out", "2026-09-01"),
      ],
      TODAY,
    ),
    { entryId: "latest", procedure: "MASS_REMOVAL", surgeryDate: "2026-10-10" },
  );
});

test("awaiting groups scheduled care into exams, spays or neuters and other surgery, the earliest of each", () => {
  const awaiting = awaitingCare(
    [
      scheduled("exam-later", "2026-10-20", { kind: "EXAM", examType: "VET" }),
      scheduled("exam-first", "2026-10-16", { kind: "EXAM", examType: "RECHECK" }),
      scheduled("spay", "2026-10-18", { kind: "SURGERY", procedure: "SPAY" }),
      scheduled("neuter", "2026-10-12", { kind: "SURGERY", procedure: "NEUTER" }),
      scheduled("mass", "2026-10-25", { kind: "SURGERY", procedure: "MASS_REMOVAL" }),
      // Not an exam or a surgery: never awaited.
      scheduled("vaccine", "2026-10-01", { kind: "VACCINE" }),
    ],
    TODAY,
  );
  assert.deepEqual(awaiting, {
    exam: { entryId: "exam-first", dueDate: "2026-10-16", overdue: false, label: "recheck exam" },
    surgery: {
      entryId: "mass",
      dueDate: "2026-10-25",
      overdue: false,
      label: "surgery (mass removal)",
    },
    spayNeuter: { entryId: "neuter", dueDate: "2026-10-12", overdue: true, label: "neuter" },
  });
});

test("care due today isn't overdue, and a tie on the day goes to the lower id", () => {
  const awaiting = awaitingCare(
    [
      scheduled("b", "2026-10-14", { kind: "EXAM", examType: "VET" }),
      scheduled("a", "2026-10-14", { kind: "EXAM", examType: "INTAKE" }),
    ],
    TODAY,
  );
  assert.deepEqual(awaiting.exam, {
    entryId: "a",
    dueDate: "2026-10-14",
    overdue: false,
    label: "intake exam",
  });
  assert.equal(awaiting.surgery, null);
  assert.equal(awaiting.spayNeuter, null);
});

test("the problem list keeps active and chronic rows, allergies apart, by name", () => {
  const status = careStatus(
    {
      episode: null,
      surgeries: [],
      scheduled: [],
      problems: [
        { id: "1", type: "CONDITION", name: "otitis", status: "RESOLVED" },
        { id: "2", type: "CONDITION", name: "Heartworm disease", status: "ACTIVE" },
        { id: "3", type: "ALLERGY", name: "penicillin", status: "ACTIVE" },
        { id: "4", type: "CONDITION", name: "arthritis", status: "CHRONIC" },
        { id: "5", type: "ALLERGY", name: "Chicken", status: "CHRONIC" },
        { id: "6", type: "ALLERGY", name: "Grass", status: "RESOLVED" },
      ],
    },
    TODAY,
  );
  assert.deepEqual(status.allergies, [
    { id: "5", name: "Chicken" },
    { id: "3", name: "penicillin" },
  ]);
  assert.deepEqual(status.conditions, [
    { id: "4", name: "arthritis", status: "CHRONIC" },
    { id: "2", name: "Heartworm disease", status: "ACTIVE" },
  ]);
  assert.equal(status.episode, null);
  assert.equal(status.recovering, null);
});

test("each kind of open episode in words", () => {
  const start = day("2026-10-03");
  assert.equal(
    openEpisodeText({ type: "HOSPITALISED_IN_HOUSE", startDate: start, clinicName: null }),
    "Hospitalised in house since Oct 3, 2026",
  );
  assert.equal(
    openEpisodeText({
      type: "HOSPITALISED_OFF_SITE",
      startDate: start,
      clinicName: "Downtown Veterinary Clinic",
    }),
    "Hospitalised at Downtown Veterinary Clinic since Oct 3, 2026",
  );
  assert.equal(
    openEpisodeText({ type: "UNDER_VET_CARE", startDate: start, clinicName: null }),
    "Under vet care since Oct 3, 2026",
  );
  assert.equal(
    openEpisodeText({
      type: "UNDER_VET_CARE",
      startDate: start,
      clinicName: "Downtown Veterinary Clinic",
    }),
    "Under vet care at Downtown Veterinary Clinic since Oct 3, 2026",
  );
});

test("the banner's lines come in order: episode, recovering, awaiting, allergies", () => {
  const status = careStatus(
    {
      episode: {
        id: "ep",
        type: "HOSPITALISED_IN_HOUSE",
        startDate: day("2026-10-03"),
        clinicName: null,
      },
      surgeries: [surgery("neuter", "2026-10-10")],
      scheduled: [
        scheduled("spay", "2026-10-18", { kind: "SURGERY", procedure: "SPAY" }),
        scheduled("mass", "2026-10-20", { kind: "SURGERY", procedure: "MASS_REMOVAL" }),
        scheduled("exam", "2026-10-11", { kind: "EXAM", examType: "VET" }),
      ],
      problems: [
        { id: "a", type: "ALLERGY", name: "penicillin", status: "ACTIVE" },
        { id: "b", type: "ALLERGY", name: "chicken", status: "ACTIVE" },
        { id: "c", type: "CONDITION", name: "Heartworm disease", status: "ACTIVE" },
      ],
    },
    TODAY,
  );
  assert.deepEqual(careStatusLines(status), [
    {
      key: "episode",
      text: "Hospitalised in house since Oct 3, 2026",
      tone: "destructive",
    },
    {
      key: "recovering",
      text: "Recovering from neuter since Oct 10, 2026",
      tone: "default",
    },
    {
      key: "awaiting-exam",
      text: "Awaiting vet exam, overdue since Oct 11, 2026",
      tone: "default",
    },
    {
      key: "awaiting-surgery",
      text: "Awaiting surgery (mass removal), due Oct 20, 2026",
      tone: "default",
    },
    { key: "awaiting-spayNeuter", text: "Awaiting spay, due Oct 18, 2026", tone: "default" },
    { key: "allergies", text: "Allergies: chicken, penicillin", tone: "destructive" },
  ]);
});

test("one allergy reads singular, and nothing on record gives no lines", () => {
  const empty = careStatus(
    { episode: null, surgeries: [], scheduled: [], problems: [] },
    TODAY,
  );
  assert.deepEqual(careStatusLines(empty), []);
  const one = careStatus(
    {
      episode: null,
      surgeries: [],
      scheduled: [],
      problems: [{ id: "a", type: "ALLERGY", name: "Penicillin", status: "ACTIVE" }],
    },
    TODAY,
  );
  assert.deepEqual(careStatusLines(one), [
    { key: "allergies", text: "Allergy: Penicillin", tone: "destructive" },
  ]);
});
