// Same reasoning as outcome-recording.test.ts for living under prisma/ and
// running via `npm run test:db`. Return to field and lost in care are the two
// outcome types Shelter Animals Count asks for that the app could not record
// before. What matters is what the rows say afterwards: the animal archived
// with the type as its reason, the outcome storing no owner or partner, a
// reversal undoing all of it, and a foster placement closed and reopened.
//
// `recordOutcome`, `recordOutcomeCorrection` and `recordOutcomeReversal` are
// the whole of their actions bar the session check, the form validation and
// the cache invalidation, so driving them is driving the actions.
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
  PartnerType,
  Sex,
} from "@/prisma/generated/enums";
import {
  recordOutcome,
  recordOutcomeCorrection,
} from "@/app/lib/services/outcome-recording";
import { recordOutcomeReversal } from "@/app/lib/services/outcome-reversal";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import {
  OutcomeFormSchema,
  type OutcomeFormOutput,
} from "@/app/lib/zod-schemas/outcome.schema";
import { assertNoListingMismatch } from "./listing-consistency";

const runId = Date.now().toString(36);

const INTAKE_DAY = "2026-01-01";
const PLACEMENT_START = "2026-01-05";
const OUTCOME_DAY = "2026-01-10";

const NEW_TYPES = [
  { type: OutcomeType.RETURN_TO_FIELD, words: "return to field" },
  { type: OutcomeType.LOST_IN_CARE, words: "lost in care" },
] as const;

