import { test } from "node:test";
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
const SHELTER_TIMEZONE = "America/New_York";
import type { ReadinessBlocker } from "@/app/lib/readiness/compute-readiness";
import type {
  AnimalReadiness,
  ReadinessViewerCan,
} from "@/app/lib/readiness/board";
import { toAnimalReadinessView as rawToAnimalReadinessView, toReadinessLine as rawToReadinessLine } from "./animal-readiness";

// Shelter-local wall-clock times, so day counts don't depend on the machine
// running the tests.
const at = (date: string, time = "12:00") =>
  fromZonedTime(`${date} ${time}`, SHELTER_TIMEZONE);
const NOW = at("2026-09-13", "09:00");

const toAnimalReadinessView = (readiness: AnimalReadiness, can: ReadinessViewerCan, now: Date) => rawToAnimalReadinessView(readiness, can, now, SHELTER_TIMEZONE);
const toReadinessLine = (readiness: AnimalReadiness, now: Date) => rawToReadinessLine(readiness, now, SHELTER_TIMEZONE);

const STAFF: ReadinessViewerCan = {
  manageAssessments: true,
  manageAnimalInfo: true,
  managePhotos: true,
};
const VOLUNTEER: ReadinessViewerCan = {
  manageAssessments: false,
  manageAnimalInfo: false,
  managePhotos: false,
};

const buddy = (
  blockers: ReadinessBlocker[],
  listingStatus: AnimalReadiness["animal"]["listingStatus"] = "PUBLISHED",
): AnimalReadiness => ({
  animal: {
    id: "buddy",
    name: "Buddy",
    species: "Dog",
    listingStatus,
    placement: {
      kind: "UNIT",
      locationId: "loc-dogs",
      locationName: "Dog block A",
      unitName: "A-3",
    },
  },
  blockers,
});

const ARRIVED = at("2026-08-10");

const missingBehavioral: ReadinessBlocker = {
  kind: "MISSING_ASSESSMENT",
  templateKey: "INTAKE_BEHAVIORAL",
  templateName: "Intake Behavioral",
  since: ARRIVED,
};
const noPhoto: ReadinessBlocker = { kind: "NO_PHOTO", since: ARRIVED };
const escalated: ReadinessBlocker = {
  kind: "ESCALATED_FINDING",
  assessmentId: "asmt-1",
  templateName: "Daily Rounds",
  observedAt: at("2026-09-11"),
  since: at("2026-09-11"),
};
const acute: ReadinessBlocker = {
  kind: "ACUTE_HEALTH",
  healthStatus: "UNDER_VET_CARE",
  since: null,
};

test("an animal with nothing outstanding is ready", () => {
  const view = toAnimalReadinessView(buddy([]), STAFF, NOW);
  assert.deepEqual(view, {
    animalId: "buddy",
    name: "Buddy",
    listingStatus: "PUBLISHED",
    status: "READY",
  });
});

test("an archived animal is archived, whatever is outstanding", () => {
  const view = toAnimalReadinessView(
    buddy([missingBehavioral, noPhoto], "ARCHIVED"),
    STAFF,
    NOW,
  );
  assert.equal(view.status, "ARCHIVED");
  assert.ok(!("outstanding" in view));
});

test("days outstanding are stated, counted in whole shelter-calendar days", () => {
  const view = toAnimalReadinessView(buddy([missingBehavioral]), STAFF, NOW);
  assert.equal(view.status, "NOT_READY");
  if (view.status !== "NOT_READY") return;
  // Aug 10 → Sep 13 is 34 days, whatever the hour on either end.
  assert.equal(view.daysOutstanding, 34);
  assert.deepEqual(view.outstanding, [
    {
      kind: "MISSING_ASSESSMENT",
      description: "Intake Behavioral",
      since: "2026-08-10",
      daysOutstanding: 34,
      nextStep: "Record Intake Behavioral",
    },
  ]);
});

test("the day boundary is the shelter's, not UTC's", () => {
  // 22:30 shelter time on Sep 12 is already Sep 13 in UTC; it still began
  // yesterday as far as the shelter is concerned.
  const lateLastNight: ReadinessBlocker = {
    ...escalated,
    observedAt: at("2026-09-12", "22:30"),
    since: at("2026-09-12", "22:30"),
  };
  const view = toAnimalReadinessView(buddy([lateLastNight]), STAFF, NOW);
  assert.equal(view.status, "NOT_READY");
  if (view.status !== "NOT_READY") return;
  assert.equal(view.outstanding[0].since, "2026-09-12");
  assert.equal(view.outstanding[0].daysOutstanding, 1);
});

