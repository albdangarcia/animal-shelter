// Recording vitals, against a real Postgres: the entry, the animal's current
// weight it leaves, and the activity text, as the Vitals page and an exam
// both write them through the vitals service.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { AnimalActivityType, Sex } from "@/prisma/generated/enums";
import {
  VitalsRefusal,
  recordVitals,
  type RecordVitalsInput,
} from "@/app/lib/services/vitals";

const runId = randomUUID().slice(0, 8);

let speciesId: string;
let colorId: string;
let staffId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Vitals species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Vitals color") },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: name("Vitals staff") },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  // Takes the vitals entries and activity rows.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
      },
      select: { id: true },
    })
  ).id;

const record = (
  input: RecordVitalsInput,
  loggedAfter?: Date,
) =>
  prisma.$transaction((tx) =>
    recordVitals(tx, input, staffId, { unitSystem: "metric", loggedAfter }),
  );

const currentWeightOf = async (animalId: string) =>
  (
    await prisma.animal.findUniqueOrThrow({
      where: { id: animalId },
      select: { currentWeightGrams: true },
    })
  ).currentWeightGrams;

const summariesOf = async (animalId: string) =>
  (
    await prisma.animalActivityLog.findMany({
      where: { animalId, activityType: AnimalActivityType.VITALS_RECORDED },
      orderBy: { changedAt: "asc" },
      select: { changeSummary: true, changedById: true },
    })
  ).map((row) => row.changeSummary);

test("recording vitals writes the entry, sets the current weight and logs it", async () => {
  const animalId = await makeAnimal("Records");
  const recordedAt = new Date("2026-10-03T16:00:00Z");
  const { vitalsLogId, loggedAt } = await record({
    animalId,
    recordedAt,
    weightGrams: 12400,
    temperatureC: 38.6,
    bodyConditionScore: 5,
    notes: "Calm on the scale.",
  });

  const log = await prisma.vitalsLog.findUniqueOrThrow({ where: { id: vitalsLogId } });
  assert.equal(log.animalId, animalId);
  assert.equal(log.recordedById, staffId);
  assert.equal(log.recordedAt.toISOString(), recordedAt.toISOString());
  assert.equal(log.weightGrams, 12400);
  assert.equal(log.temperatureC, 38.6);
  assert.equal(log.bodyConditionScore, 5);
  assert.equal(log.notes, "Calm on the scale.");
  assert.equal(log.deletedAt, null);
  assert.equal(await currentWeightOf(animalId), 12400);

  const [row] = await prisma.animalActivityLog.findMany({
    where: { animalId },
    select: { activityType: true, changedById: true, changeSummary: true, changedAt: true },
  });
  assert.deepEqual(
    { ...row, changedAt: row.changedAt.toISOString() },
    {
      activityType: AnimalActivityType.VITALS_RECORDED,
      changedById: staffId,
      changeSummary: "Weight recorded: 12.4 kg",
      changedAt: loggedAt.toISOString(),
    },
  );

  // Without a weight, the text says vitals, and the weight stays.
  await record({ animalId, recordedAt: new Date("2026-10-04T16:00:00Z"), temperatureC: 39 });
  assert.equal(await currentWeightOf(animalId), 12400);
  assert.deepEqual(await summariesOf(animalId), [
    "Weight recorded: 12.4 kg",
    "Vitals recorded.",
  ]);
});

