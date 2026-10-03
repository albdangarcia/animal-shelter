import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { _fetchAnimalCharacteristics } from "./animal-characteristics-tab";

export type {
  CharacteristicAssignment,
  CharacteristicWithAssignment,
} from "./animal-characteristics-tab";

export const fetchAnimalCharacteristics = RequirePermission(
  AppPermissions.ANIMAL_CHARACTERISTICS_READ
)(_fetchAnimalCharacteristics);
