import { test } from "node:test";
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
const SHELTER_TIMEZONE = "America/New_York";
import { shelterDaysBetween as rawShelterDaysBetween } from "../utils/shelter-day";
import type { ReadinessBlocker } from "./compute-readiness";
import type { CalendarDay } from "../utils/shelter-day";
import {
  BLOCKER_KIND_ORDER,
  FOSTER_LOCATION,
  READINESS_KIND_PAGE_SIZE,
  READINESS_PREVIEW_LIMIT,
  UNPLACED_LOCATION,
  blockerAction,
  buildReadinessBoard as rawBuildReadinessBoard,
  describeBlocker,
  orderBlockers,
  parseReadinessBoardFilters,
  readinessBoardFilterOptions,
  type AnimalReadiness,
  type ReadinessAnimal,
  type ReadinessBoardFilters,
  type ReadinessBoardOverview,
} from "./board";

// Shelter-local wall-clock times, so day counts don't depend on the machine
// running the tests.
const shelterDaysBetween = (since: Date, now: Date) => rawShelterDaysBetween(since, now, SHELTER_TIMEZONE);
const buildReadinessBoard = (readiness: Parameters<typeof rawBuildReadinessBoard>[0], filters: Parameters<typeof rawBuildReadinessBoard>[1], now: Date, page = 1) => rawBuildReadinessBoard(readiness, filters, now, page, SHELTER_TIMEZONE);

const at = (day: number, time = "12:00") =>
  fromZonedTime(
    `2026-09-${String(day).padStart(2, "0")} ${time}`,
    SHELTER_TIMEZONE,
  );
const NOW = at(12);

const NO_FILTERS: ReadinessBoardFilters = {
  species: [],
  locations: [],
  stages: [],
  kind: null,
};

const animal = (overrides: Partial<ReadinessAnimal> = {}): ReadinessAnimal => ({
  id: "frisco",
  name: "Frisco",
  species: "Dog",
  listingStatus: "PUBLISHED",
  placement: {
    kind: "UNIT",
    locationId: "loc-dogs",
    locationName: "Dog block A",
    unitName: "A-3",
  },
  ...overrides,
});

const missing = (templateName: string, since: Date): ReadinessBlocker => ({
  kind: "MISSING_ASSESSMENT",
  templateKey: templateName.toUpperCase().replace(/ /g, "_"),
  templateName,
  since,
});

// An open care episode that started on `day` of September.
const underCareSince = (
  episodeId: string,
  day: number,
  overrides: Partial<Extract<ReadinessBlocker, { kind: "UNDER_CARE" }>> = {},
): ReadinessBlocker => ({
  kind: "UNDER_CARE",
  episodeId,
  episodeType: "HOSPITALISED_IN_HOUSE",
  startDate: `2026-09-${String(day).padStart(2, "0")}` as CalendarDay,
  partnerName: null,
  since: at(day, "00:00"),
  ...overrides,
});

const entry = (
  a: ReadinessAnimal,
  blockers: ReadinessBlocker[],
): AnimalReadiness => ({ animal: a, blockers });

// Asserts the overview shape (as opposed to a `?kind=` detail page) and
// returns the one group the caller asked about.
const groupOf = (
  board: ReturnType<typeof buildReadinessBoard>,
  kind: ReadinessBlocker["kind"],
) => {
  assert.equal(board.view, "overview");
  return (board as ReadinessBoardOverview).groups.find((g) => g.kind === kind)!;
};

test("an empty shelter has every group, all empty", () => {
  const board = buildReadinessBoard([], NO_FILTERS, NOW) as ReadinessBoardOverview;
  assert.deepEqual(
    board.groups.map((g) => g.kind),
    [...BLOCKER_KIND_ORDER],
  );
  assert.ok(board.groups.every((g) => g.rows.length === 0 && g.totalCount === 0));
  assert.equal(board.animalCount, 0);
  assert.equal(board.blockedCount, 0);
});

test("a ready animal counts toward the total but appears in no group", () => {
  const board = buildReadinessBoard(
    [entry(animal(), []), entry(animal({ id: "buddy", name: "Buddy" }), [{ kind: "NO_PHOTO", since: at(1) }])],
    NO_FILTERS,
    NOW,
  );
  assert.equal(board.animalCount, 2);
  assert.equal(board.blockedCount, 1);
  assert.deepEqual(
    groupOf(board, "NO_PHOTO").rows.map((r) => r.animal.id),
    ["buddy"],
  );
});

