import bcrypt from "bcrypt";
import {
  PrismaClient,
  Role,
  Sex,
  PersonType,
  PartnerType,
  AnimalListingStatus,
  IntakeType,
  AnimalHealthStatus,
  AnimalLegalStatus,
  AnimalSize,
  NoteCategory,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  CharacteristicCategory,
  AssessmentType,
  AssessmentOutcome,
  FieldType,
  OutcomeType,
} from "@prisma/client";
const prisma = new PrismaClient();
import { isDemo } from "@/lib/flags";
import {
  getRandomDate,
  getRandomDateWithinLastDays,
  getRandomItem,
} from "@/app/lib/utils/seeding-utils";

// =================================================================//
//                             MOCK DATA                            //
// =================================================================//

const baseUrl = isDemo
  ? "https://bpkxtpt6ukyq9hzk.public.blob.vercel-storage.com/seed"
  : "/uploads";

const personData = [
  {
    name: "External Agency",
    type: PersonType.AGENCY,
    email: "agency@example.com",
  },
  {
    name: "Admin User",
    type: PersonType.INDIVIDUAL,
    email: "admin@example.com",
    role: Role.ADMIN,
  },
  {
    name: "Olivia Chen",
    type: PersonType.INDIVIDUAL,
    email: "staff1@example.com",
    role: Role.STAFF,
  },
  {
    name: "Benjamin Carter",
    type: PersonType.INDIVIDUAL,
    email: "staff2@example.com",
    role: Role.STAFF,
  },
  {
    name: "Sam Rivera",
    type: PersonType.INDIVIDUAL,
    email: "volunteer1@example.com",
    role: Role.VOLUNTEER,
  },
  {
    name: "Jane Doe",
    type: PersonType.INDIVIDUAL,
    email: "surrenderer1@example.com",
    role: Role.USER,
  },
  {
    name: "John Smith",
    type: PersonType.INDIVIDUAL,
    email: "finder1@example.com",
    role: Role.USER,
  },
];

const allColors = {
  BLACK: { name: "Black" },
  WHITE: { name: "White" },
  BROWN: { name: "Brown" },
  GOLDEN: { name: "Golden" },
  GRAY: { name: "Gray" },
  BRINDLE: { name: "Brindle" },
  TABBY: { name: "Tabby" },
  TRICOLOR: { name: "Tricolor" },
  ORANGE: { name: "Orange" },
  GREEN: { name: "Green" },
};

const allSpecies = {
  DOG: {
    name: "Dog",
    breeds: {
      GOLDEN_RETRIEVER: { name: "Golden Retriever" },
      AMERICAN_ESKIMO: { name: "American Eskimo Dog" },
      AIREDALE_TERRIER: { name: "Airedale Terrier" },
      MIXED_BREED: { name: "Mixed Breed" },
      LABRADOR: { name: "Labrador" },
    },
  },
  CAT: {
    name: "Cat",
    breeds: {
      SIAMESE: { name: "Siamese" },
      BRITISH_SHORTHAIR: { name: "British Shorthair" },
      DOMESTIC_SHORTHAIR: { name: "Domestic Shorthair" },
      TABBY: { name: "Tabby" },
    },
  },
  BIRD: {
    name: "Bird",
    breeds: {
      HOUSE_FINCH: { name: "House Finch" },
      NORTHERN_CARDINAL: { name: "Northern Cardinal" },
      PARAKEET: { name: "Parakeet" },
    },
  },
  RABBIT: {
    name: "Rabbit",
    breeds: {
      NETHERLAND_DWARF: { name: "Netherland Dwarf" },
      LIONHEAD: { name: "Lionhead" },
    },
  },
  REPTILE: {
    name: "Reptile",
    breeds: {
      IGUANA: { name: "Iguana" },
      GREEN_SEA_TURTLE: { name: "Green Sea Turtle" },
      BEARDED_DRAGON: { name: "Bearded Dragon" },
    },
  },
  OTHER: {
    name: "Other",
    breeds: {
      GUINEA_PIG: { name: "Guinea Pig" },
      HAMSTER: { name: "Hamster" },
    },
  },
};

