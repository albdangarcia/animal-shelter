import prisma from "@/app/lib/prisma";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../auth/protected-actions";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import {
  findAllAnimalsTasks,
  parseAllAnimalsTasksArgs,
  type AllAnimalsTasksArgs,
} from "./all-animal-tasks";

export type { AllAnimalsTasksPayload } from "./all-animal-tasks";

// Bad arguments throw their own message, outside the try; the Due filter reads
// the shelter's today, fetched here so the page's other lookups don't wait.
const _fetchAllAnimalsTasks = async (args: AllAnimalsTasksArgs) => {
  const validArgs = parseAllAnimalsTasksArgs(args);
  const today = await getShelterToday();
  try {
    return await findAllAnimalsTasks(prisma, validArgs, today);
  } catch (error) {
    console.error("Error fetching all tasks:", error);
    throw new Error("Error fetching all tasks.");
  }
};

export const fetchAllAnimalsTasks = RequirePermission(
  AppPermissions.ANIMAL_TASK_READ,
)(_fetchAllAnimalsTasks);
