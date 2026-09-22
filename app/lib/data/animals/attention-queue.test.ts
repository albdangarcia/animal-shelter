import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTENTION_QUEUE_CAP,
  buildAttentionQueue,
  type AcuteHealthRow,
  type AttentionAnimal,
  type FosterOverdueRow,
  type TaskDueRow,
} from "./attention-queue";
import { calendarDay, shiftDayKey } from "@/app/lib/utils/shelter-day";

const animal = (id: string, overrides: Partial<AttentionAnimal> = {}): AttentionAnimal => ({
  id,
  name: id,
  species: "Dog",
  currentUnit: null,
  ...overrides,
});

const taskRow = (
  a: AttentionAnimal,
  overrides: Partial<Omit<TaskDueRow, "animal">> = {},
): TaskDueRow => ({
  animal: a,
  taskId: `task-${a.id}`,
  title: "Do the thing",
  dueDate: calendarDay("2026-08-20"),
  priority: "MEDIUM",
  ...overrides,
});

const acuteRow = (
  a: AttentionAnimal,
  overrides: Partial<Omit<AcuteHealthRow, "animal">> = {},
): AcuteHealthRow => ({
  animal: a,
  healthStatus: "UNDER_VET_CARE",
  ...overrides,
});

const fosterRow = (
  a: AttentionAnimal,
  overrides: Partial<Omit<FosterOverdueRow, "animal">> = {},
): FosterOverdueRow => ({
  animal: a,
  placementId: `placement-${a.id}`,
  expectedEndDate: calendarDay("2026-08-15"),
  fosterName: "Jane Doe",
  ...overrides,
});

const empty = { tasksDue: [], acuteHealth: [], fostersOverdue: [] };

test("no signals produces an empty queue", () => {
  assert.deepEqual(buildAttentionQueue(empty), []);
});

test("an animal with multiple signals appears once, with every reason attached", () => {
  const bruno = animal("bruno");
  const queue = buildAttentionQueue({
    ...empty,
    tasksDue: [taskRow(bruno, { taskId: "t1" })],
    fostersOverdue: [fosterRow(bruno)],
  });

  assert.equal(queue.length, 1);
  assert.equal(queue[0].animalId, "bruno");
  assert.deepEqual(
    queue[0].reasons.map((r) => r.kind),
    ["TASK_DUE", "FOSTER_OVERDUE"],
  );
});

test("acute health with an open task never reaches signal 2 — but the pure merge still dedupes if handed both", () => {
  // The query layer excludes tasked animals from `acuteHealth`; this asserts the
  // merge is not the thing that would double-list an animal if it didn't.
  const luna = animal("luna");
  const queue = buildAttentionQueue({
    ...empty,
    tasksDue: [taskRow(luna)],
    acuteHealth: [acuteRow(luna)],
  });

  assert.equal(queue.length, 1);
  assert.deepEqual(
    queue[0].reasons.map((r) => r.kind),
    ["TASK_DUE", "UNTASKED_ACUTE_HEALTH"],
  );
});

test("multiple overdue tasks on one animal each contribute a reason, ordered by due day", () => {
  const bruno = animal("bruno");
  const queue = buildAttentionQueue({
    ...empty,
    tasksDue: [
      taskRow(bruno, { taskId: "later", dueDate: calendarDay("2026-08-25") }),
      taskRow(bruno, { taskId: "earlier", dueDate: calendarDay("2026-08-18") }),
    ],
  });

  assert.equal(queue.length, 1);
  assert.deepEqual(
    queue[0].reasons.map((r) => (r.kind === "TASK_DUE" ? r.taskId : r.kind)),
    ["earlier", "later"],
  );
});

test("tiers order the queue: overdue task, then untasked acute health, then overdue foster", () => {
  const queue = buildAttentionQueue({
    tasksDue: [taskRow(animal("has-task"))],
    acuteHealth: [acuteRow(animal("acute-only"))],
    fostersOverdue: [fosterRow(animal("foster-only"))],
  });

  assert.deepEqual(
    queue.map((item) => item.animalId),
    ["has-task", "acute-only", "foster-only"],
  );
});

