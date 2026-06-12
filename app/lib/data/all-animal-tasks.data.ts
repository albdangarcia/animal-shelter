import { prisma } from "@/app/lib/prisma";
import { Prisma, TaskCategory, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { Permissions } from "@/app/lib/auth/permissions";
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

  // Handles sorting logic
  const orderBy: Prisma.TaskOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" }; // Default sort
    const [id, dir] = sort.split(".");
    return { [id]: dir === "desc" ? "desc" : "asc" };
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
    const [totalCount, tasks] = await prisma.$transaction([
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
  Permissions.ANIMAL_TASK_READ_LISTING,
)(_fetchAllAnimalsTasks);
