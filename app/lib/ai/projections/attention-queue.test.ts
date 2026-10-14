import { test } from "node:test";
import assert from "node:assert/strict";
import { toAttentionQueueView } from "./attention-queue";
import type { AttentionQueueItem } from "@/app/lib/data/animals/attention-queue";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { MedicalEntryKind, TaskPriority } from "@/prisma/generated/enums";

const TODAY = calendarDay("2026-08-28");

const withTask = (dueDate: string): AttentionQueueItem => ({
  animalId: "a1",
  name: "Frisco",
  species: "Dog",
  currentUnit: "Dog block A · A-1",
  reasons: [
    {
      kind: "TASK_DUE",
      taskId: "t1",
      title: "Nail trim",
      dueDate: calendarDay(dueDate),
      priority: TaskPriority.HIGH,
    },
  ],
});

const overdueFlag = (item: AttentionQueueItem) => {
  const reason = toAttentionQueueView([item], TODAY)[0].reasons[0];
  assert.equal(reason.kind, "TASK_DUE");
  return reason.kind === "TASK_DUE" ? reason.overdue : undefined;
};

test("a task due before today is overdue", () => {
  assert.equal(overdueFlag(withTask("2026-08-20")), true);
});

test("a task due today is not overdue", () => {
  // The boundary that matters: today's work is not a backlog item, however
  // late in the day the queue is read.
  assert.equal(overdueFlag(withTask("2026-08-28")), false);
});

test("a task due the day before today is overdue", () => {
  assert.equal(overdueFlag(withTask("2026-08-27")), true);
});

test("a task due after today is not overdue", () => {
  assert.equal(overdueFlag(withTask("2026-08-29")), false);
});

test("the due date reaches the model as the day it is, not an instant", () => {
  // The model reads this against the day in the system prompt. Sending an
  // instant would make it a different day for part of every evening.
  const reason = toAttentionQueueView([withTask("2026-08-20")], TODAY)[0]
    .reasons[0];
  assert.equal(reason.kind, "TASK_DUE");
  if (reason.kind !== "TASK_DUE") return;
  assert.equal(reason.dueDate, "2026-08-20");
});

const withMedical = (dueDate: string): AttentionQueueItem => ({
  animalId: "a3",
  name: "Fido",
  species: "Dog",
  currentUnit: "Medical wing · MED-1",
  reasons: [
    {
      kind: "MEDICAL_DUE",
      entryId: "e1",
      itemName: "DHPP",
      entryKind: MedicalEntryKind.VACCINE,
      dueDate: calendarDay(dueDate),
    },
  ],
});

test("medical care due before today is overdue, and due today is not", () => {
  const view = (dueDate: string) =>
    toAttentionQueueView([withMedical(dueDate)], TODAY)[0].reasons[0];
  assert.deepEqual(view("2026-08-27"), {
    kind: "MEDICAL_DUE",
    entryId: "e1",
    itemName: "DHPP",
    entryKind: MedicalEntryKind.VACCINE,
    dueDate: "2026-08-27",
    overdue: true,
  });
  assert.equal(
    (view("2026-08-28") as { overdue?: boolean }).overdue,
    false,
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
        reasons: [
          {
            kind: "CARE_UNPLANNED",
            episodeId: "episode-1",
            episodeType: "HOSPITALISED_OFF_SITE",
            startDate: calendarDay("2026-08-20"),
          },
        ],
      },
    ],
    TODAY,
  );
  // The episode's id stays on the server; the model gets what and since when.
  assert.deepEqual(view[0].reasons[0], {
    kind: "CARE_UNPLANNED",
    episodeType: "HOSPITALISED_OFF_SITE",
    startDate: "2026-08-20",
  });
});
