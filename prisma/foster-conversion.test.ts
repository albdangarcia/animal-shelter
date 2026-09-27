// Same reasoning as foster-return.test.ts for living under prisma/ and running
// via `npm run test:db`. A conversion archives the animal behind its row lock,
// records the adoption, and closes the placement, and what matters is what the
// rows say afterwards: the placement closed on today and linked to the
// outcome, the conversion's row after the adoption's, or, after a refusal, the
// placement still open, the animal listed as it was and nothing written.
//
// `recordFosterConversion` is the whole of the conversion action bar the
// session check, the form validation, the transaction and the cache
// invalidation.
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
import { recordFosterConversion } from "@/app/lib/services/foster-conversion";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { shiftDayKey, formatShelterDay } from "@/app/lib/utils/shelter-day";
import {
  ConflictError,
  PreconditionFailedError,
  TimelineOrderError,
} from "@/app/lib/utils/errors";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterPersonId: string;
let fosterName: string;
let fosterProfileId: string;
let otherApplicantId: string;

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
      data: { name: `Foster conversion species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Foster conversion color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Foster conversion staff");
  fosterName = `Foster conversion foster ${runId}`;
  fosterPersonId = await person("Foster conversion foster");
  otherApplicantId = await person("Foster conversion applicant");
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
  await prisma.adoptionApplication.deleteMany({
    where: { applicantId: { in: [fosterPersonId, otherApplicantId] } },
  });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterPersonId, otherApplicantId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/**
 * An animal that arrived on `intakeDate` and went out to the foster on
 * 2026-01-05, as placing it leaves it: out of any unit, and pending adoption
 * with the listing saved on the placement if it is foster-to-adopt.
 * `returned` leaves the placement ended by a return on 2026-01-08, with the
 * animal listed again.
 */
const makeFosteredAnimal = async (
  label: string,
  {
    type = FosterPlacementType.FOSTER_TO_ADOPT,
    returned = false,
    intakeDate = "2026-01-01",
  }: {
    type?: FosterPlacementType;
    returned?: boolean;
    intakeDate?: string;
  } = {},
) => {
  const pendingAdoption =
    type === FosterPlacementType.FOSTER_TO_ADOPT && !returned;
  const animal = await prisma.animal.create({
    data: {
      name: `${label} ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId,
      primaryColorId: colorId,
      listingStatus: pendingAdoption
        ? AnimalListingStatus.PENDING_ADOPTION
        : AnimalListingStatus.PUBLISHED,
      intake: {
        create: {
          type: IntakeType.STRAY,
          intakeDate,
          staffMemberId: staffId,
        },
      },
    },
    select: { id: true },
  });
  const placement = await prisma.fosterPlacement.create({
    data: {
      type,
      startDate: "2026-01-05",
      animalId: animal.id,
      fosterProfileId,
      placedById: staffId,
      previousListingStatus:
        type === FosterPlacementType.FOSTER_TO_ADOPT
          ? AnimalListingStatus.PUBLISHED
          : undefined,
      ...(returned && {
        endDate: "2026-01-08",
        returnReason: FosterReturnReason.RETURNED_TO_SHELTER,
        returnedById: staffId,
      }),
    },
    select: { id: true },
  });
  return { animalId: animal.id, placementId: placement.id };
};

const makeApplication = async (
  animalId: string,
  {
    applicantId = fosterPersonId,
    status = ApplicationStatus.APPROVED,
  }: { applicantId?: string; status?: ApplicationStatus } = {},
) =>
  (
    await prisma.adoptionApplication.create({
      data: {
        applicantName: `Foster conversion applicant ${runId}`,
        applicantEmail: `foster.conversion.${runId}@example.com`,
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
        submittedAt: new Date("2026-01-02T12:00:00Z"),
      },
      select: { id: true },
    })
  ).id;

const convert = (placementId: string, adoptionApplicationId?: string) =>
  prisma.$transaction((tx) =>
    recordFosterConversion(
      tx,
      { placementId, adoptionApplicationId },
      staffId,
    ),
  );

