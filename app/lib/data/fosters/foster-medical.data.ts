import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  withAuthenticatedUser,
  type SessionUser,
} from "@/app/lib/auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "@/app/lib/zod-schemas/common.schemas";
import { getShelterNow } from "../shelter-settings.data";
import { findFosterMedical } from "./foster-medical";

export const fetchFosterMedical = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_FOSTER_ANIMALS_READ)(
    async (user: SessionUser, animalId: string) => {
      const id = cuidSchema.safeParse(animalId);
      if (!id.success) return null;
      const { clock } = await getShelterNow();
      return findFosterMedical(prisma, user.personId, id.data, clock);
    },
  ),
);