let speciesId: string;
let colorId: string;
let staffId: string;
let ownerId: string;
let partnerId: string;
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
      data: { name: `RTF and lost species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `RTF and lost color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("RTF and lost staff");
  ownerId = await person("RTF and lost owner");
  fosterName = `RTF and lost foster ${runId}`;
  fosterPersonId = await person("RTF and lost foster");
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId, maxAnimals: 10 },
      select: { id: true },
    })
  ).id;
  partnerId = (
    await prisma.partner.create({
      data: {
        name: `RTF and lost partner ${runId}`,
        type: PartnerType.RESCUE_GROUP,
      },
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
  await prisma.partner.deleteMany({ where: { id: partnerId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, ownerId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/** A published stray that arrived on INTAKE_DAY, in foster if asked. */
const makeAnimal = async (label: string, { inFoster = false } = {}) => {
  const animal = await prisma.animal.create({
    data: {
      name: `${label} ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.MALE,
      speciesId,
      primaryColorId: colorId,
      listingStatus: AnimalListingStatus.PUBLISHED,
      intake: {
        create: {
          type: IntakeType.STRAY,
          intakeDate: INTAKE_DAY,
          staffMemberId: staffId,
        },
      },
    },
    select: { id: true },
  });
  const placementId = inFoster
    ? (
        await prisma.fosterPlacement.create({
          data: {
            type: FosterPlacementType.GENERAL,
            startDate: PLACEMENT_START,
            animalId: animal.id,
            fosterProfileId,
            placedById: staffId,
          },
          select: { id: true },
        })
      ).id
    : null;
  return { animalId: animal.id, placementId };
};

// What the outcome form would submit, parsed the way the actions parse it.
// The owner and partner stand in for values the form keeps from another type
// chosen before this one.
const values = (
  outcomeType: OutcomeType,
  extra: Partial<OutcomeFormOutput> = {},
): OutcomeFormOutput => ({
  ...OutcomeFormSchema.parse({
    outcomeType,
    outcomeDate: OUTCOME_DAY,
    notes: "",
    ownerId,
    destinationPartnerId: partnerId,
  }),
  ...extra,
});

const record = (animalId: string, outcomeValues: OutcomeFormOutput) =>
  prisma.$transaction((tx) =>
    recordOutcome(tx, { animalId, values: outcomeValues }, staffId),
  );

const reverse = (outcomeId: string) =>
  prisma.$transaction((tx) =>
    recordOutcomeReversal(tx, outcomeId, "Entered by mistake.", staffId),
  );

const readAnimal = (animalId: string) =>
  prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      archiveReason: true,
      Outcome: {
        select: {
          id: true,
          type: true,
          ownerId: true,
          destinationPartnerId: true,
          reversedAt: true,
          medicalEntry: { select: { id: true } },
        },
      },
      activityLog: {
        select: { activityType: true, changeSummary: true },
        orderBy: { changedAt: "asc" },
      },
    },
  });

const readPlacement = (id: string) =>
  prisma.fosterPlacement.findUniqueOrThrow({
    where: { id },
    select: { endDate: true, returnReason: true, outcomeId: true },
  });

for (const { type, words } of NEW_TYPES) {
  test(`${words} is recorded: the animal is archived with it as the reason, with no owner, partner or medical record`, async () => {
    const { animalId } = await makeAnimal(`Recorded ${words}`);

    const result = await record(animalId, values(type));

    assert.deepEqual(result, { fosterPersonId: null, canceledTaskCount: 0 });
    const animal = await readAnimal(animalId);
    assert.equal(animal.listingStatus, AnimalListingStatus.ARCHIVED);
    assert.equal(animal.archiveReason, type);
    assert.equal(animal.Outcome.length, 1);
    assert.deepEqual(
      { ...animal.Outcome[0], id: undefined },
      {
        id: undefined,
        type,
        ownerId: null,
        destinationPartnerId: null,
        reversedAt: null,
        medicalEntry: null,
      },
    );
    assert.deepEqual(animal.activityLog, [
      {
        activityType: AnimalActivityType.OUTCOME_PROCESSED,
        changeSummary: `Animal was processed for outcome: ${words}.`,
      },
    ]);
    await assertNoListingMismatch(animalId);
  });

  test(`${words} refuses medical details, and nothing is written`, async () => {
    const { animalId } = await makeAnimal(`Medical on ${words}`);

    await assert.rejects(
      record(
        animalId,
        values(type, {
          medical: {
            kind: "DEATH",
            source: null,
            cause: null,
            circumstanceNotes: null,
            bodyDisposition: null,
            circumstances: "FOUND_DEAD",
            causeKnowledge: "UNKNOWN",
            necropsyRequested: null,
          },
        }),
      ),
      MedicalEntryRefusal,
    );

    const animal = await readAnimal(animalId);
    assert.equal(animal.listingStatus, AnimalListingStatus.PUBLISHED);
    assert.equal(animal.archiveReason, null);
    assert.deepEqual(animal.Outcome, []);
    assert.deepEqual(animal.activityLog, []);
  });

  test(`${words} can have its notes corrected`, async () => {
    const { animalId } = await makeAnimal(`Corrected ${words}`);
    await record(animalId, values(type));
    const [{ id: outcomeId }] = (await readAnimal(animalId)).Outcome;

    const correction = await recordOutcomeCorrection(
      outcomeId,
      values(type, { notes: "Seen near the depot." }),
      staffId,
    );

    assert.equal(correction.status, "corrected");
    const stored = await prisma.outcome.findUniqueOrThrow({
      where: { id: outcomeId },
      select: { notes: true, ownerId: true, destinationPartnerId: true },
    });
    assert.deepEqual(stored, {
      notes: "Seen near the depot.",
      ownerId: null,
      destinationPartnerId: null,
    });
  });

  test(`reversing ${words} restores the listing and clears the archive reason`, async () => {
    const { animalId } = await makeAnimal(`Reversed ${words}`);
    await record(animalId, values(type));
    const [{ id: outcomeId }] = (await readAnimal(animalId)).Outcome;

    const reversal = await reverse(outcomeId);

    assert.equal(reversal.reopenedPlacementId, null);
    const animal = await readAnimal(animalId);
    assert.equal(animal.listingStatus, AnimalListingStatus.PUBLISHED);
    assert.equal(animal.archiveReason, null);
    assert.equal(animal.Outcome.length, 1);
    assert.ok(animal.Outcome[0].reversedAt);
    assert.equal(animal.Outcome[0].type, type);
    await assertNoListingMismatch(animalId);
  });
}

test("lost in care while in foster ends the placement as ended by the outcome, linked to it", async () => {
  const { animalId, placementId } = await makeAnimal("Escaped from foster", {
    inFoster: true,
  });

  const result = await record(animalId, values(OutcomeType.LOST_IN_CARE));

  assert.deepEqual(result, { fosterPersonId, canceledTaskCount: 0 });
  const animal = await readAnimal(animalId);
  const [outcome] = animal.Outcome;
  assert.deepEqual(await readPlacement(placementId!), {
    endDate: OUTCOME_DAY,
    returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
    outcomeId: outcome.id,
  });
  assert.deepEqual(
    animal.activityLog.map((row) => row.changeSummary),
    [
      "Animal was processed for outcome: lost in care.",
      `Foster placement with ${fosterName} ended: lost in care.`,
    ],
  );
  await assertNoListingMismatch(animalId);
});

test("reversing lost in care recorded in foster reopens the placement", async () => {
  const { animalId, placementId } = await makeAnimal(
    "Recorded lost from foster by mistake",
    { inFoster: true },
  );
  await record(animalId, values(OutcomeType.LOST_IN_CARE));
  const [{ id: outcomeId }] = (await readAnimal(animalId)).Outcome;

  const reversal = await reverse(outcomeId);

  assert.equal(reversal.reopenedPlacementId, placementId);
  assert.equal(reversal.fosterPersonId, fosterPersonId);
  assert.deepEqual(await readPlacement(placementId!), {
    endDate: null,
    returnReason: null,
    // Kept: the placement did end on this outcome, reversed or not.
    outcomeId,
  });
  const animal = await readAnimal(animalId);
  assert.equal(animal.listingStatus, AnimalListingStatus.PUBLISHED);
  assert.equal(animal.archiveReason, null);
  await assertNoListingMismatch(animalId);
});