test("an animal appears once per kind, carrying every blocker of that kind", () => {
  const board = buildReadinessBoard(
    [
      entry(animal(), [
        missing("Intake Behavioral", at(2)),
        missing("Cat Test", at(2)),
        { kind: "NOT_SPAYED_NEUTERED", since: at(2) },
      ]),
    ],
    NO_FILTERS,
    NOW,
  );
  const missingRows = groupOf(board, "MISSING_ASSESSMENT").rows;
  assert.equal(missingRows.length, 1);
  assert.equal(missingRows[0].blockers.length, 2);
  assert.equal(groupOf(board, "NOT_SPAYED_NEUTERED").rows.length, 1);
});

test("within a group the animal blocked longest comes first", () => {
  const board = buildReadinessBoard(
    [
      entry(animal({ id: "rocket", name: "Rocket" }), [{ kind: "NO_PHOTO", since: at(9) }]),
      entry(animal({ id: "frisco", name: "Frisco" }), [{ kind: "NO_PHOTO", since: at(3) }]),
      entry(animal({ id: "daisy", name: "Daisy" }), [{ kind: "NO_PHOTO", since: at(6) }]),
    ],
    NO_FILTERS,
    NOW,
  );
  assert.deepEqual(
    groupOf(board, "NO_PHOTO").rows.map((r) => r.animal.name),
    ["Frisco", "Daisy", "Rocket"],
  );
});

test("a row is as old as its oldest blocker of the kind", () => {
  const board = buildReadinessBoard(
    [entry(animal(), [missing("Cat Test", at(8)), missing("Intake Behavioral", at(2))])],
    NO_FILTERS,
    NOW,
  );
  const [row] = groupOf(board, "MISSING_ASSESSMENT").rows;
  assert.deepEqual(row.since, at(2));
  assert.equal(row.blockedDays, 10);
});

test("rows blocked since the same moment sort by name, then id", () => {
  const underCare = (id: string, name: string) =>
    entry(animal({ id, name }), [underCareSince(`episode-${id}`, 3)]);
  const board = buildReadinessBoard(
    [underCare("thor-2", "Thor"), underCare("bailey", "Bailey"), underCare("thor-1", "Thor")],
    NO_FILTERS,
    NOW,
  );
  const rows = groupOf(board, "UNDER_CARE").rows;
  assert.deepEqual(
    rows.map((r) => r.animal.id),
    ["bailey", "thor-1", "thor-2"],
  );
  assert.ok(rows.every((r) => r.blockedDays === 9));
});

test("days blocked are counted on the shelter's calendar", () => {
  // Late evening one day to early morning the next is one day, not zero.
  assert.equal(shelterDaysBetween(at(11, "23:30"), at(12, "00:30")), 1);
  // Any time on the same shelter day is zero.
  assert.equal(shelterDaysBetween(at(12, "00:05"), at(12, "23:55")), 0);
  assert.equal(shelterDaysBetween(at(3), NOW), 9);
});

test("a since in the future never reads as negative days", () => {
  assert.equal(shelterDaysBetween(at(14), NOW), 0);
});

test("filters narrow by species, location and stage together", () => {
  const cat = animal({
    id: "leo",
    name: "Leo",
    species: "Cat",
    listingStatus: "DRAFT",
    placement: { kind: "UNPLACED" },
  });
  const fostered = animal({ id: "juniper", name: "Juniper", placement: { kind: "FOSTER" } });
  const readiness = [cat, fostered, animal()].map((a) =>
    entry(a, [{ kind: "NO_PHOTO", since: at(1) }]),
  );
  const names = (filters: Partial<ReadinessBoardFilters>) =>
    groupOf(
      buildReadinessBoard(readiness, { ...NO_FILTERS, ...filters }, NOW),
      "NO_PHOTO",
    ).rows.map((r) => r.animal.name);

  assert.deepEqual(names({ species: ["Cat"] }), ["Leo"]);
  assert.deepEqual(names({ locations: [FOSTER_LOCATION] }), ["Juniper"]);
  assert.deepEqual(names({ locations: [UNPLACED_LOCATION] }), ["Leo"]);
  assert.deepEqual(names({ locations: ["loc-dogs", UNPLACED_LOCATION] }), ["Frisco", "Leo"]);
  assert.deepEqual(names({ stages: ["DRAFT"] }), ["Leo"]);
  assert.deepEqual(names({ species: ["Dog"], stages: ["DRAFT"] }), []);
});

test("the totals follow the filters", () => {
  const board = buildReadinessBoard(
    [
      entry(animal({ species: "Cat" }), []),
      entry(animal({ id: "buddy", species: "Dog" }), [{ kind: "NO_PHOTO", since: at(1) }]),
    ],
    { ...NO_FILTERS, species: ["Cat"] },
    NOW,
  );
  assert.equal(board.animalCount, 1);
  assert.equal(board.blockedCount, 0);
});

