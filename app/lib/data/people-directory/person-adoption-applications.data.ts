import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import { ANIMAL_IMAGE_ORDER } from "../../utils/animal-image-order";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import z from "zod";

export type AdoptionApplicationForEditPayload =
  Prisma.AdoptionApplicationGetPayload<{
    select: {
      applicant: { select: { user: { select: { id: true } } } };
      id: true;
      status: true;
      applicantId: true;
      applicantName: true;
      applicantEmail: true;
      applicantPhone: true;
      applicantAddressLine1: true;
      applicantAddressLine2: true;
      applicantCity: true;
      applicantState: true;
      applicantZipCode: true;
      livingSituation: true;
      householdSize: true;
      hasYard: true;
      landlordPermission: true;
      hasChildren: true;
      childrenAges: true;
      otherAnimalsDescription: true;
      animalExperience: true;
      reasonForAdoption: true;
      animal: {
        select: {
          id: true;
          name: true;
          species: { select: { name: true } };
        };
      };
    };
  }>;

export type PersonAdoptionApplicationPayload =
  Prisma.AdoptionApplicationGetPayload<{
    select: {
      id: true;
      status: true;
      submittedAt: true;
      updatedAt: true;
      animal: {
        select: {
          id: true;
          name: true;
          species: { select: { name: true } };
          animalImages: {
            select: { url: true };
            // Mirrors ANIMAL_IMAGE_ORDER used in the query below — keep in sync.
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }];
            take: 1;
          };
        };
      };
    };
  }>;

const PersonAdoptionApplicationsSchema = z.object({
  currentPage: currentPageSchema,
  personId: cuidSchema,
});

const APPLICATIONS_PER_PAGE = 10;

const _fetchPersonAdoptionApplications = async (
  currentPageInput: number,
  inputPersonId: string,
): Promise<{
  applications: PersonAdoptionApplicationPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = PersonAdoptionApplicationsSchema.safeParse({
    currentPage: currentPageInput,
    personId: inputPersonId,
  });

  if (!validatedArgs.success) {
    throw new Error(
      "Invalid arguments for fetching person adoption applications.",
    );
  }

  const { currentPage, personId } = validatedArgs.data;

  const whereClause: Prisma.AdoptionApplicationWhereInput = {
    applicantId: personId,
  };

  try {
    const offset = (currentPage - 1) * APPLICATIONS_PER_PAGE;

    const [totalCount, applications] = await Promise.all([
      prisma.adoptionApplication.count({ where: whereClause }),
      prisma.adoptionApplication.findMany({
        where: whereClause,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
          animal: {
            select: {
              id: true,
              name: true,
              species: { select: { name: true } },
              animalImages: {
                select: { url: true },
                orderBy: ANIMAL_IMAGE_ORDER,
                take: 1,
              },
            },
          },
        },
        orderBy: {
          submittedAt: "desc",
        },
        take: APPLICATIONS_PER_PAGE,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / APPLICATIONS_PER_PAGE);
    return { applications, totalPages, totalRows: totalCount };
  } catch (error) {
    console.error("Error fetching person adoption applications.", error);
    throw new Error("Could not fetch person adoption applications.");
  }
};

const _fetchAdoptionApplicationForEdit = async (
  applicationId: string,
): Promise<AdoptionApplicationForEditPayload | null> => {
  const parsedApplicationId = cuidSchema.safeParse(applicationId);

  if (!parsedApplicationId.success) {
    throw new Error("Invalid ID format.");
  }

  try {
    const application = await prisma.adoptionApplication.findUnique({
      where: {
        id: parsedApplicationId.data,
      },
      select: {
        // Only walk-in contacts (no user account) can have their applications
        // edited by staff — registered users manage their own.
        applicant: { select: { user: { select: { id: true } } } },
        id: true,
        status: true,
        applicantId: true,
        applicantName: true,
        applicantEmail: true,
        applicantPhone: true,
        applicantAddressLine1: true,
        applicantAddressLine2: true,
        applicantCity: true,
        applicantState: true,
        applicantZipCode: true,
        livingSituation: true,
        householdSize: true,
        hasYard: true,
        landlordPermission: true,
        hasChildren: true,
        childrenAges: true,
        otherAnimalsDescription: true,
        animalExperience: true,
        reasonForAdoption: true,
        animal: {
          select: {
            id: true,
            name: true,
            species: { select: { name: true } },
          },
        },
      },
    });

    if (!application || application.applicant.user !== null) {
      return null;
    }

    return application;
  } catch (error) {
    console.error("Error fetching adoption application for edit.", error);
    throw new Error("Could not fetch application for editing.");
  }
};


export const fetchPersonAdoptionApplications = RequirePermission(
  AppPermissions.PERSONS_READ,
)(_fetchPersonAdoptionApplications);

export const fetchAdoptionApplicationForEdit = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_fetchAdoptionApplicationForEdit);
