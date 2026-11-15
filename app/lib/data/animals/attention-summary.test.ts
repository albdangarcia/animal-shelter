import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTENTION_QUEUE_CAP,
  buildAttentionQueue,
  type AttentionAnimal,
  type AttentionSignals,
  type CareUnplannedRow,
  type FosterOverdueRow,
  type MedicalDueRow,
  type MissedDoseRow,
  type TaskDueRow,
} from "./attention-queue";
import { ATTENTION_PREVIEW_SIZE, summarizeAttention } from "./attention-summary";
import { calendarDay } from "@/app/lib/utils/shelter-day";

const day = calendarDay;

const animal = (id: string): AttentionAnimal => ({
  id,
  name: id,
  species: "Dog",
  currentUnit: null,
});

const taskRow = (
  a: AttentionAnimal,
  overrides: Partial<Omit<TaskDueRow, "animal">> = {},
): TaskDueRow => ({
  animal: a,
  taskId: `task-${a.id}`,
  title: "Do the thing",
  dueDate: day("2026-08-20"),
  priority: "MEDIUM",
  ...overrides,
});

const doseRow = (
  a: AttentionAnimal,
  slotDate = day("2026-08-20"),
): MissedDoseRow => ({
  animal: a,
  count: 1,
  earliest: { slotDate, slot: "AM" },
  medications: ["Meloxicam"],
});

const medicalRow = (
  a: AttentionAnimal,
  overrides: Partial<Omit<MedicalDueRow, "animal">> = {},
): MedicalDueRow => ({
  animal: a,
  entryId: `entry-${a.id}`,
  itemName: "Rabies",
  kind: "VACCINE",
  dueDate: day("2026-08-20"),
  ...overrides,
});

const careRow = (a: AttentionAnimal, startDate = day("2026-08-10")): CareUnplannedRow => ({
  animal: a,
  episodeId: `episode-${a.id}`,
  episodeType: "UNDER_VET_CARE",
  startDate,
});

const fosterRow = (
  a: AttentionAnimal,
  expectedEndDate = day("2026-08-15"),
): FosterOverdueRow => ({
  animal: a,
  placementId: `placement-${a.id}`,
  expectedEndDate,
  fosterName: "Jane Doe",
});

const empty: AttentionSignals = {
  tasksDue: [],
  dosesMissed: [],
  medicalDue: [],
  careUnplanned: [],
  fostersOverdue: [],
};

test("nothing due gives no groups", () => {
  assert.deepEqual(summarizeAttention(empty), []);
});

test("groups come in the queue's tier order, and a reason with no rows has no group", () => {
  const groups = summarizeAttention({
    ...empty,
    // Given in reverse, to show the order is the summary's own.
    fostersOverdue: [fosterRow(animal("f"))],
    careUnplanned: [careRow(animal("c"))],
    tasksDue: [taskRow(animal("t"))],
  });
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["TASK_DUE", "CARE_UNPLANNED", "FOSTER_OVERDUE"],
  );
});

test("every kind in tier order: tasks, missed doses, medical care, nothing planned, fosters", () => {
  const a = animal("a");
  const groups = summarizeAttention({
    tasksDue: [taskRow(a)],
    dosesMissed: [doseRow(a)],
    medicalDue: [medicalRow(a)],
    careUnplanned: [careRow(a)],
    fostersOverdue: [fosterRow(a)],
  });
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["TASK_DUE", "DOSE_MISSED", "MEDICAL_DUE", "CARE_UNPLANNED", "FOSTER_OVERDUE"],
  );
  // One animal in every group: each lists it, with that group's reason.
  for (const group of groups) {
    assert.equal(group.count, 1);
    assert.deepEqual(
      group.first.map(({ animal, reason }) => [animal.id, reason.kind]),
      [["a", group.kind]],
    );
  }
});

test("counts are not capped at the queue's cap", () => {
  const many = ATTENTION_QUEUE_CAP + 5;
  const animals = Array.from({ length: many }, (_, i) =>
    animal(`a${String(i).padStart(2, "0")}`),
  );
  const [doses] = summarizeAttention({
    ...empty,
    dosesMissed: animals.map((a) => doseRow(a)),
  });
  assert.equal(doses.count, many);
  assert.equal(doses.first.length, ATTENTION_PREVIEW_SIZE);
});

