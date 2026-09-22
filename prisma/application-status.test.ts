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
} from "@/app/lib/data/application-status.data";

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
    ApplicationStatus.CLOSED,
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
  assert.equal(await read, ApplicationStatus.CLOSED);
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

// The shape every row takes once the status column holds only decisions: an
// application an outcome closed still stores the open status it had. Here the
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
  assert.equal(unfiltered.statusById.get(closed.id), ApplicationStatus.CLOSED);
  assert.equal(unfiltered.statusById.get(open.id), ApplicationStatus.PENDING);
  assert.equal(unfiltered.totalRows, 3);
});
