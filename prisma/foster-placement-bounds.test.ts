// Same reasoning as outcome-recording.test.ts for living under prisma/ and
// running via `npm run test:db`. Every foster placement lies inside the stay
// it belongs to, and the three writers that can move a stay's edge (an intake
// correction, a recorded outcome, an outcome correction) read the placements
// behind the animal's row lock before writing. What matters is what the rows
// say afterwards: after a refusal, nothing written; after an accepted day, the
// day written and the placements where they belong.
//
// A placement always starts on the day it is made, so a placement in the past
// is written directly, as the rows the placement form and a return leave.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  FosterReturnReason,
  IntakeType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  recordIntakeCorrection,
  type IntakeCorrectionValues,
} from "@/app/lib/services/intake-correction";
import {
  recordOutcome,
  recordOutcomeCorrection,
} from "@/app/lib/services/outcome-recording";
import {
  OutcomeFormSchema,
  type OutcomeFormOutput,
} from "@/app/lib/zod-schemas/outcome.schema";
import { ConflictError, TimelineOrderError } from "@/app/lib/utils/errors";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterPersonId: string;
let fosterName: string;
let fosterProfileId: string;

before(async () => {
  const person = async (name: string) =>
    (
      await prisma.person.create({
        data: { name: `${name} ${runId}` },
        select: { id: true },
      })
    ).id;
  speciesId = (
    await prisma.species.create({
      data: { name: `Placement bounds species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Placement bounds color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Placement bounds staff");
  fosterName = `Placement bounds foster ${runId}`;
  fosterPersonId = await person("Placement bounds foster");
  fosterProfileId = (
    await prisma.fosterProfile.create({
      // Room for every placement below, though capacity is not what is tested.
      data: { personId: fosterPersonId, maxAnimals: 50 },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { fosterProfileId } });
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

type Event = { intake: string } | { outcome: string; reversed?: boolean };

type Placement = {
  start: string;
  // Returned to the shelter on this day. Left out, the placement is open.
  end?: string;
};

/**
 * An animal with the given intakes and outcomes, listed as its last live
 * event leaves it, and general placements with the one foster. Each intake is
 * a stray with no found address, so a correction that sends back only a new
 * day changes nothing else.
 */
const makeAnimal = async (
  label: string,
  events: Event[],
  placements: Placement[],
) => {
  const live = events.filter(
    (event) => !("outcome" in event && event.reversed),
  );
  const archived = "outcome" in live[live.length - 1];
  const animal = await prisma.animal.create({
    data: {
      name: `${label} ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId,
      primaryColorId: colorId,
      listingStatus: archived
        ? AnimalListingStatus.ARCHIVED
        : AnimalListingStatus.PUBLISHED,
      archiveReason: archived ? OutcomeType.TRANSFER_OUT : null,
    },
    select: { id: true },
  });
  const intakeIds: string[] = [];
  const outcomeIds: string[] = [];
  for (const event of events) {
    if ("intake" in event) {
      const intake = await prisma.intake.create({
        data: {
          animalId: animal.id,
          intakeDate: event.intake,
          type: IntakeType.STRAY,
          staffMemberId: staffId,
        },
        select: { id: true },
      });
      intakeIds.push(intake.id);
    } else {
      const outcome = await prisma.outcome.create({
        data: {
          animalId: animal.id,
          outcomeDate: event.outcome,
          type: OutcomeType.TRANSFER_OUT,
          staffMemberId: staffId,
          reversedAt: event.reversed ? new Date() : null,
          reversedById: event.reversed ? staffId : null,
          reversalReason: event.reversed ? "Entered by mistake." : null,
        },
        select: { id: true },
      });
      outcomeIds.push(outcome.id);
    }
  }
  const placementIds: string[] = [];
  for (const { start, end } of placements) {
    const placement = await prisma.fosterPlacement.create({
      data: {
        type: FosterPlacementType.GENERAL,
        startDate: start,
        endDate: end ?? null,
        returnReason: end ? FosterReturnReason.RETURNED_TO_SHELTER : null,
        returnedById: end ? staffId : null,
        animalId: animal.id,
        fosterProfileId,
        placedById: staffId,
      },
      select: { id: true },
    });
    placementIds.push(placement.id);
  }
  return { animalId: animal.id, intakeIds, outcomeIds, placementIds };
};

/** Everything a refused change must leave as it was. */
const snapshot = async (animalId: string) => {
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      currentUnitId: true,
      intake: {
        select: { id: true, intakeDate: true, updatedAt: true },
        orderBy: { intakeDate: "asc" },
      },
      Outcome: {
        select: { id: true, outcomeDate: true, reversedAt: true },
        orderBy: { outcomeDate: "asc" },
      },
      fosterPlacements: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
          returnReason: true,
          outcomeId: true,
          updatedAt: true,
        },
        orderBy: { startDate: "asc" },
      },
      activityLog: {
        select: { activityType: true, changeSummary: true },
        orderBy: { changedAt: "asc" },
      },
    },
  });
  return animal;
};