test("something that began today is 0 days, not negative", () => {
  const today: ReadinessBlocker = {
    ...escalated,
    observedAt: at("2026-09-13", "08:00"),
    since: at("2026-09-13", "08:00"),
  };
  const view = toAnimalReadinessView(buddy([today]), STAFF, NOW);
  assert.equal(view.status, "NOT_READY");
  if (view.status !== "NOT_READY") return;
  assert.equal(view.outstanding[0].daysOutstanding, 0);
});

test("outstanding items come most urgent first, in the board's order", () => {
  const view = toAnimalReadinessView(
    buddy([noPhoto, missingBehavioral, acute, escalated]),
    STAFF,
    NOW,
  );
  assert.equal(view.status, "NOT_READY");
  if (view.status !== "NOT_READY") return;
  assert.deepEqual(
    view.outstanding.map((b) => b.kind),
    ["ESCALATED_FINDING", "ACUTE_HEALTH", "MISSING_ASSESSMENT", "NO_PHOTO"],
  );
});

test("an undated item says so rather than inventing a duration", () => {
  const view = toAnimalReadinessView(buddy([acute]), STAFF, NOW);
  assert.equal(view.status, "NOT_READY");
  if (view.status !== "NOT_READY") return;
  assert.equal(view.daysOutstanding, null);
  assert.deepEqual(view.outstanding[0], {
    kind: "ACUTE_HEALTH",
    description: "Under Vet Care",
    since: null,
    daysOutstanding: null,
    nextStep: "Update health status",
  });
});

test("the animal's own duration is its oldest dated item's", () => {
  // The undated one doesn't pull it to null, and the recent one doesn't
  // shorten it.
  const view = toAnimalReadinessView(
    buddy([acute, escalated, noPhoto]),
    STAFF,
    NOW,
  );
  assert.equal(view.status, "NOT_READY");
  if (view.status !== "NOT_READY") return;
  assert.equal(view.daysOutstanding, 34);
});

test("an item's description is the board's wording", () => {
  const claim: ReadinessBlocker = {
    kind: "UNSUPPORTED_CHARACTERISTIC",
    characteristicId: "c1",
    characteristicName: "Good with cats",
    issue: "CONTRADICTED",
    since: at("2026-09-01"),
  };
  const view = toAnimalReadinessView(buddy([claim, escalated]), STAFF, NOW);
  assert.equal(view.status, "NOT_READY");
  if (view.status !== "NOT_READY") return;
  assert.deepEqual(
    view.outstanding.map((b) => b.description),
    [
      "Daily Rounds of Sep 11, 2026",
      "Good with cats — contradicted by a live finding",
    ],
  );
});

test("the next step is worded for what the viewer may change", () => {
  const blockers = [missingBehavioral, noPhoto];
  const staff = toAnimalReadinessView(buddy(blockers), STAFF, NOW);
  const volunteer = toAnimalReadinessView(buddy(blockers), VOLUNTEER, NOW);
  assert.equal(staff.status, "NOT_READY");
  assert.equal(volunteer.status, "NOT_READY");
  if (staff.status !== "NOT_READY" || volunteer.status !== "NOT_READY") return;
  assert.deepEqual(
    staff.outstanding.map((b) => b.nextStep),
    ["Record Intake Behavioral", "Add a photo"],
  );
  assert.deepEqual(
    volunteer.outstanding.map((b) => b.nextStep),
    ["View assessments", "View photos"],
  );
});

test("the summary line counts outstanding items and names each kind once", () => {
  const secondMissing: ReadinessBlocker = {
    ...missingBehavioral,
    templateKey: "INTAKE_MEDICAL",
    templateName: "Intake Medical",
  };
  assert.deepEqual(
    toReadinessLine(
      buddy([noPhoto, missingBehavioral, secondMissing, acute]),
      NOW,
    ),
    {
      status: "NOT_READY",
      outstandingCount: 4,
      daysOutstanding: 34,
      kinds: ["ACUTE_HEALTH", "MISSING_ASSESSMENT", "NO_PHOTO"],
    },
  );
});

test("the summary line reads ready and archived the same way the tool does", () => {
  assert.deepEqual(toReadinessLine(buddy([]), NOW), { status: "READY" });
  assert.deepEqual(toReadinessLine(buddy([noPhoto], "ARCHIVED"), NOW), {
    status: "ARCHIVED",
  });
});
