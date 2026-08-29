import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskStatus } from "@/prisma/generated/enums";
import { buildApprovalReason } from "./set-task-status-reason";

test("approval reason states the server-resolved facts, including current status", () => {
  const reason = buildApprovalReason({
    taskTitle: "Post-op wound recheck",
    animalName: "Daisy",
    unitLabel: "Medical wing · MED-2",
    currentStatus: TaskStatus.TODO,
    requestedStatus: TaskStatus.DONE,
  });

  assert.equal(
    reason,
    'Mark "Post-op wound recheck" on Daisy (Medical wing · MED-2) as DONE. Currently TODO.',
  );
  // The current status is the tell that the card is built from the database —
  // the model never supplies it.
  assert.match(reason, /Currently TODO\.$/);
});

test("approval reason omits the parenthetical when the animal has no unit", () => {
  const reason = buildApprovalReason({
    taskTitle: "Leash-reactivity reassessment",
    animalName: "Bruno",
    unitLabel: null,
    currentStatus: TaskStatus.IN_PROGRESS,
    requestedStatus: TaskStatus.DONE,
  });

  assert.equal(
    reason,
    'Mark "Leash-reactivity reassessment" on Bruno as DONE. Currently IN_PROGRESS.',
  );
});
