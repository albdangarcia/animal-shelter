import prisma from "@/app/lib/prisma";
import { RequireAllPermissions } from "../../auth/protected-actions";
import { AppPermissions } from "../../auth/permissions";
import { findActiveVetClinics } from "../medical-catalog";
import { findOutcomeMedical } from "./outcome-medical";

export const fetchOutcomeMedical = RequireAllPermissions(AppPermissions.OUTCOMES_READ, AppPermissions.MEDICAL_READ)(findOutcomeMedical);
export const fetchOutcomeMedicalClinics = RequireAllPermissions(AppPermissions.OUTCOMES_MANAGE, AppPermissions.MEDICAL_MANAGE)(async () => findActiveVetClinics(prisma));
