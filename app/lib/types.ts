import { FieldType, Prisma } from "@prisma/client";

export type SearchParamsType = Promise<{ [key: string]: string | undefined }>;
export type IDParamType = Promise<{ id: string }>;

// Type for the pet object when images are included
export type AnimalByIDPayload = Prisma.AnimalGetPayload<{
  include: {
    animalImages: true;
    breeds: {
      include: {
        species: true;
      };
    };
  };
}>;

export type OutcomePayload = Prisma.OutcomeGetPayload<{
  include: {
    animal: {
      select: {
        id: true;
        name: true;
      };
    };
    staffMember: {
      select: {
        id: true;
        name: true;
      };
    };
    destinationPartner: {
      select: {
        id: true;
        name: true;
      };
    };
    adoptionApplication: {
      select: {
        id: true;
        applicantName: true;
      };
    };
  };
}>;

export type AnimalSectionCardPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    birthDate: true;
    sex: true;
    size: true;
    microchipNumber: true;
    listingStatus: true;
    isSpayedNeutered: true;
    city: true;
    state: true;
    healthStatus: true;
    legalStatus: true;
    animalImages: {
      select: {
        url: true;
      };
      orderBy: {
        createdAt: "asc";
      };
      take: 1;
    };
    species: {
      select: { name: true };
    };
    breeds: {
      select: { name: true };
    };
    colors: {
      select: { name: true };
      take: 1;
    };
    adoptionApplications: {
      select: { status: true };
    };
    intake: {
      select: { intakeDate: true };
      orderBy: { intakeDate: "desc" };
      take: 1;
    };
    _count: {
      select: {
        likes: true;
        tasks: {
          where: {
            status: { in: ["TODO", "IN_PROGRESS"] };
          };
        };
      };
    };
  };
}>;

export type AnimalIntakeFormPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    birthDate: true;
    sex: true;
    weightKg: true;
    heightCm: true;
    city: true;
    state: true;
    description: true;
    listingStatus: true;
    microchipNumber: true;
    healthStatus: true;
    speciesId: true;
    breeds: {
      select: {
        id: true;
      };
    };
    colors: {
      select: {
        id: true;
      };
    };
  };
}>;

export type ActionResult = {
  success: boolean;
  message: string | null;
};

export type AdoptionApplicationPayload = Prisma.AdoptionApplicationGetPayload<{
  include: {
    animal: {
      select: {
        id: true;
        name: true;
        breeds: {
          select: {
            name: true;
          };
        };
        species: {
          select: {
            name: true;
          };
        };
        adoptionApplications: {
          select: {
            userId: true;
          };
        };
      };
    };
  };
}>;

// Type for the animal object returned by getAnimalForApplication
// This includes basic animal details and a minimal list of adoption applications
export type AnimalForApplicationPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    breeds: {
      select: {
        name: true;
      };
    };
    species: {
      select: { name: true };
    };
    adoptionApplications: {
      select: { userId: true };
    };
  };
}>;

export type RoleManagementPayload = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    image: true;
    role: true;
    createdAt: true;
    deactivatedAt: true;
    // lastLogin: true;
    person: {
      select: {
        name: true;
      };
    };
  };
}>;

export type AnimalsPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    birthDate: true;
    city: true;
    state: true;
    listingStatus: true;
    sex: true;
    size: true;
  };
}>;

export type MyApplicationPayload = Prisma.AdoptionApplicationGetPayload<{
  select: {
    id: true;
    status: true;
    applicantName: true;
    applicantPhone: true;
    submittedAt: true;
    animal: {
      select: {
        id: true;
        name: true;
        species: {
          select: {
            name: true;
          };
        };
        animalImages: {
          select: {
            url: true;
          };
          take: 1;
        };
      };
    };
  };
}>;

export type ApplicationsPayload = Prisma.AdoptionApplicationGetPayload<{
  select: {
    id: true;
    applicantName: true;
    applicantEmail: true;
    applicantPhone: true;
    applicantCity: true;
    applicantState: true;
    status: true;
    submittedAt: true;
  };
}>;

export type PartnerPayload = Prisma.PartnerGetPayload<{
  select: {
    id: true;
    name: true;
  };
}>;

export type TaskAssignee = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null | undefined;
};

export type ColorPayload = Prisma.ColorGetPayload<{
  select: {
    id: true;
    name: true;
  };
}>;

export type SpeciesPayload = Prisma.SpeciesGetPayload<{
  select: {
    id: true;
    name: true;
    breeds: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

export type AnimalReIntakeFormPayload = Prisma.AnimalGetPayload<{
  select: {
    id: true;
    name: true;
    listingStatus: true;
  };
}>;

export type FieldOption = string | { value: string; label: string };

export interface TemplateField {
  id: string;
  label: string;
  fieldType: FieldType;
  placeholder: string | null;
  options: FieldOption[];
  isRequired: boolean;
  order: number;
}

export type PeopleDirectoryPayload = Prisma.PersonGetPayload<{
  select: {
    id: true;
    name: true;
    type: true;
    email: true;
    phone: true;
    city: true;
    state: true;
    user: {
      select: {
        id: true;
      };
    };
  };
}>;

export type PersonSectionCardPayload = Prisma.PersonGetPayload<{
  select: {
    id: true;
    name: true;
    type: true;
    email: true;
    phone: true;
    address: true;
    city: true;
    state: true;
    zipCode: true;
    user: {
      select: {
        id: true;
        role: true;
        image: true;
        emailVerified: true;
      };
    };
    _count: {
      select: {
        adoptionApplications: true;
        surrenderedAnimals: true;
        foundAnimals: true;
        reclaimedAnimalsAsOwner: true;
        tasksAssigned: true;
        tasksCreated: true;
        notesAuthored: true;
        processedIntakes: true;
        processedOutcomes: true;
        Assessment: true;
      };
    };
  };
}>;

export type PersonFormPayload = Prisma.PersonGetPayload<{
  select: {
    id: true;
    name: true;
    type: true;
    email: true;
    phone: true;
    address: true;
    city: true;
    state: true;
    zipCode: true;
  };
}>;

export type HouseholdProfilePayload = Prisma.HouseholdProfileGetPayload<{
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
}>;