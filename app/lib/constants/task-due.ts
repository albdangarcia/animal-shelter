/**
 * The all-animals Tasks list's Due filter choices, by where a task's due date
 * falls against the shelter's today. The dashboard's "tasks due or overdue"
 * links to `overdue,today`, which is the same rule its count uses. No imports,
 * so the toolbar (a client component) can read it without pulling in the
 * query module.
 */
export const TASK_DUE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "later", label: "Due later" },
  { value: "none", label: "No due date" },
] as const;

export type TaskDue = (typeof TASK_DUE_OPTIONS)[number]["value"];
