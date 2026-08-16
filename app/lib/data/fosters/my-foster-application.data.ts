import prisma from "@/app/lib/prisma";
import { FosterStatus } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "@/app/lib/auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { MyFosterApplicationPayload } from "@/app/lib/types";

export type FosterApplicantDefaultsPayload = Prisma.PersonGetPayload<{
  select: {
    name: true;
    email: true;
    phone: true;
    address: true;
    city: true;
    state: true;
    zipCode: true;
    householdProfile: {
      select: {
        livingSituation: true;
        hasYard: true;
        landlordPermission: true;
        householdSize: true;
        hasChildren: true;
        childrenAges: true;
        otherAnimalsDescription: true;
        animalExperience: true;
      };
    };
  };
}>;

const _fetchMyFosterApplication = async (
  user: SessionUser,
): Promise<{
  application: MyFosterApplicationPayload | null;
  applicantDefaults: FosterApplicantDefaultsPayload | null;
  hasActiveFosterProfile: boolean;
}> => {
  try {
    const [application, applicantDefaults, fosterProfile] = await Promise.all([
      prisma.fosterApplication.findFirst({
        where: { personId: user.personId },
        orderBy: { submittedAt: "desc" },
        include: {
          speciesCapabilities: { select: { id: true, name: true } },
          history: {
            orderBy: { changedAt: "desc" },
            include: { changedBy: { select: { name: true } } },
          },
        },
      }),
      prisma.person.findUnique({
        where: { id: user.personId },
        select: {
          name: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          householdProfile: {
            select: {
              livingSituation: true,
              hasYard: true,
              landlordPermission: true,
              householdSize: true,
              hasChildren: true,
              childrenAges: true,
              otherAnimalsDescription: true,
              animalExperience: true,
            },
          },
        },
      }),
      // Source of truth for "approved foster" is an ACTIVE FosterProfile, not
      // application status — a staff direct-add can activate one without an
      // APPROVED application row.
      prisma.fosterProfile.findUnique({
        where: { personId: user.personId, status: FosterStatus.ACTIVE },
        select: { id: true },
      }),
    ]);

    return {
      application,
      applicantDefaults,
      hasActiveFosterProfile: fosterProfile !== null,
    };
  } catch (error) {
    console.error("Error fetching foster application.", error);
    throw new Error("Error fetching foster application.");
  }
};

export const fetchMyFosterApplication = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_FOSTER_APPLICATION_MANAGE)(
    _fetchMyFosterApplication,
  ),
);