// The date alone moved: the stray intake as `makeAnimal` writes it.
const intakeOn = (intakeDate: string): IntakeCorrectionValues => ({
  intakeDate: calendarDay(intakeDate),
  type: IntakeType.STRAY,
  notes: null,
  sourcePartnerId: null,
  surrenderingPersonId: null,
  foundAddress: null,
  foundCity: null,
  foundState: null,
});

const correctIntake = (intakeId: string, intakeDate: string) =>
  prisma.$transaction((tx) =>
    recordIntakeCorrection(tx, intakeId, intakeOn(intakeDate), staffId),
  );

// What the outcome form would submit, parsed the way the actions parse it.
const outcomeValues = (outcomeDate: string): OutcomeFormOutput =>
  OutcomeFormSchema.parse({
    outcomeType: OutcomeType.DECEASED,
    outcomeDate,
    notes: "",
  });

const record = (animalId: string, outcomeDate: string) =>
  prisma.$transaction((tx) =>
    recordOutcome(
      tx,
      { animalId, values: outcomeValues(outcomeDate) },
      staffId,
    ),
  );

const correctOutcome = (outcomeId: string, outcomeDate: string) =>
  recordOutcomeCorrection(outcomeId, outcomeValues(outcomeDate), staffId);

const liveOutcomeId = async (animalId: string) => {
  const outcomes = await prisma.outcome.findMany({
    where: { animalId, reversedAt: null },
    select: { id: true },
  });
  assert.equal(outcomes.length, 1);
  return outcomes[0].id;
};

const readPlacement = (id: string) =>
  prisma.fosterPlacement.findUniqueOrThrow({
    where: { id },
    select: { endDate: true, returnReason: true, outcomeId: true },
  });

const refusedWith = (message: string) => (error: unknown) => {
  // Anything else is reported as itself, not as a failed type check.
  if (!(error instanceof TimelineOrderError)) throw error;
  assert.equal(error.message, message);
  assert.equal(error.field, "outcomeDate");
  return true;
};

const intakeAfterStart = (day: string) =>
  `The intake date can't be after the foster placement with ${fosterName} began on ${day}.`;
const outcomeBeforeEnd = (day: string) =>
  `The outcome date can't be before the foster placement with ${fosterName} ended on ${day}.`;
const outcomeBeforeStart = (day: string) =>
  `The outcome date can't be before the foster placement with ${fosterName} began on ${day}.`;

test("an intake corrected past an open placement's start is refused with nothing written, and the start day is accepted", async () => {
  const { animalId, intakeIds } = await makeAnimal(
    "Intake past an open placement",
    [{ intake: "2026-01-01" }],
    [{ start: "2026-01-05" }],
  );
  const before = await snapshot(animalId);

  assert.deepEqual(await correctIntake(intakeIds[0], "2026-01-06"), {
    status: "refused",
    animalId,
    message: intakeAfterStart("Jan 5, 2026"),
  });
  assert.deepEqual(await snapshot(animalId), before);
  await assertNoListingMismatch(animalId);

  const accepted = await correctIntake(intakeIds[0], "2026-01-05");
  assert.equal(accepted.status, "corrected");
  assert.equal((await snapshot(animalId)).intake[0].intakeDate, "2026-01-05");
  await assertNoListingMismatch(animalId);
});