test("the current weight follows the latest weigh-in, and a backdated one reads against the one before it", async () => {
  const animalId = await makeAnimal("Backdated");
  await record({ animalId, recordedAt: new Date("2026-09-01T16:00:00Z"), weightGrams: 3000 });
  await record({ animalId, recordedAt: new Date("2026-09-20T16:00:00Z"), weightGrams: 5000 });
  assert.equal(await currentWeightOf(animalId), 5000);

  // Entered last, but measured between the two: it doesn't become current,
  // and its change is from the weigh-in on Sep 1, not the one on Sep 20.
  await record({ animalId, recordedAt: new Date("2026-09-10T16:00:00Z"), weightGrams: 4000 });
  assert.equal(await currentWeightOf(animalId), 5000);
  // And one measured before them all has nothing to compare with.
  await record({ animalId, recordedAt: new Date("2026-08-25T16:00:00Z"), weightGrams: 2800 });
  assert.equal(await currentWeightOf(animalId), 5000);

  assert.deepEqual(await summariesOf(animalId), [
    "Weight recorded: 3 kg",
    "Weight recorded: 5 kg (up 2 kg)",
    "Weight recorded: 4 kg (up 1 kg)",
    "Weight recorded: 2.8 kg",
  ]);

  // A later weigh-in that went down.
  await record({ animalId, recordedAt: new Date("2026-09-25T16:00:00Z"), weightGrams: 4800 });
  assert.equal(await currentWeightOf(animalId), 4800);
  assert.equal((await summariesOf(animalId)).at(-1), "Weight recorded: 4.8 kg (down 200 g)");
});

test("vitals with no measurement, or one out of bounds, are refused with nothing written", async () => {
  const animalId = await makeAnimal("Refused");
  const recordedAt = new Date("2026-10-03T16:00:00Z");
  const refusedOn = (input: RecordVitalsInput, field: string, pattern: RegExp) =>
    assert.rejects(record(input), (error) => {
      assert.ok(error instanceof VitalsRefusal, String(error));
      assert.equal(error.field, field);
      assert.match(error.message, pattern);
      return true;
    });

  await refusedOn(
    { animalId, recordedAt, notes: "Only a note." },
    "weightGrams",
    /at least one measurement/,
  );
  await refusedOn({ animalId, recordedAt, temperatureC: 50 }, "temperatureC", /at most 45/);
  await refusedOn({ animalId, recordedAt, bodyConditionScore: 10 }, "bodyConditionScore", /1 and 9/);
  await refusedOn({ animalId, recordedAt, weightGrams: -5 }, "weightGrams", /positive/);

  assert.equal(await prisma.vitalsLog.count({ where: { animalId } }), 0);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), 0);
  assert.equal(await currentWeightOf(animalId), null);
});

test("the activity row is stamped after the row it follows", async () => {
  const animalId = await makeAnimal("Stamped");
  // A stamp a second ahead of the clock: the row must still come after it.
  const before = new Date(Date.now() + 1000);
  const { loggedAt } = await record(
    { animalId, recordedAt: new Date("2026-10-03T16:00:00Z"), weightGrams: 5000 },
    before,
  );
  assert.equal(loggedAt.getTime(), before.getTime() + 1);
});

const backendPid = async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;

const waitForSessionBlockedBy = async (holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session was seen waiting on backend ${holderPid}.`);
};

test("vitals recorded while another weigh-in is being written wait for it, and keep the newer weight", async () => {
  const animalId = await makeAnimal("At once");
  await record({ animalId, recordedAt: new Date("2026-10-01T16:00:00Z"), weightGrams: 4000 });

  // Given longer than the five seconds the wait below may take, so a slow
  // machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let written!: (pid: number) => void;
  const isWritten = new Promise<number>((resolve) => (written = resolve));
  // A newer weigh-in (as an exam writes one) that hasn't committed yet.
  const holder = prisma.$transaction(
    async (tx) => {
      await recordVitals(
        tx,
        { animalId, recordedAt: new Date("2026-10-05T16:00:00Z"), weightGrams: 5000 },
        staffId,
        { unitSystem: "metric" },
      );
      written(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isWritten, holder as Promise<never>]);

  // A temperature alone, recorded on the Vitals page at the same moment.
  const second = prisma.$transaction(
    (tx) =>
      recordVitals(
        tx,
        { animalId, recordedAt: new Date("2026-10-06T16:00:00Z"), temperatureC: 38.5 },
        staffId,
        { unitSystem: "metric" },
      ),
    { timeout },
  );
  // Observed as soon as it starts, so a failed wait is not followed by an
  // unhandled rejection. Awaiting it below still sees any rejection.
  void second.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    release();
    await Promise.allSettled([holder, second]);
  }
  await holder;
  await second;

  // Had the second read the latest weight before the first committed, it
  // would have put 4 kg back.
  assert.equal(await currentWeightOf(animalId), 5000);
});
