import { unstable_noStore as noStore } from "next/cache";
import prisma from "@/app/lib/prisma";
import { ITEMS_PER_PAGE } from "@/app/lib/constants";
import { rolesWithPermission } from "@/app/lib/actions/authorization";
import { z } from "zod";
import { idSchema } from "../../schemas/common";

// Define a schema for fetchFilteredUsers
const fetchFilteredUsersSchema = z.object({
  parsedQuery: z.string(),
  parsedCurrentPage: z.number(),
});

// Define a schema for fetchUserPages
const fetchUserPagesSchema = z.string();

export async function fetchFilteredUsers(query: string, currentPage: number) {
  // Disable caching for this function
  noStore();

  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin"]);
  if (!hasPermission) {
    throw new Error("Access Denied");
  }

  // Parse the query and currentPage
  const parsedData = fetchFilteredUsersSchema.safeParse({
    parsedQuery: query,
    parsedCurrentPage: currentPage,
  });
  if (!parsedData.success) {
    throw new Error("Invalid type.");
  }
  const { parsedQuery, parsedCurrentPage } = parsedData.data;

  // page offset
  const offset = (parsedCurrentPage - 1) * ITEMS_PER_PAGE;

  // fetch the users
  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: parsedQuery,
          mode: "insensitive",
        },
        role: {
          not: "admin",
        },
      },
      select: {
        id: true,
        email: true,
        image: true,
        role: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: ITEMS_PER_PAGE,
      skip: offset,
    });
    // const [employees, totalEmployees] = await prisma.$transaction([
    //   prisma.user.findMany({
    //     where: {
    //       email: {
    //         contains: parsedQuery,
    //         mode: "insensitive",
    //       },
    //       role: {
    //         not: "admin",
    //       },
    //     },
    //     select: {
    //       id: true,
    //       email: true,
    //       image: true,
    //       role: true,
    //     },
    //     orderBy: {
    //       createdAt: "desc",
    //     },
    //     take: EMPLOYEE_PER_PAGE,
    //     skip: offset,
    //   }),
    //   prisma.user.count({
    //     where: {
    //       email: {
    //         contains: parsedQuery,
    //         mode: "insensitive",
    //       },
    //       role: {
    //         not: "admin",
    //       },
    //     },
    //   }),
    // ]);

    // add a 4 seconds delay to simulate a slow network
    // await new Promise((resolve) => setTimeout(resolve, 4000));

    // return the users
    return users;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error fetching users.", error);
    }
    throw new Error("Error fetching users.");
  }
}

export async function fetchUserPages(query: string) {
  // Disable caching for this function
  noStore();

  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin"]);
  if (!hasPermission) {
    throw new Error("Access Denied");
  }

  // Parse the query
  const parsedQuery = fetchUserPagesSchema.safeParse(query);
  if (!parsedQuery.success) {
    throw new Error("Invalid type.");
  }
  const validatedQuery = parsedQuery.data;

  // Get the total number of users that contains the query
  try {
    const count = await prisma.user.count({
      where: {
        email: {
          contains: validatedQuery,
          mode: "insensitive",
        },
      },
    });

    // Calculate the total number of pages
    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    // return the total number of pages
    return totalPages;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error fetching user pages.", error);
    }
    throw new Error("Error fetching user pages.");
  }
}

export async function fetchUserById(id: string) {
  // Disable caching for this function
  noStore();
  
  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin"]);
  if (!hasPermission) {
    throw new Error("Access Denied.");
  }

  // Validate the id at runtime
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid ID format.");
  }
  const validatedId = parsedId.data;
  
  // Fetch the user
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

    // return the user
    return user;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error fetching user.", error);
    }
    throw new Error("Error fetching user.");
  }
}