const allCharacteristics = {
  GOOD_WITH_KIDS: {
    name: "Good with Kids",
    category: CharacteristicCategory.ENVIRONMENT,
  },
  HOUSEBROKEN: {
    name: "Housebroken",
    category: CharacteristicCategory.ENVIRONMENT,
  },
  GOOD_WITH_DOGS: {
    name: "Good with other dogs",
    category: CharacteristicCategory.BEHAVIOR,
  },
  GOOD_WITH_CATS: {
    name: "Good with cats",
    category: CharacteristicCategory.BEHAVIOR,
  },
  NEEDS_QUIET_HOME: {
    name: "Needs a quiet home",
    category: CharacteristicCategory.ENVIRONMENT,
  },
  LEASH_REACTIVE: {
    name: "On-Leash Reactivity",
    category: CharacteristicCategory.BEHAVIOR,
  },
  DEAF: { name: "Deaf", category: CharacteristicCategory.MEDICAL },
  HEARTWORM_POSITIVE: {
    name: "Heartworm Positive",
    category: CharacteristicCategory.MEDICAL,
  },
  FEE_WAIVED: {
    name: "Adoption Fee Waived",
    category: CharacteristicCategory.ADMINISTRATIVE,
  },
};

const partnerData = [
  {
    name: "City Animal Control",
    type: PartnerType.GOVERNMENT_AGENCY,
    contactPerson: "Officer Dave",
    email: "contact@cityanimalcontrol.gov",
    phone: "555-0101",
    address: "123 Public Works Rd",
    city: "New York",
    state: "NY",
    zipCode: "10001",
  },
  {
    name: "Second Chance Rescue",
    type: PartnerType.RESCUE_GROUP,
    contactPerson: "Sarah Jones",
    email: "sarah@secondchancerescue.org",
    phone: "555-0102",
    address: "456 Rescue Ave",
    city: "New York",
    state: "NY",
    zipCode: "10002",
  },
  {
    name: "Downtown Veterinary Clinic",
    type: PartnerType.VET_CLINIC,
    contactPerson: "Dr. Emily White",
    email: "reception@downtownvet.com",
    phone: "555-0103",
    address: "789 Health St",
    city: "New York",
    state: "NY",
    zipCode: "10003",
  },
];