test("the overview previews only the longest-blocked rows per group; totalCount holds the true count", () => {
  const readiness = Array.from({ length: 7 }, (_, i) =>
    entry(animal({ id: `a${i}`, name: `Animal ${i}` }), [
      { kind: "NO_PHOTO", since: at(i + 1) },
    ]),
  );
  const board = buildReadinessBoard(readiness, NO_FILTERS, NOW) as ReadinessBoardOverview;
  const group = board.groups.find((g) => g.kind === "NO_PHOTO")!;
  assert.equal(group.rows.length, READINESS_PREVIEW_LIMIT);
  assert.equal(group.totalCount, 7);
  // Earliest `since` (longest blocked) first — a0..a4 beat a5 and a6.
  assert.deepEqual(
    group.rows.map((r) => r.animal.id),
    ["a0", "a1", "a2", "a3", "a4"],
  );
});

test("`kind` returns every row of that kind, paginated in longest-blocked order", () => {
  const readiness = Array.from({ length: 12 }, (_, i) =>
    entry(animal({ id: `a${i}`, name: `Animal ${i}` }), [
      { kind: "NO_PHOTO", since: at(i + 1) },
    ]),
  );
  const filters: ReadinessBoardFilters = { ...NO_FILTERS, kind: "NO_PHOTO" };

  const page1 = buildReadinessBoard(readiness, filters, NOW, 1);
  assert.equal(page1.view, "detail");
  if (page1.view !== "detail") throw new Error("expected a detail view");
  assert.equal(page1.kind, "NO_PHOTO");
  assert.equal(page1.totalRows, 12);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.pageSize, READINESS_KIND_PAGE_SIZE);
  assert.deepEqual(
    page1.rows.map((r) => r.animal.id),
    Array.from({ length: READINESS_KIND_PAGE_SIZE }, (_, i) => `a${i}`),
  );

  const page2 = buildReadinessBoard(readiness, filters, NOW, 2);
  assert.equal(page2.view, "detail");
  if (page2.view !== "detail") throw new Error("expected a detail view");
  assert.deepEqual(
    page2.rows.map((r) => r.animal.id),
    ["a10", "a11"],
  );
});

test("kind combines with species/location/stage — only matching animals' rows appear", () => {
  const readiness = [
    entry(animal({ id: "leo", name: "Leo", species: "Cat" }), [
      { kind: "NO_PHOTO", since: at(1) },
    ]),
    entry(animal({ id: "fido", name: "Fido", species: "Dog" }), [
      { kind: "NO_PHOTO", since: at(2) },
    ]),
  ];
  const board = buildReadinessBoard(
    readiness,
    { ...NO_FILTERS, kind: "NO_PHOTO", species: ["Cat"] },
    NOW,
  );
  assert.equal(board.view, "detail");
  if (board.view !== "detail") throw new Error("expected a detail view");
  assert.deepEqual(
    board.rows.map((r) => r.animal.id),
    ["leo"],
  );
  assert.equal(board.totalRows, 1);
});

test("animalCount and blockedCount reflect every filtered animal, not just the drilled-into kind", () => {
  const readiness = [
    entry(animal({ id: "a1" }), [{ kind: "NO_PHOTO", since: at(1) }]),
    entry(animal({ id: "a2" }), [{ kind: "NOT_SPAYED_NEUTERED", since: at(1) }]),
    entry(animal({ id: "a3" }), []),
  ];
  const board = buildReadinessBoard(readiness, { ...NO_FILTERS, kind: "NO_PHOTO" }, NOW);
  assert.equal(board.animalCount, 3);
  assert.equal(board.blockedCount, 2);
  assert.equal(board.view, "detail");
  if (board.view !== "detail") throw new Error("expected a detail view");
  assert.equal(board.totalRows, 1);
});

test("URL params parse into filters, empty meaning any and no kind", () => {
  assert.deepEqual(parseReadinessBoardFilters({}), NO_FILTERS);
  assert.deepEqual(
    parseReadinessBoardFilters({ species: "Dog,Cat", location: "foster,", stage: "DRAFT" }),
    { species: ["Dog", "Cat"], locations: ["foster"], stages: ["DRAFT"], kind: null },
  );
});

