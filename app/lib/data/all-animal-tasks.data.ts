import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import type { TaskCategory, TaskStatus } from "@/prisma/generated/enums";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../auth/protected-actions";
import { pageSizeSchema } from "../zod-schemas/common.schemas";

const AllAnimalsTasksSchema = z.object({
  query: z.string(),
  currentPage: z.int().positive(),
  category: z.string().optional(),
  status: z.string().optional(),
  pageSize: pageSizeSchema,
  sort: z.string().optional(),
});

export type AllAnimalsTasksPayload = Prisma.TaskGetPayload<{
  select: {
    id: true;
    title: true;
    details: true;
    status: true;
    priority: true;
    category: true;
    dueDate: true;
    animal: { select: { id: true; name: true } };
    assignee: { select: { id: true; name: true } };
    createdAt: true;
  };
}>;

const _fetchAllAnimalsTasks = async (
  queryInput: string,
  currentPageInput: number,
  categoryInput: string | undefined,
  statusInput: string | undefined,
  pageSizeInput: number,
  sortInput: string | undefined,
): Promise<{
  tasks: AllAnimalsTasksPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = AllAnimalsTasksSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    category: categoryInput,
    status: statusInput,
    pageSize: pageSizeInput,
    sort: sortInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching all tasks.");
  }

  const { query, currentPage, category, status, pageSize, sort } =
    validatedArgs.data;

  // An array, always ending in `id`: `dueDate` holds a calendar day, so two
  // tasks due the same day tie, and without a final tie-break the database is
  // free to return a tied row on two different pages of this offset pagination
  // — or on neither.
  const orderBy: Prisma.TaskOrderByWithRelationInput[] = (() => {
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
  })();

  // The 'where' clause for filtering, without the animalId constraint
  const whereClause: Prisma.TaskWhereInput = {
    title: { contains: query, mode: "insensitive" },
    ...(category && {
      category: { in: category.split(",") as TaskCategory[] },
    }),
    ...(status && {
      status: { in: status.split(",") as TaskStatus[] },
    }),
  };

  try {
    const offset = (currentPage - 1) * pageSize;
    const [totalCount, tasks] = await Promise.all([
      prisma.task.count({ where: whereClause }),
      prisma.task.findMany({
        where: whereClause,
        select: {
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
        },
        orderBy: orderBy,
        take: pageSize,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return { tasks, totalPages, totalRows: totalCount };
  } catch (error) {
    console.error("Error fetching all tasks:", error);
    throw new Error("Error fetching all tasks.");
  }
};

export const fetchAllAnimalsTasks = RequirePermission(
  AppPermissions.ANIMAL_TASK_READ,
)(_fetchAllAnimalsTasks);
