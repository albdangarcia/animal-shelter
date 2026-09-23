// Same reasoning as person-account-unlink.test.ts for living under prisma/ and
// running via `npm run test:db`. Two things here need Postgres itself: row
// locks, which only two real transactions can show waiting on each other, and
// paging by a derived status, which is only worth testing on rows whose stored
// status says something different from their outcomes.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  ApplicationSource,
  ApplicationStatus,
  FosterPlacementType,
  LivingSituation,
  OutcomeType,
  Sex,
} from "@/prisma/generated/enums";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  effectiveStatusBehindLock,
  lockAnimal,
  lockPerson,
  pageApplicationsByEffectiveStatus,
  withConsequenceInHistory,
} from "@/app/lib/data/application-status.data";
import { EffectiveApplicationStatus } from "@/app/lib/utils/derive-application-status";

const runId = Date.now().toString(36);
const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

let speciesId: string;
let colorId: string;
let staffId: string;
let applicantId: string;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Status species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Status color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Status staff ${runId}` },
      select: { id: true },
    })
  ).id;
  applicantId = (
    await prisma.person.create({
      data: { name: `Status applicant ${runId}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { placedById: staffId } });
  await prisma.fosterProfile.deleteMany({ where: { personId: staffId } });
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.adoptionApplication.deleteMany({ where: { applicantId } });
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, applicantId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.MALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.PUBLISHED,
      },
      select: { id: true },
    })
  ).id;

const makeApplication = (
  animalId: string,
  {
    status = ApplicationStatus.PENDING,
    submittedAt = hoursAgo(1),
  }: { status?: ApplicationStatus; submittedAt?: Date } = {},
) =>
  prisma.adoptionApplication.create({
    data: {
      applicantName: `Status applicant ${runId}`,
      applicantEmail: `status.${runId}@example.com`,
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
      submittedAt,
    },
    select: DERIVATION_APPLICATION_SELECT,
  });

const makeOpenApplication = async (label: string) =>
  makeApplication(await makeAnimal(label));

/**
 * Records an outcome the way both outcome-recording paths do, archiving the
 * animal first, and holds the transaction open between the two writes and
 * again before committing. `ownerId` makes the outcome reference a person, as
 * a return to owner does.
 */
const recordOutcomeInSteps = (animalId: string, ownerId?: string) => {
  const gate = () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { open, opened };
  };
  const archived = gate();
  const insert = gate();
  const recorded = gate();
  const commit = gate();
  const committed = prisma.$transaction(async (tx) => {
    await tx.animal.updateMany({
      where: { id: animalId, listingStatus: { not: AnimalListingStatus.ARCHIVED } },
      data: { listingStatus: AnimalListingStatus.ARCHIVED },
    });
    archived.open();
    await insert.opened;
    await tx.outcome.create({
      data: {
        animalId,
        type: OutcomeType.TRANSFER_OUT,
        outcomeDate: "2026-01-01",
        staffMemberId: staffId,
        ...(ownerId && { ownerId }),
      },
    });
    recorded.open();
    await commit.opened;
  });
  return {
    isArchived: archived.opened,
    insertOutcome: insert.open,
    isRecorded: recorded.opened,
    commit: commit.open,
    committed,
  };
};

/**
 * Resolves once some session is waiting on a row lock taken by a statement on
 * `table`, which is the only proof that a read got as far as the lock and is
 * blocked there, rather than merely not having started yet. Throws if none is
 * seen within the time limit.
 */
const waitForLockWaitOn = async (table: "animals" | "persons") => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query ILIKE ${`%FROM ${table} WHERE id = $1 FOR%`}`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session was seen waiting on a lock on ${table}.`);
};

test("a read that takes no lock misses an outcome still being recorded", async () => {
  const application = await makeOpenApplication("Unlocked");
  const outcome = recordOutcomeInSteps(application.animalId);
  outcome.insertOutcome();
  await outcome.isRecorded;

  assert.equal(
    await effectiveApplicationStatus(application),
    ApplicationStatus.PENDING,
  );

  outcome.commit();
  await outcome.committed;
  assert.equal(
    await effectiveApplicationStatus(application),
    EffectiveApplicationStatus.CLOSED,
  );
});