const animalSeedData = [
  {
    name: "Frisco",
    sex: Sex.FEMALE,
    size: AnimalSize.LARGE,
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.GOLDEN_RETRIEVER],
    colors: [allColors.GOLDEN],
    characteristics: [
      allCharacteristics.GOOD_WITH_KIDS,
      allCharacteristics.GOOD_WITH_DOGS,
    ],
    intakeType: IntakeType.OWNER_SURRENDER,
    healthStatus: AnimalHealthStatus.HEALTHY,
    legalStatus: AnimalLegalStatus.NONE,
    images: [`${baseUrl}/dog1.jpg`, `${baseUrl}/dog1-1.webp`],
  },
  {
    name: "Flash",
    sex: Sex.MALE,
    size: AnimalSize.SMALL,
    species: allSpecies.DOG,
    breeds: [
      allSpecies.DOG.breeds.AMERICAN_ESKIMO,
      allSpecies.DOG.breeds.MIXED_BREED,
    ],
    colors: [allColors.WHITE],
    characteristics: [allCharacteristics.NEEDS_QUIET_HOME],
    intakeType: IntakeType.STRAY,
    healthStatus: AnimalHealthStatus.AWAITING_VET_EXAM,
    legalStatus: AnimalLegalStatus.STRAY_HOLD,
    images: [`${baseUrl}/dog2.jpg`, `${baseUrl}/dog2-1.webp`],
  },
  {
    name: "Fido",
    sex: Sex.MALE,
    size: AnimalSize.MEDIUM,
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.AIREDALE_TERRIER],
    colors: [allColors.BROWN, allColors.BLACK],
    characteristics: [allCharacteristics.HOUSEBROKEN],
    intakeType: IntakeType.TRANSFER_IN,
    healthStatus: AnimalHealthStatus.UNDER_VET_CARE,
    legalStatus: AnimalLegalStatus.NONE,
    images: [`${baseUrl}/dog3.jpg`, `${baseUrl}/dog3-1.jpg`],
  },
  {
    name: "Whiskers",
    sex: Sex.FEMALE,
    size: AnimalSize.SMALL,
    species: allSpecies.CAT,
    breeds: [allSpecies.CAT.breeds.SIAMESE],
    colors: [allColors.WHITE, allColors.BROWN],
    characteristics: [allCharacteristics.GOOD_WITH_CATS],
    intakeType: IntakeType.OWNER_SURRENDER,
    healthStatus: AnimalHealthStatus.HEALTHY,
    legalStatus: AnimalLegalStatus.NONE,
    images: [
      `${baseUrl}/cat1.webp`,
      `${baseUrl}/cat1-1.jpg`,
      `${baseUrl}/cat1-2.jpg`,
    ],
  },
  {
    name: "Misty",
    sex: Sex.FEMALE,
    size: AnimalSize.SMALL,
    species: allSpecies.CAT,
    breeds: [allSpecies.CAT.breeds.DOMESTIC_SHORTHAIR],
    colors: [allColors.GRAY, allColors.TABBY],
    characteristics: [],
    intakeType: IntakeType.BORN_IN_CARE,
    healthStatus: AnimalHealthStatus.AWAITING_SPAY_NEUTER,
    legalStatus: AnimalLegalStatus.NONE,
    images: [
      `${baseUrl}/cat2.webp`,
      `${baseUrl}/cat2-1.jpg`,
      `${baseUrl}/cat2-2.jpg`,
    ],
  },
  {
    name: "Godzilla",
    sex: Sex.MALE,
    size: AnimalSize.MEDIUM,
    species: allSpecies.REPTILE,
    breeds: [allSpecies.REPTILE.breeds.IGUANA],
    colors: [allColors.GREEN],
    characteristics: [],
    intakeType: IntakeType.SEIZE,
    healthStatus: AnimalHealthStatus.AWAITING_TRIAGE,
    legalStatus: AnimalLegalStatus.POLICE_HOLD,
    images: [
      `${baseUrl}/reptile2.webp`,
      `${baseUrl}/reptile2-1.jpg`,
      `${baseUrl}/reptile2-2.jpg`,
    ],
  },
  {
    name: "Buddy",
    sex: Sex.MALE,
    size: AnimalSize.LARGE,
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.LABRADOR, allSpecies.DOG.breeds.MIXED_BREED],
    colors: [allColors.BLACK],
    characteristics: [
      allCharacteristics.GOOD_WITH_KIDS,
      allCharacteristics.HOUSEBROKEN,
    ],
    intakeType: IntakeType.STRAY,
    healthStatus: AnimalHealthStatus.HEALTHY,
    legalStatus: AnimalLegalStatus.STRAY_HOLD,
    images: [`${baseUrl}/dog3-2.webp`],
  },
  {
    name: "Leo",
    sex: Sex.MALE,
    size: AnimalSize.SMALL,
    species: allSpecies.CAT,
    breeds: [
      allSpecies.CAT.breeds.TABBY,
      allSpecies.CAT.breeds.DOMESTIC_SHORTHAIR,
    ],
    colors: [allColors.TABBY, allColors.ORANGE],
    characteristics: [allCharacteristics.GOOD_WITH_CATS],
    intakeType: IntakeType.BORN_IN_CARE,
    healthStatus: AnimalHealthStatus.HEALTHY,
    legalStatus: AnimalLegalStatus.NONE,
    images: [`${baseUrl}/dog1-3.webp`],
  },
  {
    name: "Daisy",
    sex: Sex.FEMALE,
    size: AnimalSize.LARGE,
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.GOLDEN_RETRIEVER],
    colors: [allColors.GOLDEN],
    characteristics: [allCharacteristics.DEAF],
    intakeType: IntakeType.TRANSFER_IN,
    healthStatus: AnimalHealthStatus.UNDER_VET_CARE,
    legalStatus: AnimalLegalStatus.NONE,
    images: [`${baseUrl}/dog1-2.jpg`],
  },
];

