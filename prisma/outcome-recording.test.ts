// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. Whether an outcome day is refused rests on
// the animal's other intakes and outcomes, read behind a row lock that exists
// only in a real Postgres, and a refusal is only as good as what the rows say
// afterwards: the animal still listed as it was, no outcome, no activity row.
//
// `recordOutcome` and `recordOutcomeCorrection` are the whole of the create
// and correct actions bar the session check, the form validation and the
// cache invalidation, so driving them is driving the actions.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  recordOutcome,
  recordOutcomeCorrection,
} from "@/app/lib/services/outcome-recording";
import { recordOutcomeReversal } from "@/app/lib/services/outcome-reversal";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  OutcomeFormSchema,
  type OutcomeFormOutput,
} from "@/app/lib/zod-schemas/outcome.schema";
import { shiftDayKey, shelterToday } from "@/app/lib/utils/shelter-day";
import { fallbackShelterSettings } from "@/app/lib/utils/shelter-settings";
import { ConflictError, TimelineOrderError } from "@/app/lib/utils/errors";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);

// Two days out, so it is in the future whatever timezone the shelter keeps.
const future = () =>
  shiftDayKey(shelterToday(fallbackShelterSettings().timezone), 2);

let speciesId: string;
let colorId: string;
let staffId: string;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Outcome day species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Outcome day color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Outcome day staff ${runId}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

type Event = { intake: string } | { outcome: string; reversed?: boolean };

/**
 * An animal with the given intakes and outcomes, listed as its last live
 * event leaves it. Every outcome is a death, so it needs no partner or owner.
 */
const makeAnimal = async (label: string, events: Event[]) => {
  const live = events.filter((event) => !("outcome" in event && event.reversed));
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
        : AnimalListingStatus.DRAFT,
      archiveReason: archived ? OutcomeType.DECEASED : null,
    },
    select: { id: true },
  });
  const outcomeIds: string[] = [];
  for (const event of events) {
    if ("intake" in event) {
      await prisma.intake.create({
        data: {
          animalId: animal.id,
          intakeDate: event.intake,
          type: IntakeType.STRAY,
          staffMemberId: staffId,
        },
      });
    } else {
      const outcome = await prisma.outcome.create({
        data: {
          animalId: animal.id,
          outcomeDate: event.outcome,
          type: OutcomeType.DECEASED,
          staffMemberId: staffId,
          reversedAt: event.reversed ? new Date() : null,
          reversedById: event.reversed ? staffId : null,
          reversalReason: event.reversed ? "Entered against the wrong animal." : null,
        },
        select: { id: true },
      });
      outcomeIds.push(outcome.id);
    }
  }
  return { animalId: animal.id, outcomeIds };
};

// What the outcome form would submit, parsed the way the actions parse it.
const deceased = (outcomeDate: string, notes = ""): OutcomeFormOutput =>
  OutcomeFormSchema.parse({
    outcomeType: OutcomeType.DECEASED,
    outcomeDate,
    notes,
  });

const record = (animalId: string, outcomeDate: string) =>
  prisma.$transaction((tx) =>
    recordOutcome(tx, { animalId, values: deceased(outcomeDate) }, staffId),
  );

const readAnimal = async (animalId: string) => {
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      Outcome: {
        where: { reversedAt: null },
        select: { id: true, outcomeDate: true, notes: true },
        orderBy: { outcomeDate: "asc" },
      },
      activityLog: { select: { activityType: true, changeSummary: true } },
    },
  });
  return {
    listingStatus: animal.listingStatus,
    outcomes: animal.Outcome,
    activityLogs: animal.activityLog,
  };
};

const refusedFor = (message: string) => (error: unknown) => {
  // Anything else is reported as itself, not as a failed type check.
  if (!(error instanceof TimelineOrderError)) throw error;
  assert.equal(error.message, message);
  assert.equal(error.field, "outcomeDate");
  return true;
};