test("a read behind the animal lock waits for the outcome and sees it", async () => {
  const application = await makeOpenApplication("Locked");
  const outcome = recordOutcomeInSteps(application.animalId);
  outcome.insertOutcome();
  await outcome.isRecorded;

  const read = prisma.$transaction((tx) =>
    effectiveStatusBehindLock(tx, application),
  );
  await waitForLockWaitOn("animals");

  outcome.commit();
  await outcome.committed;
  assert.equal(await read, EffectiveApplicationStatus.CLOSED);
});

// Staff entering an application holds the person, then waits for the animal.
// An outcome for that animal, owned by that person, holds the animal and then
// checks the owner's foreign key. If the person lock blocked that check, each
// transaction would wait on the other and Postgres would abort one.
test("entering an application does not deadlock with an outcome it waits for", async () => {
  const animalId = await makeAnimal("Deadlock");
  const outcome = recordOutcomeInSteps(animalId, applicantId);
  await outcome.isArchived;

  const entry = prisma.$transaction(async (tx) => {
    await lockPerson(tx, applicantId);
    await lockAnimal(tx, animalId);
  });
  await waitForLockWaitOn("animals");

  outcome.insertOutcome();
  await outcome.isRecorded;
  outcome.commit();

  const [outcomeResult, entryResult] = await Promise.allSettled([
    outcome.committed,
    entry,
  ]);
  assert.equal(outcomeResult.status, "fulfilled", String((outcomeResult as PromiseRejectedResult).reason));
  assert.equal(entryResult.status, "fulfilled", String((entryResult as PromiseRejectedResult).reason));
});

// The status column holds only decisions, so an application an outcome closed
// still stores the open status it had. Here the
// column says PENDING for two applications and the outcomes say one of them is
// closed, so a filter or sort that read the column would get these wrong.
test("the status filter, sort and pages follow the outcomes, not the column", async () => {
  const animalId = await makeAnimal("Paging");
  const closed = await makeApplication(animalId, { submittedAt: hoursAgo(3) });
  const withdrawn = await makeApplication(animalId, {
    status: ApplicationStatus.WITHDRAWN,
    submittedAt: hoursAgo(3),
  });
  await prisma.outcome.create({
    data: {
      animalId,
      type: OutcomeType.TRANSFER_OUT,
      outcomeDate: "2026-01-01",
      staffMemberId: staffId,
      createdAt: hoursAgo(2),
    },
  });
  const open = await makeApplication(animalId, { submittedAt: hoursAgo(1) });

  const page = (
    statuses: string[],
    statusSort?: "asc" | "desc",
    offset = 0,
    pageSize = 10,
  ) =>
    pageApplicationsByEffectiveStatus({
      where: { animalId },
      orderBy: { submittedAt: "desc" },
      statuses,
      statusSort,
      offset,
      pageSize,
    });

  assert.deepEqual((await page(["CLOSED"])).ids, [closed.id]);
  assert.deepEqual((await page(["PENDING"])).ids, [open.id]);
  assert.equal((await page(["PENDING"])).totalRows, 1);

  const sorted = await page([], "asc");
  assert.deepEqual(sorted.ids, [open.id, withdrawn.id, closed.id]);
  assert.deepEqual((await page([], "desc")).ids, [closed.id, withdrawn.id, open.id]);
  assert.deepEqual((await page([], "asc", 1, 1)).ids, [withdrawn.id]);

  const unfiltered = await page([]);
  assert.equal(unfiltered.statusById.get(closed.id), EffectiveApplicationStatus.CLOSED);
  assert.equal(unfiltered.statusById.get(open.id), ApplicationStatus.PENDING);
  assert.equal(unfiltered.totalRows, 3);
});

