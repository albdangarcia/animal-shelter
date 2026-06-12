import { prisma } from "@/app/lib/prisma";
import { Prisma, Role } from "@prisma/client";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { UsersParamsSchema } from "../zod-schemas/user.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
import { UsersPayload, UserByIdPayload } from "../types";

const _fetchUsers = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  roleInput: string | undefined,
  pageSizeInput: number,
): Promise<{
  users: UsersPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  // Parse and validate all arguments
  const validatedArgs = UsersParamsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    role: roleInput,
    pageSize: pageSizeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching users.");
  }
  const { query, currentPage, sort, role, pageSize } = validatedArgs.data;

  const offset = (currentPage - 1) * pageSize;

  // Dynamically set the sorting order
  const orderBy: Prisma.UserOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" }; // Default sort
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "email":
        return { email: dir };
      case "role":
        return { role: dir };
      case "createdAt":
        return { createdAt: dir };
      default:
        return { createdAt: "desc" };
    }
  })();

  // Define the base where clause for filtering
  const whereClause: Prisma.UserWhereInput = {
    email: {
      contains: query,
      mode: "insensitive",
    },
    // Exclude admins from the general user list by default
    role: {
      not: Role.ADMIN,
    },
  };

  // If a specific role is provided for filtering, apply it
  if (role && Object.values(Role).includes(role as Role)) {
    whereClause.role = role as Role;
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

const _fetchUserById = async (id: string): Promise<UserByIdPayload | null> => {
  // Validate the id
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid User ID format.");
  }
  const validatedId = parsedId.data;

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: validatedId,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });
    return user;
  } catch (error) {
    console.error("Error fetching user.", error);
    throw new Error("Error fetching user.");
  }
};

export const fetchUsers = RequirePermission(Permissions.MANAGE_ROLES)(
  _fetchUsers,
);

export const fetchUserById = RequirePermission(Permissions.MANAGE_ROLES)(
  _fetchUserById,
);
