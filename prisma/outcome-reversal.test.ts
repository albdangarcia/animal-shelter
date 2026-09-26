// Same reasoning as person-account-unlink.test.ts for living under prisma/ and
// running via `npm run test:db`. A reversal is only as good as what the rows
// say afterwards — the outcome, the animal's listing, the placement, the
// activity log — and the partial unique index on the adoption link exists only
// in a real Postgres.
//
// `recordOutcomeReversal` is the whole of the reversal action bar the session
// check and the cache invalidation, so driving it is driving the action.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationSource,
  ApplicationStatus,
  FosterPlacementType,
  FosterReturnReason,
  IntakeType,
  LivingSituation,
  LocationType,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  assertNoLiveAdoptionOutcome,
  recordOutcomeReversal,
} from "@/app/lib/services/outcome-reversal";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatuses,
  effectiveStatusBehindLock,
  lockAnimal,
  withConsequenceInHistory,
} from "@/app/lib/data/application-status.data";
import { _fetchAnimalStayEvents } from "@/app/lib/data/reports/report-shared.data";
import { runGlobalSearch } from "@/app/lib/data/search/global-search";
import { computeStays } from "@/app/lib/utils/stay-utils";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);
const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

const REASON = "Entered against the wrong animal.";

let speciesId: string;
let colorId: string;
let staffId: string;
let adminId: string;
let applicantId: string;
let fosterPersonId: string;
let fosterProfileId: string;
const locationIds: string[] = [];

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
      data: { name: `Reversal species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Reversal color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Reversal staff");
  adminId = await person("Reversal admin");
  applicantId = await person("Reversal applicant");
  fosterPersonId = await person("Reversal foster");
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { placedById: staffId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.adoptionApplication.deleteMany({ where: { applicantId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.unit.deleteMany({ where: { locationId: { in: locationIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, adminId, applicantId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  listingStatus: AnimalListingStatus,
  currentUnitId?: string,
) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus,
        currentUnitId,
        // Every animal arrived before any outcome here is dated, so its
        // timeline is one a listing can agree or disagree with.
        intake: {
          create: {
            type: IntakeType.STRAY,
            intakeDate: "2026-08-01",
            staffMemberId: staffId,
          },
        },
      },
      select: { id: true },
    })
  ).id;

/** A unit in a location of its own, with the label the app gives it. */
const makeUnit = async (capacity = 2) => {
  const location = await prisma.location.create({
    data: {
      name: `Reversal kennels ${runId} ${locationIds.length + 1}`,
      type: LocationType.KENNEL,
    },
    select: { id: true, name: true },
  });
  locationIds.push(location.id);
  const unit = await prisma.unit.create({
    data: { name: "A3", capacity, locationId: location.id },
    select: { id: true },
  });
  return {
    id: unit.id,
    locationId: location.id,
    label: `${location.name} · A3`,
  };
};

const makeApplication = async (
  animalId: string,
  status: ApplicationStatus = ApplicationStatus.APPROVED,
) =>
  (
    await prisma.adoptionApplication.create({
      data: {
        applicantName: `Reversal applicant ${runId}`,
        applicantEmail: `reversal.${runId}@example.com`,
        applicantPhone: "2125550100",
        applicantAddressLine1: "1 Main St",
        applicantCity: "New York",
        applicantState: "NY",
        applicantZipCode: "10001",
        livingSituation: LivingSituation.OWN_HOME,
        householdSize: 1,
        reasonForAdoption: "Test",
        status,
        source: ApplicationSource.STAFF,
        applicantId,
        animalId,
        submittedAt: hoursAgo(48),
      },
      select: { id: true },
    })
  ).id;

/**
 * Leaves the rows an outcome-recording path leaves: the outcome, carrying the
 * listing status and unit the animal had, and the animal archived for it and
 * out of its unit.
 */
const recordOutcome = async (
  animalId: string,
  {
    type = OutcomeType.TRANSFER_OUT,
    previousListingStatus,
    previousUnitId,
    adoptionApplicationId,
    createdAt = hoursAgo(1),
    outcomeDate = "2026-09-01",
  }: {
    type?: OutcomeType;
    previousListingStatus: AnimalListingStatus | null;
    previousUnitId?: string;
    adoptionApplicationId?: string;
    createdAt?: Date;
    outcomeDate?: string;
  },
) => {
  const outcome = await prisma.outcome.create({
    data: {
      animalId,
      type,
      outcomeDate,
      staffMemberId: staffId,
      previousListingStatus,
      previousUnitId,
      adoptionApplicationId,
      createdAt,
    },
    select: { id: true },
  });
  await prisma.animal.update({
    where: { id: animalId },
    data: {
      listingStatus: AnimalListingStatus.ARCHIVED,
      archiveReason: type,
      currentUnitId: null,
    },
  });
  return outcome.id;
};

// The state a re-intake leaves the animal in: the intake, and the listing.
const reIntake = async (animalId: string, intakeDate = "2026-09-10") => {
  await prisma.intake.create({
    data: {
      animalId,
      type: IntakeType.SEIZE,
      intakeDate,
      staffMemberId: staffId,
    },
  });
  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.DRAFT, archiveReason: null },
  });
};

const reverse = (
  outcomeId: string,
  reason = REASON,
  options?: { timeout: number },
) =>
  prisma.$transaction(
    (tx) => recordOutcomeReversal(tx, outcomeId, reason, adminId),
    options,
  );

const readOutcome = (id: string) =>
  prisma.outcome.findUniqueOrThrow({
    where: { id },
    select: {
      reversedAt: true,
      reversedById: true,
      reversalReason: true,
      adoptionApplicationId: true,
    },
  });

const readAnimal = (id: string) =>
  prisma.animal.findUniqueOrThrow({
    where: { id },
    select: { listingStatus: true, archiveReason: true },
  });

/** The backend a transaction runs on, so a wait can be pinned to it. */
const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// The only proof a statement reached the lock and is blocked there, rather
// than not having started yet. Asking which sessions `holderPid` blocks,
// rather than matching the lock query, keeps another test file's wait on some
// other animal (the files run in parallel) from passing for this one.
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

const reversalRows = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId, activityType: AnimalActivityType.OUTCOME_REVERSED },
    select: { changedById: true, changeSummary: true, changedAt: true },
  });

const locationRows = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId, activityType: AnimalActivityType.LOCATION_CHANGE },
    select: { changedById: true, changeSummary: true, changedAt: true },
  });

const unitOf = async (animalId: string) =>
  (
    await prisma.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { currentUnitId: true },
    })
  ).currentUnitId;

test("a reversal voids the outcome, restores the listing and records why", async () => {
  const animalId = await makeAnimal("Restored", AnimalListingStatus.PENDING_ADOPTION);
  const applicationId = await makeApplication(animalId);
  const outcomeId = await recordOutcome(animalId, {
    type: OutcomeType.ADOPTION,
    previousListingStatus: AnimalListingStatus.PENDING_ADOPTION,
    adoptionApplicationId: applicationId,
  });

  const result = await reverse(outcomeId, `  ${REASON}  `);

  assert.equal(result.animalId, animalId);
  assert.equal(result.adoptionApplicationId, applicationId);
  assert.equal(result.restoredListingStatus, AnimalListingStatus.PENDING_ADOPTION);
  assert.equal(result.reopenedPlacementId, null);
  assert.equal(result.fosterPersonId, null);

  // Voided, not deleted, and the link to the application is kept.
  const outcome = await readOutcome(outcomeId);
  assert.ok(outcome.reversedAt);
  assert.equal(outcome.reversedById, adminId);
  assert.equal(outcome.reversalReason, REASON);
  assert.equal(outcome.adoptionApplicationId, applicationId);

  assert.deepEqual(await readAnimal(animalId), {
    listingStatus: AnimalListingStatus.PENDING_ADOPTION,
    archiveReason: null,
  });

  const rows = await reversalRows(animalId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].changedById, adminId);
  assert.match(rows[0].changeSummary!, /^Outcome was reversed: adoption\./);
  assert.match(rows[0].changeSummary!, /restored to pending adoption/);
  assert.ok(rows[0].changeSummary!.endsWith(`Reason: ${REASON}`));
  await assertNoListingMismatch(animalId);
});

test("a reversal needs a reason", async () => {
  const animalId = await makeAnimal("No reason", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });

  for (const reason of ["", "   \n\t"]) {
    await assert.rejects(reverse(outcomeId, reason), PreconditionFailedError);
  }

  assert.equal((await readOutcome(outcomeId)).reversedAt, null);
  assert.equal(
    (await readAnimal(animalId)).listingStatus,
    AnimalListingStatus.ARCHIVED,
  );
  assert.equal((await reversalRows(animalId)).length, 0);
});

test("a second reversal is refused, and the first stands", async () => {
  const animalId = await makeAnimal("Twice", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });

  await reverse(outcomeId);
  const first = await readOutcome(outcomeId);

  await assert.rejects(
    reverse(outcomeId, "A different reason."),
    (error) =>
      error instanceof ConflictError && /already been reversed/.test(error.message),
  );

  assert.deepEqual(await readOutcome(outcomeId), first);
  assert.equal((await reversalRows(animalId)).length, 1);
  await assertNoListingMismatch(animalId);
});

test("two reversals of one outcome at once: one lands, the other is refused", async () => {
  const animalId = await makeAnimal("Race", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });

  const results = await Promise.allSettled([
    reverse(outcomeId, "First click."),
    reverse(outcomeId, "Second click."),
  ]);

  const landed = results.filter((r) => r.status === "fulfilled");
  const refused = results.filter((r) => r.status === "rejected");
  assert.equal(landed.length, 1);
  assert.equal(refused.length, 1);
  assert.ok(refused[0].reason instanceof ConflictError);
  assert.equal((await reversalRows(animalId)).length, 1);
  await assertNoListingMismatch(animalId);
});

// Every write that depends on an application's effective status takes the
// animal lock and derives behind it. A reversal changes that status for every
// application on the animal, so it has to wait for them, and they for it.
test("a reversal waits for the animal lock", async () => {
  const animalId = await makeAnimal("Held", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });

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
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  const reversal = reverse(outcomeId, REASON, { timeout });
  try {
    await waitForSessionBlockedBy(holderPid);
    assert.equal((await readOutcome(outcomeId)).reversedAt, null);
  } finally {
    // Released even when the wait fails, so neither transaction is left open.
    release();
  }
  await holder;
  await reversal;
  assert.ok((await readOutcome(outcomeId)).reversedAt);
  await assertNoListingMismatch(animalId);
});

test("the listing is left alone when the animal is no longer archived", async () => {
  const animalId = await makeAnimal("Re-intaken", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });
  await reIntake(animalId);

  const result = await reverse(outcomeId);

  // The reversal itself still lands; only the restore is declined.
  assert.ok((await readOutcome(outcomeId)).reversedAt);
  assert.equal(result.restoredListingStatus, null);
  assert.match(result.effects, /left as it is/);
  assert.deepEqual(await readAnimal(animalId), {
    listingStatus: AnimalListingStatus.DRAFT,
    archiveReason: null,
  });
  const [row] = await reversalRows(animalId);
  assert.match(row.changeSummary!, /left as it is/);
  await assertNoListingMismatch(animalId);
});

test("the listing is left alone when a later outcome archived the animal", async () => {
  const animalId = await makeAnimal("Out again", AnimalListingStatus.PUBLISHED);
  const earlier = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    createdAt: hoursAgo(3),
  });
  await reIntake(animalId);
  await recordOutcome(animalId, {
    type: OutcomeType.RETURN_TO_OWNER,
    previousListingStatus: AnimalListingStatus.DRAFT,
    createdAt: hoursAgo(1),
    outcomeDate: "2026-09-20",
  });

  // Archived, but by the later outcome: restoring the earlier one's snapshot
  // would put an animal that has left back on the list.
  const result = await reverse(earlier);

  assert.equal(result.restoredListingStatus, null);
  assert.deepEqual(await readAnimal(animalId), {
    listingStatus: AnimalListingStatus.ARCHIVED,
    archiveReason: OutcomeType.RETURN_TO_OWNER,
  });
  await assertNoListingMismatch(animalId);
});

test("an outcome with no recorded listing brings the animal back as a draft", async () => {
  const animalId = await makeAnimal("Unrecorded", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: null,
  });

  const result = await reverse(outcomeId);

  assert.equal(result.restoredListingStatus, AnimalListingStatus.DRAFT);
  assert.match(result.effects, /nothing recorded what it was/);
  assert.deepEqual(await readAnimal(animalId), {
    listingStatus: AnimalListingStatus.DRAFT,
    archiveReason: null,
  });
  await assertNoListingMismatch(animalId);
});

test("a reversal puts the animal back in the unit the outcome took it out of", async () => {
  // Exactly full once the animal is back, which is not over capacity.
  const unit = await makeUnit(1);
  const animalId = await makeAnimal("Rehoused", AnimalListingStatus.PUBLISHED, unit.id);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    previousUnitId: unit.id,
  });
  assert.equal(await unitOf(animalId), null);

  const result = await reverse(outcomeId);

  assert.equal(result.restoredUnitId, unit.id);
  assert.equal(await unitOf(animalId), unit.id);
  assert.match(result.effects, new RegExp(`It was put back in ${unit.label}\\.`));
  assert.doesNotMatch(result.effects, /over capacity/);

  const [reversal] = await reversalRows(animalId);
  assert.ok(reversal.changeSummary!.includes(`It was put back in ${unit.label}.`));
  const moves = await locationRows(animalId);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].changedById, adminId);
  assert.equal(moves[0].changeSummary, `Moved to ${unit.label}.`);
  // Strictly later, so the feed, newest first, shows the move above it.
  assert.ok(moves[0].changedAt > reversal.changedAt);
});

test("an animal is not put back in a unit that has been deleted", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Unit gone", AnimalListingStatus.PUBLISHED, unit.id);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    previousUnitId: unit.id,
  });
  await prisma.unit.update({
    where: { id: unit.id },
    data: { deletedAt: new Date() },
  });

  const result = await reverse(outcomeId);

  const sentence = `It has no unit now, since ${unit.label} has been deleted; place it from its record.`;
  assert.equal(result.restoredUnitId, null);
  assert.equal(await unitOf(animalId), null);
  // The listing still comes back.
  assert.equal(result.restoredListingStatus, AnimalListingStatus.PUBLISHED);
  const [row] = await reversalRows(animalId);
  assert.ok(row.changeSummary!.includes(sentence));
  assert.equal((await locationRows(animalId)).length, 0);
});

test("an animal is not put back in a unit whose location has been deleted", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Location gone", AnimalListingStatus.PUBLISHED, unit.id);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    previousUnitId: unit.id,
  });
  await prisma.location.update({
    where: { id: unit.locationId },
    data: { deletedAt: new Date() },
  });

  const result = await reverse(outcomeId);

  assert.equal(result.restoredUnitId, null);
  assert.equal(await unitOf(animalId), null);
  const [row] = await reversalRows(animalId);
  assert.ok(
    row.changeSummary!.includes(
      `It has no unit now, since ${unit.label} has been deleted; place it from its record.`,
    ),
  );
  assert.equal((await locationRows(animalId)).length, 0);
});

test("an outcome with no stored unit leaves the animal unhoused, and the log says so", async () => {
  const animalId = await makeAnimal("Never housed", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });

  const result = await reverse(outcomeId);

  assert.equal(result.restoredUnitId, null);
  assert.equal(await unitOf(animalId), null);
  const [row] = await reversalRows(animalId);
  assert.ok(
    row.changeSummary!.includes("It has no unit now; place it from its record."),
  );
  assert.equal((await locationRows(animalId)).length, 0);
});

test("the unit is left alone when the animal is no longer archived", async () => {
  const unit = await makeUnit();
  const elsewhere = await makeUnit();

  // Placed somewhere else after the re-intake, and still unhoused.
  for (const placedSince of [elsewhere.id, null]) {
    const animalId = await makeAnimal("Back since", AnimalListingStatus.PUBLISHED, unit.id);
    const outcomeId = await recordOutcome(animalId, {
      previousListingStatus: AnimalListingStatus.PUBLISHED,
      previousUnitId: unit.id,
    });
    await reIntake(animalId);
    await prisma.animal.update({
      where: { id: animalId },
      data: { currentUnitId: placedSince },
    });

    const result = await reverse(outcomeId);

    assert.equal(result.restoredUnitId, null);
    assert.equal(await unitOf(animalId), placedSince);
    const [row] = await reversalRows(animalId);
    assert.doesNotMatch(row.changeSummary!, /\bunit\b/);
    assert.equal((await locationRows(animalId)).length, 0);
  }
});

test("the unit is left alone when a later outcome archived the animal", async () => {
  const first = await makeUnit();
  const second = await makeUnit();
  const animalId = await makeAnimal("Out twice", AnimalListingStatus.PUBLISHED, first.id);
  const earlier = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    previousUnitId: first.id,
    createdAt: hoursAgo(3),
  });
  await reIntake(animalId);
  await prisma.animal.update({
    where: { id: animalId },
    data: { currentUnitId: second.id },
  });
  await recordOutcome(animalId, {
    type: OutcomeType.RETURN_TO_OWNER,
    previousListingStatus: AnimalListingStatus.DRAFT,
    previousUnitId: second.id,
    createdAt: hoursAgo(1),
    outcomeDate: "2026-09-20",
  });

  const result = await reverse(earlier);

  assert.equal(result.restoredUnitId, null);
  assert.equal(await unitOf(animalId), null);
  assert.equal((await locationRows(animalId)).length, 0);
  await assertNoListingMismatch(animalId);
});

test("an animal given a unit while archived keeps it", async () => {
  const unit = await makeUnit();
  const since = await makeUnit();
  const animalId = await makeAnimal("Placed while out", AnimalListingStatus.PUBLISHED, unit.id);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    previousUnitId: unit.id,
  });
  await prisma.animal.update({
    where: { id: animalId },
    data: { currentUnitId: since.id },
  });

  const result = await reverse(outcomeId);

  assert.equal(result.restoredUnitId, null);
  assert.equal(await unitOf(animalId), since.id);
  // The listing still comes back; only the unit is left alone.
  assert.equal(result.restoredListingStatus, AnimalListingStatus.PUBLISHED);
  const [row] = await reversalRows(animalId);
  assert.doesNotMatch(row.changeSummary!, /\bunit\b/);
  assert.equal((await locationRows(animalId)).length, 0);
});

test("a full unit takes the animal back, and says it is over capacity", async () => {
  const unit = await makeUnit(1);
  const animalId = await makeAnimal("Crowded", AnimalListingStatus.PUBLISHED, unit.id);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    previousUnitId: unit.id,
  });
  // The kennel was filled while the outcome stood. An archived animal
  // placed there does not count.
  await makeAnimal("Newcomer", AnimalListingStatus.PUBLISHED, unit.id);
  await makeAnimal("Archived lodger", AnimalListingStatus.ARCHIVED, unit.id);

  const result = await reverse(outcomeId);

  assert.equal(result.restoredUnitId, unit.id);
  assert.equal(await unitOf(animalId), unit.id);
  const [row] = await reversalRows(animalId);
  assert.ok(
    row.changeSummary!.includes(
      `It was put back in ${unit.label}. ${unit.label} is now over capacity (2/1).`,
    ),
  );
  assert.equal((await locationRows(animalId)).length, 1);
});

test("a hard-deleted unit leaves nothing stored, and the animal unhoused", async () => {
  const unit = await makeUnit();
  const animalId = await makeAnimal("Unit erased", AnimalListingStatus.PUBLISHED, unit.id);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
    previousUnitId: unit.id,
  });
  await prisma.unit.delete({ where: { id: unit.id } });

  const { previousUnitId } = await prisma.outcome.findUniqueOrThrow({
    where: { id: outcomeId },
    select: { previousUnitId: true },
  });
  assert.equal(previousUnitId, null);

  const result = await reverse(outcomeId);

  assert.equal(result.restoredUnitId, null);
  assert.equal(await unitOf(animalId), null);
  assert.match(result.effects, /It has no unit now; place it from its record\./);
});

/**
 * The rows a foster-to-adopt conversion leaves: an adoption outcome, the
 * placement it closed pointing at it, and the animal archived.
 */
const recordConversion = async (label: string) => {
  const animalId = await makeAnimal(label, AnimalListingStatus.PENDING_ADOPTION);
  const applicationId = await makeApplication(animalId);
  const outcomeId = await recordOutcome(animalId, {
    type: OutcomeType.ADOPTION,
    previousListingStatus: AnimalListingStatus.PENDING_ADOPTION,
    adoptionApplicationId: applicationId,
  });
  const placement = await prisma.fosterPlacement.create({
    data: {
      type: FosterPlacementType.FOSTER_TO_ADOPT,
      startDate: "2026-08-01",
      endDate: "2026-09-01",
      returnReason: FosterReturnReason.ADOPTED_BY_FOSTER,
      animalId,
      fosterProfileId,
      previousListingStatus: AnimalListingStatus.PUBLISHED,
      placedById: staffId,
      returnedById: staffId,
      outcomeId,
      adoptionApplicationId: applicationId,
    },
    select: { id: true },
  });
  return { animalId, outcomeId, placementId: placement.id };
};

const readPlacement = (id: string) =>
  prisma.fosterPlacement.findUniqueOrThrow({
    where: { id },
    select: {
      endDate: true,
      returnReason: true,
      returnedById: true,
      adoptionApplicationId: true,
      outcomeId: true,
    },
  });

test("reversing a conversion reopens the placement it closed", async () => {
  const { animalId, outcomeId, placementId } =
    await recordConversion("Converted");

  const result = await reverse(outcomeId);

  assert.equal(result.reopenedPlacementId, placementId);
  assert.equal(result.fosterPersonId, fosterPersonId);
  assert.deepEqual(await readPlacement(placementId), {
    endDate: null,
    returnReason: null,
    returnedById: null,
    adoptionApplicationId: null,
    // Kept: the placement did produce this outcome, reversed or not.
    outcomeId,
  });
  assert.equal(
    (await readAnimal(animalId)).listingStatus,
    AnimalListingStatus.PENDING_ADOPTION,
  );
  const [row] = await reversalRows(animalId);
  assert.match(row.changeSummary!, /foster placement with Reversal foster .* was reopened/);

  // The animal is with the foster again, not in a unit, so nothing is said
  // about one.
  assert.equal(result.restoredUnitId, null);
  assert.equal(await unitOf(animalId), null);
  assert.doesNotMatch(row.changeSummary!, /\bunit\b/);
  assert.equal((await locationRows(animalId)).length, 0);
  await assertNoListingMismatch(animalId);
});

test("a conversion's placement stays closed when the listing is left alone", async () => {
  const { animalId, outcomeId, placementId } =
    await recordConversion("Converted, back since");
  await reIntake(animalId);
  const before = await readPlacement(placementId);

  const result = await reverse(outcomeId);

  assert.equal(result.reopenedPlacementId, null);
  // Named all the same: the foster's history now shows the outcome reversed.
  assert.equal(result.fosterPersonId, fosterPersonId);
  assert.deepEqual(await readPlacement(placementId), before);
  await assertNoListingMismatch(animalId);
});

test("a reversed adoption's application can take a new adoption outcome", async () => {
  const animalId = await makeAnimal("Adopted again", AnimalListingStatus.PENDING_ADOPTION);
  const applicationId = await makeApplication(animalId);
  const adopt = (createdAt: Date) =>
    recordOutcome(animalId, {
      type: OutcomeType.ADOPTION,
      previousListingStatus: AnimalListingStatus.PENDING_ADOPTION,
      adoptionApplicationId: applicationId,
      createdAt,
    });
  const isUniqueViolation = (error: unknown) =>
    (error as { code?: string }).code === "P2002";

  const first = await adopt(hoursAgo(3));

  // While the first is live, both the check and the index refuse a second.
  await assert.rejects(
    prisma.$transaction((tx) => assertNoLiveAdoptionOutcome(tx, applicationId)),
    ConflictError,
  );
  await assert.rejects(adopt(hoursAgo(2)), isUniqueViolation);

  await reverse(first);

  await prisma.$transaction((tx) =>
    assertNoLiveAdoptionOutcome(tx, applicationId),
  );
  const second = await adopt(new Date());

  const { outcomes } = await prisma.adoptionApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      outcomes: {
        select: { id: true, reversedAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  assert.deepEqual(
    outcomes.map((o) => [o.id, o.reversedAt !== null]),
    [
      [first, true],
      [second, false],
    ],
  );

  const application = await prisma.adoptionApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: DERIVATION_APPLICATION_SELECT,
  });
  const staff = await withConsequenceInHistory(
    { ...application, history: [] },
    { includeReversals: true },
  );
  assert.equal(staff.status, "ADOPTED");
  assert.deepEqual(
    staff.history.map(({ id, status, event }) => [id, status, event]),
    [
      [`outcome-${second}`, "ADOPTED", undefined],
      [`reversal-${first}`, "ADOPTED", "reversal"],
      [`outcome-${first}`, "ADOPTED", undefined],
    ],
  );
  assert.deepEqual(
    (await withConsequenceInHistory({ ...application, history: [] })).history.map(
      ({ id }) => id,
    ),
    [`outcome-${second}`],
  );

  // And the second is now the one live adoption.
  await assert.rejects(adopt(new Date()), isUniqueViolation);
});

test("reversing an outcome that does not exist is refused", async () => {
  await assert.rejects(reverse("cmtn2bxpz00gancgsd6hyf79q"), NotFoundError);
});

// Everything below reads a reversed outcome back through the code the app
// reads it with, rather than through the reversal's own result.

test("a reversed adoption adopts and closes nothing, and no status is rewritten", async () => {
  const animalId = await makeAnimal("Un-adopted", AnimalListingStatus.PENDING_ADOPTION);
  const winnerId = await makeApplication(animalId);
  const otherId = await makeApplication(animalId, ApplicationStatus.REVIEWING);
  const outcomeId = await recordOutcome(animalId, {
    type: OutcomeType.ADOPTION,
    previousListingStatus: AnimalListingStatus.PENDING_ADOPTION,
    adoptionApplicationId: winnerId,
  });

  // Each reader's answer for [winner, other].
  const byId = <T>(entries: Iterable<readonly [string, T]>) => {
    const map = new Map(entries);
    return [map.get(winnerId), map.get(otherId)];
  };
  const rows = () =>
    prisma.adoptionApplication.findMany({
      where: { id: { in: [winnerId, otherId] } },
      select: DERIVATION_APPLICATION_SELECT,
    });
  const effective = async () =>
    byId(await effectiveApplicationStatuses(await rows()));
  // The applicant timeline keeps only the live consequence.
  const timelines = async () =>
    byId(
      await Promise.all(
        (await rows()).map(async (row) => {
          const { status, history } = await withConsequenceInHistory({
            ...row,
            history: [],
          });
          return [row.id, [status, history.length]] as const;
        }),
      ),
    );
  const searchHits = async () =>
    byId(
      (
        await runGlobalSearch(prisma, `Un-adopted ${runId}`, [
          "adoptionApplications",
        ])
      ).adoptionApplications!.map((hit) => [hit.id, hit.status] as const),
    );
  const stored = async () =>
    byId((await rows()).map((row) => [row.id, row.status] as const));

  assert.deepEqual(await effective(), ["ADOPTED", "CLOSED"]);
  assert.deepEqual(await timelines(), [
    ["ADOPTED", 1],
    ["CLOSED", 1],
  ]);
  assert.deepEqual(await searchHits(), ["ADOPTED", "CLOSED"]);

  await reverse(outcomeId);

  assert.deepEqual(await effective(), ["APPROVED", "REVIEWING"]);
  assert.deepEqual(await timelines(), [
    ["APPROVED", 0],
    ["REVIEWING", 0],
  ]);
  const reversedAt = (await readOutcome(outcomeId)).reversedAt;
  const staffTimelines = await Promise.all(
    (await rows()).map(async (row) => [
      row.id,
      await withConsequenceInHistory(
        { ...row, history: [] },
        { includeReversals: true },
      ),
    ] as const),
  );
  for (const [id, result] of staffTimelines) {
    const adopted = id === winnerId;
    assert.equal(result.status, adopted ? "APPROVED" : "REVIEWING");
    assert.deepEqual(result.history.map(({ id }) => id), [
      `reversal-${outcomeId}`,
      `outcome-${outcomeId}`,
    ]);
    assert.equal(result.history[0].event, adopted ? "reversal" : "reopened");
    assert.equal(result.history[0].changedAt.getTime(), reversedAt!.getTime());
    assert.equal(result.history[0].changedBy?.name, `Reversal admin ${runId}`);
    assert.equal(
      result.history[0].statusChangeReason,
      adopted
        ? `Adoption outcome reversed: ${REASON}`
        : `Reopened: the adoption that closed this application was reversed: ${REASON}`,
    );
    assert.equal(result.history[1].status, adopted ? "ADOPTED" : "CLOSED");
  }
  assert.deepEqual(await searchHits(), ["APPROVED", "REVIEWING"]);
  // The gate both outcome-recording paths use: the winner is approved again,
  // so it can take a new adoption.
  assert.equal(
    await prisma.$transaction((tx) =>
      effectiveStatusBehindLock(tx, { id: winnerId, animalId }),
    ),
    ApplicationStatus.APPROVED,
  );
  // Nothing was written onto the applications.
  assert.deepEqual(await stored(), [
    ApplicationStatus.APPROVED,
    ApplicationStatus.REVIEWING,
  ]);
});

test("a reversed outcome ends no stay", async () => {
  const animalId = await makeAnimal("Stay reopened", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });
  const stays = async () => {
    const animal = (await _fetchAnimalStayEvents([speciesId])).find(
      (a) => a.id === animalId,
    )!;
    return computeStays(animal.events, calendarDay("2026-09-22"));
  };

  const recorded = await stays();
  assert.equal(recorded.isInCare, false);
  assert.equal(recorded.stays[0].outcomeDate, "2026-09-01");

  await reverse(outcomeId);

  const reversed = await stays();
  await assertNoListingMismatch(animalId);
  assert.equal(reversed.isInCare, true);
  assert.equal(reversed.stays.length, 1);
  assert.equal(reversed.stays[0].outcomeDate, null);
});