// The history table records decisions only. What an outcome did to an
// application is read off the outcome itself, so the timeline still says who
// recorded it, when, and why, in its place after the decisions.
test("the status history ends with the outcome that adopted or closed the application", async () => {
  const animalId = await makeAnimal("History");
  const adopter = await makeApplication(animalId, {
    status: ApplicationStatus.APPROVED,
    submittedAt: hoursAgo(5),
  });
  const other = await makeApplication(animalId, {
    status: ApplicationStatus.REVIEWING,
    submittedAt: hoursAgo(4),
  });
  const reviewedAt = hoursAgo(3);
  await prisma.applicationStatusHistory.create({
    data: {
      applicationId: other.id,
      status: ApplicationStatus.REVIEWING,
      statusChangeReason: "Application moved to review.",
      changedAt: reviewedAt,
      changedById: staffId,
    },
  });
  const recordedAt = hoursAgo(2);
  await prisma.outcome.create({
    data: {
      animalId,
      type: OutcomeType.ADOPTION,
      outcomeDate: "2026-01-01",
      staffMemberId: staffId,
      adoptionApplicationId: adopter.id,
      createdAt: recordedAt,
    },
  });
  const later = await makeApplication(animalId, { submittedAt: hoursAgo(1) });

  const withHistory = async (application: typeof adopter) =>
    withConsequenceInHistory({
      ...application,
      history: await prisma.applicationStatusHistory.findMany({
        where: { applicationId: application.id },
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      }),
    });
  const timeline = (entries: Awaited<ReturnType<typeof withHistory>>["history"]) =>
    entries.map((entry) => [
      entry.status,
      entry.statusChangeReason,
      entry.changedAt.getTime(),
      entry.changedBy?.name,
    ]);
  const staffName = `Status staff ${runId}`;

  const closed = await withHistory(other);
  assert.equal(closed.status, EffectiveApplicationStatus.CLOSED);
  assert.deepEqual(timeline(closed.history), [
    [
      EffectiveApplicationStatus.CLOSED,
      "This animal was adopted by another applicant.",
      recordedAt.getTime(),
      staffName,
    ],
    [
      ApplicationStatus.REVIEWING,
      "Application moved to review.",
      reviewedAt.getTime(),
      staffName,
    ],
  ]);

  const adopted = await withHistory(adopter);
  assert.equal(adopted.status, EffectiveApplicationStatus.ADOPTED);
  assert.deepEqual(timeline(adopted.history), [
    [
      EffectiveApplicationStatus.ADOPTED,
      "Animal adopted by applicant.",
      recordedAt.getTime(),
      staffName,
    ],
  ]);

  // Submitted after the adoption was recorded: nothing closed it.
  const live = await withHistory(later);
  assert.equal(live.status, ApplicationStatus.PENDING);
  assert.deepEqual(live.history, []);
});

test("a foster-to-adopt conversion's closure does not name another applicant", async () => {
  const animalId = await makeAnimal("Converted");
  const application = await makeApplication(animalId, {
    submittedAt: hoursAgo(3),
  });
  // The conversion page links no application, so one it closes may be the
  // foster's own.
  const outcome = await prisma.outcome.create({
    data: {
      animalId,
      type: OutcomeType.ADOPTION,
      outcomeDate: "2026-01-01",
      staffMemberId: staffId,
      createdAt: hoursAgo(2),
    },
    select: { id: true },
  });
  const fosterProfile = await prisma.fosterProfile.create({
    data: { personId: staffId },
    select: { id: true },
  });
  await prisma.fosterPlacement.create({
    data: {
      type: FosterPlacementType.FOSTER_TO_ADOPT,
      startDate: "2025-12-01",
      animalId,
      fosterProfileId: fosterProfile.id,
      placedById: staffId,
      outcomeId: outcome.id,
    },
  });

  const closed = await withConsequenceInHistory({ ...application, history: [] });
  assert.equal(closed.status, EffectiveApplicationStatus.CLOSED);
  assert.equal(
    closed.history[0].statusChangeReason,
    "This animal was adopted by the family fostering them.",
  );
});

// Two outcomes recorded in the same millisecond. A cuid begins with the
// millisecond it was generated and a per-process counter, so the smaller id
// was generated first and is the one that closed the application. The `a…` id
// stands for the outcome generated first; it is inserted second, so the order
// the rows come back in cannot be what decides.
test("of two outcomes recorded in the same millisecond, the one generated first closes", async () => {
  const animalId = await makeAnimal("Tied outcomes");
  const application = await makeApplication(animalId, {
    submittedAt: hoursAgo(3),
  });
  const recordedAt = hoursAgo(2);
  for (const [id, type] of [
    [`z${runId}tied`, OutcomeType.DECEASED],
    [`a${runId}tied`, OutcomeType.TRANSFER_OUT],
  ] as const) {
    await prisma.outcome.create({
      data: {
        id,
        animalId,
        type,
        outcomeDate: "2026-01-01",
        staffMemberId: staffId,
        createdAt: recordedAt,
      },
    });
  }

  const closed = await withConsequenceInHistory({ ...application, history: [] });
  assert.equal(closed.history[0].id, `outcome-a${runId}tied`);
  assert.equal(
    closed.history[0].statusChangeReason,
    "This animal was transferred to another organization.",
  );
});