test("an intake corrected past a returned placement's start is refused with nothing written, and the start day is accepted", async () => {
  const { animalId, intakeIds } = await makeAnimal(
    "Intake past a returned placement",
    [{ intake: "2026-01-01" }],
    [{ start: "2026-01-05", end: "2026-01-08" }],
  );
  const before = await snapshot(animalId);

  // Before the placement's end, and after it: both leave it outside.
  for (const day of ["2026-01-06", "2026-01-10"]) {
    assert.deepEqual(await correctIntake(intakeIds[0], day), {
      status: "refused",
      animalId,
      message: intakeAfterStart("Jan 5, 2026"),
    });
  }
  assert.deepEqual(await snapshot(animalId), before);
  await assertNoListingMismatch(animalId);

  const accepted = await correctIntake(intakeIds[0], "2026-01-05");
  assert.equal(accepted.status, "corrected");
  await assertNoListingMismatch(animalId);
});

test("a placement in another stay does not block an intake correction", async () => {
  const { animalId, intakeIds } = await makeAnimal(
    "Placement in the first stay",
    [
      { intake: "2026-01-01" },
      { outcome: "2026-01-31" },
      { intake: "2026-03-01" },
    ],
    [{ start: "2026-01-10", end: "2026-01-20" }],
  );

  const result = await correctIntake(intakeIds[1], "2026-03-10");

  assert.equal(result.status, "corrected");
  assert.equal((await snapshot(animalId)).intake[1].intakeDate, "2026-03-10");
  await assertNoListingMismatch(animalId);
});

test("a backdated outcome before a returned placement's end is refused with nothing written, and the end day is accepted", async () => {
  const { animalId, placementIds } = await makeAnimal(
    "Outcome before a return",
    [{ intake: "2026-01-01" }],
    [{ start: "2026-01-05", end: "2026-01-20" }],
  );
  const before = await snapshot(animalId);

  await assert.rejects(
    record(animalId, "2026-01-15"),
    refusedWith(outcomeBeforeEnd("Jan 20, 2026")),
  );
  assert.deepEqual(await snapshot(animalId), before);
  assert.equal(before.listingStatus, AnimalListingStatus.PUBLISHED);
  await assertNoListingMismatch(animalId);

  await record(animalId, "2026-01-20");
  // The returned placement is not the outcome's to end.
  assert.deepEqual(await readPlacement(placementIds[0]), {
    endDate: "2026-01-20",
    returnReason: FosterReturnReason.RETURNED_TO_SHELTER,
    outcomeId: null,
  });
  const after = await snapshot(animalId);
  assert.equal(after.listingStatus, AnimalListingStatus.ARCHIVED);
  assert.deepEqual(
    after.activityLog.filter(
      (log) => log.activityType === AnimalActivityType.FOSTER_RETURNED,
    ),
    [],
  );
  await assertNoListingMismatch(animalId);
});

test("an outcome corrected before an unlinked returned placement's end is refused with nothing written", async () => {
  const { animalId } = await makeAnimal(
    "Outcome corrected before a return",
    [{ intake: "2026-01-01" }],
    [{ start: "2026-01-05", end: "2026-01-20" }],
  );
  await record(animalId, "2026-01-25");
  const outcomeId = await liveOutcomeId(animalId);
  const before = await snapshot(animalId);

  await assert.rejects(
    correctOutcome(outcomeId, "2026-01-15"),
    refusedWith(outcomeBeforeEnd("Jan 20, 2026")),
  );
  assert.deepEqual(await snapshot(animalId), before);
  await assertNoListingMismatch(animalId);

  // Its end day is allowed.
  const accepted = await correctOutcome(outcomeId, "2026-01-20");
  assert.equal(accepted.status, "corrected");
  assert.equal(accepted.fosterPersonId, null);
  await assertNoListingMismatch(animalId);
});