test("an outcome dated before the stay's intake is refused, and nothing is written", async () => {
  const { animalId } = await makeAnimal("Before intake", [
    { intake: "2026-01-03" },
  ]);

  await assert.rejects(
    record(animalId, "2025-12-30"),
    refusedFor(
      "The outcome date can't be before this stay's intake on Jan 3, 2026.",
    ),
  );

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.DRAFT);
  assert.deepEqual(animal.outcomes, []);
  assert.deepEqual(animal.activityLogs, []);
  await assertNoListingMismatch(animalId);
});

test("an outcome on the stay's intake day or later is recorded", async () => {
  const { animalId } = await makeAnimal("Zero-day stay", [
    { intake: "2026-01-03" },
  ]);

  await record(animalId, "2026-01-03");

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.ARCHIVED);
  assert.deepEqual(
    animal.outcomes.map((outcome) => outcome.outcomeDate),
    ["2026-01-03"],
  );
  assert.deepEqual(
    animal.activityLogs.map((row) => row.activityType),
    [AnimalActivityType.OUTCOME_PROCESSED],
  );
  await assertNoListingMismatch(animalId);
});

test("an archived animal is refused for its status, not for the day", async () => {
  const { animalId } = await makeAnimal("Already gone", [
    { intake: "2026-01-03" },
    { outcome: "2026-02-01" },
  ]);

  const before = await readAnimal(animalId);

  await assert.rejects(
    record(animalId, "2026-01-10"),
    (error: unknown) =>
      error instanceof ConflictError &&
      error.message === "This animal has already been processed for an outcome.",
  );

  assert.deepEqual(await readAnimal(animalId), before);
  await assertNoListingMismatch(animalId);
});

test("a future day is refused on create", async () => {
  const { animalId } = await makeAnimal("Future create", [
    { intake: "2026-01-03" },
  ]);

  await assert.rejects(
    record(animalId, future()),
    refusedFor("The outcome date can't be in the future."),
  );

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.DRAFT);
  assert.deepEqual(animal.outcomes, []);
  assert.deepEqual(animal.activityLogs, []);
  await assertNoListingMismatch(animalId);
});

test("a correction moved past a later re-intake is refused, and one within bounds is accepted", async () => {
  const { animalId, outcomeIds } = await makeAnimal("Moved past return", [
    { intake: "2026-01-01" },
    { outcome: "2026-02-01" },
    { intake: "2026-03-01" },
  ]);

  await assert.rejects(
    recordOutcomeCorrection(outcomeIds[0], deceased("2026-03-05"), staffId),
    refusedFor(
      "The outcome date can't be after the next intake on Mar 1, 2026.",
    ),
  );
  let animal = await readAnimal(animalId);
  assert.equal(animal.outcomes[0].outcomeDate, "2026-02-01");
  assert.deepEqual(animal.activityLogs, []);

  const result = await recordOutcomeCorrection(
    outcomeIds[0],
    deceased("2026-02-10"),
    staffId,
  );

  assert.deepEqual(result, {
    status: "corrected",
    animalId,
    fosterPersonId: null,
  });
  animal = await readAnimal(animalId);
  assert.equal(animal.outcomes[0].outcomeDate, "2026-02-10");
  assert.equal(animal.listingStatus, AnimalListingStatus.DRAFT);
  assert.deepEqual(animal.activityLogs, [
    {
      activityType: AnimalActivityType.OUTCOME_CORRECTED,
      changeSummary:
        "Outcome was corrected: the date changed from Feb 1, 2026 to Feb 10, 2026.",
    },
  ]);
  await assertNoListingMismatch(animalId);
});

