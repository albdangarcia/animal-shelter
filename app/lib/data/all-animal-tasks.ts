// The all-animals Tasks list's query. No auth or `next/*` imports, so
// database tests can call it; `all-animal-tasks.data.ts` wraps it with the
// permission check.
import { z } from "zod";
import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import type { TaskCategory, TaskStatus } from "@/prisma/generated/enums";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { TASK_DUE_OPTIONS, type TaskDue } from "@/app/lib/constants/task-due";
import { pageSizeSchema } from "../zod-schemas/common.schemas";
import { animalNotArchived } from "./animals/not-archived";

type Db = typeof prisma;

const isTaskDue = (value: string): value is TaskDue =>
  TASK_DUE_OPTIONS.some((option) => option.value === value);

/**
 * The due-date condition for the picked choices, or none when nothing known
 * is picked. A value the filter doesn't offer (a hand-edited address) is
 * ignored. `dueDate` is a `yyyy-MM-dd` string, so `lt`/`gt` against today
 * compare calendar days.
 */
export const taskDueWhere = (
  due: string | undefined,
  today: CalendarDay,
): Prisma.TaskWhereInput | undefined => {
  const picked = new Set((due ?? "").split(",").filter(isTaskDue));
  if (picked.size === 0) return undefined;
  const byChoice: Record<TaskDue, Prisma.TaskWhereInput> = {
    overdue: { dueDate: { lt: today } },
    today: { dueDate: today },
    later: { dueDate: { gt: today } },
    none: { dueDate: null },
  };
  return { OR: [...picked].map((choice) => byChoice[choice]) };
};

const AllAnimalsTasksSchema = z.object({
  query: z.string(),
  currentPage: z.int().positive(),
  category: z.string().optional(),
  status: z.string().optional(),
  due: z.string().optional(),
  // Leave out the tasks of animals that have left the shelter (listing status
  // ARCHIVED): what the dashboard's "tasks due or overdue" count leaves out.
  hideLeft: z.boolean().optional(),
  pageSize: pageSizeSchema,
  sort: z.string().optional(),
});

export type AllAnimalsTasksArgs = z.input<typeof AllAnimalsTasksSchema>;

const allAnimalsTaskSelect = {
  id: true,
  title: true,
  details: true,
  status: true,
  priority: true,
  category: true,
  dueDate: true,
  animal: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  createdAt: true,
} satisfies Prisma.TaskSelect;

export type AllAnimalsTasksPayload = Prisma.TaskGetPayload<{
  select: typeof allAnimalsTaskSelect;
}>;

// An array, always ending in `id`: `dueDate` holds a calendar day, so two
// tasks due the same day tie, and without a final tie-break the database is
// free to return a tied row on two different pages of this offset pagination
// — or on neither.
const orderByFor = (
  sort: string | undefined,
): Prisma.TaskOrderByWithRelationInput[] => {
  const withId = (
    order: Prisma.TaskOrderByWithRelationInput,
  ): Prisma.TaskOrderByWithRelationInput[] => [order, { id: "asc" }];

  if (!sort) return withId({ createdAt: "desc" }); // Default sort

  const [id, dir] = sort.split(".");
  const direction: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  if (id === "animal_id") {
    return withId({ animal: { name: direction } });
  }
  if (id === "assignee") {
    return withId({ assignee: { name: direction } });
  }

  // Only these scalar fields can be passed straight through to Prisma.
  const sortableFields = new Set([
    "title",
    "status",
    "category",
    "priority",
    "dueDate",
    "createdAt",
  ]);
  if (sortableFields.has(id)) {
    return withId({ [id]: direction });
  }

  return withId({ createdAt: "desc" });
};

export type ValidAllAnimalsTasksArgs = z.output<typeof AllAnimalsTasksSchema>;

/** The list's arguments, checked; throws on a bad page or page size. */
export const parseAllAnimalsTasksArgs = (
  args: AllAnimalsTasksArgs,
): ValidAllAnimalsTasksArgs => {
  const validatedArgs = AllAnimalsTasksSchema.safeParse(args);
  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching all tasks.");
  }
  return validatedArgs.data;
};

/** One page of every animal's tasks, filtered as the list's address says. */
export const findAllAnimalsTasks = async (
  db: Db,
  args: ValidAllAnimalsTasksArgs,
  today: CalendarDay,
): Promise<{
  tasks: AllAnimalsTasksPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const { query, currentPage, category, status, due, hideLeft, pageSize, sort } =
    args;

  const dueWhere = taskDueWhere(due, today);
  const whereClause: Prisma.TaskWhereInput = {
    title: { contains: query, mode: "insensitive" },
    ...(category && {
      category: { in: category.split(",") as TaskCategory[] },
    }),
    ...(status && {
      status: { in: status.split(",") as TaskStatus[] },
    }),
    ...dueWhere,
    ...(hideLeft && { animal: animalNotArchived }),
  };

  const offset = (currentPage - 1) * pageSize;
  const [totalCount, tasks] = await Promise.all([
    db.task.count({ where: whereClause }),
    db.task.findMany({
      where: whereClause,
      select: allAnimalsTaskSelect,
      orderBy: orderByFor(sort),
      take: pageSize,
      skip: offset,
    }),
  ]);

  return {
    tasks,
    totalPages: Math.ceil(totalCount / pageSize),
    totalRows: totalCount,
  };
};