test("the placement an outcome ended still moves with it, bounded by its own start", async () => {
  // Returned once, then out again when the outcome was recorded.
  const { animalId, placementIds } = await makeAnimal(
    "Outcome in a second placement",
    [{ intake: "2026-01-01" }],
    [{ start: "2026-01-02", end: "2026-01-04" }, { start: "2026-01-05" }],
  );
  const [returned, open] = placementIds;
  await record(animalId, "2026-01-25");
  const outcomeId = await liveOutcomeId(animalId);

  const result = await correctOutcome(outcomeId, "2026-01-10");

  assert.equal(result.status, "corrected");
  assert.equal(result.fosterPersonId, fosterPersonId);
  assert.deepEqual(await readPlacement(open), {
    endDate: "2026-01-10",
    returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
    outcomeId,
  });
  assert.equal((await readPlacement(returned)).endDate, "2026-01-04");
  await assertNoListingMismatch(animalId);

  // Before both: the linked one's start is the later bound.
  const before = await snapshot(animalId);
  await assert.rejects(
    correctOutcome(outcomeId, "2026-01-03"),
    refusedWith(outcomeBeforeStart("Jan 5, 2026")),
  );
  assert.deepEqual(await snapshot(animalId), before);
  await assertNoListingMismatch(animalId);
});

test("a placement already outside every stay does not block a change", async () => {
  // Begun before the only intake, so inside no stay.
  const { animalId, intakeIds, placementIds } = await makeAnimal(
    "Placement before the intake",
    [{ intake: "2026-01-10" }],
    [{ start: "2026-01-05" }],
  );

  const corrected = await correctIntake(intakeIds[0], "2026-01-12");
  assert.equal(corrected.status, "corrected");
  await assertNoListingMismatch(animalId);

  // The outcome still ends it, as it ends any open placement.
  await record(animalId, "2026-01-15");
  assert.equal((await readPlacement(placementIds[0])).endDate, "2026-01-15");
  await assertNoListingMismatch(animalId);
});

test("on a merged stay, moving the second intake past a placement's start is accepted", async () => {
  // Left Jan 31 and back Mar 1, and the departure reversed: one stay from
  // Jan 1, with the placement after the second intake.
  const { animalId, intakeIds } = await makeAnimal(
    "Merged stay",
    [
      { intake: "2026-01-01" },
      { outcome: "2026-01-31", reversed: true },
      { intake: "2026-03-01" },
    ],
    [{ start: "2026-03-05" }],
  );

  const result = await correctIntake(intakeIds[1], "2026-03-10");

  assert.equal(result.status, "corrected");
  assert.equal((await snapshot(animalId)).intake[1].intakeDate, "2026-03-10");
  await assertNoListingMismatch(animalId);
});

test("an outcome is refused while two placements are open, and nothing is written", async () => {
  // No path makes this: the placement form refuses a second open placement.
  // Written directly, since the database does not refuse it.
  const { animalId } = await makeAnimal(
    "Two open placements",
    [{ intake: "2026-01-01" }],
    [{ start: "2026-01-05" }, { start: "2026-01-06" }],
  );
  const before = await snapshot(animalId);

  // After both starts, so no day check would refuse it.
  await assert.rejects(record(animalId, "2026-01-10"), (error: unknown) => {
    if (!(error instanceof ConflictError)) throw error;
    assert.equal(
      error.message,
      "This animal has more than one open foster placement. Return all but one before recording an outcome.",
    );
    return true;
  });

  assert.deepEqual(await snapshot(animalId), before);
  assert.equal(before.listingStatus, AnimalListingStatus.PUBLISHED);
  await assertNoListingMismatch(animalId);
});