test("tasks count tasks, but list each animal once, with its first task", () => {
  const a = animal("a");
  const b = animal("b");
  const [tasks] = summarizeAttention({
    ...empty,
    tasksDue: [
      taskRow(a, { taskId: "a-later", dueDate: day("2026-08-19") }),
      taskRow(a, { taskId: "a-first", dueDate: day("2026-08-12") }),
      taskRow(b, { taskId: "b-only", dueDate: day("2026-08-15") }),
    ],
  });
  assert.equal(tasks.count, 3);
  assert.deepEqual(
    tasks.first.map(({ animal, reason }) => [
      animal.id,
      reason.kind === "TASK_DUE" && reason.taskId,
    ]),
    [
      ["a", "a-first"],
      ["b", "b-only"],
    ],
  );
});

test("medical care counts entries; fosters count placements", () => {
  const a = animal("a");
  const groups = summarizeAttention({
    ...empty,
    medicalDue: [
      medicalRow(a, { entryId: "e1" }),
      medicalRow(a, { entryId: "e2" }),
    ],
    fostersOverdue: [fosterRow(a), { ...fosterRow(a), placementId: "second" }],
  });
  assert.deepEqual(
    groups.map((group) => [group.kind, group.count, group.first.length]),
    [
      ["MEDICAL_DUE", 2, 1],
      ["FOSTER_OVERDUE", 2, 1],
    ],
  );
});

test("each group lists its first animals in the queue's order for that tier", () => {
  const groups = summarizeAttention({
    tasksDue: [
      taskRow(animal("t-later"), { dueDate: day("2026-08-20"), priority: "HIGH" }),
      taskRow(animal("t-low"), { dueDate: day("2026-08-10"), priority: "LOW" }),
      taskRow(animal("t-high"), { dueDate: day("2026-08-10"), priority: "HIGH" }),
      taskRow(animal("t-last"), { dueDate: day("2026-08-21") }),
    ],
    dosesMissed: [
      doseRow(animal("d-today"), day("2026-08-20")),
      doseRow(animal("d-yesterday"), day("2026-08-19")),
    ],
    medicalDue: [
      medicalRow(animal("m-later"), { dueDate: day("2026-08-18") }),
      medicalRow(animal("m-first"), { dueDate: day("2026-08-01") }),
    ],
    careUnplanned: [
      careRow(animal("c-recent"), day("2026-08-12")),
      careRow(animal("c-oldest"), day("2026-08-01")),
    ],
    fostersOverdue: [
      fosterRow(animal("f-recent"), day("2026-08-12")),
      fosterRow(animal("f-oldest"), day("2026-08-01")),
    ],
  });
  assert.deepEqual(
    groups.map((group) => group.first.map(({ animal }) => animal.id)),
    [
      ["t-high", "t-low", "t-later"],
      ["d-yesterday", "d-today"],
      ["m-first", "m-later"],
      ["c-oldest", "c-recent"],
      ["f-oldest", "f-recent"],
    ],
  );
});

test("a tie on the group's keys goes by the animal's name, as in the queue", () => {
  const ace = animal("ace");
  const zed = animal("zed");
  const signals: AttentionSignals = {
    ...empty,
    // Zed's task and entry have the lower ids; the names still decide.
    tasksDue: [
      taskRow(zed, { taskId: "a-task", priority: "HIGH" }),
      taskRow(ace, { taskId: "z-task", priority: "HIGH" }),
    ],
    medicalDue: [
      medicalRow(zed, { entryId: "a-entry" }),
      medicalRow(ace, { entryId: "z-entry" }),
    ],
  };
  const [tasks, medical] = summarizeAttention(signals);
  assert.deepEqual(tasks.first.map(({ animal }) => animal.id), ["ace", "zed"]);
  assert.deepEqual(medical.first.map(({ animal }) => animal.id), ["ace", "zed"]);
  // The AI's queue puts them in the same order.
  assert.deepEqual(
    buildAttentionQueue({ ...empty, tasksDue: signals.tasksDue }).map(
      (item) => item.animalId,
    ),
    ["ace", "zed"],
  );
});
