import { unstable_noStore as noStore } from "next/cache";
import prisma from "@/app/lib/prisma";
import { ITEMS_PER_PAGE } from "@/app/lib/constants";
import { rolesWithPermission } from "@/app/lib/actions/authorization";

export async function fetchFilteredUsers(query: string, currentPage: number) {
  noStore();
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: query,
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
    //         contains: query,
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
    //         contains: query,
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

    return users;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching users.");
  }
}

export async function fetchUserPages(query: string) {
  noStore();
  try {
    const count = await prisma.user.count({
      where: {
        email: {
          contains: query,
          mode: "insensitive",
        },
      },
    });

    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching user pages.");
  }
}
export async function fetchUserById(id: string) {
  const hasPermission = await rolesWithPermission(["admin"]);
  if (!hasPermission) {
    throw new Error("Access Denied.");
  }
  noStore();
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: id,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    return user;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching user.");
  }
}
