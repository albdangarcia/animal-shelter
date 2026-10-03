// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. Which trait an assessment proposes or argues
// against is worked out in `app/lib/assessments/proposals.test.ts`; what is
// left is the write a suggestion makes and what the Characteristics tab reads
// back from the rows: the citation, whether its assessment is deleted or no
// longer supports it, and the live findings against each trait.
//
// `recordCharacteristicSuggestion` is the whole of the suggestion action bar
// the session check, the input validation and the cache invalidation.
// `_fetchAnimalCharacteristics` is the tab's read without its permission
// wrapper.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  CharacteristicCategory,
  FieldType,
  Sex,
} from "@/prisma/generated/enums";
import { fromZonedTime } from "date-fns-tz";
import { _fetchAnimalCharacteristics } from "@/app/lib/data/animals/animal-characteristics-tab";
import { loadAssessmentCharacteristicsSummary } from "@/app/lib/data/animals/assessment-characteristic-review";
import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import { recordCharacteristicSuggestion } from "@/app/lib/services/characteristic-suggestion";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";

const runId = Date.now().toString(36);

// A pair-test template, like the seeded Cat Test and Dog-to-Dog Introduction
// in one: each recommendation proposes one trait on its affirming answer and
// argues against it on its concerning one.
const TEMPLATE_NAME = `Pair Test ${runId}`;
const CATS = "cats";
const DOGS = "dogs";
const AFFIRMING = "Safe";
const NEUTRAL = "Needs slow introductions";
const CONCERNING = "Not safe";

// Each id is set only once its row exists, and cleanup deletes by id only:
// Prisma drops an undefined filter, so `{ speciesId: undefined }` after a
// failed setup would match every animal in the database.
let speciesId: string | undefined;
let colorId: string | undefined;
let staffId: string;
let otherStaffId: string;
let templateId: string | undefined;
const traitId: Record<string, string> = {};
const fieldId: Record<string, string> = {};

const createPerson = async (name: string) =>
  (
    await prisma.person.create({
      data: { name: `${name} ${runId}` },
      select: { id: true },
    })
  ).id;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Suggestion species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Suggestion color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await createPerson("Suggestion staff");
  otherStaffId = await createPerson("Suggestion other staff");
  for (const [key, name] of [
    [CATS, `Good with cats ${runId}`],
    [DOGS, `Good with other dogs ${runId}`],
  ]) {
    traitId[key] = (
      await prisma.characteristic.create({
        data: { name, category: CharacteristicCategory.ENVIRONMENT },
        select: { id: true },
      })
    ).id;
  }
  const template = await prisma.assessmentTemplate.create({
    data: {
      key: `PAIR_TEST_${runId}`,
      name: TEMPLATE_NAME,
      fields: {
        create: [CATS, DOGS].map((key, order) => ({
          key,
          label: `${key} recommendation`,
          fieldType: FieldType.SINGLE_SELECT,
          options: [AFFIRMING, NEUTRAL, CONCERNING],
          concerningValues: [CONCERNING],
          order,
          proposesCharacteristicId: traitId[key],
          proposesOnValues: [AFFIRMING],
        })),
      },
    },
    select: { id: true, fields: { select: { id: true, key: true } } },
  });
  templateId = template.id;
  for (const f of template.fields) fieldId[f.key] = f.id;
});

after(async () => {
  try {
    if (speciesId) {
      // Takes the assessments, their answers, the assignments and the
      // activity rows with it.
      await prisma.animal.deleteMany({ where: { speciesId } });
    }
    if (templateId) {
      await prisma.assessmentTemplate.delete({ where: { id: templateId } });
    }
    await prisma.characteristic.deleteMany({
      where: { id: { in: Object.values(traitId) } },
    });
    await prisma.person.deleteMany({
      where: { id: { in: [staffId, otherStaffId].filter(Boolean) } },
    });
    if (colorId) await prisma.color.delete({ where: { id: colorId } });
    if (speciesId) await prisma.species.delete({ where: { id: speciesId } });
  } finally {
    await prisma.$disconnect();
  }
});

