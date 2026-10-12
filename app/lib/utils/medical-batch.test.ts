import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  ageOn,
  animalsItemIsNotFor,
  batchAnimalLabels,
  batchSizeIssue,
  scheduledBatchIssue,
} from "./medical-batch";

test("batchSizeIssue: one to 50 animals", () => {
  assert.equal(batchSizeIssue(0), "Pick at least one animal.");
  assert.equal(batchSizeIssue(1), null);
  assert.equal(batchSizeIssue(50), null);
  assert.equal(
    batchSizeIssue(51),
    "A batch can cover at most 50 animals. 51 are picked.",
  );
});

test("animalsItemIsNotFor: an item with no species is for every animal", () => {
  const dog = { name: "Rex", species: { id: "dog" } };
  const cat = { name: "Tom", species: { id: "cat" } };
  assert.deepEqual(animalsItemIsNotFor({ speciesIds: ["dog"] }, [dog, cat]), [cat]);
  assert.deepEqual(animalsItemIsNotFor({ speciesIds: [] }, [dog, cat]), []);
  assert.deepEqual(animalsItemIsNotFor(undefined, [dog, cat]), []);
});

test("scheduledBatchIssue: due care for one vaccine or treatment", () => {
  const dhpp = { itemId: "dhpp", itemName: "DHPP", kind: "VACCINE" } as const;
  const fvrcp = { itemId: "fvrcp", itemName: "FVRCP", kind: "VACCINE" } as const;
  const snap = { itemId: "snap", itemName: "Snap", kind: "TEST" } as const;

  assert.match(scheduledBatchIssue([]) ?? "", /^Select due/);
  assert.equal(scheduledBatchIssue([dhpp]), null);
  assert.equal(scheduledBatchIssue([dhpp, dhpp]), null);
  assert.equal(
    scheduledBatchIssue([fvrcp, dhpp, fvrcp]),
    "The selected entries are for different items (DHPP and FVRCP). Select entries for one item.",
  );
  assert.match(scheduledBatchIssue([snap]) ?? "", /^Tests are recorded one at a time/);
  assert.match(
    scheduledBatchIssue(Array.from({ length: 51 }, () => dhpp)) ?? "",
    /^At most 50 entries/,
  );
});

const TODAY = "2026-10-12" as CalendarDay;

test("ageOn: the largest whole unit on the shelter's day, not the clock's", () => {
  assert.equal(ageOn("2025-10-12", TODAY), "1 year");
  assert.equal(ageOn("2025-10-13", TODAY), "11 months");
  assert.equal(ageOn("2024-02-29", TODAY), "2 years");
  assert.equal(ageOn("2026-09-12", TODAY), "1 month");
  assert.equal(ageOn("2026-09-13", TODAY), "4 weeks");
  assert.equal(ageOn("2026-10-08", TODAY), "4 days");
  assert.equal(ageOn("2026-10-12", TODAY), "newborn");
  // No age for a day after today, or for something that isn't a day.
  assert.equal(ageOn("2026-10-13", TODAY), null);
  assert.equal(ageOn("", TODAY), null);
  assert.equal(ageOn("2026-02-30", TODAY), null);
});

const misty = { id: "1", name: "Misty", species: "Cat", sex: "FEMALE", primaryColor: "Gray", birthDate: "2020-01-01" } as const;
const rex = { id: "2", name: "Rex", species: "Dog", sex: "MALE", primaryColor: "Orange", birthDate: "2025-10-12" } as const;
const otherRex = { id: "3", name: "rex ", species: "Dog", sex: "UNKNOWN", primaryColor: "Golden", birthDate: "2021-06-01" } as const;

test("batchAnimalLabels: sex, colour and age only for names another animal shares", () => {
  const labels = batchAnimalLabels([misty, rex, otherRex], TODAY);
  assert.equal(labels.get("1"), "Misty (Cat)");
  assert.equal(labels.get("2"), "Rex (Dog · male, orange, 1 year)");
  assert.equal(labels.get("3"), "rex  (Dog · sex unknown, golden, 5 years)");
  // A birth date with no age to give leaves the age out.
  assert.equal(
    batchAnimalLabels([rex, { ...otherRex, birthDate: "2027-01-01" }], TODAY).get("3"),
    "rex  (Dog · sex unknown, golden)",
  );
  // One animal listed twice (two of its entries) is no clash.
  assert.equal(batchAnimalLabels([misty, misty], TODAY).get("1"), "Misty (Cat)");
});
