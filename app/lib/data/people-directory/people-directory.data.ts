import { prisma } from "@/app/lib/prisma";
import { Prisma, Role } from "@prisma/client";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { PeopleDirectoryParamsSchema } from "../../zod-schemas/people-directory.schemas";
import {
  HouseholdProfilePayload,
  PeopleDirectoryPayload,
  PersonForApplicationFormPayload,
  PersonFormPayload,
  PersonProfileTabPayload,
  PersonSectionCardPayload,
} from "../../types";
import { cuidSchema } from "../../zod-schemas/common.schemas";

const _fetchPeople = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  pageSizeInput: number,
  accountInput: string | undefined,
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
    account: accountInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching people.");
  }
  const { query, currentPage, sort, pageSize, account } = validatedArgs.data;

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

  // REPLACE with account filtering.
  // The faceted filter sends a comma-separated string; only filter when
  // exactly one option is selected (both selected = no filter needed).
  if (account) {
    const selected = account.split(",").filter(Boolean);
    const wantsRegistered = selected.includes("registered");
    const wantsNoAccount = selected.includes("no_account");

    // Only narrow when exactly one of the two is chosen
    if (wantsRegistered && !wantsNoAccount) {
      whereClause.AND = [
        ...(whereClause.AND as Prisma.PersonWhereInput[]),
        { user: { isNot: null } },
      ];
    } else if (wantsNoAccount && !wantsRegistered) {
      whereClause.AND = [
        ...(whereClause.AND as Prisma.PersonWhereInput[]),
        { user: { is: null } },
      ];
    }
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
            animalNotesAuthored: true,
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

const _fetchPersonProfileTabData = async (
  id: string,
): Promise<PersonProfileTabPayload | null> => {
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
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        user: {
          select: {
            role: true,
            emailVerified: true,
          },
        },
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
    });

    if (person?.user?.role === Role.ADMIN) {
      return null;
    }

    return person;
  } catch (error) {
    console.error("Error fetching person profile tab data.", error);
    throw new Error("Error fetching person profile data.");
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

const _fetchPersonForApplicationForm = async (
  id: string,
): Promise<PersonForApplicationFormPayload | null> => {
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
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        user: {
          select: {
            id: true,
          },
        },
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
    });

    // Block the staff application form for any person who already has a registered account.
    // Registered users submit their own applications via the public flow.
    if (person?.user) {
      return null;
    }

    return person;
  } catch (error) {
    console.error("Error fetching person for application form.", error);
    throw new Error("Error fetching person data.");
  }
};

export const fetchPersonForApplicationForm = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_fetchPersonForApplicationForm);

const _fetchPersonHasUserAccount = async (
  personId: string,
): Promise<boolean> => {
  const parsedId = cuidSchema.safeParse(personId);
  if (!parsedId.success) {
    throw new Error("Invalid person ID format.");
  }
  try {
    const person = await prisma.person.findUnique({
      where: { id: parsedId.data },
      select: { user: { select: { id: true } } },
    });
    return person?.user != null;
  } catch (error) {
    console.error("Error fetching person account status.", error);
    throw new Error("Error fetching person account status.");
  }
};

export const fetchPersonHasUserAccount = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_fetchPersonHasUserAccount);

export const fetchPersonProfileTabData = RequirePermission(
  AppPermissions.PERSONS_READ,
)(_fetchPersonProfileTabData);

export const fetchMyHouseholdProfile = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_PROFILE_UPDATE)(_fetchMyHouseholdProfile),
);

export const fetchMyProfile = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_PROFILE_UPDATE)(_fetchMyProfile),
);

export const fetchPersonForEdit = RequirePermission(
  AppPermissions.PERSONS_MANAGE,
)(_fetchPersonForEdit);

export const fetchSectionCardsPersonData = RequirePermission(
  AppPermissions.PERSONS_READ,
)(_fetchSectionCardsPersonData);

export const fetchPeople = RequirePermission(AppPermissions.PERSONS_READ)(
  _fetchPeople,
);
