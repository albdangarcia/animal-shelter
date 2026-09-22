import prisma from "@/app/lib/prisma";
import {
  Role,
  type TaskCategory,
  type TaskStatus,
} from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import { AnimalTasksSchema } from "../../zod-schemas/animal.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { TaskAssignee } from "../../types";

export type FetchAnimalTasksPayload = Prisma.TaskGetPayload<{
  select: {
    id: true;
    title: true;
    details: true;
    status: true;
    priority: true;
    category: true;
    dueDate: true;
    assignee: { select: { id: true; name: true } };
    createdAt: true;
  };
}>;

const _fetchAnimalTasks = async (
  queryInput: string,
  currentPageInput: number,
  categoryInput: string | undefined,
  statusInput: string | undefined,
  pageSizeInput: number,
  sortInput: string | undefined,
  inputAnimalId: string,
): Promise<{
  tasks: FetchAnimalTasksPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = AnimalTasksSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    category: categoryInput,
    status: statusInput,
    pageSize: pageSizeInput,
    sort: sortInput,
    animalId: inputAnimalId,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching tasks.");
  }

  const { query, currentPage, category, status, pageSize, sort, animalId } =
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

    if (id === "assignee") {
      return withId({ assignee: { name: direction } });
    }

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

  // The where clause is updated to filter by animalId if it's provided
  const whereClause: Prisma.TaskWhereInput = {
    ...(animalId && { animalId: animalId }),
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
    console.error("Error fetching tasks:", error);
    throw new Error("Error fetching tasks.");
  }
};

const _fetchTaskAssigneeList = async (): Promise<TaskAssignee[]> => {
  try {
    const assignees = await prisma.person.findMany({
      where: {
        // Filter based on the role of the associated User
        user: {
          role: {
            in: [Role.STAFF, Role.ADMIN, Role.VOLUNTEER],
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        user: {
          select: {
            image: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
    const mappedList = assignees.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      image: person.user?.image,
    }));
    return mappedList;
  } catch (error) {
    console.error("Error fetching assignee list:", error);
    throw new Error("Failed to fetch assignee list.");
  }
};

export const fetchTaskAssigneeList = RequirePermission(
  AppPermissions.ANIMAL_TASK_MANAGE,
)(_fetchTaskAssigneeList);

export const fetchAnimalTasks = RequirePermission(
  AppPermissions.ANIMAL_TASK_READ,
)(_fetchAnimalTasks);
