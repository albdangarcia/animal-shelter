// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. A correction is only as good as what the rows
// say afterwards — the intake, the activity log — and the timeline gate reads
// the animal's other events behind a row lock that exists only in a real
// Postgres.
//
// `recordIntakeCorrection` is the whole of the correction action bar the
// session check, the form validation and the cache invalidation, so driving
// it is driving the action.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
  OutcomeType,
  PartnerType,
  Sex,
} from "@/prisma/generated/enums";
import {
  recordIntakeCorrection,
  toIntakeCorrectionValues,
  type IntakeCorrectionValues,
} from "@/app/lib/services/intake-correction";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { checkTimelineChange } from "@/app/lib/data/animal-timeline.data";
import { IntakeCorrectionFormSchema } from "@/app/lib/zod-schemas/intake.schema";
import { calendarDay, shiftDayKey, shelterToday } from "@/app/lib/utils/shelter-day";
import { fallbackShelterSettings } from "@/app/lib/utils/shelter-settings";
import { NotFoundError } from "@/app/lib/utils/errors";

const runId = Date.now().toString(36);

let speciesId: string;
let colorId: string;
let staffId: string;
let surrendererId: string;
let partnerId: string;
let otherPartnerId: string;

before(async () => {
  const person = async (name: string) =>
    (
      await prisma.person.create({
        data: { name: `${name} ${runId}` },
        select: { id: true },
      })
    ).id;
  const partner = async (name: string) =>
    (
      await prisma.partner.create({
        data: { name: `${name} ${runId}`, type: PartnerType.RESCUE_GROUP },
        select: { id: true },
      })
    ).id;
  speciesId = (
    await prisma.species.create({
      data: { name: `Correction species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Correction color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Correction staff");
  surrendererId = await person("Correction surrenderer");
  partnerId = await partner("Correction rescue");
  otherPartnerId = await partner("Other rescue");
});

after(async () => {
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.partner.deleteMany({
    where: { id: { in: [partnerId, otherPartnerId] } },
  });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, surrendererId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

type Event =
  | {
      intake: string;
      type?: IntakeType;
      // Columns written as given, over the type's defaults, the way an older
      // row or the seed might hold them.
      columns?: Record<string, string | null>;
    }
  | { outcome: string; reversed?: boolean };

/**
 * An animal with the given intakes and outcomes, listed as its last event
 * leaves it. Each intake is a stray found at 1 Elm St unless a type or its
 * columns say otherwise.
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
      archiveReason: archived ? OutcomeType.TRANSFER_OUT : null,
    },
    select: { id: true },
  });
  const intakeIds: string[] = [];
  const outcomeIds: string[] = [];
  for (const event of events) {
    if ("intake" in event) {
      const type = event.type ?? IntakeType.STRAY;
      const intake = await prisma.intake.create({
        data: {
          animalId: animal.id,
          intakeDate: event.intake,
          type,
          staffMemberId: staffId,
          ...(type === IntakeType.STRAY && {
            foundAddress: "1 Elm St",
            foundCity: "Springfield",
            foundState: "IL",
          }),
          ...(type === IntakeType.TRANSFER_IN && { sourcePartnerId: partnerId }),
          ...event.columns,
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
          reversalReason: event.reversed ? "Entered twice." : null,
        },
        select: { id: true },
      });
      outcomeIds.push(outcome.id);
    }
  }
  return { animalId: animal.id, intakeIds, outcomeIds };
};

const readIntake = (id: string) =>
  prisma.intake.findUniqueOrThrow({
    where: { id },
    select: {
      intakeDate: true,
      type: true,
      notes: true,
      sourcePartnerId: true,
      surrenderingPersonId: true,
      foundAddress: true,
      foundCity: true,
      foundState: true,
      foundZipCode: true,
      dateLost: true,
      foundByPersonId: true,
      staffMemberId: true,
    },
  });

// What the edit form would submit for the intake as it stands, with `changes`
// applied on top, parsed the way the action parses it.
const submission = async (
  intakeId: string,
  changes: Record<string, string | undefined> = {},
): Promise<IntakeCorrectionValues> => {
  const stored = await readIntake(intakeId);
  return toIntakeCorrectionValues(
    IntakeCorrectionFormSchema.parse({
      intakeType: stored.type,
      intakeDate: stored.intakeDate,
      notes: stored.notes ?? "",
      sourcePartnerId: stored.sourcePartnerId ?? "",
      surrenderingPersonId: stored.surrenderingPersonId ?? "",
      foundAddress: stored.foundAddress ?? "",
      foundCity: stored.foundCity ?? "",
      foundState: stored.foundState ?? "",
      ...changes,
    }),
  );
};

const correct = (
  intakeId: string,
  next: IntakeCorrectionValues,
  options?: { timeout: number },
) =>
  prisma.$transaction(
    (tx) => recordIntakeCorrection(tx, intakeId, next, staffId),
    options,
  );

const correctionRows = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId, activityType: AnimalActivityType.INTAKE_CORRECTED },
    select: { changedById: true, changeSummary: true },
  });

test("a notes fix writes the intake and one activity row", async () => {
  const { animalId, intakeIds } = await makeAnimal("Notes", [
    { intake: "2026-01-03" },
  ]);

  const result = await correct(
    intakeIds[0],
    await submission(intakeIds[0], { notes: "Shy with dogs." }),
  );

  assert.equal(result.status, "corrected");
  assert.equal((await readIntake(intakeIds[0])).notes, "Shy with dogs.");
  const rows = await correctionRows(animalId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].changedById, staffId);
  assert.equal(rows[0].changeSummary, "Intake was corrected: notes were added.");
});

test("a save that changes nothing writes nothing", async () => {
  const { animalId, intakeIds } = await makeAnimal("Unchanged", [
    { intake: "2026-01-03" },
  ]);

  const result = await correct(intakeIds[0], await submission(intakeIds[0]));

  assert.equal(result.status, "unchanged");
  assert.equal((await correctionRows(animalId)).length, 0);
});

test("stray to owner surrender needs a person and clears the found address", async () => {
  const { animalId, intakeIds } = await makeAnimal("Retyped", [
    { intake: "2026-01-03" },
  ]);
  const stored = await readIntake(intakeIds[0]);

  const withoutPerson = IntakeCorrectionFormSchema.safeParse({
    intakeType: IntakeType.OWNER_SURRENDER,
    intakeDate: stored.intakeDate,
  });
  assert.equal(withoutPerson.success, false);
  assert.deepEqual(
    withoutPerson.error!.issues.map((issue) => issue.path),
    [["surrenderingPersonId"]],
  );

  const result = await correct(
    intakeIds[0],
    await submission(intakeIds[0], {
      intakeType: IntakeType.OWNER_SURRENDER,
      surrenderingPersonId: surrendererId,
    }),
  );

  assert.equal(result.status, "corrected");
  const intake = await readIntake(intakeIds[0]);
  assert.equal(intake.type, IntakeType.OWNER_SURRENDER);
  assert.equal(intake.surrenderingPersonId, surrendererId);
  assert.equal(intake.foundAddress, null);
  assert.equal(intake.foundCity, null);
  assert.equal(intake.foundState, null);
  // Who recorded the intake is not something a correction touches.
  assert.equal(intake.staffMemberId, staffId);

  const [row] = await correctionRows(animalId);
  assert.equal(
    row.changeSummary,
    `Intake was corrected: the type changed from stray to owner surrender; ` +
      `the surrendering person changed from none to Correction surrenderer ${runId}; ` +
      `the found address, city and state were cleared (were 1 Elm St, Springfield, IL).`,
  );
});

test("a stored blank reads as empty, so leaving it blank changes nothing", async () => {
  const { animalId, intakeIds } = await makeAnimal("Blank", [
    {
      intake: "2026-01-03",
      type: IntakeType.TRANSFER_IN,
      columns: { notes: "", foundCity: "" },
    },
  ]);

  const result = await correct(intakeIds[0], await submission(intakeIds[0]));

  assert.equal(result.status, "unchanged");
  assert.equal((await correctionRows(animalId)).length, 0);
});

test("clearing a partly filled found location names only what it held", async () => {
  const { animalId, intakeIds } = await makeAnimal("Partial", [
    {
      intake: "2026-01-03",
      type: IntakeType.TRANSFER_IN,
      columns: { foundCity: "Springfield" },
    },
  ]);

  await correct(intakeIds[0], await submission(intakeIds[0]));

  assert.equal((await readIntake(intakeIds[0])).foundCity, null);
  assert.equal(
    (await correctionRows(animalId))[0].changeSummary,
    "Intake was corrected: the found city was cleared (was Springfield).",
  );
});

test("the stray columns no form writes are kept for a stray and cleared with the type", async () => {
  const columns = {
    foundZipCode: "62701",
    dateLost: "2025-12-30",
  };
  const kept = await makeAnimal("Kept", [
    { intake: "2026-01-03", columns: { ...columns, foundByPersonId: surrendererId } },
  ]);
  await correct(
    kept.intakeIds[0],
    await submission(kept.intakeIds[0], { notes: "Found near the park." }),
  );
  const stray = await readIntake(kept.intakeIds[0]);
  assert.equal(stray.foundZipCode, "62701");
  assert.equal(stray.dateLost, "2025-12-30");
  assert.equal(stray.foundByPersonId, surrendererId);

  const retyped = await makeAnimal("Cleared", [
    { intake: "2026-01-03", columns: { ...columns, foundByPersonId: surrendererId } },
  ]);
  await correct(
    retyped.intakeIds[0],
    await submission(retyped.intakeIds[0], {
      intakeType: IntakeType.TRANSFER_IN,
      sourcePartnerId: partnerId,
    }),
  );
  const transfer = await readIntake(retyped.intakeIds[0]);
  assert.equal(transfer.foundZipCode, null);
  assert.equal(transfer.dateLost, null);
  assert.equal(transfer.foundByPersonId, null);
  assert.equal(
    (await correctionRows(retyped.animalId))[0].changeSummary,
    `Intake was corrected: the type changed from stray to transfer in; ` +
      `the source partner changed from none to Correction rescue ${runId}; ` +
      `the found address, city, state and zip code were cleared (were 1 Elm St, Springfield, IL, 62701); ` +
      `the date lost was cleared (was Dec 30, 2025); ` +
      `the person who found the animal was cleared (was Correction surrenderer ${runId}).`,
  );
});

test("the partner and found fields are named from and to", async () => {
  const transfer = await makeAnimal("Partner", [
    { intake: "2026-01-03", type: IntakeType.TRANSFER_IN },
  ]);
  await correct(
    transfer.intakeIds[0],
    await submission(transfer.intakeIds[0], { sourcePartnerId: otherPartnerId }),
  );
  assert.equal(
    (await correctionRows(transfer.animalId))[0].changeSummary,
    `Intake was corrected: the source partner changed from Correction rescue ${runId} to Other rescue ${runId}.`,
  );

  const stray = await makeAnimal("Found", [{ intake: "2026-01-03" }]);
  await correct(
    stray.intakeIds[0],
    await submission(stray.intakeIds[0], { foundAddress: "12 Elm St" }),
  );
  assert.equal(
    (await correctionRows(stray.animalId))[0].changeSummary,
    "Intake was corrected: the found address changed from 1 Elm St to 12 Elm St.",
  );
});

test("a date moved past the stay's outcome is refused, and nothing is written", async () => {
  const { animalId, intakeIds } = await makeAnimal("Crossing", [
    { intake: "2026-01-03" },
    { outcome: "2026-02-01" },
  ]);

  const result = await correct(
    intakeIds[0],
    await submission(intakeIds[0], {
      intakeDate: "2026-02-10",
      notes: "Would have been saved too.",
    }),
  );

  assert.deepEqual(result, {
    status: "refused",
    animalId,
    message: "The intake date can't be after this stay's outcome on Feb 1, 2026.",
  });
  const intake = await readIntake(intakeIds[0]);
  assert.equal(intake.intakeDate, "2026-01-03");
  assert.equal(intake.notes, null);
  assert.equal((await correctionRows(animalId)).length, 0);
});

test("a date within the stay is corrected and logged", async () => {
  const { animalId, intakeIds } = await makeAnimal("Within", [
    { intake: "2026-01-05" },
    { outcome: "2026-02-01" },
  ]);

  const result = await correct(
    intakeIds[0],
    await submission(intakeIds[0], { intakeDate: "2026-01-01" }),
  );

  assert.equal(result.status, "corrected");
  assert.equal((await readIntake(intakeIds[0])).intakeDate, "2026-01-01");
  assert.equal(
    (await correctionRows(animalId))[0].changeSummary,
    "Intake was corrected: the date changed from Jan 5, 2026 to Jan 1, 2026.",
  );
});

test("a future date is refused on the server", async () => {
  const { intakeIds } = await makeAnimal("Future", [{ intake: "2026-01-03" }]);
  // Two days out, so it is in the future whatever timezone the shelter keeps.
  const future = shiftDayKey(
    shelterToday(fallbackShelterSettings().timezone),
    2,
  );

  const result = await correct(
    intakeIds[0],
    await submission(intakeIds[0], { intakeDate: future }),
  );

  assert.equal(result.status, "refused");
  assert.equal(
    result.status === "refused" && result.message,
    "The intake date can't be in the future.",
  );
});

test("an existing duplicate intake does not block a harmless move", async () => {
  // Adopted, returned, adopted again, returned, and the first adoption then
  // reversed: the animal never left, so the second intake duplicates the first.
  const { intakeIds } = await makeAnimal("Duplicated", [
    { intake: "2026-01-01" },
    { outcome: "2026-02-01", reversed: true },
    { intake: "2026-03-01" },
    { outcome: "2026-04-01" },
    { intake: "2026-05-01" },
  ]);

  const result = await correct(
    intakeIds[2],
    await submission(intakeIds[2], { intakeDate: "2026-04-15" }),
  );
  assert.equal(result.status, "corrected");

  // The reversed outcome is not on the timeline, so crossing its day is not
  // crossing anything.
  const crossing = await correct(
    intakeIds[0],
    await submission(intakeIds[0], { intakeDate: "2026-02-15" }),
  );
  assert.equal(crossing.status, "corrected");
});

test("the gate takes each kind of change", async () => {
  const { animalId, intakeIds, outcomeIds } = await makeAnimal("Gate", [
    { intake: "2026-01-01" },
    { outcome: "2026-02-01" },
  ]);
  const check = (change: Parameters<typeof checkTimelineChange>[2]) =>
    prisma.$transaction(async (tx) => {
      await lockAnimal(tx, animalId);
      return checkTimelineChange(tx, animalId, change);
    });

  assert.equal(
    await check({ kind: "addIntake", day: calendarDay("2026-03-01") }),
    null,
  );
  assert.equal(
    await check({ kind: "addOutcome", day: calendarDay("2026-03-01") }),
    "The outcome date would put this animal's intakes and outcomes out of order.",
  );
  assert.equal(
    await check({
      kind: "moveOutcome",
      outcomeId: outcomeIds[0],
      day: calendarDay("2025-12-01"),
    }),
    "The outcome date can't be before this stay's intake on Jan 1, 2026.",
  );
  assert.equal(
    await check({
      kind: "moveIntake",
      intakeId: intakeIds[0],
      day: calendarDay("2026-01-20"),
    }),
    null,
  );
});

test("an unknown intake is not found", async () => {
  const { intakeIds } = await makeAnimal("Known", [{ intake: "2026-01-03" }]);
  const next = await submission(intakeIds[0]);
  await assert.rejects(
    correct("clnotarealintakeid000000", next),
    NotFoundError,
  );
});

/** The backend a transaction runs on, so a wait can be pinned to it. */
const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// Same as in outcome-reversal.test.ts: pinned to the holder's own backend, so
// another file's wait on some other animal cannot pass for this one.
const waitForSessionBlockedBy = async (holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session was seen waiting on backend ${holderPid}.`);
};

// The date is judged against the animal's other events, so it must not be
// judged against a set an outcome is about to change. An outcome recorded
// while the correction waits is one it then sees.
test("a date correction waits for the animal lock, and judges what it finds", async () => {
  const { animalId, intakeIds } = await makeAnimal("Held", [
    { intake: "2026-01-03" },
  ]);
  const next = await submission(intakeIds[0], { intakeDate: "2026-02-10" });

  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
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
      await tx.outcome.create({
        data: {
          animalId,
          outcomeDate: "2026-02-01",
          type: OutcomeType.TRANSFER_OUT,
          staffMemberId: staffId,
        },
      });
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  const correction = correct(intakeIds[0], next, { timeout });
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    // Released even when the wait fails, so neither transaction is left open.
    release();
  }
  await holder;
  const result = await correction;
  assert.equal(result.status, "refused");
  assert.equal((await readIntake(intakeIds[0])).intakeDate, "2026-01-03");
});
