// Medication doses against a real Postgres: what the dose table itself holds
// to, beneath any service. A slot takes one live dose (a partial unique index
// that leaves voided doses out), as-needed doses have no slot and never clash,
// an order with doses can't be deleted, and an animal's deletion takes its
// orders and doses with it.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import {
  DoseSlot,
  DoseUnit,
  MedicalItemKind,
  MedicalRoute,
  MedicationDoseResult,
  MedicationFrequency,
  MedicationOrderEventAction,
  Sex,
} from "@/prisma/generated/enums";
import { createMedicalItem } from "@/app/lib/services/medical-catalog";

// Random, not the time: the files run in parallel, and each cleans up the
// rows whose names end in its own runId.
const runId = randomUUID().slice(0, 8);

let speciesId: string;
let colorId: string;
let staffId: string;
let itemId: string;

before(async () => {
  speciesId = (
    await prisma.species.create({ data: { name: `Doses species ${runId}` }, select: { id: true } })
  ).id;
  colorId = (
    await prisma.color.create({ data: { name: `Doses color ${runId}` }, select: { id: true } })
  ).id;
  staffId = (
    await prisma.person.create({ data: { name: `Doses staff ${runId}` }, select: { id: true } })
  ).id;
  itemId = (
    await prisma.$transaction((tx) =>
      createMedicalItem(tx, {
        kind: MedicalItemKind.MEDICATION,
        name: `Doxycycline ${runId}`,
        speciesIds: [],
        analytes: [],
      }),
    )
  ).id;
});

after(async () => {
  // Takes the orders, their events and their doses with them.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const newAnimal = async () =>
  (
    await prisma.animal.create({
      data: {
        name: `Doses animal ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
      },
      select: { id: true },
    })
  ).id;

const newOrder = async (animalId: string, frequency: MedicationFrequency) =>
  (
    await prisma.medicationOrder.create({
      data: {
        animalId,
        itemId,
        doseAmount: 100,
        doseUnit: DoseUnit.MG,
        route: MedicalRoute.ORAL,
        frequency,
        startDate: "2026-10-12",
        firstSlot: frequency === MedicationFrequency.PRN ? null : DoseSlot.AM,
        createdById: staffId,
      },
      select: { id: true },
    })
  ).id;

const newDose = (
  orderId: string,
  animalId: string,
  slotDate: string,
  slot: DoseSlot | null,
) =>
  prisma.medicationDose.create({
    data: {
      orderId,
      animalId,
      slotDate,
      slot,
      result: MedicationDoseResult.GIVEN,
      administeredAt: new Date("2026-10-14T13:00:00Z"),
      administeredById: staffId,
      createdById: staffId,
    },
    select: { id: true },
  });

const failsWith = (code: string) => (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

test("a slot holds one live dose, and voiding it frees the slot", async () => {
  const animalId = await newAnimal();
  const orderId = await newOrder(animalId, MedicationFrequency.BID);
  const first = await newDose(orderId, animalId, "2026-10-14", DoseSlot.AM);

  await assert.rejects(newDose(orderId, animalId, "2026-10-14", DoseSlot.AM), failsWith("P2002"));
  // Another slot or another day of the same order is its own slot.
  await newDose(orderId, animalId, "2026-10-14", DoseSlot.PM);
  await newDose(orderId, animalId, "2026-10-15", DoseSlot.AM);

  await prisma.medicationDose.update({
    where: { id: first.id },
    data: { voidedAt: new Date(), voidedById: staffId, voidReason: "Recorded on the wrong day" },
  });
  const replacement = await newDose(orderId, animalId, "2026-10-14", DoseSlot.AM);
  // The replacement is live; another is refused again.
  await assert.rejects(newDose(orderId, animalId, "2026-10-14", DoseSlot.AM), failsWith("P2002"));

  const onSlot = await prisma.medicationDose.findMany({
    where: { orderId, slotDate: "2026-10-14", slot: DoseSlot.AM },
    orderBy: { createdAt: "asc" },
    select: { id: true, voidedAt: true },
  });
  assert.deepEqual(
    onSlot.map((dose) => [dose.id, dose.voidedAt !== null]),
    [
      [first.id, true],
      [replacement.id, false],
    ],
  );
});

test("as-needed doses have no slot, and any number fit on one day", async () => {
  const animalId = await newAnimal();
  const orderId = await newOrder(animalId, MedicationFrequency.PRN);
  await newDose(orderId, animalId, "2026-10-14", null);
  await newDose(orderId, animalId, "2026-10-14", null);
  await newDose(orderId, animalId, "2026-10-14", null);
  assert.equal(await prisma.medicationDose.count({ where: { orderId } }), 3);
});

test("an order with doses can't be deleted; deleting the animal takes its orders, events and doses", async () => {
  const animalId = await newAnimal();
  const orderId = await newOrder(animalId, MedicationFrequency.BID);
  await prisma.medicationOrderEvent.create({
    data: { orderId, action: MedicationOrderEventAction.CREATED, actorId: staffId },
  });
  await newDose(orderId, animalId, "2026-10-14", DoseSlot.AM);

  await assert.rejects(prisma.medicationOrder.delete({ where: { id: orderId } }), failsWith("P2003"));
  assert.equal(await prisma.medicationOrder.count({ where: { id: orderId } }), 1);

  await prisma.animal.delete({ where: { id: animalId } });
  assert.equal(await prisma.medicationOrder.count({ where: { animalId } }), 0);
  assert.equal(await prisma.medicationOrderEvent.count({ where: { orderId } }), 0);
  assert.equal(await prisma.medicationDose.count({ where: { animalId } }), 0);
});
