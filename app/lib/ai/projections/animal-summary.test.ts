import { test } from "node:test";
import assert from "node:assert/strict";
import { toAnimalSummary } from "./animal-summary";
import type { AiAnimalSummaryRow } from "@/app/lib/data/animals/animal.data";
import { careStatus } from "@/app/lib/utils/care-status";
import { calendarDay } from "@/app/lib/utils/shelter-day";

const TODAY = calendarDay("2026-10-14");

const fido: AiAnimalSummaryRow = {
  id: "fido",
  name: "Fido",
  sex: "MALE",
  birthDate: "2022-03-01",
  size: "LARGE",
  listingStatus: "PUBLISHED",
  species: { name: "Dog" },
  breeds: [{ name: "Labrador" }],
  primaryColor: { name: "Black" },
  currentUnit: { name: "MED-1", location: { name: "Medical wing" } },
  fosterPlacements: [],
  tasks: [],
  intake: [{ intakeDate: "2026-07-06", type: "STRAY" }],
};

test("the care facts are carried for a viewer who can read the medical record", () => {
  const care = careStatus(
    {
      episode: {
        id: "episode-1",
        type: "HOSPITALISED_IN_HOUSE",
        startDate: calendarDay("2026-10-11"),
        clinicName: null,
      },
      surgeries: [
        {
          entryId: "entry-dental",
          procedure: "DENTAL",
          completedDate: calendarDay("2026-10-08"),
        },
      ],
      scheduled: [
        {
          entryId: "entry-neuter",
          kind: "SURGERY",
          procedure: "NEUTER",
          examType: null,
          dueDate: calendarDay("2026-10-20"),
        },
        {
          entryId: "entry-recheck",
          kind: "EXAM",
          procedure: null,
          examType: "RECHECK",
          dueDate: calendarDay("2026-10-13"),
        },
      ],
      problems: [
        { id: "c1", type: "CONDITION", name: "Heartworm disease", status: "ACTIVE" },
        { id: "c2", type: "CONDITION", name: "Otitis", status: "RESOLVED" },
        { id: "a1", type: "ALLERGY", name: "Penicillin", status: "ACTIVE" },
      ],
    },
    TODAY,
  );
  const summary = toAnimalSummary(fido, null, care);
  assert.deepEqual(summary.care, {
    episode: { type: "HOSPITALISED_IN_HOUSE", startDate: "2026-10-11", clinic: null },
    recovering: { procedure: "DENTAL", surgeryDate: "2026-10-08" },
    // Exam first, then other surgery, then spay or neuter.
    awaiting: [
      { kind: "recheck exam", dueDate: "2026-10-13", overdue: true },
      { kind: "neuter", dueDate: "2026-10-20", overdue: false },
    ],
    allergies: ["Penicillin"],
    conditions: ["Heartworm disease"],
  });
  // Entry and episode ids stay on the server.
  assert.doesNotMatch(JSON.stringify(summary.care), /episode-1|entry-/);
});

test("nothing on record reads as an empty care, not as none", () => {
  const care = careStatus(
    { episode: null, surgeries: [], scheduled: [], problems: [] },
    TODAY,
  );
  assert.deepEqual(toAnimalSummary(fido, null, care).care, {
    episode: null,
    recovering: null,
    awaiting: [],
    allergies: [],
    conditions: [],
  });
});

test("care is null for a viewer who can't read the medical record", () => {
  const summary = toAnimalSummary(fido, null, null);
  assert.equal(summary.care, null);
  assert.equal(summary.name, "Fido");
  assert.equal(summary.currentUnit, "Medical wing · MED-1");
});
