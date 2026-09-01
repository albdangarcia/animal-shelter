import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "@/app/lib/auth/protected-actions";
import { isFosteringAnimal } from "@/app/lib/auth/ownership";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { ANIMAL_IMAGE_ORDER } from "@/app/lib/utils/animal-image-order";

const fosterPlacementForMyAnimalsInclude = {
  animal: {
    select: {
      id: true,
      name: true,
      birthDate: true,
      listingStatus: true,
      species: { select: { name: true } },
      breeds: { select: { name: true } },
      animalImages: {
        select: { url: true },
        orderBy: ANIMAL_IMAGE_ORDER,
        take: 1,
      },
    },
  },
} satisfies Prisma.FosterPlacementInclude;

export type MyFosterPlacementPayload = Prisma.FosterPlacementGetPayload<{
  include: typeof fosterPlacementForMyAnimalsInclude;
}>;

export type MyFosterAnimalsResult = {
  hasFosterProfile: boolean;
  currentPlacements: MyFosterPlacementPayload[];
  pastPlacements: MyFosterPlacementPayload[];
};

const _fetchMyFosterAnimals = async (
  user: SessionUser,
): Promise<MyFosterAnimalsResult> => {
  const personId = user.personId;
  if (!personId) {
    return { hasFosterProfile: false, currentPlacements: [], pastPlacements: [] };
  }

  try {
    const fosterProfile = await prisma.fosterProfile.findUnique({
      where: { personId },
      select: {
        placements: {
          orderBy: { startDate: "desc" },
          include: fosterPlacementForMyAnimalsInclude,
        },
      },
    });

    if (!fosterProfile) {
      return {
        hasFosterProfile: false,
        currentPlacements: [],
        pastPlacements: [],
      };
    }

    // isFosteringAnimal is the single source of truth for "currently
    // fostering" — reuse it here rather than re-deriving the
    // same open-placement check from `endDate` a second time.
    const isCurrent = await Promise.all(
      fosterProfile.placements.map((placement) =>
        isFosteringAnimal(personId, placement.animal.id),
      ),
    );

    const currentPlacements = fosterProfile.placements.filter(
      (_, i) => isCurrent[i],
    );
    const pastPlacements = fosterProfile.placements
      .filter((_, i) => !isCurrent[i])
      .slice(0, 5);

    return { hasFosterProfile: true, currentPlacements, pastPlacements };
  } catch (error) {
    console.error("Error fetching my foster animals.", error);
    throw new Error("Error fetching my foster animals.");
  }
};

export const fetchMyFosterAnimals = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_FOSTER_ANIMALS_READ)(
    _fetchMyFosterAnimals,
  ),
);