const taskSeedData = [
  {
    title: "Administer flea and tick medication",
    details: "Administer monthly flea and tick prevention for a dog.",
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    category: TaskCategory.MEDICAL,
    // 5 days from now
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Behavioral assessment for new dog",
    details:
      "Conduct a standard behavioral assessment, focusing on leash reactivity.",
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    category: TaskCategory.BEHAVIORAL,
    // 12 days from now
    dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Update adoption profile photos",
    details:
      "Take new photos and write a new bio for an animal's online adoption profile.",
    status: TaskStatus.DONE,
    priority: TaskPriority.LOW,
    category: TaskCategory.ADMINISTRATIVE,
    // 3 days from now
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Submit monthly intake report to city council",
    details: "Compile and send the monthly animal intake statistics report.",
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    category: TaskCategory.ADMINISTRATIVE,
    // 7 days in the past — shows as overdue
    dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
];

interface SeedTemplateField {
  label: string;
  fieldType: FieldType;
  placeholder?: string;
  options?: string[];
  order: number;
}

interface SeedAssessmentTemplate {
  name: string;
  type: AssessmentType;
  description: string;
  allowCustomFields: boolean;
  fields: SeedTemplateField[];
}

const assessmentTemplateSeedData: SeedAssessmentTemplate[] = [
  {
    name: "Intake Behavioral",
    type: AssessmentType.INTAKE_BEHAVIORAL,
    description: "Standard behavioral checklist for all incoming dogs.",
    allowCustomFields: true,
    fields: [
      {
        label: "Kennel Presence",
        fieldType: "SELECT",
        options: ["Quiet", "Anxious", "Barking", "Alert"],
        order: 1,
      },
      {
        label: "Leash Manners",
        fieldType: "SELECT",
        options: [
          "Pulls Heavily",
          "Pulls Moderately",
          "Loose Leash",
          "Walks Politely",
        ],
        order: 2,
      },
      {
        label: "Food Guarding (High Value)",
        fieldType: "SELECT",
        options: ["None", "Stiffens", "Growls", "Snaps"],
        order: 3,
      },
    ],
  },
  {
    name: "Intake Medical",
    type: AssessmentType.INTAKE_MEDICAL,
    description: "Standard medical checklist for all incoming animals.",
    allowCustomFields: true,
    fields: [
      {
        label: "Body Condition Score",
        fieldType: "TEXT",
        placeholder: "e.g., 5/9",
        order: 1,
      },
      {
        label: "Dental Health",
        fieldType: "TEXT",
        placeholder: "e.g., Mild Tartar",
        order: 2,
      },
      {
        label: "Fleas Present",
        fieldType: "SELECT",
        options: ["Yes", "No", "Treated"],
        order: 3,
      },
    ],
  },
  {
    name: "Daily Monitoring",
    type: AssessmentType.DAILY_MONITORING,
    description: "For animals under observation for mild illness or behavior.",
    allowCustomFields: true,
    fields: [
      {
        label: "Appetite",
        fieldType: "SELECT",
        options: ["Normal", "Decreased", "Not Eaten"],
        order: 1,
      },
      {
        label: "Energy Level",
        fieldType: "SELECT",
        options: ["Normal", "Lethargic", "Hyperactive"],
        order: 2,
      },
    ],
  },
];

const assessmentSeedData = [
  {
    templateName: "Intake Behavioral",
    overallOutcome: AssessmentOutcome.GOOD,
    summary:
      "Animal is friendly and energetic. Showed no signs of aggression and was curious about the new environment. Pulls a bit on the leash but is responsive to commands.",
    fields: [
      {
        fieldName: "Reaction to Handling",
        fieldValue: "Tolerant",
        notes: "Allowed petting all over, including paws and ears.",
      },
      { fieldName: "Food Guarding", fieldValue: "None Observed", notes: "" },
      {
        fieldName: "Leash Manners",
        fieldValue: "Pulls Heavily",
        notes: "Responds to corrections but gets easily excited.",
      },
    ],
  },
  {
    templateName: "Intake Medical",
    overallOutcome: AssessmentOutcome.NEEDS_ATTENTION,
    summary:
      "Animal is slightly underweight with mild dental tartar. No other major concerns noted on initial physical exam. Recommend a dental cleaning in the near future.",
    fields: [
      {
        fieldName: "Body Condition Score",
        fieldValue: "4/9 (Slightly Underweight)",
        notes: "Ribs are easily palpable.",
      },
      {
        fieldName: "Dental Health",
        fieldValue: "Mild Tartar",
        notes: "Grade 2/4 dental disease.",
      },
      { fieldName: "Heart & Lungs", fieldValue: "Clear", notes: "" },
    ],
  },
  {
    templateName: "Daily Monitoring",
    overallOutcome: AssessmentOutcome.MONITOR,
    summary:
      "Noticed some coughing after exertion. Will continue to monitor. Appetite and energy levels are otherwise normal.",
    fields: [
      { fieldName: "Appetite", fieldValue: "Normal", notes: "" },
      { fieldName: "Energy Level", fieldValue: "Normal", notes: "" },
      {
        fieldName: "Coughing/Sneezing",
        fieldValue: "Present (Mild)",
        notes: "Observed a dry cough after a short walk.",
      },
    ],
  },
];

// =================================================================//
//                        SEEDING FUNCTIONS                         //
// =================================================================//

async function seedPersonsAndUsers() {
  console.log("Seeding persons and users...");

  if (!process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD is not set in your .env.local file.");
  }

  for (const pData of personData) {
    const person = await prisma.person.create({
      data: {
        name: pData.name,
        type: pData.type,
        email: pData.email,
      },
    });

    if (pData.role) {
      let passwordToHash = "7dJbys5@?tMA"; // Default password for non-admin users

      if (pData.role === Role.ADMIN) {
        passwordToHash = process.env.ADMIN_PASSWORD;
      }

      const hashedPassword = await bcrypt.hash(passwordToHash, 10);

      await prisma.user.create({
        data: {
          email: pData.email,
          password: hashedPassword,
          role: pData.role,
          person: { connect: { id: person.id } },
        },
      });
    }
  }
  console.log("Seeded persons and users.");
}

async function seedLookupTables() {
  console.log("Seeding species, breeds, colors, characteristics...");
  try {
    // Seed Colors
    for (const color of Object.values(allColors)) {
      await prisma.color.create({ data: color });
    }

    // Seed Characteristics
    for (const char of Object.values(allCharacteristics)) {
      await prisma.characteristic.create({ data: char });
    }

    // Seed Species and Breeds
    for (const s of Object.values(allSpecies)) {
      const species = await prisma.species.create({
        data: { name: s.name },
      });
      for (const breed of Object.values(s.breeds)) {
        await prisma.breed.create({
          data: {
            name: breed.name,
            speciesId: species.id,
          },
        });
      }
    }
  } catch (error) {
    console.error("Error seeding lookup tables:", error);
    throw error;
  }
  console.log("Seeded species, breeds, colors, characteristics.");
}

async function seedPartners() {
  console.log("Seeding partners...");
  try {
    for (const pData of partnerData) {
      await prisma.partner.create({ data: pData });
    }
  } catch (error) {
    console.error("Error seeding partners:", error);
    throw error;
  }
  console.log("Seeded partners.");
}

async function seedAssessmentTemplates() {
  console.log("Seeding assessment templates...");
  try {
    for (const templateData of assessmentTemplateSeedData) {
      await prisma.assessmentTemplate.create({
        data: {
          name: templateData.name,
          type: templateData.type,
          description: templateData.description,
          allowCustomFields: templateData.allowCustomFields,
          // Use a nested create to add all related fields at once
          templateFields: {
            create: templateData.fields,
          },
        },
      });
    }
  } catch (error) {
    console.error("Error seeding assessment templates:", error);
    throw error;
  }
  console.log("Seeded assessment templates.");
}

async function seedAnimalsAndRelations() {
  console.log("Seeding animals and their relations...");
  // Fetch all created lookup data to get their IDs for relations
  const staffMembers = await prisma.person.findMany({
    where: { user: { role: Role.STAFF } },
  });
  const publicPersons = await prisma.person.findMany({
    where: { user: null, name: { not: "SYSTEM" } },
  });
  const allPartners = await prisma.partner.findMany();
  const dbBreeds = await prisma.breed.findMany();
  const dbColors = await prisma.color.findMany();
  const dbChars = await prisma.characteristic.findMany();
  const dbSpecies = await prisma.species.findMany();

  if (staffMembers.length === 0) {
    throw new Error(
      "No staff members found. Please ensure staff are seeded before animals.",
    );
  }

  for (const animalData of animalSeedData) {
    try {
      // Find the DB records based on the names from our seed data objects
      const species = dbSpecies.find((s) => s.name === animalData.species.name);
      if (!species) {
        console.warn(
          `Skipping animal "${animalData.name}" because its species "${animalData.species.name}" was not found.`,
        );
        continue;
      }

      const breedNames = animalData.breeds.map((b) => b.name);
      const connectedBreeds = dbBreeds
        .filter((dbBreed) => breedNames.includes(dbBreed.name))
        .map((b) => ({ id: b.id }));

      const colorNames = animalData.colors.map((c) => c.name);
      const connectedColors = dbColors
        .filter((dbColor) => colorNames.includes(dbColor.name))
        .map((c) => ({ id: c.id }));

      const characteristicNames = animalData.characteristics.map((c) => c.name);
      const connectedChars = dbChars
        .filter((dbChar) => characteristicNames.includes(dbChar.name))
        .map((dbChar) => ({ id: dbChar.id }));

      const processingStaff = getRandomItem(staffMembers);

      //  Create Animal and Intake within a transaction
      const animal = await prisma.animal.create({
        data: {
          name: animalData.name,
          birthDate: getRandomDate(),
          sex: animalData.sex,
          size: animalData.size,
          city: "New York",
          state: "NY",
          description: "A wonderful companion looking for a home.",
          listingStatus: AnimalListingStatus.PUBLISHED,
          publishedAt: getRandomDate(),
          healthStatus: animalData.healthStatus,
          legalStatus: animalData.legalStatus,
          species: { connect: { id: species.id } },
          breeds: { connect: connectedBreeds },
          colors: { connect: connectedColors },
          characteristics: { connect: connectedChars },
          animalImages: {
            create: animalData.images.map((imageUrl) => ({ url: imageUrl })),
          },
        },
      });

      // Always create an intake record for the new animal
      const intakeData: {
        animalId: string;
        type: IntakeType;
        staffMemberId: string;
        surrenderingPersonId?: string;
        foundByPersonId?: string;
        sourcePartnerId?: string;
      } = {
        animalId: animal.id,
        type: animalData.intakeType,
        staffMemberId: processingStaff.id,
      };

      // Add additional fields based on the intake type
      if (animalData.intakeType === IntakeType.OWNER_SURRENDER) {
        intakeData.surrenderingPersonId = getRandomItem(publicPersons)?.id;
      } else if (animalData.intakeType === IntakeType.STRAY) {
        intakeData.foundByPersonId = getRandomItem(publicPersons)?.id;
      } else if (animalData.intakeType === IntakeType.TRANSFER_IN) {
        intakeData.sourcePartnerId = getRandomItem(allPartners)?.id;
      }

      await prisma.intake.create({
        data: {
          ...intakeData,
          intakeDate: getRandomDateWithinLastDays(90, 1),
        },
      });

      // Seed a random adoption outcome for roughly half the animals
      if (Math.random() > 0.5) {
        const staffMember = getRandomItem(staffMembers);
        await prisma.outcome.create({
          data: {
            animalId: animal.id,
            type: OutcomeType.ADOPTION,
            // Adoptions happen more recently than intakes (realistic lag)
            outcomeDate: getRandomDateWithinLastDays(75, 1),
            staffMemberId: staffMember.id,
          },
        });
      }

      // Log activity and create initial note
      await prisma.animalActivityLog.create({
        data: {
          animalId: animal.id,
          activityType: "INTAKE_PROCESSED",
          changedById: processingStaff.id,
          changeSummary: `Animal was admitted as ${animalData.intakeType
            .replace(/_/g, " ")
            .toLowerCase()}.`,
        },
      });

      await prisma.note.create({
        data: {
          animalId: animal.id,
          authorId: processingStaff.id,
          category: NoteCategory.GENERAL,
          content: `Initial intake notes. Animal appears to be in ${animalData.healthStatus} condition.`,
        },
      });

      if (animalData.healthStatus !== AnimalHealthStatus.HEALTHY) {
        await prisma.task.create({
          data: {
            animalId: animal.id,
            createdById: processingStaff.id,
            title: "Schedule Vet Examination",
            category: TaskCategory.MEDICAL,
            priority: TaskPriority.HIGH,
            status: TaskStatus.TODO,
            // Random due date between 3 and 7 days from now
            dueDate: new Date(
              Date.now() +
                (Math.floor(Math.random() * 5) + 3) * 24 * 60 * 60 * 1000,
            ),
          },
        });
      }
    } catch (error) {
      console.error(`Error seeding animal "${animalData.name}":`, error);
    }
  }
  console.log("Seeded animals and their relations.");
}

async function seedTasks() {
  console.log("Seeding tasks...");
  try {
    const staffMembers = await prisma.person.findMany({
      where: { user: { role: Role.STAFF } },
    });
    const animals = await prisma.animal.findMany();

    if (!staffMembers.length || !animals.length) {
      console.log("No staff or animals found, skipping task seeding.");
      return;
    }

    for (const taskData of taskSeedData) {
      await prisma.task.create({
        data: {
          ...taskData,
          animalId: getRandomItem(animals).id,
          assigneeId: getRandomItem(staffMembers).id,
          createdById: getRandomItem(staffMembers).id,
        },
      });
    }
  } catch (error) {
    console.error("Error seeding tasks:", error);
    throw error;
  }
  console.log("Seeded tasks.");
}

async function seedAssessments() {
  console.log("Seeding assessments...");
  try {
    const staffMembers = await prisma.person.findMany({
      where: { user: { role: Role.STAFF } },
    });
    const animals = await prisma.animal.findMany();
    const templates = await prisma.assessmentTemplate.findMany();

    if (!staffMembers.length || !animals.length || !templates.length) {
      console.log(
        "No staff, animals, or templates found, skipping assessment seeding.",
      );
      return;
    }

    for (const assessmentData of assessmentSeedData) {
      // Find the template that matches the assessment's template name
      const relatedTemplate = templates.find(
        (t) => t.name === assessmentData.templateName,
      );

      await prisma.assessment.create({
        data: {
          // `type` is no longer a field on the Assessment model
          overallOutcome: assessmentData.overallOutcome,
          summary: assessmentData.summary,
          date: getRandomDate(),
          animalId: getRandomItem(animals).id,
          assessorId: getRandomItem(staffMembers).id,
          // Connect to the template ID
          templateId: relatedTemplate?.id,
          // Use a nested create to add all related fields at once
          fields: {
            create: assessmentData.fields,
          },
        },
      });
    }
  } catch (error) {
    console.error("Error seeding assessments:", error);
    throw error;
  }
  console.log("Seeded assessments.");
}

// seedChartData creates multiple intake/outcome records pointing
// at the same animals — that's intentional, since in a real shelter one animal = one intake,
// we just need the daily counts to make the chart look realistic.
async function seedChartData() {
  console.log("Seeding bulk intake/outcome data for chart demo...");
  const animals = await prisma.animal.findMany();
  const staffMembers = await prisma.person.findMany({
    where: { user: { role: Role.STAFF } },
  });

  if (!animals.length || !staffMembers.length) {
    console.log("No animals or staff found, skipping chart data seeding.");
    return;
  }

  // Create ~80 intakes spread across the last 90 days
  for (let i = 0; i < 80; i++) {
    await prisma.intake.create({
      data: {
        animalId: getRandomItem(animals).id,
        type: getRandomItem(Object.values(IntakeType)),
        intakeDate: getRandomDateWithinLastDays(90, 1),
        staffMemberId: getRandomItem(staffMembers).id,
      },
    });
  }

  // Create ~50 adoptions spread across the last 75 days (lag behind intakes)
  for (let i = 0; i < 50; i++) {
    await prisma.outcome.create({
      data: {
        animalId: getRandomItem(animals).id,
        type: OutcomeType.RETURN_TO_OWNER,
        outcomeDate: getRandomDateWithinLastDays(75, 1),
        staffMemberId: getRandomItem(staffMembers).id,
      },
    });
  }

  console.log("Seeded bulk chart data.");
}

export async function main() {
  console.log("Start seeding new data...");
  await seedPersonsAndUsers();
  await seedLookupTables();
  await seedPartners();
  await seedAssessmentTemplates();
  await seedAnimalsAndRelations();
  await seedTasks();
  await seedAssessments();
  await seedChartData();
  console.log("Seeding finished successfully.");
}

const isExplicitSeedRun =
  process.argv.includes("seed") ||
  process.env.PRISMA_SEEDING === "true" ||
  (typeof require !== "undefined" && require.main === module);

if (isExplicitSeedRun) {
  main()
    .then(async () => {
      console.log("Disconnecting Prisma Client...");
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error("An error occurred during the seeding process:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
} else {
  console.log(
    "ℹ️ Seed script evaluated during build phase. Database seeding skipped.",
  );
}
