// The dashboard's "Applications waiting" counts against real Postgres. The
// point is the adoption side: an application's waiting status is derived from
// its animal's outcomes, so the rows here store one status and mean another.
// The DB test files share one database and run at once, so every count is
// narrowed to this file's own animals or applicants.
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
  countAdoptionApplicationsWaiting,
  countFosterApplicationsWaiting,
} from "@/app/lib/data/applications-waiting";
import { shelterDayKey } from "@/app/lib/utils/shelter-day";

const runId = Date.now().toString(36);
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const TIMEZONE = "UTC";
const today = () => shelterDayKey(new Date(), TIMEZONE);

let speciesId: string;
let colorId: string;
let staffId: string;
let applicantId: string;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Waiting species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Waiting color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Waiting staff ${runId}` },
      select: { id: true },
    })
  ).id;
  applicantId = (
    await prisma.person.create({
      data: { name: `Waiting applicant ${runId}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.adoptionApplication.deleteMany({ where: { applicantId } });
  await prisma.fosterApplication.deleteMany({ where: { personId: applicantId } });
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
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.PUBLISHED,
      },
      select: { id: true },
    })
  ).id;

const makeApplication = async (
  animalId: string,
  status: ApplicationStatus,
  submittedAt: Date,
) =>
  (
    await prisma.adoptionApplication.create({
      data: {
        applicantName: `Waiting applicant ${runId}`,
        applicantEmail: `waiting.${runId}@example.com`,
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
      select: { id: true },
    })
  ).id;

const recordOutcome = async (
  animalId: string,
  {
    type = OutcomeType.TRANSFER_OUT,
    createdAt,
    adoptionApplicationId,
  }: {
    type?: OutcomeType;
    createdAt: Date;
    adoptionApplicationId?: string;
  },
) =>
  (
    await prisma.outcome.create({
      data: {
        animalId,
        type,
        outcomeDate: "2026-01-01",
        staffMemberId: staffId,
        createdAt,
        ...(adoptionApplicationId && { adoptionApplicationId }),
      },
      select: { id: true },
    })
  ).id;

const countAdoption = (animalIds: string[]) =>
  countAdoptionApplicationsWaiting(prisma, {
    today: today(),
    timezone: TIMEZONE,
    where: { animalId: { in: animalIds } },
  });

test("PENDING and REVIEWING are waiting; the other review decisions are not", async () => {
  const animalId = await makeAnimal("Decisions");
  await makeApplication(animalId, ApplicationStatus.PENDING, daysAgo(2));
  await makeApplication(animalId, ApplicationStatus.REVIEWING, daysAgo(4));
  for (const status of [
    ApplicationStatus.WAITLISTED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ]) {
    await makeApplication(animalId, status, daysAgo(10));
  }

  assert.deepEqual(await countAdoption([animalId]), {
    count: 2,
    oldestDays: 4,
  });
});

test("an application stored as PENDING is not waiting once its animal left, and is again once that outcome is reversed", async () => {
  const animalId = await makeAnimal("Left");
  await makeApplication(animalId, ApplicationStatus.PENDING, daysAgo(3));
  const outcomeId = await recordOutcome(animalId, { createdAt: daysAgo(1) });

  // The column still says PENDING; the effective status is CLOSED.
  assert.deepEqual(await countAdoption([animalId]), {
    count: 0,
    oldestDays: null,
  });

  await prisma.outcome.update({
    where: { id: outcomeId },
    data: {
      reversedAt: new Date(),
      reversedById: staffId,
      reversalReason: "Recorded on the wrong animal.",
    },
  });
  assert.deepEqual(await countAdoption([animalId]), {
    count: 1,
    oldestDays: 3,
  });
});

test("an application adopted by a live adoption outcome is not waiting", async () => {
  const animalId = await makeAnimal("Adopted");
  const applicationId = await makeApplication(
    animalId,
    ApplicationStatus.REVIEWING,
    daysAgo(5),
  );
  await recordOutcome(animalId, {
    type: OutcomeType.ADOPTION,
    createdAt: daysAgo(1),
    adoptionApplicationId: applicationId,
  });

  assert.deepEqual(await countAdoption([animalId]), {
    count: 0,
    oldestDays: null,
  });
});

test("the oldest is the oldest application counted, not an older closed one", async () => {
  // An old application closed when its animal left, then a newer one on an
  // animal still here.
  const leftId = await makeAnimal("Oldest left");
  await makeApplication(leftId, ApplicationStatus.PENDING, daysAgo(20));
  await recordOutcome(leftId, { createdAt: daysAgo(15) });
  // On the same animal: one submitted after it came back is open again.
  await makeApplication(leftId, ApplicationStatus.PENDING, daysAgo(6));
  const hereId = await makeAnimal("Oldest here");
  await makeApplication(hereId, ApplicationStatus.REVIEWING, daysAgo(2));

  assert.deepEqual(await countAdoption([leftId, hereId]), {
    count: 2,
    oldestDays: 6,
  });
});

test("foster applications are waiting by their status column", async () => {
  const email = `waiting.foster.${runId}@example.com`;
  const makeFoster = (status: ApplicationStatus, submittedAt: Date) =>
    prisma.fosterApplication.create({
      data: {
        applicantName: `Waiting foster ${runId}`,
        applicantEmail: email,
        applicantPhone: "2125550100",
        applicantAddressLine1: "1 Main St",
        applicantCity: "New York",
        applicantState: "NY",
        applicantZipCode: "10001",
        livingSituation: LivingSituation.OWN_HOME,
        householdSize: 1,
        status,
        submittedAt,
        personId: applicantId,
      },
    });
  const countFoster = () =>
    countFosterApplicationsWaiting(prisma, {
      today: today(),
      timezone: TIMEZONE,
      where: { applicantEmail: email },
    });

  assert.deepEqual(await countFoster(), { count: 0, oldestDays: null });

  await makeFoster(ApplicationStatus.PENDING, daysAgo(1));
  await makeFoster(ApplicationStatus.REVIEWING, daysAgo(7));
  await makeFoster(ApplicationStatus.WAITLISTED, daysAgo(30));
  await makeFoster(ApplicationStatus.APPROVED, daysAgo(30));
  await makeFoster(ApplicationStatus.REJECTED, daysAgo(30));
  await makeFoster(ApplicationStatus.WITHDRAWN, daysAgo(30));

  assert.deepEqual(await countFoster(), { count: 2, oldestDays: 7 });
});
