"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import { AppPermissions } from "@/app/lib/auth/permissions";
import type { FormResult } from "@/app/lib/action-result";
import {
  RequirePermission,
  withAuthenticatedUser,
  type SessionUser,
} from "../auth/protected-actions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { ConflictError, NotFoundError } from "../utils/errors";
import { unlinkAccountFromPerson } from "../services/person-account-unlink";

const PEOPLE_DIRECTORY_PATH = "/dashboard/people-directory";

const personPath = (personId: string) => `${PEOPLE_DIRECTORY_PATH}/${personId}`;

/**
 * Staff-facing repair for an account linked to the wrong person's record.
 * The work is in `person-account-unlink`; this is the authorization, the
 * transaction and the cache invalidation around it.
 */
const _unlinkPersonAccount = async (
  actor: SessionUser,
  personId: string,
): Promise<FormResult<never, { replacementPersonId: string }>> => {
  const parsedId = cuidSchema.safeParse(personId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid person ID format." };
  }

  let replacementPersonId: string;

  try {
    ({ replacementPersonId } = await prisma.$transaction((tx) =>
      unlinkAccountFromPerson(tx, parsedId.data, {
        userId: actor.id,
        personId: actor.personId,
      }),
    ));
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError) {
      return { ok: false, message: error.message };
    }
    console.error("Database Error unlinking person account:", error);
    return {
      ok: false,
      message: "Database Error: Failed to unlink the login account.",
    };
  }

  // "layout" rather than the bare path: the account state this changes is read
  // by the profile tab, the notes tab and the applications tab alike.
  revalidatePath(PEOPLE_DIRECTORY_PATH);
  revalidatePath(personPath(parsedId.data), "layout");
  revalidatePath(personPath(replacementPersonId), "layout");

  return {
    ok: true,
    message:
      "Login account unlinked. It now has its own person record, and this one is staff-editable again.",
    data: { replacementPersonId },
  };
};

export const unlinkPersonAccount = withAuthenticatedUser(
  RequirePermission(AppPermissions.PERSON_ACCOUNT_UNLINK)(_unlinkPersonAccount),
);
