import { prisma } from "@/app/lib/prisma";
import { Prisma, Role, TaskCategory, TaskStatus } from "@prisma/client";
import { AnimalTasksSchema } from "../../zod-schemas/animal.schemas";
import { RequirePermission } from "../../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
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
  inputAnimalId: string
): Promise<{ tasks: FetchAnimalTasksPayload[]; totalPages: number; totalRows: number }> => {
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

  const orderBy: Prisma.TaskOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" }; // Default sort
    const [id, dir] = sort.split(".");
    return { [id]: dir === "desc" ? "desc" : "asc" };
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
  Permissions.ANIMAL_TASK_CREATE
)(_fetchTaskAssigneeList);

export const fetchAnimalTasks = RequirePermission(
  Permissions.ANIMAL_TASK_READ_LISTING
)(_fetchAnimalTasks);