test("an animal in more than one tier sorts by its highest tier", () => {
  const queue = buildAttentionQueue({
    tasksDue: [taskRow(animal("multi"))],
    acuteHealth: [acuteRow(animal("acute-only"))],
    fostersOverdue: [fosterRow(animal("multi"))],
  });

  // `multi` has a foster reason too, but its task puts it in tier 1, ahead of
  // the acute-only animal.
  assert.deepEqual(
    queue.map((item) => item.animalId),
    ["multi", "acute-only"],
  );
});

test("within tier 1, earlier due date wins; then higher priority", () => {
  const queue = buildAttentionQueue({
    ...empty,
    tasksDue: [
      taskRow(animal("due-late"), { dueDate: calendarDay("2026-08-24"), priority: "HIGH" }),
      taskRow(animal("due-early-low"), { dueDate: calendarDay("2026-08-20"), priority: "LOW" }),
      taskRow(animal("due-early-high"), { dueDate: calendarDay("2026-08-20"), priority: "HIGH" }),
    ],
  });

  assert.deepEqual(
    queue.map((item) => item.animalId),
    ["due-early-high", "due-early-low", "due-late"],
  );
});

test("within tier 3, the earliest expected end date sorts first", () => {
  const queue = buildAttentionQueue({
    ...empty,
    fostersOverdue: [
      fosterRow(animal("b"), { expectedEndDate: calendarDay("2026-08-10") }),
      fosterRow(animal("a"), { expectedEndDate: calendarDay("2026-08-01") }),
    ],
  });

  assert.deepEqual(
    queue.map((item) => item.animalId),
    ["a", "b"],
  );
});

test("ties break on name then id, so the queue is identical between identical inputs", () => {
  const sameDue = calendarDay("2026-08-20");
  const queue = buildAttentionQueue({
    ...empty,
    tasksDue: [
      taskRow(animal("z", { name: "Zoe" }), { dueDate: sameDue, priority: "MEDIUM" }),
      taskRow(animal("a", { name: "Abe" }), { dueDate: sameDue, priority: "MEDIUM" }),
    ],
  });

  assert.deepEqual(
    queue.map((item) => item.name),
    ["Abe", "Zoe"],
  );
});

test("the queue is capped at ATTENTION_QUEUE_CAP", () => {
  const tasksDue = Array.from({ length: ATTENTION_QUEUE_CAP + 5 }, (_, i) =>
    taskRow(animal(`a${String(i).padStart(2, "0")}`), {
      dueDate: shiftDayKey(calendarDay("2026-08-01"), i),
    }),
  );

  const queue = buildAttentionQueue({ ...empty, tasksDue });

  assert.equal(queue.length, ATTENTION_QUEUE_CAP);
  // The cap keeps the most time-sensitive items (earliest due dates).
  assert.equal(queue[0].animalId, "a00");
  assert.equal(queue.at(-1)?.animalId, `a${String(ATTENTION_QUEUE_CAP - 1).padStart(2, "0")}`);
});

test("reason payloads carry the fields each consumer needs, and no more", () => {
  const bruno = animal("bruno", { name: "Bruno", species: "Dog", currentUnit: "Medical wing · MED-1" });
  const [item] = buildAttentionQueue({
    tasksDue: [
      taskRow(bruno, { taskId: "task-9", title: "Dental follow-up", priority: "HIGH", dueDate: calendarDay("2026-08-19") }),
    ],
    acuteHealth: [acuteRow(bruno, { healthStatus: "HOSPITALISED" })],
    fostersOverdue: [
      fosterRow(bruno, { placementId: "fp-3", fosterName: "Sam Rivera", expectedEndDate: calendarDay("2026-08-12") }),
    ],
  });

  assert.deepEqual(item, {
    animalId: "bruno",
    name: "Bruno",
    species: "Dog",
    currentUnit: "Medical wing · MED-1",
    reasons: [
      {
        kind: "TASK_DUE",
        taskId: "task-9",
        title: "Dental follow-up",
        dueDate: calendarDay("2026-08-19"),
        priority: "HIGH",
      },
      { kind: "UNTASKED_ACUTE_HEALTH", healthStatus: "HOSPITALISED" },
      {
        kind: "FOSTER_OVERDUE",
        placementId: "fp-3",
        expectedEndDate: calendarDay("2026-08-12"),
        fosterName: "Sam Rivera",
      },
    ],
  });
});
