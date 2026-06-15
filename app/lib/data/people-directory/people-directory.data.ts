import { prisma } from "@/app/lib/prisma";
import { PersonType, Prisma, Role } from "@prisma/client";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../../auth/protected-actions";
import { Permissions } from "@/app/lib/auth/permissions";
import { PeopleDirectoryParamsSchema } from "../../zod-schemas/people-directory.schemas";
import {
  HouseholdProfilePayload,
  PeopleDirectoryPayload,
  PersonFormPayload,
  PersonSectionCardPayload,
} from "../../types";
import { cuidSchema } from "../../zod-schemas/common.schemas";

const _fetchPeople = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  pageSizeInput: number,
  typeInput: string | undefined,
): Promise<{
  people: PeopleDirectoryPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = PeopleDirectoryParamsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    pageSize: pageSizeInput,
    type: typeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching people.");
  }
  const { query, currentPage, sort, pageSize, type } = validatedArgs.data;

  const offset = (currentPage - 1) * pageSize;

  // Dynamically set the sorting order
  const orderBy: Prisma.PersonOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "name":
        return { name: dir };
      case "email":
        return { email: dir };
      case "phone":
        return { phone: dir };
      case "city":
        return { city: dir };
      case "state":
        return { state: dir };
      default:
        return { createdAt: "desc" };
    }
  })();

  const whereClause: Prisma.PersonWhereInput = {
    AND: [
      // Include walk-in contacts with no account (user: null), and any
      // registered account except ADMIN. Staff/volunteers are intentionally
      // included since they may appear as finders/surrenderers via Intake.
      {
        OR: [{ user: null }, { user: { role: { not: Role.ADMIN } } }],
      },
      {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ],
      },
    ],
  };

  // If specific types are selected (and it's not "all of them"), apply the filter
  const allPersonTypes = Object.values(PersonType);
  if (type && type.length > 0 && type.length < allPersonTypes.length) {
    whereClause.AND = [
      ...(whereClause.AND as Prisma.PersonWhereInput[]),
      { type: { in: type } },
    ];
  }

  try {
    const [totalRows, people] = await prisma.$transaction([
      prisma.person.count({ where: whereClause }),
      prisma.person.findMany({
        where: whereClause,
        orderBy,
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          name: true,
          type: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalRows / pageSize);

    return { people, totalPages, totalRows };
  } catch (error) {
    console.error("Error fetching people.", error);
    throw new Error("Error fetching people.");
  }
};

const _fetchSectionCardsPersonData = async (
  id: string,
): Promise<PersonSectionCardPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid person ID format.");
  }

  const validatedPersonId = parsedId.data;

  try {
    const person = await prisma.person.findUnique({
      where: { id: validatedPersonId },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        user: {
          select: {
            id: true,
            role: true,
            image: true,
            emailVerified: true,
          },
        },
        _count: {
          select: {
            adoptionApplications: true,
            surrenderedAnimals: true,
            foundAnimals: true,
            reclaimedAnimalsAsOwner: true,
            tasksAssigned: true,
            tasksCreated: true,
            notesAuthored: true,
            processedIntakes: true,
            processedOutcomes: true,
            Assessment: true,
          },
        },
      },
    });

    if (person?.user?.role === Role.ADMIN) {
      return null;
    }

    return person;
  } catch (error) {
    console.error("Error fetching person by ID.", error);
    throw new Error("Error fetching person details.");
  }
};

const _fetchPersonForEdit = async (
  id: string,
): Promise<PersonFormPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid person ID format.");
  }

  try {
    const person = await prisma.person.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        user: { select: { role: true } },
      },
    });

    if (person?.user?.role === Role.ADMIN) {
      return null;
    }

    // strip "user" before returning since PersonFormPayload doesn't include it
    if (!person) return null;
    const { user, ...rest } = person;
    return rest;
  } catch (error) {
    console.error("Error fetching person for edit.", error);
    throw new Error("Error fetching person data.");
  }
};

const _fetchMyProfile = async (
  user: SessionUser,
): Promise<PersonFormPayload | null> => {
  try {
    const person = await prisma.person.findUnique({
      where: { id: user.personId },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
      },
    });

    return person;
  } catch (error) {
    console.error("Error fetching own profile.", error);
    throw new Error("Error fetching profile data.");
  }
};

const _fetchMyHouseholdProfile = async (
  user: SessionUser,
): Promise<HouseholdProfilePayload | null> => {
  try {
    const profile = await prisma.householdProfile.findUnique({
      where: { personId: user.personId },
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
    });

    return profile;
  } catch (error) {
    console.error("Error fetching household profile.", error);
    throw new Error("Error fetching household profile data.");
  }
};

export const fetchMyHouseholdProfile = withAuthenticatedUser(
  RequirePermission(Permissions.MY_PROFILE_UPDATE)(_fetchMyHouseholdProfile),
);

export const fetchMyProfile = withAuthenticatedUser(
  RequirePermission(Permissions.MY_PROFILE_UPDATE)(_fetchMyProfile),
);

export const fetchPersonForEdit = RequirePermission(Permissions.PERSONS_MANAGE)(
  _fetchPersonForEdit,
);

export const fetchSectionCardsPersonData = RequirePermission(
  Permissions.PERSONS_READ_DETAIL,
)(_fetchSectionCardsPersonData);

export const fetchPeople = RequirePermission(Permissions.PERSONS_READ_LISTING)(
  _fetchPeople,
);
