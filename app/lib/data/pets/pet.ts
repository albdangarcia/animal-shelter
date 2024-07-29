import { unstable_noStore as noStore } from "next/cache";
import prisma from "@/app/lib/prisma";
import { ITEMS_PER_PAGE } from "@/app/lib/constants";
import { rolesWithPermission } from "@/app/lib/actions/authorization";

export async function fetchPetCardData() {
  noStore();
  try {
    const totalPets = await prisma.pet.count();
    const adoptedPetsCount = await prisma.pet.count({
      where: {
        adoptionStatusId: "2609d1ce-f62b-42e3-a649-0129ace0152b",
      },
    });
    const pendingPetsCount = await prisma.pet.count({
      where: {
        adoptionStatusId: "09fe1188-741e-4a97-a9ad-0cfd094ee247",
      },
    });
    const availablePetsCount = await prisma.pet.count({
      where: {
        adoptionStatusId: "640566d8-2619-4764-8660-61a39baf075e",
      },
    });
    // add a 4 seconds delay to simulate a slow network
    // await new Promise((resolve) => setTimeout(resolve, 4000));

    return {
      totalPets,
      adoptedPetsCount,
      pendingPetsCount,
      availablePetsCount,
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching card data.");
  }
}

export async function fetchPetsPages(query: string) {
  noStore();
  try {
    const count = await prisma.pet.count({
      where: {
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
    });

    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching pets pages.");
  }
}

export async function fetchLatestPets() {
  noStore();
  try {
    const latestPets = await prisma.pet.findMany({
      select: {
        id: true,
        name: true,
        age: true,
        city: true,
        state: true,
        petImages: {
          select: {
            url: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    // add a 4 seconds delay to simulate a slow network
    // await new Promise((resolve) => setTimeout(resolve, 4000));

    return latestPets;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching latest pets.");
  }
}

// data for the pets table in the dashboard
export async function fetchFilteredPets(query: string, currentPage: number) {
  noStore();
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  try {
    const pets = await prisma.pet.findMany({
      where: {
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        age: true,
        city: true,
        state: true,
        adoptionStatus: {
          select: {
            name: true,
          },
        },
        species: {
          select: {
            name: true,
          },
        },
        petImages: {
          select: {
            url: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: ITEMS_PER_PAGE, // the number of records you want to fetch
      skip: offset, // the number of records to skip
    });

    // add a 4 seconds delay to simulate a slow network
    // await new Promise((resolve) => setTimeout(resolve, 4000));

    return pets;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching pets.");
  }
}

export async function fetchAdoptionStatusList() {
  try {
    const adoptionStatus = await prisma.adoptionStatus.findMany();

    return adoptionStatus;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching adoption status.");
  }
}

export async function fetchPetById(id: string) {
  noStore();
  try {
    const pet = await prisma.pet.findUnique({
      where: {
        id: id,
      },
      include: {
        petImages: true,
      },
    });

    return pet;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Error fetching pet.");
  }
}