const createAnimal = async (name: string) =>
  (
    await prisma.animal.create({
      data: {
        name: `${name} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.MALE,
        speciesId: speciesId!,
        primaryColorId: colorId!,
        listingStatus: AnimalListingStatus.DRAFT,
      },
      select: { id: true },
    })
  ).id;

/** A pair test answered as given, observed at an exact time or at noon UTC
 *  on January `observed`. The days the tests compare are days apart, so no
 *  shelter zone moves one across another. */
const recordPairTest = async (
  animalId: string,
  observed: number | Date,
  answers: Partial<Record<typeof CATS | typeof DOGS, string>>,
) => {
  const observedAt =
    typeof observed === "number"
      ? new Date(Date.UTC(2026, 0, observed, 12))
      : observed;
  const { id } = await prisma.assessment.create({
    data: {
      animalId,
      templateId: templateId!,
      assessorId: staffId,
      observedAt,
      answers: {
        create: Object.entries(answers).map(([key, value]) => ({
          templateFieldId: fieldId[key],
          questionLabel: `${key} recommendation`,
          value,
        })),
      },
    },
    select: { id: true },
  });
  return { id, observedAt };
};

const ASSIGNED_AT = new Date(Date.UTC(2026, 0, 1, 12));
const REMOVED_AT = new Date(Date.UTC(2026, 0, 2, 12));

/** An assignment by the other staff member on January 1st; `removed` takes
 *  it off the animal on the 2nd, keeping the row. */
const assign = (
  animalId: string,
  key: string,
  sourceAssessmentId: string | null,
  { removed = false } = {},
) =>
  prisma.animalCharacteristic.create({
    data: {
      animalId,
      characteristicId: traitId[key],
      assignedById: otherStaffId,
      assignedAt: ASSIGNED_AT,
      sourceAssessmentId,
      ...(removed ? { removedAt: REMOVED_AT, removedById: otherStaffId } : {}),
    },
  });

/** Staff act on the assessment's suggestion for the trait at `now`. */
const actOn = (
  assessmentId: string,
  animalId: string,
  key: string,
  now: Date,
) =>
  prisma.$transaction((tx) =>
    recordCharacteristicSuggestion(
      tx,
      { assessmentId, animalId, characteristicId: traitId[key] },
      staffId,
      now,
    ),
  );

const assignmentRows = (animalId: string) =>
  prisma.animalCharacteristic.findMany({
    where: { animalId },
    select: {
      characteristicId: true,
      sourceAssessmentId: true,
      assignedById: true,
      assignedAt: true,
      removedAt: true,
      removedById: true,
    },
  });

const activityRows = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId },
    select: { activityType: true, changedById: true, changeSummary: true },
  });

/** One trait as the Characteristics tab reads it. */
const tabRow = async (animalId: string, key: string) => {
  const row = (await _fetchAnimalCharacteristics(animalId)).find(
    (c) => c.id === traitId[key],
  );
  assert.ok(row, "The tab lists every catalog trait.");
  return row;
};

test("citing this assessment for a hand-assigned trait moves the citation and logs it", async () => {
  const animalId = await createAnimal("Hand-assigned");
  await assign(animalId, DOGS, null);
  const here = await recordPairTest(animalId, 10, { [DOGS]: AFFIRMING });

  const summary = await loadAssessmentCharacteristicsSummary(
    prisma,
    animalId,
    here.id,
  );
  assert.deepEqual(
    summary?.suggestions.map((s) => [s.characteristicId, s.action]),
    [[traitId[DOGS], "CITE"]],
  );

  const now = new Date(Date.UTC(2026, 0, 11, 15));
  assert.deepEqual(await actOn(here.id, animalId, DOGS, now), {
    ok: true,
    message: `Good with other dogs ${runId} re-cited to this assessment.`,
  });

  // The same row, now citing this assessment and stamped by whoever acted.
  assert.deepEqual(await assignmentRows(animalId), [
    {
      characteristicId: traitId[DOGS],
      sourceAssessmentId: here.id,
      assignedById: staffId,
      assignedAt: now,
      removedAt: null,
      removedById: null,
    },
  ]);
  assert.deepEqual(await activityRows(animalId), [
    {
      activityType: AnimalActivityType.FIELD_UPDATE,
      changedById: staffId,
      changeSummary: `Good with other dogs ${runId} re-cited to the ${TEMPLATE_NAME} of ${formatDateToLongString(here.observedAt)}.`,
    },
  ]);

  // Settled: the page has nothing left to suggest, and the tab links here.
  const settled = await loadAssessmentCharacteristicsSummary(
    prisma,
    animalId,
    here.id,
  );
  assert.deepEqual(settled?.suggestions, []);
  const row = await tabRow(animalId, DOGS);
  assert.equal(row.assignment?.sourceAssessment?.id, here.id);
  assert.equal(row.assignment?.sourceAssessment?.templateName, TEMPLATE_NAME);
});

test("acting again on a suggestion this assessment already cites changes nothing", async () => {
  // A second tab still showing the button after the first tab's click.
  const animalId = await createAnimal("Already cited");
  const here = await recordPairTest(animalId, 10, { [DOGS]: AFFIRMING });
  await assign(animalId, DOGS, here.id);

  assert.deepEqual(
    await actOn(here.id, animalId, DOGS, new Date(Date.UTC(2026, 0, 11, 15))),
    {
      ok: true,
      message: `Good with other dogs ${runId} already cites this assessment.`,
    },
  );
  // Not re-stamped, not logged.
  assert.deepEqual(await assignmentRows(animalId), [
    {
      characteristicId: traitId[DOGS],
      sourceAssessmentId: here.id,
      assignedById: otherStaffId,
      assignedAt: ASSIGNED_AT,
      removedAt: null,
      removedById: null,
    },
  ]);
  assert.deepEqual(await activityRows(animalId), []);
});

test("a removed trait is added back, citing this assessment", async () => {
  // Removed from the animal while still citing this very assessment: a
  // removed row reads as unassigned, whatever it cites.
  const animalId = await createAnimal("Removed");
  const here = await recordPairTest(animalId, 10, { [DOGS]: AFFIRMING });
  await assign(animalId, DOGS, here.id, { removed: true });

  // The page offers it again, as an addition.
  const summary = await loadAssessmentCharacteristicsSummary(
    prisma,
    animalId,
    here.id,
  );
  assert.deepEqual(
    summary?.suggestions.map((s) => [s.characteristicId, s.action]),
    [[traitId[DOGS], "ADD"]],
  );

  const now = new Date(Date.UTC(2026, 0, 11, 15));
  assert.deepEqual(await actOn(here.id, animalId, DOGS, now), {
    ok: true,
    message: `Good with other dogs ${runId} added to the animal.`,
  });
  assert.deepEqual(await assignmentRows(animalId), [
    {
      characteristicId: traitId[DOGS],
      sourceAssessmentId: here.id,
      assignedById: staffId,
      assignedAt: now,
      removedAt: null,
      removedById: null,
    },
  ]);
  assert.deepEqual(await activityRows(animalId), [
    {
      activityType: AnimalActivityType.FIELD_UPDATE,
      changedById: staffId,
      changeSummary: `Good with other dogs ${runId} added, citing the ${TEMPLATE_NAME} of ${formatDateToLongString(here.observedAt)}.`,
    },
  ]);
});

test("acting on one of an assessment's suggestions assigns that trait only", async () => {
  // Cats comes first in the template; acting on dogs must not pick it up.
  const animalId = await createAnimal("Two proposals");
  const here = await recordPairTest(animalId, 10, {
    [CATS]: AFFIRMING,
    [DOGS]: AFFIRMING,
  });

  const now = new Date(Date.UTC(2026, 0, 11, 15));
  assert.deepEqual(await actOn(here.id, animalId, DOGS, now), {
    ok: true,
    message: `Good with other dogs ${runId} added to the animal.`,
  });
  assert.deepEqual(await assignmentRows(animalId), [
    {
      characteristicId: traitId[DOGS],
      sourceAssessmentId: here.id,
      assignedById: staffId,
      assignedAt: now,
      removedAt: null,
      removedById: null,
    },
  ]);
  assert.deepEqual(
    (await activityRows(animalId)).map((r) => r.changeSummary),
    [
      `Good with other dogs ${runId} added, citing the ${TEMPLATE_NAME} of ${formatDateToLongString(here.observedAt)}.`,
    ],
  );
});

test("acting on a trait the assessment does not propose is refused, writing nothing", async () => {
  // A stale page: the cats answer no longer proposes, the dogs one does.
  const animalId = await createAnimal("Not proposed");
  const here = await recordPairTest(animalId, 10, {
    [CATS]: NEUTRAL,
    [DOGS]: AFFIRMING,
  });

  assert.deepEqual(
    await actOn(here.id, animalId, CATS, new Date(Date.UTC(2026, 0, 11, 15))),
    {
      ok: false,
      message: "This assessment no longer proposes that characteristic.",
    },
  );
  assert.deepEqual(await assignmentRows(animalId), []);
  assert.deepEqual(await activityRows(animalId), []);
});

test("acting on a deleted assessment's suggestion is refused, writing nothing", async () => {
  // A page loaded before the assessment was deleted.
  const animalId = await createAnimal("Deleted, acted on");
  const here = await recordPairTest(animalId, 10, { [DOGS]: AFFIRMING });
  await prisma.assessment.update({
    where: { id: here.id },
    data: { deletedAt: new Date(Date.UTC(2026, 0, 11, 12)) },
  });

  assert.deepEqual(
    await actOn(here.id, animalId, DOGS, new Date(Date.UTC(2026, 0, 11, 15))),
    {
      ok: false,
      message: "A deleted assessment can't source characteristics.",
    },
  );
  assert.deepEqual(await assignmentRows(animalId), []);
  assert.deepEqual(await activityRows(animalId), []);
});

test("acting on another animal's assessment is refused, writing nothing for either", async () => {
  // The ids come from the client; the assessment must be this animal's.
  const owner = await createAnimal("Assessment owner");
  const other = await createAnimal("Other animal");
  const here = await recordPairTest(owner, 10, { [DOGS]: AFFIRMING });

  assert.deepEqual(
    await actOn(here.id, other, DOGS, new Date(Date.UTC(2026, 0, 11, 15))),
    { ok: false, message: "Assessment not found." },
  );
  for (const animalId of [owner, other]) {
    assert.deepEqual(await assignmentRows(animalId), []);
    assert.deepEqual(await activityRows(animalId), []);
  }
});

test("an assessment edited away from what it proposed marks its citation as no longer supporting it", async () => {
  const animalId = await createAnimal("Edited away");
  // It proposes both traits; only the cats answer is edited away, so the
  // dogs proposal it keeps must not count for cats.
  const cited = await recordPairTest(animalId, 10, {
    [CATS]: AFFIRMING,
    [DOGS]: AFFIRMING,
  });
  await assign(animalId, CATS, cited.id);
  await assign(animalId, DOGS, cited.id);

  const before = await tabRow(animalId, CATS);
  assert.equal(before.assignment?.sourceAssessment?.stillSupports, true);

  await prisma.assessmentAnswer.updateMany({
    where: { assessmentId: cited.id, templateFieldId: fieldId[CATS] },
    data: { value: NEUTRAL },
  });

  const cats = await tabRow(animalId, CATS);
  assert.equal(cats.isAssigned, true);
  assert.equal(cats.assignment?.sourceAssessment?.id, cited.id);
  assert.equal(cats.assignment?.sourceAssessment?.deletedAt, null);
  assert.equal(cats.assignment?.sourceAssessment?.stillSupports, false);
  // A neutral answer argues against nothing.
  assert.deepEqual(cats.contradictedBy, []);

  const dogs = await tabRow(animalId, DOGS);
  assert.equal(dogs.assignment?.sourceAssessment?.stillSupports, true);
});

test("a citation whose assessment is deleted reads as deleted on the tab", async () => {
  const animalId = await createAnimal("Deleted source");
  const cited = await recordPairTest(animalId, 10, { [DOGS]: AFFIRMING });
  await assign(animalId, DOGS, cited.id);
  const deletedAt = new Date(Date.UTC(2026, 0, 12, 12));
  await prisma.assessment.update({
    where: { id: cited.id },
    data: { deletedAt },
  });

  // The trait stays on the animal, still citing the deleted assessment.
  const row = await tabRow(animalId, DOGS);
  assert.equal(row.isAssigned, true);
  assert.equal(row.assignment?.sourceAssessment?.id, cited.id);
  assert.deepEqual(row.assignment?.sourceAssessment?.deletedAt, deletedAt);
});

test("a deleted assessment neither warns against a trait nor overtakes a live warning", async () => {
  const animalId = await createAnimal("Deleted evidence");
  // Live on the 5th: argues against dogs.
  const live = await recordPairTest(animalId, 5, { [DOGS]: CONCERNING });
  // Deleted, from the 12th: argues against cats, and would overtake the dogs
  // warning if it still counted.
  const deleted = await recordPairTest(animalId, 12, {
    [CATS]: CONCERNING,
    [DOGS]: AFFIRMING,
  });
  await prisma.assessment.update({
    where: { id: deleted.id },
    data: { deletedAt: new Date(Date.UTC(2026, 0, 13, 12)) },
  });

  assert.deepEqual((await tabRow(animalId, CATS)).contradictedBy, []);
  assert.deepEqual(
    (await tabRow(animalId, DOGS)).contradictedBy.map((f) => [
      f.assessmentId,
      f.answerValue,
    ]),
    [[live.id, CONCERNING]],
  );
});

test("an overtaken contradiction is not reported against the trait", async () => {
  const animalId = await createAnimal("Overtaken");
  // Cats: argued against on the 5th, affirmed on a later day, the 15th.
  // Dogs: affirmed on the 5th, argued against on a later day, the 15th, so
  // that contradiction still stands.
  const older = await recordPairTest(animalId, 5, {
    [CATS]: CONCERNING,
    [DOGS]: AFFIRMING,
  });
  const newer = await recordPairTest(animalId, 15, {
    [CATS]: AFFIRMING,
    [DOGS]: CONCERNING,
  });
  await assign(animalId, CATS, newer.id);
  await assign(animalId, DOGS, older.id);

  const cats = await tabRow(animalId, CATS);
  assert.deepEqual(cats.contradictedBy, []);

  const dogs = await tabRow(animalId, DOGS);
  assert.deepEqual(
    dogs.contradictedBy.map((f) => [f.assessmentId, f.answerValue]),
    [[newer.id, CONCERNING]],
  );
});

test("the tab judges which day a finding was observed in the shelter's timezone", async () => {
  // An hour apart across the shelter's midnight: a later shelter day, so the
  // affirmation overtakes the contradiction. In UTC both fall on one day,
  // where the contradiction would stand.
  const { timezone } = await getShelterSettings();
  const lateOnThe5th = fromZonedTime("2026-01-05 23:30", timezone);
  const earlyOnThe6th = fromZonedTime("2026-01-06 00:30", timezone);
  assert.equal(
    lateOnThe5th.toISOString().slice(0, 10),
    earlyOnThe6th.toISOString().slice(0, 10),
    `The shelter's timezone (${timezone}) must put both on one UTC day.`,
  );

  const animalId = await createAnimal("Shelter day");
  await recordPairTest(animalId, lateOnThe5th, { [CATS]: CONCERNING });
  await recordPairTest(animalId, earlyOnThe6th, { [CATS]: AFFIRMING });

  assert.deepEqual((await tabRow(animalId, CATS)).contradictedBy, []);
});