test("a correction dated before the stay's intake is refused", async () => {
  const { animalId, outcomeIds } = await makeAnimal("Moved before arrival", [
    { intake: "2026-01-03" },
    { outcome: "2026-02-01" },
  ]);
  const before = await readAnimal(animalId);

  await assert.rejects(
    recordOutcomeCorrection(outcomeIds[0], deceased("2025-12-30"), staffId),
    refusedFor(
      "The outcome date can't be before this stay's intake on Jan 3, 2026.",
    ),
  );

  assert.deepEqual(await readAnimal(animalId), before);
  await assertNoListingMismatch(animalId);
});

test("a future day is refused on correction", async () => {
  const { animalId, outcomeIds } = await makeAnimal("Future correction", [
    { intake: "2026-01-03" },
    { outcome: "2026-02-01" },
  ]);

  await assert.rejects(
    recordOutcomeCorrection(outcomeIds[0], deceased(future()), staffId),
    refusedFor("The outcome date can't be in the future."),
  );

  const animal = await readAnimal(animalId);
  assert.equal(animal.outcomes[0].outcomeDate, "2026-02-01");
  assert.deepEqual(animal.activityLogs, []);
  await assertNoListingMismatch(animalId);
});

test("a correction that keeps the day is not checked, even on a future-dated row", async () => {
  const day = future();
  const { animalId, outcomeIds } = await makeAnimal("Legacy future row", [
    { intake: "2026-01-03" },
    { outcome: day },
  ]);

  const result = await recordOutcomeCorrection(
    outcomeIds[0],
    deceased(day, "Found at the gate."),
    staffId,
  );

  assert.equal(result.status, "corrected");
  const animal = await readAnimal(animalId);
  assert.equal(animal.outcomes[0].notes, "Found at the gate.");
  assert.equal(animal.outcomes[0].outcomeDate, day);
  await assertNoListingMismatch(animalId);
});

test("an animal left with a duplicate intake by a reversal can have a later outcome recorded", async () => {
  // Adopted, returned, adopted again, and back in care. Reversing the first
  // adoption, which is not the latest, leaves the return duplicating the
  // arrival, since the animal never left. That break is the reversal's, not
  // one a later outcome adds, so the animal can still leave.
  const { animalId, outcomeIds } = await makeAnimal("Duplicate intake", [
    { intake: "2026-01-01" },
    { outcome: "2026-02-01" },
    { intake: "2026-03-01" },
    { outcome: "2026-04-01" },
    { intake: "2026-05-01" },
  ]);
  const reversal = await prisma.$transaction((tx) =>
    recordOutcomeReversal(
      tx,
      outcomeIds[0],
      "Entered against the wrong animal.",
      staffId,
    ),
  );
  // Not the latest outcome, so the animal's listing was left alone.
  assert.equal(reversal.restoredListingStatus, null);

  await record(animalId, "2026-06-01");

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.ARCHIVED);
  assert.deepEqual(
    animal.outcomes.map((outcome) => outcome.outcomeDate),
    ["2026-04-01", "2026-06-01"],
  );
  await assertNoListingMismatch(animalId);
});

/** The backend a transaction runs on, so a wait can be pinned to it. */
const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// Same as in outcome-reversal.test.ts: pinned to the holder's own backend, so
// another file's wait on some other animal cannot pass for this one.
//
// Resolves true once a session is seen waiting, or false as soon as `stop`
// says there is nothing left to wait for: the session meant to block has
// already finished, so polling on would only hide why.
const waitForSessionBlockedBy = async (
  holderPid: number,
  stop: () => boolean = () => false,
): Promise<boolean> => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (stop()) return false;
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))`;
    if (waiting > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session was seen waiting on backend ${holderPid}.`);
};

/**
 * Starts a correction while another transaction holds the animal's lock, and
 * once the correction is seen waiting on it, lets that transaction run
 * `write` and commit. Settles with the correction's own outcome.
 *
 * Both transactions are given longer than the five seconds the wait may
 * take, so a slow machine fails on the wait, not on a timeout. The
 * correction's clock starts before it blocks, so it needs the longer timeout
 * as much as the holder does.
 */
