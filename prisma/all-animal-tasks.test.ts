// The all-animals Tasks list's Due filter against a real Postgres
// (`findAllAnimalsTasks`): each choice picks the tasks whose due date falls
// there against the shelter's today, choices combine, an unknown value is
// ignored, and the dashboard's "tasks due or overdue" link (open statuses,
// `overdue,today`) lists exactly the tasks its count counts.
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

  const tasks: [string, TaskStatus, string | null][] = [
    ["Long overdue", TaskStatus.TODO, "2026-09-30"],
    ["Overdue", TaskStatus.IN_PROGRESS, "2026-10-13"],
    ["Today", TaskStatus.TODO, "2026-10-14"],
    ["Tomorrow", TaskStatus.TODO, "2026-10-15"],
    ["Undated", TaskStatus.TODO, null],
    ["Done overdue", TaskStatus.DONE, "2026-10-13"],
  ];
  for (const [title, status, dueDate] of tasks) {
    await prisma.task.create({
      data: {
        title: name(title),
        category: TaskCategory.MEDICAL,
        priority: TaskPriority.HIGH,
        status,
        dueDate,
        animalId,
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
const titles = async (filters: { due?: string; status?: string }) => {
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
  assert.equal((await titles({ due: "soon" })).length, 6);
  assert.equal((await titles({})).length, 6);
});

test("the dashboard's tasks link lists exactly the tasks its count counts", async () => {
  const listed = await titles({
    status: `${TaskStatus.TODO},${TaskStatus.IN_PROGRESS}`,
    due: "overdue,today",
  });
  assert.deepEqual(listed, ["Long overdue", "Overdue", "Today"]);

  const signals = await findAttentionSignals(prisma, {
    today: TODAY,
    clock: { day: TODAY, time: "12:00" },
    doseSlotEnds: DEFAULT_DOSE_SLOT_ENDS,
  });
  const counted = signals.tasksDue
    .filter((task) => task.animal.id === animalId)
    .map((task) => task.title.replace(` ${runId}`, ""))
    .sort();
  assert.deepEqual(counted, [...listed].sort());
});