test("a recognized kind param selects that kind; anything else reads as none", () => {
  assert.equal(
    parseReadinessBoardFilters({ kind: "MISSING_ASSESSMENT" }).kind,
    "MISSING_ASSESSMENT",
  );
  assert.equal(parseReadinessBoardFilters({ kind: "NOT_A_KIND" }).kind, null);
  assert.equal(parseReadinessBoardFilters({ kind: "" }).kind, null);
});

test("filter options come from the animals present, in a stable order", () => {
  const options = readinessBoardFilterOptions([
    animal({ species: "Rabbit", listingStatus: "PENDING_ADOPTION" }),
    animal({ species: "Cat", placement: { kind: "FOSTER" } }),
    animal({
      species: "Cat",
      listingStatus: "DRAFT",
      placement: { kind: "UNIT", locationId: "loc-cats", locationName: "Cat room", unitName: "C-1" },
    }),
  ]);
  assert.deepEqual(options.species.map((o) => o.value), ["Cat", "Rabbit"]);
  assert.deepEqual(options.locations, [
    { value: "loc-cats", label: "Cat room" },
    { value: "loc-dogs", label: "Dog block A" },
    { value: FOSTER_LOCATION, label: "In foster" },
  ]);
  assert.deepEqual(options.stages.map((o) => o.value), ["DRAFT", "PUBLISHED", "PENDING_ADOPTION"]);
});

const EVERYTHING = {
  manageAssessments: true,
  manageAnimalInfo: true,
  managePhotos: true,
  manageMedical: true,
};
const READ_ONLY = {
  manageAssessments: false,
  manageAnimalInfo: false,
  managePhotos: false,
  manageMedical: false,
};

test("a missing check links to recording that template", () => {
  const missingBlocker: ReadinessBlocker = {
    kind: "MISSING_ASSESSMENT",
    templateKey: "DAILY_ROUNDS",
    templateName: "Daily Rounds",
    since: at(2),
  };
  assert.deepEqual(blockerAction(missingBlocker, "a1", EVERYTHING), {
    label: "Record Daily Rounds",
    href: "/dashboard/animals/a1/assessments/create?template=DAILY_ROUNDS",
  });
  assert.deepEqual(blockerAction(missingBlocker, "a1", READ_ONLY), {
    label: "View assessments",
    href: "/dashboard/animals/a1/assessments",
  });
});

test("an escalated finding links to the assessment that raised it", () => {
  const escalated: ReadinessBlocker = {
    kind: "ESCALATED_FINDING",
    assessmentId: "cat-test",
    templateName: "Cat Test",
    observedAt: at(3),
    since: at(3),
  };
  for (const can of [EVERYTHING, READ_ONLY]) {
    assert.equal(
      blockerAction(escalated, "a1", can).href,
      "/dashboard/animals/a1/assessments/cat-test",
    );
  }
});

test("every other kind links to the page where it is cleared", () => {
  const cases: [ReadinessBlocker, string, string][] = [
    [
      {
        kind: "UNSUPPORTED_CHARACTERISTIC",
        characteristicId: "c1",
        characteristicName: "Good with cats",
        issue: "CONTRADICTED",
        since: at(3),
      },
      "/dashboard/animals/a1/characteristics",
      "/dashboard/animals/a1/characteristics",
    ],
    [{ kind: "NOT_SPAYED_NEUTERED", since: at(1) }, "/dashboard/animals/a1/medical", "/dashboard/animals/a1/medical"],
    [{ kind: "NO_PHOTO", since: at(1) }, "/dashboard/animals/a1/photos", "/dashboard/animals/a1/photos"],
  ];
  for (const [blocker, manageHref, readHref] of cases) {
    assert.equal(blockerAction(blocker, "a1", EVERYTHING).href, manageHref, blocker.kind);
    assert.equal(blockerAction(blocker, "a1", READ_ONLY).href, readHref, blocker.kind);
  }
});

test("spay/neuter links to the medical record, worded for who may record it", () => {
  const blocker: ReadinessBlocker = { kind: "NOT_SPAYED_NEUTERED", since: at(1) };
  assert.deepEqual(blockerAction(blocker, "a1", EVERYTHING), {
    label: "Record spay/neuter",
    href: "/dashboard/animals/a1/medical",
  });
  assert.deepEqual(blockerAction(blocker, "a1", READ_ONLY), {
    label: "View medical record",
    href: "/dashboard/animals/a1/medical",
  });
  // Recording it takes the medical permission, not the profile's.
  assert.equal(
    blockerAction(blocker, "a1", { ...READ_ONLY, manageAnimalInfo: true }).label,
    "View medical record",
  );
  assert.equal(
    blockerAction(blocker, "a1", { ...EVERYTHING, manageAnimalInfo: false }).label,
    "Record spay/neuter",
  );
});

