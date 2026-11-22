// What an animal's tasks do when it leaves the shelter and when the outcome
// that took it out is reversed. Runs via `npm run test:db`: the rules are about
// which rows are written, refused and logged, and one of them is about a lock.
//
// The services driven here are the whole of their actions bar the session
// check and the cache invalidation: `recordOutcome`, `recordFosterConversion`,
// `recordOutcomeReversal`, `recordReIntake`, `recordTaskCreation` and
// `applyTaskStatusChange`.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  IntakeType,
  OutcomeType,
  PartnerType,
  Sex,
  TaskCategory,
  TaskStatus,
} from "@/prisma/generated/enums";
import { recordOutcome } from "@/app/lib/services/outcome-recording";
import { recordFosterConversion } from "@/app/lib/services/foster-conversion";
import { recordOutcomeReversal } from "@/app/lib/services/outcome-reversal";
import { recordReIntake } from "@/app/lib/services/intake-recording";
import {
  ANIMAL_LEFT_TASK_MESSAGE,
  countTasksStillToDo,
} from "@/app/lib/services/outcome-tasks";
import { recordTaskCreation } from "@/app/lib/tasks/record-task-creation";
import { applyTaskStatusChange } from "@/app/lib/tasks/apply-task-status-change";
import { applyAiTaskUndo } from "@/app/lib/tasks/undo-ai-task-change";
import { OutcomeFormSchema } from "@/app/lib/zod-schemas/outcome.schema";
import { ReIntakeFormSchema } from "@/app/lib/zod-schemas/intake.schema";
import {
  ConflictError,
  PreconditionFailedError,
  TimelineOrderError,
} from "@/app/lib/utils/errors";

const runId = Date.now().toString(36);
const REASON = "Recorded against the wrong animal.";

let speciesId: string;
let colorId: string;
let staffId: string;
let adminId: string;
let fosterPersonId: string;
let fosterProfileId: string;
let partnerId: string;

