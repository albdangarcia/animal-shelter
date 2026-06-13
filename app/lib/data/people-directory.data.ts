import { prisma } from "@/app/lib/prisma";
import { PersonType, Prisma, Role } from "@prisma/client";
import { RequirePermission } from "../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
import { PeopleDirectoryParamsSchema } from "../zod-schemas/people-directory.schemas";
import { PeopleDirectoryPayload } from "../types";

const _fetchPeople = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  pageSizeInput: number,
  typeInput: string | undefined,
): Promise<{
  people: PeopleDirectoryPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = PeopleDirectoryParamsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    pageSize: pageSizeInput,
    type: typeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching people.");
  }
  const { query, currentPage, sort, pageSize, type } = validatedArgs.data;

  const offset = (currentPage - 1) * pageSize;

  // Dynamically set the sorting order
  const orderBy: Prisma.PersonOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "name":
        return { name: dir };
      case "email":
        return { email: dir };
      case "phone":
        return { phone: dir };
      case "city":
        return { city: dir };
      case "state":
        return { state: dir };
      default:
        return { createdAt: "desc" };
    }
  })();

  const whereClause: Prisma.PersonWhereInput = {
    AND: [
      // Include walk-in contacts with no account (user: null), and any
      // registered account except ADMIN. Staff/volunteers are intentionally
      // included since they may appear as finders/surrenderers via Intake.
      {
        OR: [{ user: null }, { user: { role: { not: Role.ADMIN } } }],
      },
      {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ],
      },
    ],
  };

  // If specific types are selected (and it's not "all of them"), apply the filter
  const allPersonTypes = Object.values(PersonType);
  if (type && type.length > 0 && type.length < allPersonTypes.length) {
    whereClause.AND = [
      ...(whereClause.AND as Prisma.PersonWhereInput[]),
      { type: { in: type } },
    ];
  }

  try {
    const [totalRows, people] = await prisma.$transaction([
      prisma.person.count({ where: whereClause }),
      prisma.person.findMany({
        where: whereClause,
        orderBy,
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          name: true,
          type: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalRows / pageSize);

    return { people, totalPages, totalRows };
  } catch (error) {
    console.error("Error fetching people.", error);
    throw new Error("Error fetching people.");
  }
};

export const fetchPeople = RequirePermission(Permissions.PERSONS_READ_LISTING)(
  _fetchPeople,
);