const noIntakeExam: ReadinessBlocker = { kind: "NO_INTAKE_EXAM", since: at(1) };
const needsVetReview: ReadinessBlocker = {
  kind: "NEEDS_VET_REVIEW",
  entryId: "exam-1",
  examType: "INTAKE",
  examDate: "2026-10-03" as CalendarDay,
  since: at(3),
};

test("a vet review comes with the urgent groups, and a missing intake exam after the missing checks", () => {
  assert.deepEqual(
    orderBlockers([
      { kind: "NO_PHOTO", since: at(1) },
      { kind: "NOT_SPAYED_NEUTERED", since: at(1) },
      noIntakeExam,
      missing("Intake Behavioral", at(1)),
      underCareSince("episode-1", 1),
      needsVetReview,
      {
        kind: "ESCALATED_FINDING",
        assessmentId: "rounds",
        templateName: "Daily Rounds",
        observedAt: at(2),
        since: at(2),
      },
    ]).map((b) => b.kind),
    [
      "ESCALATED_FINDING",
      "NEEDS_VET_REVIEW",
      "UNDER_CARE",
      "MISSING_ASSESSMENT",
      "NO_INTAKE_EXAM",
      "NOT_SPAYED_NEUTERED",
      "NO_PHOTO",
    ],
  );
});

test("a trait whose condition was resolved or voided reads as the board shows it", () => {
  const unsupported = (issue: "CONDITION_RESOLVED" | "CONDITION_VOIDED") =>
    describeBlocker(
      {
        kind: "UNSUPPORTED_CHARACTERISTIC",
        characteristicId: "c1",
        characteristicName: "Heartworm Positive",
        issue,
        since: at(3),
      },
      SHELTER_TIMEZONE,
    );
  assert.equal(
    unsupported("CONDITION_RESOLVED"),
    "Heartworm Positive — its condition was resolved",
  );
  assert.equal(unsupported("CONDITION_VOIDED"), "Heartworm Positive — cites a voided condition");
});

test("the exam blockers read as the board shows them", () => {
  assert.equal(describeBlocker(noIntakeExam, SHELTER_TIMEZONE), "No intake exam");
  assert.equal(
    describeBlocker(needsVetReview, SHELTER_TIMEZONE),
    "Intake exam of Oct 3, 2026 needs vet review",
  );
  assert.equal(
    describeBlocker({ ...needsVetReview, examType: "RECHECK" }, SHELTER_TIMEZONE),
    "Recheck exam of Oct 3, 2026 needs vet review",
  );
});

test("a missing intake exam links to the medical record, worded for who may record it", () => {
  assert.deepEqual(blockerAction(noIntakeExam, "a1", EVERYTHING), {
    label: "Record intake exam",
    href: "/dashboard/animals/a1/medical",
  });
  assert.deepEqual(blockerAction(noIntakeExam, "a1", READ_ONLY), {
    label: "View medical record",
    href: "/dashboard/animals/a1/medical",
  });
  // Recording it takes the medical permission, not the assessments'.
  assert.equal(
    blockerAction(noIntakeExam, "a1", { ...EVERYTHING, manageMedical: false }).label,
    "View medical record",
  );
});

test("a vet review links every viewer to the animal's exams", () => {
  for (const can of [EVERYTHING, READ_ONLY]) {
    assert.deepEqual(blockerAction(needsVetReview, "a1", can), {
      label: "Review the exam",
      href: "/dashboard/animals/a1/medical/history?kind=EXAM",
    });
  }
});

test("an open care episode reads as the banner does, and links every viewer to it", () => {
  assert.equal(
    describeBlocker(underCareSince("ep", 3), SHELTER_TIMEZONE),
    "Hospitalised in house since Sep 3, 2026",
  );
  assert.equal(
    describeBlocker(
      underCareSince("ep", 3, {
        episodeType: "HOSPITALISED_OFF_SITE",
        partnerName: "Downtown Veterinary Clinic",
      }),
      SHELTER_TIMEZONE,
    ),
    "Hospitalised at Downtown Veterinary Clinic since Sep 3, 2026",
  );
  assert.equal(
    describeBlocker(underCareSince("ep", 3, { episodeType: "UNDER_VET_CARE" }), SHELTER_TIMEZONE),
    "Under vet care since Sep 3, 2026",
  );
  for (const can of [EVERYTHING, READ_ONLY]) {
    assert.deepEqual(blockerAction(underCareSince("ep", 3), "a1", can), {
      label: "View care episode",
      href: "/dashboard/animals/a1/medical/conditions",
    });
  }
});
