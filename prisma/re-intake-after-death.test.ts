// Same reasoning as intake-recording.test.ts for living under prisma/ and
// running via `npm run test:db`. Whether a re-intake is refused rests on the
// animal's outcomes, read behind the row lock a reversal also takes, and a
// refusal is only as good as what the rows say afterwards: the animal still
// archived, no intake, no activity row.
//
// The rule: an animal whose stay ended in a death (Deceased or Euthanized)
// can't be re-intaked. A death recorded by mistake is reversed instead, which
// puts the animal back in care, and from then on nothing here refuses it.
//
// Every outcome is recorded through `recordOutcome` and every re-intake
// through `recordReIntake`, which are the whole of their actions bar the
// session check, the form validation and the cache invalidation.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationSource,
  ApplicationStatus,
  IntakeType,
  LivingSituation,
  OutcomeType,
  PartnerType,
  Sex,
} from "@/prisma/generated/enums";
import { recordOutcome } from "@/app/lib/services/outcome-recording";
import { recordOutcomeReversal } from "@/app/lib/services/outcome-reversal";
import { recordReIntake } from "@/app/lib/services/intake-recording";
import { findStayEndingDeath } from "@/app/lib/services/archiving-outcome";
import { OutcomeFormSchema } from "@/app/lib/zod-schemas/outcome.schema";
import { ReIntakeFormSchema } from "@/app/lib/zod-schemas/intake.schema";
import { ConflictError } from "@/app/lib/utils/errors";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);

const ARRIVED = "2026-08-01";
const LEFT = "2026-09-01";
const CAME_BACK = "2026-09-10";