const readState = async (animalId: string, placementId: string) => {
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      archiveReason: true,
      currentUnitId: true,
      Outcome: {
        select: {
          id: true,
          type: true,
          outcomeDate: true,
          previousListingStatus: true,
          staffMemberId: true,
          adoptionApplicationId: true,
        },
      },
      // By time alone, as the feed orders them. No tie-break on id: it
      // would hide two rows that share a timestamp.
      activityLog: {
        select: { activityType: true, changeSummary: true, changedAt: true },
        orderBy: { changedAt: "asc" },
      },
      adoptionApplications: {
        select: {
          id: true,
          status: true,
          history: { select: { id: true, status: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  const placement = await prisma.fosterPlacement.findUniqueOrThrow({
    where: { id: placementId },
    select: {
      endDate: true,
      returnReason: true,
      returnedById: true,
      outcomeId: true,
      adoptionApplicationId: true,
    },
  });
  return {
    listingStatus: animal.listingStatus,
    archiveReason: animal.archiveReason,
    currentUnitId: animal.currentUnitId,
    outcomes: animal.Outcome,
    activityLogs: animal.activityLog,
    applications: animal.adoptionApplications,
    placement,
  };
};

/**
 * The adoption's row and the conversion's, in the order they were written,
 * the conversion's strictly later. The feed shows the conversion above the
 * adoption only then.
 */
const assertConversionFollowsOutcome = async (animalId: string) => {
  const rows = await prisma.animalActivityLog.findMany({
    where: { animalId },
    select: { activityType: true, changedAt: true },
    orderBy: { changedAt: "asc" },
  });
  assert.deepEqual(
    rows.map((row) => row.activityType),
    [AnimalActivityType.OUTCOME_PROCESSED, AnimalActivityType.FOSTER_RETURNED],
  );
  assert.ok(rows[1].changedAt > rows[0].changedAt);
};

type FosteredAnimal = { animalId: string; placementId: string };

/**
 * Refused with this error and message, and nothing written to any of the
 * `watched` animals, their placements or their applications.
 */
const assertRefused = async (
  watched: FosteredAnimal[],
  attempt: () => Promise<unknown>,
  ErrorType:
    | typeof ConflictError
    | typeof PreconditionFailedError
    | typeof TimelineOrderError,
  message: string,
) => {
  const readAll = () =>
    Promise.all(
      watched.map(({ animalId, placementId }) =>
        readState(animalId, placementId),
      ),
    );
  const before = await readAll();

  await assert.rejects(attempt(), (error: unknown) => {
    // Anything else is reported as itself, not as a failed type check.
    if (!(error instanceof ErrorType)) throw error;
    assert.equal(error.message, message);
    return true;
  });

  assert.deepEqual(await readAll(), before);
  for (const { animalId } of watched) {
    await assertNoListingMismatch(animalId);
  }
};

test("a conversion adopts the animal to the foster and closes the placement on today", async () => {
  const { animalId, placementId } = await makeFosteredAnimal("Adopted by foster");
  const applicationId = await makeApplication(animalId);
  const today = await getShelterToday();

  const result = await convert(placementId, applicationId);

  assert.deepEqual(result, { animalId });
  const after = await readState(animalId, placementId);
  assert.equal(after.listingStatus, AnimalListingStatus.ARCHIVED);
  assert.equal(after.archiveReason, OutcomeType.ADOPTION);
  assert.equal(after.currentUnitId, null);
  assert.equal(after.outcomes.length, 1);
  const [outcome] = after.outcomes;
  assert.deepEqual(outcome, {
    id: outcome.id,
    type: OutcomeType.ADOPTION,
    outcomeDate: today,
    previousListingStatus: AnimalListingStatus.PENDING_ADOPTION,
    staffMemberId: staffId,
    adoptionApplicationId: applicationId,
  });
  assert.deepEqual(after.placement, {
    endDate: today,
    returnReason: FosterReturnReason.ADOPTED_BY_FOSTER,
    returnedById: staffId,
    outcomeId: outcome.id,
    adoptionApplicationId: applicationId,
  });
  assert.deepEqual(
    after.activityLogs.map(({ activityType, changeSummary }) => ({
      activityType,
      changeSummary,
    })),
    [
      {
        activityType: AnimalActivityType.OUTCOME_PROCESSED,
        changeSummary: "Animal was processed for outcome: adoption.",
      },
      {
        activityType: AnimalActivityType.FOSTER_RETURNED,
        changeSummary: `Foster-to-adopt placement with ${fosterName} converted to an adoption.`,
      },
    ],
  );
  await assertConversionFollowsOutcome(animalId);
  await assertNoListingMismatch(animalId);
});

// Rows written back to back share a millisecond only sometimes. Under a
// frozen clock they always do, so this fails every time the conversion's row
// is not stamped after the adoption's.
test("the conversion follows the adoption even when both are written in the same millisecond", async (t) => {
  const { animalId, placementId } = await makeFosteredAnimal(
    "Adopted by foster, same millisecond",
  );

  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  try {
    await convert(placementId);
  } finally {
    t.mock.timers.reset();
  }

  await assertConversionFollowsOutcome(animalId);
  await assertNoListingMismatch(animalId);
});

test("a placement that already ended is refused as such", async () => {
  const fostered = await makeFosteredAnimal("Returned before converting", {
    returned: true,
  });

  await assertRefused(
    [fostered],
    () => convert(fostered.placementId),
    ConflictError,
    "This foster placement has already ended.",
  );
});

test("a general placement is refused", async () => {
  const fostered = await makeFosteredAnimal("Plain foster converting", {
    type: FosterPlacementType.GENERAL,
  });

  await assertRefused(
    [fostered],
    () => convert(fostered.placementId),
    PreconditionFailedError,
    "Only foster-to-adopt placements can be converted here. Use the standard outcome flow to process an adoption for other placement types.",
  );
});

// The only refusal that comes after the animal is archived without an
// application, so it is the one that shows the archive rolled back.
test("a day before the stay's intake is refused", async () => {
  // Today can only be refused when the intake is dated after it.
  const intakeDay = shiftDayKey(await getShelterToday(), 1);
  const fostered = await makeFosteredAnimal("Converting before arriving", {
    intakeDate: intakeDay,
  });

  await assertRefused(
    [fostered],
    () => convert(fostered.placementId),
    TimelineOrderError,
    `The outcome date can't be before this stay's intake on ${formatShelterDay(intakeDay)}.`,
  );
});

test("an application for another animal is refused", async () => {
  const fostered = await makeFosteredAnimal(
    "Converting with another animal's application",
  );
  const other = await makeFosteredAnimal("The other animal");
  const applicationId = await makeApplication(other.animalId);

  await assertRefused(
    [fostered, other],
    () => convert(fostered.placementId, applicationId),
    PreconditionFailedError,
    "That adoption application does not belong to this animal.",
  );
});

test("another applicant's application is refused", async () => {
  const fostered = await makeFosteredAnimal(
    "Converting with someone else's application",
  );
  const applicationId = await makeApplication(fostered.animalId, {
    applicantId: otherApplicantId,
  });

  await assertRefused(
    [fostered],
    () => convert(fostered.placementId, applicationId),
    PreconditionFailedError,
    "That adoption application does not belong to this foster.",
  );
});

test("an application that is not approved is refused", async () => {
  const fostered = await makeFosteredAnimal(
    "Converting with a pending application",
  );
  const applicationId = await makeApplication(fostered.animalId, {
    status: ApplicationStatus.PENDING,
  });

  await assertRefused(
    [fostered],
    () => convert(fostered.placementId, applicationId),
    PreconditionFailedError,
    "Cannot convert: the linked adoption application has not been approved.",
  );
});

// The column still says APPROVED. Only the effective status, derived from the
// animal's outcomes, says the application is closed.
test("an application an earlier stay's outcome closed is refused, though it stores approved", async () => {
  const fostered = await makeFosteredAnimal(
    "Converting with a closed application",
  );
  // Submitted on 2026-01-02, before the transfer below was recorded, which
  // closed it. The animal came back on 2026-01-04, before this placement.
  const applicationId = await makeApplication(fostered.animalId);
  await prisma.outcome.create({
    data: {
      animalId: fostered.animalId,
      type: OutcomeType.TRANSFER_OUT,
      outcomeDate: "2026-01-03",
      staffMemberId: staffId,
      previousListingStatus: AnimalListingStatus.PUBLISHED,
    },
  });
  await prisma.intake.create({
    data: {
      animalId: fostered.animalId,
      intakeDate: "2026-01-04",
      type: IntakeType.STRAY,
      staffMemberId: staffId,
    },
  });
  const { status } = await prisma.adoptionApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: { status: true },
  });
  assert.equal(status, ApplicationStatus.APPROVED);

  await assertRefused(
    [fostered],
    () => convert(fostered.placementId, applicationId),
    PreconditionFailedError,
    "Cannot convert: the linked adoption application has not been approved.",
  );
});
