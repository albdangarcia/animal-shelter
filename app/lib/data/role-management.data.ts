import { prisma } from "@/app/lib/prisma";
import { Prisma, Role } from "@prisma/client";
import { UsersRoleParamsSchema } from "../zod-schemas/role-management.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
import { RoleManagementPayload } from "../types";

const _fetchUserRoles = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  roleInput: string | undefined,
  pageSizeInput: number,
  statusInput: string | undefined,
): Promise<{
  users: RoleManagementPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  // Parse and validate all arguments
  const validatedArgs = UsersRoleParamsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    role: roleInput,
    pageSize: pageSizeInput,
    status: statusInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching users.");
  }
  const { query, currentPage, sort, role, pageSize, status } =
    validatedArgs.data;

  const offset = (currentPage - 1) * pageSize;

  // Dynamically set the sorting order
  const orderBy: Prisma.UserOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "email":
        return { email: dir };
      case "role":
        return { role: dir };
      case "person":
        return { person: { name: dir } };
      case "deactivatedAt":
        return { deactivatedAt: dir };
      case "createdAt":
        return { createdAt: dir };
      default:
        return { createdAt: "desc" };
    }
  })();

  // Define the base where clause for filtering
  const whereClause: Prisma.UserWhereInput = {
    // Exclude admins globally
    role: {
      not: Role.ADMIN,
    },
    OR: [
      {
        email: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        person: {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
    ],
  };

  // If specific roles are provided for filtering, apply them
  if (role && role.length > 0) {
    const filteredRoles = role.filter((r) => r !== Role.ADMIN) as Role[];
    if (filteredRoles.length > 0) {
      whereClause.role = { in: filteredRoles };
    }
  }

  if (status && status.length === 1) {
    whereClause.deactivatedAt = status[0] === "active" ? null : { not: null };
  }

  // Fetch count and users in a single database transaction for efficiency
  try {
    const [count, users] = await prisma.$transaction([
      prisma.user.count({ where: whereClause }),
      prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          image: true,
          role: true,
          createdAt: true,
          deactivatedAt: true,
          // lastLogin: true, // future prisma schema modification
          person: {
            select: {
              name: true,
            },
          },
        },
        orderBy: orderBy,
        take: pageSize,
        skip: offset,
      }),
    ]);

    // Calculate the total number of pages
    const totalPages = Math.ceil(count / pageSize);

    return { users, totalPages, totalRows: count };
  } catch (error) {
    console.error("Error fetching users.", error);
    throw new Error("Error fetching users.");
  }
};

export const fetchUserRoles = RequirePermission(Permissions.MANAGE_ROLES)(
  _fetchUserRoles,
);