let speciesId: string;
let colorId: string;
let staffId: string;
let adminId: string;
let ownerId: string;
let applicantId: string;
let vetId: string;
let partnerId: string;

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
      data: { name: `Re-intake after death species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Re-intake after death color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Re-intake after death staff");
  adminId = await person("Re-intake after death admin");
  ownerId = await person("Re-intake after death owner");
  applicantId = await person("Re-intake after death applicant");
  vetId = await person("Re-intake after death vet");
  partnerId = (
    await prisma.partner.create({
      data: {
        name: `Re-intake after death rescue ${runId}`,
        type: PartnerType.RESCUE_GROUP,
      },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  const scope = { animal: { speciesId } };
  // Takes the death and euthanasia details and their events with them.
  await prisma.medicalEntry.deleteMany({ where: scope });
  await prisma.outcome.deleteMany({ where: scope });
  await prisma.intake.deleteMany({ where: scope });
  await prisma.adoptionApplication.deleteMany({ where: { applicantId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.partner.deleteMany({ where: { id: partnerId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, adminId, ownerId, applicantId, vetId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/** An animal in care, arrived on `ARRIVED`. */
const makeAnimal = async (label: string) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.DRAFT,
        intake: {
          create: {
            type: IntakeType.STRAY,
            intakeDate: ARRIVED,
            staffMemberId: staffId,
          },
        },
      },
      select: { id: true },
    })
  ).id;

const makeApplication = async (animalId: string) =>
  (
    await prisma.adoptionApplication.create({
      data: {
        applicantName: `Re-intake after death applicant ${runId}`,
        applicantEmail: `re-intake.death.${runId}@example.com`,
        applicantPhone: "2125550100",
        applicantAddressLine1: "1 Main St",
        applicantCity: "New York",
        applicantState: "NY",
        applicantZipCode: "10001",
        livingSituation: LivingSituation.OWN_HOME,
        householdSize: 1,
        reasonForAdoption: "Test",
        status: ApplicationStatus.APPROVED,
        source: ApplicationSource.STAFF,
        applicantId,
        animalId,
        submittedAt: new Date("2026-08-02T12:00:00Z"),
      },
      select: { id: true },
    })
  ).id;

// The rest of what the outcome form submits for each type: a partner, an
// owner, an application, or the medical details a death needs.
const extras = (type: OutcomeType) => {
  switch (type) {
    case OutcomeType.TRANSFER_OUT:
      return { destinationPartnerId: partnerId };
    case OutcomeType.RETURN_TO_OWNER:
      return { ownerId };
    case OutcomeType.DECEASED:
      return {
        medical: {
          kind: "DEATH",
          circumstances: "FOUND_DEAD",
          causeKnowledge: "UNKNOWN",
          necropsyRequested: null,
        },
      };
    case OutcomeType.EUTHANIZED:
      return {
        medical: {
          kind: "EUTHANASIA",
          source: "IN_HOUSE",
          reasonCategory: "MEDICAL",
          authorizedById: vetId,
          performedById: vetId,
          drug: "Recorded agent",
          dose: "Recorded amount mL",
          route: "Recorded route",
        },
      };
    default:
      return {};
  }
};

/** Records the outcome as the outcome form would, and returns its id. */
const leave = async (animalId: string, type: OutcomeType, day = LEFT) => {
  const adoptionApplicationId =
    type === OutcomeType.ADOPTION ? await makeApplication(animalId) : undefined;
  await prisma.$transaction((tx) =>
    recordOutcome(
      tx,
      {
        animalId,
        adoptionApplicationId,
        values: OutcomeFormSchema.parse({
          outcomeType: type,
          outcomeDate: day,
          notes: "",
          ...extras(type),
        }),
      },
      staffId,
    ),
  );
  const outcome = await prisma.outcome.findFirstOrThrow({
    where: { animalId, outcomeDate: day, reversedAt: null },
    select: { id: true },
  });
  return outcome.id;
};

const reIntake = (animalId: string, intakeDate = CAME_BACK) =>
  prisma.$transaction((tx) =>
    recordReIntake(
      tx,
      {
        animalId,
        values: ReIntakeFormSchema.parse({
          intakeType: IntakeType.SEIZE,
          intakeDate,
          notes: "",
        }),
      },
      staffId,
    ),
  );

const reverse = (outcomeId: string) =>
  prisma.$transaction((tx) =>
    recordOutcomeReversal(
      tx,
      outcomeId,
      "Recorded against the wrong animal.",
      adminId,
    ),
  );

const stayEndingDeath = (animalId: string) =>
  findStayEndingDeath(prisma, animalId);

// Everything a re-intake writes, so a refusal can be shown to write none of it.
const readAnimal = async (animalId: string) => {
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      archiveReason: true,
      intake: {
        select: { intakeDate: true, type: true },
        orderBy: { intakeDate: "asc" },
      },
      activityLog: {
        where: { activityType: AnimalActivityType.INTAKE_PROCESSED },
        select: { changeSummary: true },
      },
    },
  });
  return {
    listingStatus: animal.listingStatus,
    archiveReason: animal.archiveReason,
    intakes: animal.intake.map((intake) => intake.intakeDate),
    reIntakeLogs: animal.activityLog.map((row) => row.changeSummary),
  };
};

const refusedFor = (message: string) => (error: unknown) => {
  // Anything else is reported as itself, not as a failed type check.
  if (!(error instanceof ConflictError)) throw error;
  assert.equal(error.message, message);
  return true;
};

const deathRefusal = (label: string) =>
  `Cannot process re-intake: This animal's outcome was ${label}, and an animal that has died can't be taken back in. If the outcome was recorded by mistake, an admin can reverse it from the Outcomes list, which puts the animal back in care.`;

const NOT_ARCHIVED =
  "Cannot process re-intake: This animal is not currently archived or was just re-intaked.";

for (const [type, label] of [
  [OutcomeType.DECEASED, "Deceased"],
  [OutcomeType.EUTHANIZED, "Euthanized"],
] as const) {
  test(`a re-intake after the ${label} outcome is refused, and nothing is written`, async () => {
    const animalId = await makeAnimal(`Died, ${label}`);
    await leave(animalId, type);
    assert.equal(await stayEndingDeath(animalId), type);
    const before = await readAnimal(animalId);
    assert.equal(before.listingStatus, AnimalListingStatus.ARCHIVED);

    await assert.rejects(reIntake(animalId), refusedFor(deathRefusal(label)));

    assert.deepEqual(await readAnimal(animalId), before);
    await assertNoListingMismatch(animalId);
  });
}

// Refused for the death, not for the day: the date check would refuse this
// one too, with a message that sends staff looking at the wrong thing.
test("a re-intake after a death dated before the death is refused for the death", async () => {
  const animalId = await makeAnimal("Died, early return");
  await leave(animalId, OutcomeType.DECEASED);

  await assert.rejects(
    reIntake(animalId, "2026-08-15"),
    refusedFor(deathRefusal("Deceased")),
  );
});

// What is read is the outcome itself, not `archiveReason`, the copy beside
// the listing status. An archived animal with none still died.
test("a death is refused whatever the animal's archive reason says", async () => {
  const animalId = await makeAnimal("Died, no archive reason");
  await leave(animalId, OutcomeType.EUTHANIZED);
  await prisma.animal.update({
    where: { id: animalId },
    data: { archiveReason: null },
  });

  await assert.rejects(
    reIntake(animalId),
    refusedFor(deathRefusal("Euthanized")),
  );
});

for (const [type, label] of [
  [OutcomeType.ADOPTION, "Adoption"],
  [OutcomeType.TRANSFER_OUT, "Transfer Out"],
  [OutcomeType.RETURN_TO_OWNER, "Return To Owner"],
  [OutcomeType.OTHER, "Other"],
] as const) {
  test(`a re-intake after the ${label} outcome is still recorded`, async () => {
    const animalId = await makeAnimal(`Left, ${label}`);
    await leave(animalId, type);
    assert.equal(await stayEndingDeath(animalId), null);

    await reIntake(animalId);

    const animal = await readAnimal(animalId);
    assert.equal(animal.listingStatus, AnimalListingStatus.DRAFT);
    assert.equal(animal.archiveReason, null);
    assert.deepEqual(animal.intakes, [ARRIVED, CAME_BACK]);
    assert.deepEqual(animal.reIntakeLogs, ["Animal was re-intaked as seize."]);
    await assertNoListingMismatch(animalId);
  });
}

// A death recorded by mistake is reversed, not re-intaked: the reversal puts
// the animal back in care, so a re-intake straight after is refused for that,
// and the death no longer counts. When the animal really leaves later, it can
// come back like any other.
test("a reversed death blocks nothing: the animal is back in care, and can leave and return", async () => {
  const animalId = await makeAnimal("Death reversed");
  const deathId = await leave(animalId, OutcomeType.DECEASED);

  const reversal = await reverse(deathId);
  assert.equal(reversal.restoredListingStatus, AnimalListingStatus.DRAFT);
  assert.equal(await stayEndingDeath(animalId), null);
  await assert.rejects(reIntake(animalId), refusedFor(NOT_ARCHIVED));

  await leave(animalId, OutcomeType.TRANSFER_OUT, "2026-09-05");
  assert.equal(await stayEndingDeath(animalId), null);
  await reIntake(animalId);

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.DRAFT);
  assert.deepEqual(animal.intakes, [ARRIVED, CAME_BACK]);
  assert.deepEqual(animal.reIntakeLogs, ["Animal was re-intaked as seize."]);
  await assertNoListingMismatch(animalId);
});

// The reverse order: an animal that came back once and then died is refused.
// The rule reads the stay that ended last, not the first.
test("an animal that came back once and then died is refused", async () => {
  const animalId = await makeAnimal("Returned, then died");
  await leave(animalId, OutcomeType.RETURN_TO_OWNER);
  await reIntake(animalId);
  await leave(animalId, OutcomeType.DECEASED, "2026-10-01");
  assert.equal(await stayEndingDeath(animalId), OutcomeType.DECEASED);

  await assert.rejects(
    reIntake(animalId, "2026-10-05"),
    refusedFor(deathRefusal("Deceased")),
  );
  assert.deepEqual((await readAnimal(animalId)).intakes, [ARRIVED, CAME_BACK]);
});

// The death archived the animal although it is dated before outcomes already
// on its timeline. Reversing an outcome in the middle of the timeline leaves
// its day open, and an outcome recorded into that gap is accepted, since it
// mends the break rather than adding one. The outcome that archived the
// animal is the one recorded last, not the one dated last, and that is the
// one read, as a reversal reads it.
test("a death dated before the animal's later stays is still refused, and reversing it un-archives", async () => {
  const animalId = await makeAnimal("Died into a reversed gap");
  const firstLeft = await leave(animalId, OutcomeType.OTHER);
  await reIntake(animalId);
  await leave(animalId, OutcomeType.OTHER, "2026-10-01");
  await reIntake(animalId, "2026-10-10");
  // In care, so the listing is left alone.
  assert.equal((await reverse(firstLeft)).restoredListingStatus, null);
  const deathId = await leave(animalId, OutcomeType.DECEASED, "2026-08-15");

  const before = await readAnimal(animalId);
  assert.equal(before.listingStatus, AnimalListingStatus.ARCHIVED);
  assert.equal(before.archiveReason, OutcomeType.DECEASED);
  assert.equal(await stayEndingDeath(animalId), OutcomeType.DECEASED);
  await assert.rejects(
    reIntake(animalId, "2026-10-20"),
    refusedFor(deathRefusal("Deceased")),
  );
  assert.deepEqual(await readAnimal(animalId), before);

  // The reversal agrees that the death archived the animal.
  assert.equal(
    (await reverse(deathId)).restoredListingStatus,
    AnimalListingStatus.DRAFT,
  );
  assert.equal(await stayEndingDeath(animalId), null);
});

// Only rows from before this rule can hold a re-intake after a death. Such an
// animal is in care, and a death in a stay it has left behind refuses nothing.
test("an animal in care is not refused for a death in an earlier stay", async () => {
  const animalId = await makeAnimal("Back after an old death");
  await prisma.outcome.create({
    data: {
      animalId,
      type: OutcomeType.DECEASED,
      outcomeDate: LEFT,
      staffMemberId: staffId,
    },
  });
  await prisma.intake.create({
    data: {
      animalId,
      type: IntakeType.SEIZE,
      intakeDate: CAME_BACK,
      staffMemberId: staffId,
    },
  });

  assert.equal(await stayEndingDeath(animalId), null);
  await assert.rejects(reIntake(animalId, "2026-10-01"), refusedFor(NOT_ARCHIVED));
});

// Only the outcome that archived the animal counts, not any death on its
// record. One from before this rule, with a return after it, refuses nothing
// once the animal has left again some other way.
test("an animal that last left by transfer is re-intaked despite an older death", async () => {
  const animalId = await makeAnimal("Transferred after an old death");
  await prisma.outcome.create({
    data: {
      animalId,
      type: OutcomeType.DECEASED,
      outcomeDate: LEFT,
      staffMemberId: staffId,
    },
  });
  await prisma.intake.create({
    data: {
      animalId,
      type: IntakeType.SEIZE,
      intakeDate: CAME_BACK,
      staffMemberId: staffId,
    },
  });
  await leave(animalId, OutcomeType.TRANSFER_OUT, "2026-10-01");
  assert.equal(await stayEndingDeath(animalId), null);

  await reIntake(animalId, "2026-10-10");

  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.DRAFT);
  assert.deepEqual(animal.intakes, [ARRIVED, CAME_BACK, "2026-10-10"]);
  await assertNoListingMismatch(animalId);
});
