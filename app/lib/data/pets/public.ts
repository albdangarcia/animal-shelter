import { Session } from "next-auth";
import { unstable_noStore as noStore } from "next/cache";
import prisma from "@/app/lib/prisma";
import { ITEMS_PER_PAGE } from "@/app/lib/constants";

/*
============ data for the public pages ============
*/
export async function fetchFilteredPublishedPetsWithCategory(
  query: string,
  currentPage: number,
  speciesName?: string,
  session?: Session | null
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  // const session = await auth();
  const userId = session?.user?.id;

  try {
    const pets = await prisma.pet.findMany({
      where: {
        name: {
          contains: query,
          mode: "insensitive",
        },
        published: true,
        ...(speciesName && {
          species: {
            name: speciesName,
          },
        }),
      },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        petImages: {
          select: {
            url: true,
          },
          take: 1,
        },
        ...(userId && {
          likes: {
            select: {
              userId: true,
            },
            where: {
              userId: userId,
            },
            take: 1,
          },
        }),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: ITEMS_PER_PAGE,
      skip: offset,
    });

    // add a 4 seconds delay to simulate a slow network
    // await new Promise((resolve) => setTimeout(resolve, 4000));

    return pets;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching pets.");
  }
}

export async function fetchPublishedPetsPagesWithCategory(
  query: string,
  speciesName?: string
) {
  try {
    const count = await prisma.pet.count({
      where: {
        name: {
          contains: query,
          mode: "insensitive",
        },
        published: true,
        ...(speciesName && {
          species: {
            name: speciesName,
          },
        }),
      },
    });

    const totalPages = Math.ceil(Number(count) / ITEMS_PER_PAGE);

    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching pets pages.");
  }
}

export async function fetchSpecies() {
  try {
    const species = await prisma.species.findMany();
    return species;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching categories.");
  }
}

export async function fetchFrontPagePetById(id: string) {
  try {
    const pet = await prisma.pet.findUnique({
      where: {
        id: id,
      },
      select: {
        name: true,
        city: true,
        state: true,
        age: true,
        weight: true,
        height: true,
        species: {
          select: {
            name: true,
          },
        },
        description: true,
        petImages: true,
      },
    });

    return pet;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching pet.");
  }
}
