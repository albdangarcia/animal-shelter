// Lives under prisma/ so `npm run test:db` runs it against the throwaway
// docker-compose Postgres on 55432 (see scripts/test-db.ts), never the dev DB.
//
// Drives the real `setTaskStatusTool.execute` — permission check, the
// approval-id guard, the write transaction, and the P2002-to-ConflictError
// mapping — against a hand-built `messages` array carrying a
// `tool-approval-request` part, the same shape `findApprovalId` reads out of
// the SDK's real message history. No mocking: real rows, a self-contained
// fixture graph per test, cleaned up afterwards.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import prisma from "@/app/lib/prisma";
import {
  setTaskStatusTool,
  type SetTaskStatusInput,
  type SetTaskStatusOk,
} from "@/app/lib/ai/tools/set-task-status";
import type { ToolResult } from "@/app/lib/ai/tools/tool-result";
import type { Actor } from "@/app/lib/auth/actor";
import { Role, Sex, TaskCategory, TaskStatus } from "@/prisma/generated/enums";

type Fixture = Awaited<ReturnType<typeof createFixture>>;

// `execute`'s declared return type includes the streaming-tool
// `AsyncIterable` branch that `tool()` allows in general; this tool always
// returns a plain result, never a generator, so this narrows what TS sees.
async function runExecute(
  input: SetTaskStatusInput,
  options: {
    context: Actor;
    toolCallId: string;
    messages: ModelMessage[];
  },
): Promise<ToolResult<{ result: SetTaskStatusOk }>> {
  const result = await setTaskStatusTool.execute!(input, options);
  if (Symbol.asyncIterator in Object(result)) {
    throw new Error("setTaskStatusTool.execute unexpectedly streamed");
  }
  return result as ToolResult<{ result: SetTaskStatusOk }>;
}

async function createFixture() {
  const tag = randomUUID().slice(0, 8);

  const actor = await prisma.person.create({
    data: { name: `Approval Actor ${tag}` },
    select: { id: true },
  });
  const species = await prisma.species.create({
    data: { name: `Approval Species ${tag}` },
    select: { id: true },
  });
  const color = await prisma.color.create({
    data: { name: `Approval Color ${tag}` },
    select: { id: true },
  });
  const animal = await prisma.animal.create({
    data: {
      name: `Approval Animal ${tag}`,
      birthDate: new Date("2020-01-01"),
      sex: Sex.UNKNOWN,
      speciesId: species.id,
      primaryColorId: color.id,
    },
    select: { id: true },
  });
  const task = await prisma.task.create({
    data: {
      title: `Approval Task ${tag}`,
      category: TaskCategory.ADMINISTRATIVE,
      status: TaskStatus.TODO,
      animalId: animal.id,
      createdById: actor.id,
    },
    select: { id: true },
  });

  return {
    tag,
    actorId: actor.id,
    animalId: animal.id,
    speciesId: species.id,
    colorId: color.id,
    taskId: task.id,
  };
}

async function destroyFixture(f: Fixture) {
  await prisma.aiActionLog.deleteMany({ where: { targetId: f.taskId } });
  await prisma.animalActivityLog.deleteMany({ where: { animalId: f.animalId } });
  await prisma.task.deleteMany({ where: { animalId: f.animalId } });
  await prisma.animal.delete({ where: { id: f.animalId } });
  await prisma.species.delete({ where: { id: f.speciesId } });
  await prisma.color.delete({ where: { id: f.colorId } });
  await prisma.person.delete({ where: { id: f.actorId } });
}

function actorFor(f: Fixture): Actor {
  return { userId: f.actorId, personId: f.actorId, role: Role.STAFF };
}

// Mirrors what the SDK hands `execute` on a replay turn: an assistant message
// carrying the signed `tool-approval-request` part for this tool call.
function messagesWithApproval(
  toolCallId: string,
  approvalId: string,
): ModelMessage[] {
  return [
    {
      role: "assistant",
      content: [{ type: "tool-approval-request", approvalId, toolCallId }],
    },
  ];
}

const logsFor = (approvalId: string) =>
  prisma.aiActionLog.findMany({ where: { approvalId } });

const statusOf = (taskId: string) =>
  prisma.task
    .findUniqueOrThrow({ where: { id: taskId }, select: { status: true } })
    .then((t) => t.status);

after(() => prisma.$disconnect());

test("a replayed approval is refused and rolls back, leaving one AiActionLog row", async () => {
  const f = await createFixture();
  try {
    const toolCallId = `call-${f.tag}`;
    const approvalId = `approval-${f.tag}`;
    const messages = messagesWithApproval(toolCallId, approvalId);
    const input = { taskId: f.taskId, status: TaskStatus.DONE };

    const first = await runExecute(input, {
      context: actorFor(f),
      toolCallId,
      messages,
    });
    assert.equal(first.ok, true);
    assert.equal(await statusOf(f.taskId), TaskStatus.DONE);
    assert.equal((await logsFor(approvalId)).length, 1);

    // A colleague reopens the task, independent of the AI write.
    await prisma.task.update({
      where: { id: f.taskId },
      data: { status: TaskStatus.TODO },
    });

    const replay = await runExecute(input, {
      context: actorFor(f),
      toolCallId,
      messages,
    });
    assert.equal(replay.ok, false);
    assert.match(
      "reason" in replay ? replay.reason : "",
      /already been used/i,
    );

    // The write and its rollback both ran inside the same transaction — the
    // reopen from the previous step is what's left standing.
    assert.equal(await statusOf(f.taskId), TaskStatus.TODO);
    assert.equal((await logsFor(approvalId)).length, 1);
  } finally {
    await destroyFixture(f);
  }
});

test("a missing approval id is refused before any write", async () => {
  const f = await createFixture();
  try {
    const toolCallId = `call-${f.tag}`;
    const input = { taskId: f.taskId, status: TaskStatus.DONE };

    // No tool-approval-request part anywhere in the history.
    const result = await runExecute(input, {
      context: actorFor(f),
      toolCallId,
      messages: [{ role: "user", content: "mark it done" }],
    });

    assert.equal(result.ok, false);
    assert.match(
      "reason" in result ? result.reason : "",
      /no approval was found/i,
    );
    assert.equal(await statusOf(f.taskId), TaskStatus.TODO);
    assert.equal(
      (
        await prisma.aiActionLog.findMany({ where: { targetId: f.taskId } })
      ).length,
      0,
    );
  } finally {
    await destroyFixture(f);
  }
});

test("a single valid approval writes the task, activity log, and action log", async () => {
  const f = await createFixture();
  try {
    const toolCallId = `call-${f.tag}`;
    const approvalId = `approval-${f.tag}`;
    const input = { taskId: f.taskId, status: TaskStatus.DONE };

    const result = await runExecute(input, {
      context: actorFor(f),
      toolCallId,
      messages: messagesWithApproval(toolCallId, approvalId),
    });

    assert.equal(result.ok, true);
    assert.equal(await statusOf(f.taskId), TaskStatus.DONE);

    const activityLogs = await prisma.animalActivityLog.findMany({
      where: { animalId: f.animalId },
    });
    assert.equal(activityLogs.length, 1);

    const actionLogs = await logsFor(approvalId);
    assert.equal(actionLogs.length, 1);
    assert.equal(actionLogs[0].toolCallId, toolCallId);
    assert.equal(actionLogs[0].actorId, f.actorId);
  } finally {
    await destroyFixture(f);
  }
});
