import { prisma } from "../prisma";

/**
 * Type-guard utility that checks if a resource is owned by the current user.
 * * @param resource - The object being checked, must contain a userId property.
 * @param userPersonId - The ID of the currently authenticated user.
 * @returns True if the resource is not null and the resource.userId matches userPersonId.
 */
export function isOwnedByUser<T extends { applicantId: string }>(
  resource: T | null,
  userPersonId: string
): resource is T {
  return resource !== null && resource.applicantId === userPersonId;
}

/**
 * THE predicate for foster-scoped ownership: true iff an open FosterPlacement
 * (endDate == null) exists whose FosterProfile belongs to this person.
 * @param personId - The ID of the currently authenticated user's Person record.
 * @param animalId - The animal being checked.
 * @returns True if the person is currently fostering the animal.
 */
export async function isFosteringAnimal(
  personId: string,
  animalId: string
): Promise<boolean> {
  const openPlacement = await prisma.fosterPlacement.findFirst({
    where: {
      animalId,
      endDate: null,
      fosterProfile: { personId },
    },
    select: { id: true },
  });

  return openPlacement !== null;
}