const correctWhileHeld = async (
  animalId: string,
  outcomeId: string,
  values: OutcomeFormOutput,
  write: (tx: TransactionClient) => Promise<unknown>,
) => {
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: (pid: number) => void;
  const isLocked = new Promise<number>((resolve) => (locked = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await lockAnimal(tx, animalId);
      locked(await backendPid(tx));
      await released;
      await write(tx);
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  // Observed from the start, so a rejection is never reported as unhandled
  // and the wait can stop the moment the correction finishes.
  let correctionSettled = false;
  const correction = recordOutcomeCorrection(outcomeId, values, staffId, {
    timeout,
  })
    .then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    .finally(() => (correctionSettled = true));
  const waited = await waitForSessionBlockedBy(
    holderPid,
    () => correctionSettled,
  ).then(
    (blocked) => ({ blocked }),
    (error: unknown) => ({ error }),
  );

  // Released whatever happened above, and both transactions are let finish
  // before anything is reported, so neither is left running into the next
  // test.
  release();
  const [held] = await Promise.allSettled([holder, correction]);
  const result = await correction;

  // The first thing that went wrong is reported, as itself. A correction
  // that finished without ever waiting either failed before it reached the
  // lock, or took none; the wait's own error would hide both.
  if ("blocked" in waited && !waited.blocked) {
    if ("error" in result) throw result.error;
    throw new Error("The correction finished without waiting on the lock.");
  }
  if ("error" in waited) throw waited.error;
  if (held.status === "rejected") throw held.reason;
  if ("error" in result) throw result.error;
  return result.value;
};

// A reversal committed while the correction waits takes the outcome off the
// timeline. The correction has to see that behind the lock and say so, not
// correct a voided record, and not fail looking for it on the timeline.
test("a correction waiting on the lock is refused when the outcome is reversed first", async () => {
  const { animalId, outcomeIds } = await makeAnimal("Reversed while held", [
    { intake: "2026-01-03" },
    { outcome: "2026-02-01" },
  ]);

  await assert.rejects(
    correctWhileHeld(animalId, outcomeIds[0], deceased("2026-02-10"), (tx) =>
      recordOutcomeReversal(tx, outcomeIds[0], "Wrong animal.", staffId),
    ),
    (error: unknown) =>
      error instanceof ConflictError &&
      error.message ===
        "This outcome was reversed, so it can no longer be corrected.",
  );

  const outcome = await prisma.outcome.findUniqueOrThrow({
    where: { id: outcomeIds[0] },
    select: { outcomeDate: true, reversedAt: true },
  });
  assert.equal(outcome.outcomeDate, "2026-02-01");
  assert.notEqual(outcome.reversedAt, null);
  const corrections = await prisma.animalActivityLog.count({
    where: { animalId, activityType: AnimalActivityType.OUTCOME_CORRECTED },
  });
  assert.equal(corrections, 0);
  await assertNoListingMismatch(animalId);
});

// The day is judged against the animal's other events, so it must not be
// judged against a set a re-intake is about to change. One committed while
// the correction waits is one it then sees.
test("a correction waiting on the lock is judged against a re-intake committed first", async () => {
  const { animalId, outcomeIds } = await makeAnimal("Returned while held", [
    { intake: "2026-01-01" },
    { outcome: "2026-02-01" },
  ]);

  await assert.rejects(
    correctWhileHeld(animalId, outcomeIds[0], deceased("2026-03-05"), (tx) =>
      tx.intake.create({
        data: {
          animalId,
          intakeDate: "2026-03-01",
          type: IntakeType.STRAY,
          staffMemberId: staffId,
        },
      }),
    ),
    refusedFor(
      "The outcome date can't be after the next intake on Mar 1, 2026.",
    ),
  );

  const animal = await readAnimal(animalId);
  assert.equal(animal.outcomes[0].outcomeDate, "2026-02-01");
  assert.deepEqual(animal.activityLogs, []);
});
