// Same reasoning as intake-correction.test.ts for living under prisma/ and
// running via `npm run test:db`. The length-of-stay report reads every
// animal's intakes and outcomes from the database, so what it shows after a
// write is only as good as what it reads back.
//
// The report's worklist row is the open stay that `computeStays` makes of
// `_fetchAnimalStayEvents`. The report itself is not imported: its permission
// wrapper loads the auth config, which needs settings this job does not have.
// `recordIntakeCorrection` is the correction action bar the session check,
// the form validation and the cache invalidation.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { AnimalListingStatus, IntakeType, Sex } from "@/prisma/generated/enums";
import { _fetchAnimalStayEvents } from "@/app/lib/data/reports/report-shared.data";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import {
  recordIntakeCorrection,
  toIntakeCorrectionValues,
} from "@/app/lib/services/intake-correction";
import { IntakeCorrectionFormSchema } from "@/app/lib/zod-schemas/intake.schema";
import { computeStays } from "@/app/lib/utils/stay-utils";
import { shiftDayKey, type CalendarDay } from "@/app/lib/utils/shelter-day";

const runId = Date.now().toString(36);

let speciesId: string;
let colorId: string;
let staffId: string;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: `Stay species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Stay color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `Stay staff ${runId}` },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

// One animal's stays as the report computes them, from this run's species
// only, the way the report's species filter reads them.
const staysOf = async (animalId: string, today: CalendarDay) => {
  const animal = (await _fetchAnimalStayEvents([speciesId])).find(
    (a) => a.id === animalId,
  );
  assert.ok(animal, "The animal is read for the report.");
  return computeStays(animal.events, today);
};

test("a corrected intake date moves the open stay the length-of-stay worklist reads", async () => {
  const today = await getShelterToday();
  const intakeDay = shiftDayKey(today, -10);
  const animal = await prisma.animal.create({
    data: {
      name: `In care ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.FEMALE,
      speciesId,
      primaryColorId: colorId,
      listingStatus: AnimalListingStatus.DRAFT,
    },
    select: { id: true },
  });
  const intake = await prisma.intake.create({
    data: {
      animalId: animal.id,
      intakeDate: intakeDay,
      type: IntakeType.STRAY,
      staffMemberId: staffId,
      foundAddress: "1 Elm St",
      foundCity: "Springfield",
      foundState: "IL",
    },
    select: { id: true },
  });

  const before = await staysOf(animal.id, today);
  assert.equal(before.isInCare, true);
  assert.equal(before.stays.at(-1)?.intakeDate, intakeDay);
  assert.equal(before.currentStayDays, 10);

  // What the edit form sends with only the date changed, parsed the way the
  // action parses it.
  const dayBefore = shiftDayKey(intakeDay, -1);
  const result = await prisma.$transaction((tx) =>
    recordIntakeCorrection(
      tx,
      intake.id,
      toIntakeCorrectionValues(
        IntakeCorrectionFormSchema.parse({
          intakeType: IntakeType.STRAY,
          intakeDate: dayBefore,
          foundAddress: "1 Elm St",
          foundCity: "Springfield",
          foundState: "IL",
        }),
      ),
      staffId,
    ),
  );
  assert.equal(result.status, "corrected");

  const after = await staysOf(animal.id, today);
  assert.equal(after.isInCare, true);
  assert.equal(after.stays.length, 1);
  assert.equal(after.stays[0].intakeDate, dayBefore);
  assert.equal(after.currentStayDays, 11);
  assert.equal(after.cumulativeDays, 11);
});
