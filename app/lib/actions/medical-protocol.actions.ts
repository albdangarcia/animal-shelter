"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  MedicalProtocolFormSchema,
  type MedicalProtocolFormInput,
} from "../zod-schemas/medical-protocol.schemas";
import {
  createMedicalProtocol as createProtocol,
  MedicalProtocolRefusal,
  retireMedicalProtocol as retireProtocol,
  unretireMedicalProtocol as unretireProtocol,
  updateMedicalProtocol as updateProtocol,
} from "../services/medical-protocol";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import { fieldErrorsByPath } from "../utils/form-result-utils";

type MedicalProtocolResult = FormResult<MedicalProtocolFormInput>;

// The protocols page, and the catalog's, whose items keep their kind while a
// protocol step names them. The intake forms read the session, so they render
// per request and hold no cached copy.
const revalidateMedicalSettings = () => {
  revalidatePath("/dashboard/settings/medical");
  revalidatePath("/dashboard/settings/medical/protocols");
};

/** A refusal from the service, keyed to its field when it has one. */
const refused = (error: unknown): MedicalProtocolResult | null => {
  if (error instanceof MedicalProtocolRefusal && error.field) {
    return {
      ok: false,
      message: error.message,
      fieldErrors: {
        [error.field]: [error.message],
      } as FieldErrors<MedicalProtocolFormInput>,
    };
  }
  if (
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof PreconditionFailedError
  ) {
    return { ok: false, message: error.message };
  }
  return null;
};

// Keyed by each issue's whole path, so a step's message lands on its own field.
const invalidFields = (
  error: z.ZodError<MedicalProtocolFormInput>,
  verb: string,
): MedicalProtocolResult => ({
  ok: false,
  message: `Missing or invalid fields. Failed to ${verb} protocol.`,
  fieldErrors: fieldErrorsByPath<MedicalProtocolFormInput>(error.issues),
});

const _createMedicalProtocol = async (
  _user: SessionUser,
  values: MedicalProtocolFormInput,
): Promise<MedicalProtocolResult> => {
  const validated = MedicalProtocolFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "create");
  }

  try {
    await prisma.$transaction((tx) => createProtocol(tx, validated.data));
  } catch (error) {
    const refusal = refused(error);
    if (refusal) return refusal;
    console.error("Database Error creating medical protocol:", error);
    return { ok: false, message: "Database Error: Failed to create protocol." };
  }

  revalidateMedicalSettings();
  return { ok: true, message: `${validated.data.name} protocol added.` };
};

const _updateMedicalProtocol = async (
  _user: SessionUser,
  protocolId: string,
  values: MedicalProtocolFormInput,
): Promise<MedicalProtocolResult> => {
  const parsedId = cuidSchema.safeParse(protocolId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid protocol ID format." };
  }
  const validated = MedicalProtocolFormSchema.safeParse(values);
  if (!validated.success) {
    return invalidFields(validated.error, "update");
  }

  try {
    await prisma.$transaction((tx) =>
      updateProtocol(tx, parsedId.data, validated.data),
    );
  } catch (error) {
    const refusal = refused(error);
    if (refusal) return refusal;
    console.error("Database Error updating medical protocol:", error);
    return { ok: false, message: "Database Error: Failed to update protocol." };
  }

  revalidateMedicalSettings();
  return { ok: true, message: `${validated.data.name} protocol updated.` };
};

const setRetired =
  (retire: boolean) =>
  async (
    _user: SessionUser,
    protocolId: string,
  ): Promise<{ success: boolean; message: string }> => {
    const parsedId = cuidSchema.safeParse(protocolId);
    if (!parsedId.success) {
      return { success: false, message: "Invalid protocol ID format." };
    }

    try {
      await prisma.$transaction((tx) =>
        retire
          ? retireProtocol(tx, parsedId.data)
          : unretireProtocol(tx, parsedId.data),
      );
    } catch (error) {
      // An overlap on unretiring has a field, but no form to show it in.
      const refusal = refused(error);
      if (refusal) return { success: false, message: refusal.message };
      console.error("Database Error changing medical protocol retirement:", error);
      return {
        success: false,
        message: `Database Error: Failed to ${retire ? "retire" : "unretire"} protocol.`,
      };
    }

    revalidateMedicalSettings();
    return {
      success: true,
      message: retire ? "Protocol retired." : "Protocol unretired.",
    };
  };

export const createMedicalProtocol = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(_createMedicalProtocol),
);

export const updateMedicalProtocol = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(_updateMedicalProtocol),
);

export const retireMedicalProtocol = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(setRetired(true)),
);

export const unretireMedicalProtocol = withAuthenticatedUser(
  RequirePermission(AppPermissions.MEDICAL_SETTINGS_MANAGE)(setRetired(false)),
);
