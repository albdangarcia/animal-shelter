import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { queryShelterBoard } from "./shelter-board";

export type {
  BoardAnimal,
  BoardLocation,
  BoardUnit,
  FosteredBoardAnimal,
  ShelterBoardData,
} from "./shelter-board";

export const fetchShelterBoard = RequirePermission(
  AppPermissions.ANIMAL_INFO_READ,
)(queryShelterBoard);
