import prisma from "@/app/lib/prisma";
import { ITEMS_PER_PAGE } from "@/app/lib/constants";
import { z } from "zod";
import { auth } from "@/auth";
import { idSchema } from "../../schemas/common";

/*
============ data for the public pages ============
*/
// Schema for fetchPublishedPetsPagesWithCategory function
const fetchPublishedPetsPagesWithCategorySchema = z.object({
  parsedQuery: z.string(),
  parsedSpeciesName: z.string().optional(),
});

// Schema for the function parameters
const fetchFilteredPublishedPetsWithCategorySchema = z.object({
  parsedQuery: z.string(),
  parsedCurrentPage: z.number(),
  parsedSpeciesName: z.string().optional(),
});

export async function fetchFilteredPublishedPetsWithCategory(
  query: string,
  currentPage: number,
  speciesName?: string
) {
  // Parse the query, currentPage, and speciesName
  const parsedData = fetchFilteredPublishedPetsWithCategorySchema.safeParse({
    parsedQuery: query,
    parsedCurrentPage: currentPage,
    parsedSpeciesName: speciesName,
  });
  if (!parsedData.success) {
    throw new Error("Invalid type.");
  }
  const { parsedQuery, parsedCurrentPage, parsedSpeciesName } = parsedData.data;

  // page offset
  const offset = (parsedCurrentPage - 1) * ITEMS_PER_PAGE;

  // get the user id from the session
  const session = await auth();
  const userId = session?.user?.id;

  // fetch the pets
  try {
    const pets = await prisma.pet.findMany({
      where: {
        name: {
          contains: parsedQuery,
          mode: "insensitive",
        },
        published: true,
        // if speciesName is provided, filter by species
        ...(parsedSpeciesName && {
          species: {
            name: parsedSpeciesName,
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
        // if userId is provided, check if the user liked the pet
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

    // return the pets
    return pets;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("Error fetching pets.", error);
    }
    throw new Error("Error fetching pets.");
  }
}

export async function fetchPublishedPetsPagesWithCategory(
  query: string,
  speciesName?: string
) {
  // Parse the query and speciesName
  const parsedData = fetchPublishedPetsPagesWithCategorySchema.safeParse({
    parsedQuery: query,
    parsedSpeciesName: speciesName,
  });
  if (!parsedData.success) {
    throw new Error("Invalid type.");
  }
  const { parsedQuery, parsedSpeciesName } = parsedData.data;

  // fetch the total number of pets based on the query
  try {
    const count = await prisma.pet.count({
      where: {
        name: {
          contains: parsedQuery,
          mode: "insensitive",
        },
        published: true,
        // if speciesName is provided, filter by species
        ...(parsedSpeciesName && {
          species: {
            name: parsedSpeciesName,
          },
        }),
      },
    });

    // calculate the total number of pages
    const totalPages = Math.ceil(Number(count) / ITEMS_PER_PAGE);

    // return the total number of pages
    return totalPages;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("Error fetching pets pages.", error);
    }
    throw new Error("Error fetching pets pages.");
  }
}

export async function fetchSpecies() {
  try {
    const species = await prisma.species.findMany();
    return species;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("Error fetching species.", error);
    }
    throw new Error("Error fetching species.");
  }
}

export async function fetchFrontPagePetById(id: string) {
  // Validate the id at runtime
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid id.");
  }
  const validatedId = parsedId.data;

  try {
    const pet = await prisma.pet.findUnique({
      where: {
        id: validatedId,
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

    // return the pet
    return pet;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("Error fetching pet.", error);
    }
    throw new Error("Error fetching pet.");
  }
}
