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
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationSource,
  ApplicationStatus,
  FosterPlacementType,
  FosterReturnReason,
  IntakeType,
  LivingSituation,
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
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, adminId, applicantId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string, listingStatus: AnimalListingStatus) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus,
      },
      select: { id: true },
    })
  ).id;

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
 * listing status the animal had, and the animal archived for it.
 */
const recordOutcome = async (
  animalId: string,
  {
    type = OutcomeType.TRANSFER_OUT,
    previousListingStatus,
    adoptionApplicationId,
    createdAt = hoursAgo(1),
  }: {
    type?: OutcomeType;
    previousListingStatus: AnimalListingStatus | null;
    adoptionApplicationId?: string;
    createdAt?: Date;
  },
) => {
  const outcome = await prisma.outcome.create({
    data: {
      animalId,
      type,
      outcomeDate: "2026-09-01",
      staffMemberId: staffId,
      previousListingStatus,
      adoptionApplicationId,
      createdAt,
    },
    select: { id: true },
  });
  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED, archiveReason: type },
  });
  return outcome.id;
};

// The state a re-intake leaves the animal in; nothing here reads intakes.
const reIntake = (animalId: string) =>
  prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.DRAFT, archiveReason: null },
  });

const reverse = (outcomeId: string, reason = REASON) =>
  prisma.$transaction((tx) =>
    recordOutcomeReversal(tx, outcomeId, reason, adminId),
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

// As in application-status.test.ts: the only proof a statement reached the
// lock and is blocked there, rather than not having started yet.
const waitForLockWaitOnAnimal = async () => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%FROM animals WHERE id = $1 FOR%'`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("No session was seen waiting on a lock on animals.");
};

const reversalRows = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId, activityType: AnimalActivityType.OUTCOME_REVERSED },
    select: { changedById: true, changeSummary: true },
  });

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
});

// Every write that depends on an application's effective status takes the
// animal lock and derives behind it. A reversal changes that status for every
// application on the animal, so it has to wait for them, and they for it.
test("a reversal waits for the animal lock", async () => {
  const animalId = await makeAnimal("Held", AnimalListingStatus.PUBLISHED);
  const outcomeId = await recordOutcome(animalId, {
    previousListingStatus: AnimalListingStatus.PUBLISHED,
  });

  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const holder = prisma.$transaction(async (tx) => {
    await lockAnimal(tx, animalId);
    locked();
    await released;
  });
  await isLocked;

  const reversal = reverse(outcomeId);
  await waitForLockWaitOnAnimal();
  assert.equal((await readOutcome(outcomeId)).reversedAt, null);

  release();
  await holder;
  await reversal;
  assert.ok((await readOutcome(outcomeId)).reversedAt);
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
  });

  // Archived, but by the later outcome: restoring the earlier one's snapshot
  // would put an animal that has left back on the list.
  const result = await reverse(earlier);

  assert.equal(result.restoredListingStatus, null);
  assert.deepEqual(await readAnimal(animalId), {
    listingStatus: AnimalListingStatus.ARCHIVED,
    archiveReason: OutcomeType.RETURN_TO_OWNER,
  });
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
});

test("a conversion's placement stays closed when the listing is left alone", async () => {
  const { animalId, outcomeId, placementId } =
    await recordConversion("Converted, back since");
  await reIntake(animalId);
  const before = await readPlacement(placementId);

  const result = await reverse(outcomeId);

  assert.equal(result.reopenedPlacementId, null);
  assert.deepEqual(await readPlacement(placementId), before);
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
  const second = await adopt(hoursAgo(1));

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
  // What the staff and applicant timelines show: the review history, plus the
  // outcome that adopted or closed the application as an entry, if one did.
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
  await prisma.intake.create({
    data: {
      animalId,
      type: IntakeType.STRAY,
      intakeDate: "2026-08-01",
      staffMemberId: staffId,
    },
  });
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
  assert.equal(reversed.isInCare, true);
  assert.equal(reversed.stays.length, 1);
  assert.equal(reversed.stays[0].outcomeDate, null);
});
