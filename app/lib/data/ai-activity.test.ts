import { test } from "node:test";
import assert from "node:assert/strict";
import { AiActionTargetType, TaskStatus } from "@/prisma/generated/enums";
import {
  isTaskStatusStale,
  parseSnapshot,
  taskStatusSnapshotSchema,
  toolLabel,
} from "./ai-activity";

test("taskStatusSnapshotSchema accepts a valid status", () => {
  const parsed = taskStatusSnapshotSchema.safeParse({ status: TaskStatus.DONE });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.status, TaskStatus.DONE);
});

test("taskStatusSnapshotSchema tolerates extra keys (non-strict)", () => {
  const parsed = taskStatusSnapshotSchema.safeParse({
    status: TaskStatus.TODO,
    somethingElse: 1,
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.status, TaskStatus.TODO);
});

test("parseSnapshot(TASK) rejects shapes a Json column could hold", () => {
  for (const bad of [
    null,
    undefined,
    "DONE",
    42,
    {},
    { status: "NOT_A_STATUS" },
    { status: 123 },
    [{ status: "DONE" }],
  ]) {
    assert.equal(
      parseSnapshot(AiActionTargetType.TASK, bad).success,
      false,
      `expected ${JSON.stringify(bad)} to fail`,
    );
  }
});

test("parseSnapshot(TASK) accepts the shape phase 6 writes", () => {
  const parsed = parseSnapshot(AiActionTargetType.TASK, {
    status: TaskStatus.IN_PROGRESS,
  });
  assert.equal(parsed.success, true);
});

test("isTaskStatusStale: false when the live value still equals `after`", () => {
  assert.equal(
    isTaskStatusStale(TaskStatus.DONE, { status: TaskStatus.DONE }),
    false,
  );
});

test("isTaskStatusStale: true when the task moved on since the assistant", () => {
  assert.equal(
    isTaskStatusStale(TaskStatus.SKIPPED, { status: TaskStatus.DONE }),
    true,
  );
  assert.equal(
    isTaskStatusStale(TaskStatus.TODO, { status: TaskStatus.DONE }),
    true,
  );
});

test("toolLabel maps known tools and falls back to the raw name", () => {
  assert.equal(toolLabel("setTaskStatus"), "Task status change");
  assert.equal(toolLabel("someFutureTool"), "someFutureTool");
});
