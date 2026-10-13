import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dueBucket,
  groupMedicalDue,
  type MedicalDuePlace,
  type MedicalDueListRow,
  type MedicalDueReviewRow,
} from "./medical-due-groups";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

const TODAY = calendarDay("2026-10-11");

const inUnit = (locationId: string, locationName: string, unitName = "A-1"): MedicalDuePlace => ({
  type: "UNIT",
  locationId,
  locationName,
  unitId: `${locationId}-${unitName}`,
  unitName,
});
const fostered = (fosterPersonId: string, fosterName: string): MedicalDuePlace => ({
  type: "FOSTER",
  fosterPersonId,
  fosterName,
});
const notHoused: MedicalDuePlace = { type: "NOT_HOUSED" };

const row = (
  id: string,
  dueDate: string,
  place: MedicalDuePlace,
  options: { animal?: string; item?: string } = {},
): MedicalDueListRow => ({
  entry: {
    id,
    kind: "VACCINE",
    status: "SCHEDULED",
    dueDate: calendarDay(dueDate),
    completedDate: null,
    itemId: `item-${options.item ?? "DHPP"}`,
    procedure: null,
    notes: null,
    item: { name: options.item ?? "DHPP" },
  },
  animal: {
    id: `animal-${options.animal ?? id}`,
    name: options.animal ?? id,
    species: "Dog",
    sex: "MALE",
    primaryColor: "Black",
    birthDate: "2024-01-01",
  },
  place,
});

const review = (
  id: string,
  reviewDate: string,
  place: MedicalDuePlace,
  options: { animal?: string } = {},
): MedicalDueReviewRow => ({
  review: true,
  entry: {
    id,
    kind: "SURGERY",
    procedure: "SPAY",
    exemptionReason: "TOO_YOUNG_OR_UNDERWEIGHT",
    declineReason: null,
    reviewDate: calendarDay(reviewDate),
  },
  animal: {
    id: `animal-${options.animal ?? id}`,
    name: options.animal ?? id,
    species: "Cat",
    sex: "FEMALE",
    primaryColor: "Tabby",
    birthDate: "2026-09-01",
  },
  place,
});

/** Each group as "title: BUCKET ids | BUCKET ids". */
const shape = (
  rows: MedicalDueListRow[],
  today: CalendarDay = TODAY,
  reviews: MedicalDueReviewRow[] = [],
) =>
  groupMedicalDue(rows, today, reviews).map(
    (group) =>
      `${group.title}: ${group.sections
        .map((section) => `${section.bucket} ${section.rows.map((r) => r.entry.id).join(",")}`)
        .join(" | ")}`,
  );

test("before today is overdue, today is today, and later is upcoming", () => {
  assert.equal(dueBucket(calendarDay("2026-10-10"), TODAY), "OVERDUE");
  assert.equal(dueBucket(calendarDay("2025-01-01"), TODAY), "OVERDUE");
  assert.equal(dueBucket(TODAY, TODAY), "TODAY");
  assert.equal(dueBucket(calendarDay("2026-10-12"), TODAY), "UPCOMING");
});

test("nothing due makes no groups", () => {
  assert.deepEqual(groupMedicalDue([], TODAY), []);
});

test("locations by name, then fosters by name, then the animals not housed", () => {
  const groups = groupMedicalDue(
    [
      row("a", "2026-10-11", notHoused),
      row("b", "2026-10-11", fostered("p2", "Zoe Park")),
      row("c", "2026-10-11", inUnit("l2", "Puppy room")),
      row("d", "2026-10-11", fostered("p1", "Amir Khan")),
      row("e", "2026-10-11", inUnit("l1", "Dog block")),
    ],
    TODAY,
  );
  assert.deepEqual(
    groups.map((group) => [group.type, group.title, group.key]),
    [
      ["UNIT", "Dog block", "location:l1"],
      ["UNIT", "Puppy room", "location:l2"],
      ["FOSTER", "Amir Khan", "foster:p1"],
      ["FOSTER", "Zoe Park", "foster:p2"],
      ["NOT_HOUSED", "Not housed", "not-housed"],
    ],
  );
});

test("one group per location across its units, and per foster across their animals", () => {
  assert.deepEqual(
    shape([
      row("a", "2026-10-11", inUnit("l1", "Dog block", "A-1")),
      row("b", "2026-10-11", inUnit("l1", "Dog block", "A-2")),
      row("c", "2026-10-11", fostered("p1", "Amir Khan")),
      row("d", "2026-10-11", fostered("p1", "Amir Khan")),
    ]),
    ["Dog block: TODAY a,b", "Amir Khan: TODAY c,d"],
  );
});

test("two locations with one name stay apart", () => {
  const groups = groupMedicalDue(
    [
      row("a", "2026-10-11", inUnit("l2", "Annex")),
      row("b", "2026-10-11", inUnit("l1", "Annex")),
    ],
    TODAY,
  );
  assert.deepEqual(
    groups.map((group) => group.key),
    ["location:l1", "location:l2"],
  );
});

test("each group has Overdue, Today and Upcoming in that order, leaving out empty ones", () => {
  const place = inUnit("l1", "Dog block");
  assert.deepEqual(
    shape([
      row("up", "2026-10-18", place),
      row("today", "2026-10-11", place),
      row("late", "2026-10-03", place),
    ]),
    ["Dog block: OVERDUE late | TODAY today | UPCOMING up"],
  );
  assert.deepEqual(shape([row("up", "2026-10-13", place)]), [
    "Dog block: UPCOMING up",
  ]);
});

test("rows in a bucket run soonest due first, then by animal, then by item", () => {
  const place = inUnit("l1", "Dog block");
  assert.deepEqual(
    shape([
      row("rex-rabies", "2026-10-09", place, { animal: "Rex", item: "Rabies" }),
      row("rex-dhpp", "2026-10-09", place, { animal: "Rex", item: "DHPP" }),
      row("ace", "2026-10-09", place, { animal: "Ace" }),
      row("oldest", "2026-10-01", place, { animal: "Zed" }),
    ]),
    ["Dog block: OVERDUE oldest,ace,rex-dhpp,rex-rabies"],
  );
});

test("an exemption up for review is bucketed by its review day, after the animal's care due that day", () => {
  const room = inUnit("l1", "Cat room");
  assert.deepEqual(
    shape(
      [
        row("milo-fvrcp", "2026-10-09", room, { animal: "Milo", item: "FVRCP" }),
        row("ace-today", "2026-10-11", room, { animal: "Ace" }),
      ],
      TODAY,
      [
        review("milo-review", "2026-10-09", room, { animal: "Milo" }),
        review("zed-review", "2026-10-11", room, { animal: "Zed" }),
        review("bo-review", "2026-10-15", fostered("p1", "Amir Khan"), { animal: "Bo" }),
      ],
    ),
    [
      "Cat room: OVERDUE milo-fvrcp,milo-review | TODAY ace-today,zed-review",
      "Amir Khan: UPCOMING bo-review",
    ],
  );
  // Reviews alone make groups too.
  assert.deepEqual(shape([], TODAY, [review("r", "2026-10-11", notHoused)]), [
    "Not housed: TODAY r",
  ]);
});
