// The attention queue's signals read against a real Postgres
// (`findAttentionSignals`): the two read here, tasks due and fosters overdue,
// and that tasks due come back uncapped, which is what lets the dashboard's
// counts be right when more than `ATTENTION_QUEUE_CAP` animals need
// attention (no signal query takes a limit; the cap is the queue's alone). The other three signals have their own files
// (`medication-doses.test.ts`, `medical-due.test.ts`, `care-status.test.ts`);
// merging and summarizing the rows is unit-tested in `attention-queue.test.ts`
// and `attention-summary.test.ts`.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  FosterPlacementType,
  Sex,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "@/prisma/generated/enums";
import {
  findAttentionSignals,
  type AttentionSignals,
} from "@/app/lib/data/animals/attention-signals";
import {
  ATTENTION_QUEUE_CAP,
  buildAttentionQueue,
} from "@/app/lib/data/animals/attention-queue";
import { summarizeAttention } from "@/app/lib/data/animals/attention-summary";
import { DEFAULT_DOSE_SLOT_ENDS } from "@/app/lib/utils/shelter-settings";
import { calendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-14");
const YESTERDAY = calendarDay("2026-10-13");
const TOMORROW = calendarDay("2026-10-15");

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterPersonId: string;
let fosterProfileId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Attention species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Attention color") },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: name("Attention staff") },
      select: { id: true },
    })
  ).id;
  fosterPersonId = (
    await prisma.person.create({
      data: { name: name("Attention foster") },
      select: { id: true },
    })
  ).id;
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { placedById: staffId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  // Takes the tasks.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  listingStatus: AnimalListingStatus = AnimalListingStatus.PUBLISHED,
) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus,
      },
      select: { id: true },
    })
  ).id;

const addTask = async (
  animalId: string,
  status: TaskStatus,
  dueDate: string | null,
  title = "Recheck",
) =>
  (
    await prisma.task.create({
      data: {
        title,
        category: TaskCategory.MEDICAL,
        priority: TaskPriority.HIGH,
        status,
        dueDate,
        animalId,
        createdById: staffId,
      },
      select: { id: true },
    })
  ).id;

const addPlacement = async (
  animalId: string,
  expectedEndDate: string | null,
  endDate: string | null = null,
) =>
  (
    await prisma.fosterPlacement.create({
      data: {
        type: FosterPlacementType.GENERAL,
        startDate: "2026-09-01",
        expectedEndDate,
        endDate,
        animalId,
        fosterProfileId,
        placedById: staffId,
      },
      select: { id: true },
    })
  ).id;

const signalsOn = (today = TODAY) =>
  findAttentionSignals(prisma, {
    today,
    clock: { day: today, time: "12:00" },
    doseSlotEnds: DEFAULT_DOSE_SLOT_ENDS,
  });

/** The signals for these animals only: other files write rows at once. */
const onlyFor = (signals: AttentionSignals, animalIds: string[]): AttentionSignals => {
  const mine = <T extends { animal: { id: string } }>(rows: T[]) =>
    rows.filter((row) => animalIds.includes(row.animal.id));
  return {
    tasksDue: mine(signals.tasksDue),
    dosesMissed: mine(signals.dosesMissed),
    medicalDue: mine(signals.medicalDue),
    careUnplanned: mine(signals.careUnplanned),
    fostersOverdue: mine(signals.fostersOverdue),
  };
};

test("tasks due today or overdue and still open are signalled; done, undated, future and archived ones aren't", async () => {
  const animal = await makeAnimal("Task animal");
  const dueToday = await addTask(animal, TaskStatus.TODO, TODAY, "Due today");
  const overdue = await addTask(animal, TaskStatus.IN_PROGRESS, YESTERDAY, "Overdue");
  await addTask(animal, TaskStatus.DONE, YESTERDAY);
  await addTask(animal, TaskStatus.ON_HOLD, YESTERDAY);
  await addTask(animal, TaskStatus.TODO, null);
  await addTask(animal, TaskStatus.TODO, TOMORROW);

  const archived = await makeAnimal("Task archived", AnimalListingStatus.ARCHIVED);
  await addTask(archived, TaskStatus.TODO, YESTERDAY);

  const { tasksDue } = onlyFor(await signalsOn(), [animal, archived]);
  const identity = {
    id: animal,
    name: name("Task animal"),
    species: name("Attention species"),
    currentUnit: null,
  };
  assert.deepEqual(
    [...tasksDue].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [
      {
        animal: identity,
        taskId: overdue,
        title: "Overdue",
        dueDate: YESTERDAY,
        priority: TaskPriority.HIGH,
      },
      {
        animal: identity,
        taskId: dueToday,
        title: "Due today",
        dueDate: TODAY,
        priority: TaskPriority.HIGH,
      },
    ],
  );
});

test("an open placement is overdue the day after its expected end, not on it; an ended or archived one isn't", async () => {
  const overdue = await makeAnimal("Foster overdue");
  const overduePlacement = await addPlacement(overdue, YESTERDAY);
  const dueBackToday = await makeAnimal("Foster due today");
  await addPlacement(dueBackToday, TODAY);
  const noExpectedEnd = await makeAnimal("Foster open-ended");
  await addPlacement(noExpectedEnd, null);
  const ended = await makeAnimal("Foster ended");
  await addPlacement(ended, "2026-10-01", "2026-10-05");
  const archived = await makeAnimal("Foster archived", AnimalListingStatus.ARCHIVED);
  await addPlacement(archived, YESTERDAY);

  const mine = [overdue, dueBackToday, noExpectedEnd, ended, archived];
  assert.deepEqual(onlyFor(await signalsOn(), mine).fostersOverdue, [
    {
      animal: {
        id: overdue,
        name: name("Foster overdue"),
        species: name("Attention species"),
        currentUnit: null,
      },
      placementId: overduePlacement,
      expectedEndDate: YESTERDAY,
      fosterName: name("Attention foster"),
    },
  ]);

  // The next day, the placement due back today is overdue too.
  const tomorrow = onlyFor(await signalsOn(TOMORROW), mine).fostersOverdue;
  assert.deepEqual(
    tomorrow.map((row) => row.animal.id).sort(),
    [overdue, dueBackToday].sort(),
  );
});

test("tasks due are read uncapped: the dashboard counts every animal past the queue's cap", async () => {
  const many = ATTENTION_QUEUE_CAP + 5;
  const animals: string[] = [];
  for (let i = 0; i < many; i++) {
    const animal = await makeAnimal(`Busy ${String(i).padStart(2, "0")}`);
    animals.push(animal);
    await addTask(animal, TaskStatus.TODO, YESTERDAY);
  }
  // A second task on one animal: counted as a task, listed once as an animal.
  await addTask(animals[0], TaskStatus.TODO, TODAY);

  const signals = onlyFor(await signalsOn(), animals);
  assert.equal(signals.tasksDue.length, many + 1);

  // The AI's queue stops at the cap; the dashboard's count doesn't.
  assert.equal(buildAttentionQueue(signals).length, ATTENTION_QUEUE_CAP);
  const [tasks] = summarizeAttention(signals);
  assert.equal(tasks.kind, "TASK_DUE");
  assert.equal(tasks.count, many + 1);
  assert.equal(tasks.first.length, 3);
});
