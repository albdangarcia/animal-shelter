import type { TaskStatus } from "@/prisma/generated/enums";

/**
 * The reason string shown on the approval card, kept in a Prisma-free module so
 * it stays unit-testable (the test runner loads no env, so anything importing
 * the data layer cannot be tested).
 *
 * Built from database facts, not from `part.input` or model prose (applied
 * to writes): the person approving must see what will actually happen, so this
 * states the task's real title, the animal, the unit, and — the tell that it is
 * server-resolved — the task's *current* status, which the model never supplied.
 */
export function buildApprovalReason(facts: {
  taskTitle: string;
  animalName: string;
  unitLabel: string | null;
  currentStatus: TaskStatus;
  requestedStatus: TaskStatus;
}): string {
  const where = facts.unitLabel ? ` (${facts.unitLabel})` : "";
  return (
    `Mark "${facts.taskTitle}" on ${facts.animalName}${where} as ` +
    `${facts.requestedStatus}. Currently ${facts.currentStatus}.`
  );
}

/** `${location} · ${unit}`, matching the animal-summary projection's format. */
export function formatUnitLabel(
  unit: { name: string; location: { name: string } } | null,
): string | null {
  return unit ? `${unit.location.name} · ${unit.name}` : null;
}
