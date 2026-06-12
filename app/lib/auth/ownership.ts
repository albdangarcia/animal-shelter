/**
 * Type-guard utility that checks if a resource is owned by the current user.
 * * @param resource - The object being checked, must contain a userId property.
 * @param userPersonId - The ID of the currently authenticated user.
 * @returns True if the resource is not null and the resource.userId matches userPersonId.
 */
export function isOwnedByUser<T extends { userId: string }>(
  resource: T | null,
  userPersonId: string
): resource is T {
  return resource !== null && resource.userId === userPersonId;
}