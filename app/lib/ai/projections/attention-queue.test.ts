import { test } from "node:test";
import assert from "node:assert/strict";
import { toAttentionQueueView } from "./attention-queue";
import type { AttentionQueueItem } from "@/app/lib/data/animals/attention-queue";
import { TaskPriority } from "@/prisma/generated/enums";

const NOW = new Date(2026, 7, 28, 14, 30); // 2026-08-28, mid-afternoon

const withTask = (dueDate: Date): AttentionQueueItem => ({
  animalId: "a1",
  name: "Frisco",
  species: "Dog",
  currentUnit: "Dog block A · A-1",
  reasons: [
    {
      kind: "TASK_DUE",
      taskId: "t1",
      title: "Nail trim",
      dueDate,
      priority: TaskPriority.HIGH,
    },
  ],
});

const overdueFlag = (item: AttentionQueueItem) => {
  const reason = toAttentionQueueView([item], NOW)[0].reasons[0];
  assert.equal(reason.kind, "TASK_DUE");
  return reason.kind === "TASK_DUE" ? reason.overdue : undefined;
};

test("a task due before today is overdue", () => {
  assert.equal(overdueFlag(withTask(new Date(2026, 7, 20, 9, 0))), true);
});

test("a task due earlier today is not overdue", () => {
  // The boundary that matters: a task due at 09:00 when it is now 14:30 is
  // still today's work, not a backlog item.
  assert.equal(overdueFlag(withTask(new Date(2026, 7, 28, 9, 0))), false);
});

test("a task due at the very start of today is not overdue", () => {
  assert.equal(overdueFlag(withTask(new Date(2026, 7, 28, 0, 0, 0))), false);
});

test("a task due one millisecond before midnight is overdue", () => {
  assert.equal(
    overdueFlag(withTask(new Date(2026, 7, 27, 23, 59, 59, 999))),
    true,
  );
});

test("non-task reasons are unaffected", () => {
  const view = toAttentionQueueView(
    [
      {
        animalId: "a2",
        name: "Fern",
        species: "Rabbit",
        currentUnit: "Isolation · ISO-2",
        reasons: [{ kind: "UNTASKED_ACUTE_HEALTH", healthStatus: "AWAITING_TRIAGE" }],
      } as AttentionQueueItem,
    ],
    NOW,
  );
  assert.equal(view[0].reasons[0].kind, "UNTASKED_ACUTE_HEALTH");
});