before(async () => {
  const person = async (name: string) =>
    (
      await prisma.person.create({
        data: { name: `${name} ${runId}` },
        select: { id: true },
      })
    ).id;
  speciesId = (
    await prisma.species.create({
      data: { name: `Outcome tasks species ${runId}` },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `Outcome tasks color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Outcome tasks staff");
  adminId = await person("Outcome tasks admin");
  fosterPersonId = await person("Outcome tasks foster");
  partnerId = (
    await prisma.partner.create({
      data: {
        name: `Outcome tasks partner ${runId}`,
        type: PartnerType.RESCUE_GROUP,
      },
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
  await prisma.fosterPlacement.deleteMany({ where: { fosterProfileId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.outcome.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the tasks and the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.partner.deleteMany({ where: { id: partnerId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, adminId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

/** An animal in care since Aug 1, listed as given. */
const makeAnimal = async (
  label: string,
  listingStatus: AnimalListingStatus = AnimalListingStatus.PUBLISHED,
) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus,
        intake: {
          create: {
            type: IntakeType.STRAY,
            intakeDate: "2026-08-01",
            staffMemberId: staffId,
          },
        },
      },
      select: { id: true },
    })
  ).id;

/** A task on the animal, written directly, in the given status. */
const addTask = async (animalId: string, title: string, status: TaskStatus) =>
  (
    await prisma.task.create({
      data: {
        title,
        status,
        category: TaskCategory.MEDICAL,
        animalId,
        createdById: staffId,
      },
      select: { id: true },
    })
  ).id;

/** One task in every status, titled after it. */
const addTaskInEveryStatus = async (animalId: string) => {
  for (const status of Object.values(TaskStatus)) {
    await addTask(animalId, status, status);
  }
};

const transferOut = (animalId: string, outcomeDate = "2026-09-01") =>
  prisma.$transaction((tx) =>
    recordOutcome(
      tx,
      {
        animalId,
        values: OutcomeFormSchema.parse({
          outcomeType: OutcomeType.TRANSFER_OUT,
          outcomeDate,
          destinationPartnerId: partnerId,
          ownerId: "",
          notes: "",
        }),
      },
      staffId,
    ),
  );

const latestOutcomeId = async (animalId: string) =>
  (
    await prisma.outcome.findFirstOrThrow({
      where: { animalId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
  ).id;

const reverse = (outcomeId: string) =>
  prisma.$transaction((tx) =>
    recordOutcomeReversal(tx, outcomeId, REASON, adminId),
  );

const reIntake = (animalId: string, intakeDate: string) =>
  prisma.$transaction((tx) =>
    recordReIntake(
      tx,
      {
        animalId,
        values: ReIntakeFormSchema.parse({
          intakeType: IntakeType.SEIZE,
          intakeDate,
          notes: "",
        }),
      },
      staffId,
    ),
  );

/** Each task by title: its status and what links it to an outcome. */
const readTasks = async (animalId: string) => {
  const tasks = await prisma.task.findMany({
    where: { animalId },
    select: {
      id: true,
      title: true,
      status: true,
      canceledByOutcomeId: true,
      statusBeforeOutcome: true,
    },
  });
  return new Map(tasks.map((task) => [task.title, task]));
};

const taskRows = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId, activityType: AnimalActivityType.TASK_STATUS_CHANGED },
    select: { changeSummary: true, changedAt: true, changedById: true },
    orderBy: { changeSummary: "asc" },
  });

const STILL_TO_DO = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.ON_HOLD,
];
const SETTLED = [
  TaskStatus.DONE,
  TaskStatus.SKIPPED,
  TaskStatus.CANCELED,
  TaskStatus.DELETED,
];

test("recording an outcome cancels the tasks still to do, with a row each, and leaves settled ones alone", async () => {
  const animalId = await makeAnimal("Cancel on outcome");
  await addTaskInEveryStatus(animalId);
  assert.equal(await countTasksStillToDo(prisma, animalId), 3);

  const recorded = await transferOut(animalId);
  const outcomeId = await latestOutcomeId(animalId);

  assert.equal(recorded.canceledTaskCount, 3);
  const tasks = await readTasks(animalId);
  for (const status of STILL_TO_DO) {
    assert.deepEqual(
      {
        status: tasks.get(status)?.status,
        canceledByOutcomeId: tasks.get(status)?.canceledByOutcomeId,
        statusBeforeOutcome: tasks.get(status)?.statusBeforeOutcome,
      },
      {
        status: TaskStatus.CANCELED,
        canceledByOutcomeId: outcomeId,
        statusBeforeOutcome: status,
      },
      status,
    );
  }
  for (const status of SETTLED) {
    assert.equal(tasks.get(status)?.status, status, status);
    assert.equal(tasks.get(status)?.canceledByOutcomeId, null, status);
  }
  assert.equal(await countTasksStillToDo(prisma, animalId), 0);

  const rows = await taskRows(animalId);
  assert.deepEqual(
    rows.map((row) => row.changeSummary),
    [
      'Task "IN_PROGRESS" status changed from IN_PROGRESS to CANCELED: the animal left (transfer out).',
      'Task "ON_HOLD" status changed from ON_HOLD to CANCELED: the animal left (transfer out).',
      'Task "TODO" status changed from TODO to CANCELED: the animal left (transfer out).',
    ],
  );
  // Credited to whoever recorded the outcome, and shown above it in the feed.
  const outcomeRow = await prisma.animalActivityLog.findFirstOrThrow({
    where: { animalId, activityType: AnimalActivityType.OUTCOME_PROCESSED },
    select: { changedAt: true },
  });
  for (const row of rows) {
    assert.equal(row.changedById, staffId);
    assert.ok(row.changedAt > outcomeRow.changedAt);
  }
});

test("an outcome on an animal with nothing still to do cancels nothing and writes no task row", async () => {
  const animalId = await makeAnimal("Nothing to cancel");
  await addTask(animalId, "Done already", TaskStatus.DONE);

  const recorded = await transferOut(animalId);

  assert.equal(recorded.canceledTaskCount, 0);
  assert.equal((await readTasks(animalId)).get("Done already")?.status, TaskStatus.DONE);
  assert.equal((await taskRows(animalId)).length, 0);
});

test("a refused outcome leaves every task as it was", async () => {
  const animalId = await makeAnimal("Refused outcome");
  await addTask(animalId, "Still to do", TaskStatus.TODO);

  // Before the Aug 1 intake, so the timeline check refuses it.
  await assert.rejects(transferOut(animalId, "2026-07-01"), TimelineOrderError);

  const task = (await readTasks(animalId)).get("Still to do");
  assert.equal(task?.status, TaskStatus.TODO);
  assert.equal(task?.canceledByOutcomeId, null);
  assert.equal((await taskRows(animalId)).length, 0);
});

test("converting a foster-to-adopt placement cancels the animal's tasks still to do", async () => {
  const animalId = await makeAnimal(
    "Converted",
    AnimalListingStatus.PENDING_ADOPTION,
  );
  const placementId = (
    await prisma.fosterPlacement.create({
      data: {
        type: FosterPlacementType.FOSTER_TO_ADOPT,
        startDate: "2026-08-05",
        animalId,
        fosterProfileId,
        placedById: staffId,
        previousListingStatus: AnimalListingStatus.PUBLISHED,
      },
      select: { id: true },
    })
  ).id;
  await addTask(animalId, "Still to do", TaskStatus.IN_PROGRESS);
  await addTask(animalId, "Done already", TaskStatus.DONE);

  const converted = await prisma.$transaction((tx) =>
    recordFosterConversion(tx, { placementId }, staffId),
  );

  assert.equal(converted.canceledTaskCount, 1);
  const tasks = await readTasks(animalId);
  assert.equal(tasks.get("Still to do")?.status, TaskStatus.CANCELED);
  assert.equal(
    tasks.get("Still to do")?.canceledByOutcomeId,
    await latestOutcomeId(animalId),
  );
  assert.equal(tasks.get("Done already")?.status, TaskStatus.DONE);
  assert.deepEqual(
    (await taskRows(animalId)).map((row) => row.changeSummary),
    [
      'Task "Still to do" status changed from IN_PROGRESS to CANCELED: the animal left (adoption).',
    ],
  );
});

test("reversing the outcome puts each task back to the status it had, with a row each", async () => {
  const animalId = await makeAnimal("Reopen on reversal");
  await addTaskInEveryStatus(animalId);
  await transferOut(animalId);
  const outcomeId = await latestOutcomeId(animalId);
  const rowsBefore = (await taskRows(animalId)).length;

  const reversal = await reverse(outcomeId);

  assert.equal(reversal.reopenedTaskCount, 3);
  assert.match(reversal.effects, /3 tasks the outcome canceled were reopened\./);
  const tasks = await readTasks(animalId);
  for (const status of [...STILL_TO_DO, ...SETTLED]) {
    assert.equal(tasks.get(status)?.status, status, status);
    assert.equal(tasks.get(status)?.canceledByOutcomeId, null, status);
    assert.equal(tasks.get(status)?.statusBeforeOutcome, null, status);
  }
  assert.equal(await countTasksStillToDo(prisma, animalId), 3);

  const rows = await taskRows(animalId);
  const reopenRows = rows.filter((row) =>
    row.changeSummary?.endsWith("the outcome that canceled it was reversed."),
  );
  assert.equal(rows.length, rowsBefore + 3);
  assert.deepEqual(
    reopenRows.map((row) => row.changeSummary),
    [
      'Task "IN_PROGRESS" status changed from CANCELED to IN_PROGRESS: the outcome that canceled it was reversed.',
      'Task "ON_HOLD" status changed from CANCELED to ON_HOLD: the outcome that canceled it was reversed.',
      'Task "TODO" status changed from CANCELED to TODO: the outcome that canceled it was reversed.',
    ],
  );
  const reversalRow = await prisma.animalActivityLog.findFirstOrThrow({
    where: { animalId, activityType: AnimalActivityType.OUTCOME_REVERSED },
    select: { changedAt: true, changeSummary: true },
  });
  assert.match(reversalRow.changeSummary ?? "", /3 tasks the outcome canceled were reopened\./);
  for (const row of reopenRows) {
    assert.equal(row.changedById, adminId);
    assert.ok(row.changedAt > reversalRow.changedAt);
  }
});

test("a reversal leaves a task anyone changed since as they left it", async () => {
  const animalId = await makeAnimal("Changed since");
  const finishedId = await addTask(animalId, "Finished after", TaskStatus.TODO);
  const trashedId = await addTask(animalId, "Trashed after", TaskStatus.TODO);
  await addTask(animalId, "Untouched", TaskStatus.IN_PROGRESS);
  await transferOut(animalId);

  // Settling a canceled task is allowed on an animal that has left, and
  // unlinks it from the outcome.
  for (const [taskId, status] of [
    [finishedId, TaskStatus.DONE],
    [trashedId, TaskStatus.DELETED],
  ] as const) {
    await prisma.$transaction((tx) =>
      applyTaskStatusChange(tx, { taskId, status, changedById: staffId }),
    );
  }
  let tasks = await readTasks(animalId);
  assert.equal(tasks.get("Finished after")?.canceledByOutcomeId, null);
  assert.equal(tasks.get("Finished after")?.statusBeforeOutcome, null);

  const reversal = await reverse(await latestOutcomeId(animalId));

  assert.equal(reversal.reopenedTaskCount, 1);
  assert.match(reversal.effects, /1 task the outcome canceled was reopened\./);
  tasks = await readTasks(animalId);
  assert.equal(tasks.get("Finished after")?.status, TaskStatus.DONE);
  assert.equal(tasks.get("Trashed after")?.status, TaskStatus.DELETED);
  assert.equal(tasks.get("Untouched")?.status, TaskStatus.IN_PROGRESS);
});

test("a re-intake leaves the tasks canceled, and so does reversing the outcome after it", async () => {
  const animalId = await makeAnimal("Came back");
  await addTask(animalId, "Planned before leaving", TaskStatus.TODO);
  await transferOut(animalId);
  const outcomeId = await latestOutcomeId(animalId);

  await reIntake(animalId, "2026-09-10");

  let task = (await readTasks(animalId)).get("Planned before leaving");
  assert.equal(task?.status, TaskStatus.CANCELED);

  // The outcome no longer archives the animal, so the reversal leaves its
  // listing alone, and its tasks with it.
  const reversal = await reverse(outcomeId);

  assert.equal(reversal.reopenedTaskCount, 0);
  assert.match(reversal.effects, /The task it canceled stays canceled\./);
  task = (await readTasks(animalId)).get("Planned before leaving");
  assert.equal(task?.status, TaskStatus.CANCELED);

  // Back in care, staff can reopen it themselves, which unlinks it.
  await prisma.$transaction((tx) =>
    applyTaskStatusChange(tx, {
      taskId: task!.id,
      status: TaskStatus.TODO,
      changedById: staffId,
    }),
  );
  task = (await readTasks(animalId)).get("Planned before leaving");
  assert.equal(task?.status, TaskStatus.TODO);
  assert.equal(task?.canceledByOutcomeId, null);
});

test("while the animal is archived, no task can be added or reopened as still to do", async () => {
  const animalId = await makeAnimal("Left for good");
  const canceledId = await addTask(animalId, "Was to do", TaskStatus.TODO);
  await transferOut(animalId);

  for (const status of STILL_TO_DO) {
    await assert.rejects(
      prisma.$transaction((tx) =>
        recordTaskCreation(tx, {
          animalId,
          createdById: staffId,
          data: {
            title: `New ${status}`,
            status,
            category: TaskCategory.MEDICAL,
          },
        }),
      ),
      (error) =>
        error instanceof ConflictError &&
        error.message === ANIMAL_LEFT_TASK_MESSAGE,
      `create ${status}`,
    );
    await assert.rejects(
      prisma.$transaction((tx) =>
        applyTaskStatusChange(tx, {
          taskId: canceledId,
          status,
          changedById: staffId,
        }),
      ),
      ConflictError,
      `reopen to ${status}`,
    );
  }
  // A new task with no status is To Do, and refused too.
  await assert.rejects(
    prisma.$transaction((tx) =>
      recordTaskCreation(tx, {
        animalId,
        createdById: staffId,
        data: { title: "Default status", category: TaskCategory.MEDICAL },
      }),
    ),
    ConflictError,
  );

  const tasks = await readTasks(animalId);
  assert.equal(tasks.size, 1);
  assert.equal(tasks.get("Was to do")?.status, TaskStatus.CANCELED);
  assert.equal(
    await prisma.animalActivityLog.count({
      where: { animalId, activityType: AnimalActivityType.TASK_CREATED },
    }),
    0,
  );

  // A settled task can still be recorded, as a record of what was done.
  await prisma.$transaction((tx) =>
    recordTaskCreation(tx, {
      animalId,
      createdById: staffId,
      data: {
        title: "Done on the way out",
        status: TaskStatus.DONE,
        category: TaskCategory.MEDICAL,
      },
    }),
  );
  assert.equal(
    (await readTasks(animalId)).get("Done on the way out")?.status,
    TaskStatus.DONE,
  );
});

test("a task added while the outcome is being recorded waits for it, then is refused", async () => {
  const animalId = await makeAnimal("Added at the same moment");

  let outcomeWritten!: () => void;
  const written = new Promise<void>((resolve) => (outcomeWritten = resolve));
  let commit!: () => void;
  const committed = new Promise<void>((resolve) => (commit = resolve));

  // Holds the animal's lock, archived but not committed, until told to.
  const outcome = prisma.$transaction(
    async (tx) => {
      await recordOutcome(
        tx,
        {
          animalId,
          values: OutcomeFormSchema.parse({
            outcomeType: OutcomeType.TRANSFER_OUT,
            outcomeDate: "2026-09-01",
            destinationPartnerId: partnerId,
            ownerId: "",
            notes: "",
          }),
        },
        staffId,
      );
      outcomeWritten();
      await committed;
    },
    { timeout: 15_000 },
  );
  await written;

  // Without the lock this would read the animal as still in care, since the
  // archive is not committed, and add a task nothing would ever close.
  const creation = prisma.$transaction(
    (tx) =>
      recordTaskCreation(tx, {
        animalId,
        createdById: staffId,
        data: { title: "Racing", category: TaskCategory.MEDICAL },
      }),
    { timeout: 15_000 },
  );
  const settled = creation.then(
    () => "created",
    () => "refused",
  );
  // Still waiting on the lock.
  const early = await Promise.race([
    settled,
    new Promise((resolve) => setTimeout(() => resolve("waiting"), 300)),
  ]);
  assert.equal(early, "waiting");

  commit();
  await outcome;
  await assert.rejects(creation, ConflictError);
  assert.equal((await readTasks(animalId)).size, 0);
});

const setStatus = (taskId: string, status: TaskStatus) =>
  prisma.$transaction((tx) =>
    applyTaskStatusChange(tx, { taskId, status, changedById: staffId }),
  );

test("trashing a canceled task and taking it back out keeps it the outcome's, so a reversal reopens it", async () => {
  const animalId = await makeAnimal("Trashed and restored");
  const restoredId = await addTask(animalId, "Restored", TaskStatus.IN_PROGRESS);
  const settledId = await addTask(animalId, "Settled then canceled", TaskStatus.TODO);
  await transferOut(animalId);
  const outcomeId = await latestOutcomeId(animalId);

  // Move to Trash, then Undo.
  await setStatus(restoredId, TaskStatus.DELETED);
  await setStatus(restoredId, TaskStatus.CANCELED);
  // Marked done, then canceled again by hand: a decision staff made.
  await setStatus(settledId, TaskStatus.DONE);
  await setStatus(settledId, TaskStatus.CANCELED);

  let tasks = await readTasks(animalId);
  assert.equal(tasks.get("Restored")?.canceledByOutcomeId, outcomeId);
  assert.equal(tasks.get("Restored")?.statusBeforeOutcome, TaskStatus.IN_PROGRESS);
  assert.equal(tasks.get("Settled then canceled")?.canceledByOutcomeId, null);

  const reversal = await reverse(outcomeId);

  assert.equal(reversal.reopenedTaskCount, 1);
  tasks = await readTasks(animalId);
  assert.equal(tasks.get("Restored")?.status, TaskStatus.IN_PROGRESS);
  assert.equal(tasks.get("Settled then canceled")?.status, TaskStatus.CANCELED);
});

test("undoing the assistant's change waits for an outcome being recorded, then refuses as out of date", async () => {
  const animalId = await makeAnimal("Undo at the same moment");
  // The assistant reopened a done task: it left it To Do.
  const taskId = await addTask(animalId, "Reopened by the assistant", TaskStatus.TODO);

  let outcomeWritten!: () => void;
  const written = new Promise<void>((resolve) => (outcomeWritten = resolve));
  let commit!: () => void;
  const committed = new Promise<void>((resolve) => (commit = resolve));

  // Cancels the task, holding the animal's lock until told to commit.
  const outcome = prisma.$transaction(
    async (tx) => {
      await recordOutcome(
        tx,
        {
          animalId,
          values: OutcomeFormSchema.parse({
            outcomeType: OutcomeType.TRANSFER_OUT,
            outcomeDate: "2026-09-01",
            destinationPartnerId: partnerId,
            ownerId: "",
            notes: "",
          }),
        },
        staffId,
      );
      outcomeWritten();
      await committed;
    },
    { timeout: 15_000 },
  );
  await written;

  // Read before the lock, the task would still be To Do as the assistant left
  // it, and the undo would write Done over the outcome's cancel.
  const undo = prisma.$transaction(
    (tx) =>
      applyAiTaskUndo(tx, {
        taskId,
        restoreTo: TaskStatus.DONE,
        leftAt: { status: TaskStatus.TODO },
        actorId: staffId,
      }),
    { timeout: 15_000 },
  );
  const settled = undo.then(
    () => "undone",
    () => "refused",
  );
  const early = await Promise.race([
    settled,
    new Promise((resolve) => setTimeout(() => resolve("waiting"), 300)),
  ]);
  assert.equal(early, "waiting");

  commit();
  await outcome;
  await assert.rejects(undo, PreconditionFailedError);
  const task = (await readTasks(animalId)).get("Reopened by the assistant");
  assert.equal(task?.status, TaskStatus.CANCELED);
  assert.ok(task?.canceledByOutcomeId);
});
