"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { HouseholdProfileFormState } from "../form-state-types";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
import { HouseholdProfileFormSchema } from "../zod-schemas/household-profile.schemas";

const _updateMyHouseholdProfile = async (
  user: SessionUser,
  prevState: HouseholdProfileFormState,
  formData: FormData,
): Promise<HouseholdProfileFormState> => {
  const personId = user.personId;

  const validatedFields = HouseholdProfileFormSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or invalid fields. Failed to update household profile.",
    };
  }

  const {
    livingSituation,
    hasYard,
    landlordPermission,
    householdSize,
    hasChildren,
    childrenAges,
    otherAnimalsDescription,
    animalExperience,
  } = validatedFields.data;

  const dataToSave = {
    livingSituation,
    hasYard: hasYard === undefined ? undefined : hasYard === "true",
    landlordPermission:
      landlordPermission === undefined
        ? undefined
        : landlordPermission === "true",
    householdSize: parseInt(householdSize, 10),
    hasChildren: hasChildren === undefined ? undefined : hasChildren === "true",
    childrenAges:
      !childrenAges || childrenAges.trim() === ""
        ? []
        : childrenAges.split(",").map((age) => parseInt(age.trim(), 10)),
    otherAnimalsDescription,
    animalExperience,
  };

  try {
    await prisma.householdProfile.upsert({
      where: { personId },
      create: { personId, ...dataToSave },
      update: dataToSave,
    });
  } catch (error) {
    console.error("Database Error updating household profile:", error);
    return {
      success: false,
      message: "Database Error: Failed to update household profile.",
    };
  }

  revalidatePath("/dashboard/account");
  return {
    success: true,
    message: "Household information updated successfully.",
  };
};

export const updateMyHouseholdProfile = withAuthenticatedUser(
  RequirePermission(Permissions.MY_PROFILE_UPDATE)(_updateMyHouseholdProfile),
);
