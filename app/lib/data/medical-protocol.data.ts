import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  findIntakeProtocols,
  findMedicalProtocols,
  findProtocolStepItems,
  type MedicalProtocolListing,
  type ProtocolStepItem,
} from "./medical-protocol";
import type { ProtocolPlanProtocol } from "../utils/medical-protocol-plan";

export type { MedicalProtocolListing, ProtocolStepItem } from "./medical-protocol";

export interface MedicalProtocolSettings {
  /** Every protocol, retired ones included, with its live steps. */
  protocols: MedicalProtocolListing[];
  /** The species a protocol can be for: live ones. */
  species: { id: string; name: string }[];
  /** The catalog items a step can name. */
  items: ProtocolStepItem[];
}

// The settings page and its form. Management view: retired protocols are
// included, so admins can unretire them.
const _fetchMedicalProtocols = async (): Promise<MedicalProtocolSettings> => {
  try {
    const [protocols, species, items] = await Promise.all([
      findMedicalProtocols(prisma),
      prisma.species.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      findProtocolStepItems(prisma),
    ]);
    return { protocols, species, items };
  } catch (error) {
    console.error("Failed to fetch medical protocols:", error);
    throw new Error("Could not fetch the medical protocols.");
  }
};

export const fetchMedicalProtocols = RequirePermission(
  AppPermissions.MEDICAL_SETTINGS_MANAGE,
)(_fetchMedicalProtocols);

// What the intake forms preview. Behind the intake's own permission, not the
// settings one: staff admitting an animal read the protocols, they don't
// manage them.
const _fetchIntakeProtocols = async (): Promise<ProtocolPlanProtocol[]> => {
  try {
    return await findIntakeProtocols(prisma);
  } catch (error) {
    console.error("Failed to fetch intake protocols:", error);
    throw new Error("Could not fetch the medical protocols.");
  }
};

export const fetchIntakeProtocols = RequirePermission(
  AppPermissions.INTAKE_MANAGE,
)(_fetchIntakeProtocols);
