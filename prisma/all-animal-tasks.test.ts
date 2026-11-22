// The all-animals Tasks list's Due filter and its "Hide animals that have
// left" switch against a real Postgres (`findAllAnimalsTasks`): each Due choice
// picks the tasks whose due date falls there against the shelter's today,
// choices combine, an unknown value is ignored, the switch leaves out the
// tasks of archived animals, and the dashboard's "tasks due or overdue" link
// (open statuses, `overdue,today`, switch on) lists exactly the tasks its
// count counts.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  Sex,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "@/prisma/generated/enums";
import {
  findAllAnimalsTasks,
  parseAllAnimalsTasksArgs,
} from "@/app/lib/data/all-animal-tasks";
import { findAttentionSignals } from "@/app/lib/data/animals/attention-signals";
import { DEFAULT_DOSE_SLOT_ENDS } from "@/app/lib/utils/shelter-settings";
import { calendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each reads only the
// tasks whose title carries its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-14");

let speciesId: string;
let colorId: string;
let staffId: string;
let animalId: string;
let archivedAnimalId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Tasks species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Tasks color") },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: name("Tasks staff") },
      select: { id: true },
    })
  ).id;
  animalId = (
    await prisma.animal.create({
      data: {
        name: name("Tasks animal"),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.PUBLISHED,
      },
      select: { id: true },
    })
  ).id;

  // An animal that has left the shelter, with an open task still overdue.
  archivedAnimalId = (
    await prisma.animal.create({
      data: {
        name: name("Tasks archived animal"),
        birthDate: "2024-01-01",
        sex: Sex.MALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.ARCHIVED,
      },
      select: { id: true },
    })
  ).id;

  // The archived animal's task is due on a day no other task is, so the order
  // by due date never depends on the tie-break.
  const tasks: [string, TaskStatus, string | null, string][] = [
    ["Long overdue", TaskStatus.TODO, "2026-09-30", animalId],
    ["Left overdue", TaskStatus.TODO, "2026-10-12", archivedAnimalId],
    ["Overdue", TaskStatus.IN_PROGRESS, "2026-10-13", animalId],
    ["Today", TaskStatus.TODO, "2026-10-14", animalId],
    ["Tomorrow", TaskStatus.TODO, "2026-10-15", animalId],
    ["Undated", TaskStatus.TODO, null, animalId],
    ["Done overdue", TaskStatus.DONE, "2026-10-13", animalId],
  ];
  for (const [title, status, dueDate, taskAnimalId] of tasks) {
    await prisma.task.create({
      data: {
        title: name(title),
        category: TaskCategory.MEDICAL,
        priority: TaskPriority.HIGH,
        status,
        dueDate,
        animalId: taskAnimalId,
        createdById: staffId,
      },
    });
  }
});

after(async () => {
  // Takes the tasks.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/** The titles listed, without the runId, earliest due first. */
const titles = async (filters: {
  due?: string;
  status?: string;
  hideLeft?: boolean;
}) => {
  const { tasks, totalRows } = await findAllAnimalsTasks(
    prisma,
    parseAllAnimalsTasksArgs({
      query: runId,
      currentPage: 1,
      pageSize: 50,
      sort: "dueDate.asc",
      ...filters,
    }),
    TODAY,
  );
  assert.equal(totalRows, tasks.length);
  return tasks.map((task) => task.title.replace(` ${runId}`, ""));
};

test("each Due choice lists the tasks due there against today", async () => {
  assert.deepEqual(await titles({ due: "overdue" }), [
    "Long overdue",
    "Left overdue",
    "Overdue",
    "Done overdue",
  ]);
  assert.deepEqual(await titles({ due: "today" }), ["Today"]);
  assert.deepEqual(await titles({ due: "later" }), ["Tomorrow"]);
  assert.deepEqual(await titles({ due: "none" }), ["Undated"]);
});

test("Due choices combine, and an unknown one is ignored", async () => {
  assert.deepEqual(
    (await titles({ due: "today,none" })).sort(),
    ["Today", "Undated"],
  );
  assert.deepEqual(await titles({ due: "today,soon" }), ["Today"]);
  // Nothing known picked: no Due filter at all.
  assert.equal((await titles({ due: "soon" })).length, 7);
  assert.equal((await titles({})).length, 7);
});

/** The titles the dashboard's tasks link lists, with or without its switch. */
const linkTitles = (hideLeft: boolean) =>
  titles({
    status: `${TaskStatus.TODO},${TaskStatus.IN_PROGRESS}`,
    due: "overdue,today",
    hideLeft,
  });

test("Hide animals that have left leaves out the tasks of archived animals", async () => {
  // Off, or not given: every animal's tasks, the archived one's too.
  assert.ok((await titles({})).includes("Left overdue"));
  assert.ok(
    (await titles({ hideLeft: false })).includes("Left overdue"),
  );

  // On: only the archived animal's task goes.
  const shown = await titles({ hideLeft: true });
  assert.equal(shown.length, 6);
  assert.ok(!shown.includes("Left overdue"));

  // It combines with the other filters (`titles` also checks that the count
  // matches the rows).
  assert.deepEqual(await titles({ due: "overdue", hideLeft: true }), [
    "Long overdue",
    "Overdue",
    "Done overdue",
  ]);
});

test("the dashboard's tasks link lists exactly the tasks its count counts", async () => {
  const signals = await findAttentionSignals(prisma, {
    today: TODAY,
    clock: { day: TODAY, time: "12:00" },
    doseSlotEnds: DEFAULT_DOSE_SLOT_ENDS,
  });
  // This file's animals only: other files' tasks carry their own runId.
  const counted = signals.tasksDue
    .filter((task) => task.title.endsWith(runId))
    .map((task) => task.title.replace(` ${runId}`, ""))
    .sort();

  // With the link's switch on, the list and the count agree...
  const listed = await linkTitles(true);
  assert.deepEqual(listed, ["Long overdue", "Overdue", "Today"]);
  assert.deepEqual(counted, [...listed].sort());

  // ...and the switch is what makes them agree: without it the list also
  // holds the task of the animal that has left, which the count never has.
  assert.deepEqual(await linkTitles(false), [
    "Long overdue",
    "Left overdue",
    "Overdue",
    "Today",
  ]);
  assert.ok(!counted.includes("Left overdue"));
});
