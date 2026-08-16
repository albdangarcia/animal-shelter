import bcrypt from "bcrypt";
import { PrismaClient } from "@/prisma/generated/client";
import { Prisma } from "@/prisma/generated/client";
import {
  Role,
  Sex,
  PartnerType,
  AnimalListingStatus,
  IntakeType,
  AnimalHealthStatus,
  NoteCategory,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  CharacteristicCategory,
  AssessmentType,
  AssessmentOutcome,
  FieldType,
  OutcomeType,
  LocationType,
  ApplicationStatus,
  LivingSituation,
  FosterStatus,
  FosterPlacementType,
  FosterReturnReason,
} from "@/prisma/generated/enums";
import {
  getRandomDate,
  getRandomItem,
  generateOrderedTimeline,
  randomInt,
} from "@/app/lib/utils/seeding-utils";
import { getAnimalSize } from "@/app/lib/utils/animal-size";
import { computeStays } from "@/app/lib/utils/stay-utils";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DB URL - set DATABASE_URL_UNPOOLED or POSTGRES_URL");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });


// =================================================================//
//                             MOCK DATA                            //
// =================================================================//

// Base URL/path the seed uses for animal images. Read at seed time and baked
// into the stored image strings, so set it for the environment whose DB you're
// seeding: "/uploads" for local dev (default), or a blob/CDN base URL for a
// hosted deploy. Independent of NEXT_PUBLIC_IS_DEMO, which now only controls
// demo-specific UI (banner, reset).
const baseUrl = process.env.SEED_IMAGE_BASE_URL ?? "/uploads";

const personData = [
  {
    name: "External Agency",
    email: "agency@example.com",
  },
  {
    name: "Admin User",
    email: "admin@example.com",
    role: Role.ADMIN,
  },
  {
    name: "Olivia Chen",
    email: "staff1@example.com",
    role: Role.STAFF,
  },
  {
    name: "Benjamin Carter",
    email: "staff2@example.com",
    role: Role.STAFF,
  },
  {
    name: "Sam Rivera",
    email: "volunteer1@example.com",
    role: Role.VOLUNTEER,
  },
  {
    name: "Jane Doe",
    email: "surrenderer1@example.com",
    role: Role.USER,
    phone: "212-555-0199",
    address: "482 Lexington Ave",
    city: "New York",
    state: "NY",
    zipCode: "10017",
  },
  {
    name: "John Smith",
    email: "finder1@example.com",
    role: Role.USER,
    phone: "718-555-0142",
    address: "77 Court St",
    city: "Brooklyn",
    state: "NY",
    zipCode: "11201",
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

const partnerData: Prisma.PartnerCreateManyInput[] = [
  {
    name: "City Animal Control",
    type: PartnerType.GOVERNMENT_AGENCY,
    email: "contact@cityanimalcontrol.gov",
    phone: "555-0101",
    website: "https://cityanimalcontrol.gov",
    address: "123 Public Works Rd",
    city: "New York",
    state: "NY",
    zipCode: "10001",
  },
  {
    name: "Second Chance Rescue",
    type: PartnerType.RESCUE_GROUP,
    email: "sarah@secondchancerescue.org",
    phone: "555-0102",
    website: "https://secondchancerescue.org",
    address: "456 Rescue Ave",
    city: "New York",
    state: "NY",
    zipCode: "10002",
  },
  {
    name: "Downtown Veterinary Clinic",
    type: PartnerType.VET_CLINIC,
    email: "reception@downtownvet.com",
    phone: "555-0103",
    website: "https://downtownvet.com",
    address: "789 Health St",
    city: "New York",
    state: "NY",
    zipCode: "10003",
  },
];

// Locations, each with their units. Unit `name` must be unique within a location.
// Referenced by animals below via `location`/`unit` keys.
const allLocations = {
  DOG_BLOCK_A: {
    name: "Dog block A",
    type: LocationType.KENNEL,
    units: {
      A1: { name: "A-1", capacity: 1 },
      A2: { name: "A-2", capacity: 1 },
      A3: { name: "A-3", capacity: 2 },
      A4: { name: "A-4", capacity: 2 },
    },
  },
  ISOLATION: {
    name: "Isolation",
    type: LocationType.ISOLATION,
    units: {
      ISO1: { name: "ISO-1", capacity: 1 },
      ISO2: { name: "ISO-2", capacity: 1 },
    },
  },
  MEDICAL_WING: {
    name: "Medical wing",
    type: LocationType.MEDICAL,
    units: {
      MED1: { name: "MED-1", capacity: 1 },
      MED2: { name: "MED-2", capacity: 1 },
    },
  },
  CAT_ROOM: {
    name: "Cat room",
    type: LocationType.KENNEL,
    units: {
      C1: { name: "C-1", capacity: 3 },
      C2: { name: "C-2", capacity: 3 },
    },
  },
};

// Flattened unit names, used to randomly place generated in-care animals.
const allUnitNames = Object.values(allLocations).flatMap((location) =>
  Object.values(location.units).map((unit) => unit.name),
);

// Name pools for procedurally generated animals, keyed by species.
const generatedNamesBySpecies: Record<keyof typeof allSpecies, string[]> = {
  DOG: [
    "Rex", "Bella", "Max", "Luna", "Charlie", "Lucy", "Cooper", "Bailey",
    "Rocky", "Sadie", "Duke", "Molly", "Bear", "Zoe", "Tank", "Ruby",
    "Blue", "Thor", "Penny", "Winston",
  ],
  CAT: [
    "Shadow", "Simba", "Nala", "Oliver", "Milo", "Cleo", "Tiger", "Smokey",
    "Jasper", "Willow", "Salem", "Peanut", "Loki", "Coco", "Ash", "Pepper",
    "Mochi", "Biscuit", "Ziggy", "Olive",
  ],
  BIRD: [
    "Sunny", "Kiwi", "Sky", "Peaches", "Rio", "Echo", "Pip", "Sunshine",
    "Robin", "Skye",
  ],
  RABBIT: [
    "Thumper", "Clover", "Hazel", "Cinnamon", "Buttons", "Oreo", "Snowball",
    "Marshmallow", "Clyde", "Dash",
  ],
  REPTILE: [
    "Rango", "Spike", "Draco", "Scales", "Norbert", "Puff", "Iggy", "Zilla",
    "Torpedo", "Blaze",
  ],
  OTHER: [
    "Nibbles", "Waffles", "Pebbles", "Squeaky", "Truffle", "Nugget",
    "Pudding", "Cotton", "Hazelnut", "Marbles",
  ],
};

// Per-species image pools for generated animals, built from the actual files
// in public/uploads (and mirrored in the hosted blob store under the same
// names). Filenames are listed explicitly rather than computed, since
// extensions and numbering are irregular. "Other" has no real photos, so it
// falls back to the placeholder.
const PLACEHOLDER_IMAGE = "placeholder.jpg";

const speciesImagePools: Record<keyof typeof allSpecies, string[]> = {
  DOG: [
    "dog1.jpg", "dog1-1.webp", "dog1-2.jpg", "dog1-3.webp", "dog2.jpg",
    "dog2-1.webp", "dog3.jpg", "dog3-1.jpg", "dog3-2.webp",
  ],
  CAT: [
    "cat1.webp", "cat1-1.jpg", "cat1-2.jpg", "cat2.webp", "cat2-1.jpg",
    "cat2-2.jpg",
  ],
  BIRD: [
    "bird1.webp", "bird1-1.webp", "bird1-2.webp", "bird2.webp",
    "bird2-1.webp", "bird2-2.webp",
  ],
  RABBIT: ["rabbit1.webp", "rabbit1-1.jpg", "rabbit1-2.webp"],
  REPTILE: [
    "reptile1.webp", "reptile1-1.webp", "reptile1-2.jpg", "reptile2.webp",
    "reptile2-1.jpg", "reptile2-2.jpg",
  ],
  OTHER: [],
};

// Resolves `count` species-appropriate image URLs for a generated animal,
// falling back to the placeholder for species with an empty pool (Other).
function pickSpeciesImages(speciesName: string, count: number): string[] {
  const speciesKey = (Object.keys(allSpecies) as (keyof typeof allSpecies)[]).find(
    (key) => allSpecies[key].name === speciesName,
  );
  const pool = speciesKey ? speciesImagePools[speciesKey] : [];
  if (pool.length === 0) return [`${baseUrl}/${PLACEHOLDER_IMAGE}`];

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(shuffled[i % shuffled.length]);
  }
  return picked.map((filename) => `${baseUrl}/${filename}`);
}

// Realistic weight/height ranges per species, used to derive a plausible
// AnimalSize via the same getAnimalSize the app uses on every write path.
const bodyStatsBySpecies: Record<
  keyof typeof allSpecies,
  { weightMin: number; weightMax: number; heightMin: number; heightMax: number }
> = {
  DOG: { weightMin: 3, weightMax: 42, heightMin: 20, heightMax: 70 },
  CAT: { weightMin: 2.5, weightMax: 7, heightMin: 20, heightMax: 30 },
  BIRD: { weightMin: 0.03, weightMax: 0.6, heightMin: 10, heightMax: 30 },
  RABBIT: { weightMin: 1, weightMax: 3, heightMin: 20, heightMax: 30 },
  REPTILE: { weightMin: 0.2, weightMax: 8, heightMin: 10, heightMax: 50 },
  OTHER: { weightMin: 0.3, weightMax: 1.5, heightMin: 8, heightMax: 15 },
};

// Pools for generating the walk-in person pool (surrenderers, finders,
// owners, adopters — roles can and do overlap on the same Person).
const walkInFirstNames = [
  "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason",
  "Isabella", "Lucas", "Mia", "Logan", "Amelia", "Jackson", "Harper", "Aiden",
  "Evelyn", "Elijah", "Abigail", "James", "Charlotte", "Benjamin", "Emily",
  "Alexander", "Ella", "Michael", "Scarlett", "Daniel", "Grace", "Henry",
  "Chloe", "Sebastian", "Victoria", "Jack", "Riley", "Owen", "Aria", "Wyatt",
  "Lily", "Luke", "Zoey", "Gabriel", "Hannah", "Carter", "Layla", "Julian",
  "Nora", "Levi", "Addison", "Isaac",
];

const walkInLastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams",
  "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter",
  "Roberts",
];

const walkInStreetNames = [
  "Maple", "Oak", "Cedar", "Elm", "Pine", "Birch", "Willow", "Chestnut",
  "Walnut", "Spruce", "Sycamore", "Magnolia", "Aspen", "Cherry", "Poplar",
];

const walkInLocations = [
  { city: "New York", state: "NY", zipCode: "10001" },
  { city: "Brooklyn", state: "NY", zipCode: "11201" },
  { city: "Queens", state: "NY", zipCode: "11101" },
  { city: "Bronx", state: "NY", zipCode: "10451" },
  { city: "Staten Island", state: "NY", zipCode: "10301" },
];

const WALK_IN_PERSON_COUNT = 50;

// =================================================================//
//                   LIFECYCLE ARCHETYPE ENGINE                     //
// =================================================================//
//
// Every animal is assigned an archetype up front. Its lifecycle timeline is
// generated from that archetype, and listingStatus/archiveReason/relations
// are all DERIVED from the timeline — nothing about an animal's state is
// hardcoded independent of its events. ADOPTED mirrors the other closed-stay
// archetypes but its outcome is produced via the full adoption cascade
// (application → approval → outcome → reject-others). RETURN_READOPT layers a
// second stay on top of an initial adoption, re-entering care via a re-intake.

type Archetype =
  | "IN_CARE"
  | "TRANSFERRED_OUT"
  | "RETURNED_TO_OWNER"
  | "DECEASED_EUTHANIZED"
  | "ADOPTED"
  | "RETURN_READOPT";

interface AnimalBlueprint {
  name: string;
  sex: Sex;
  weightKg: number;
  heightCm: number;
  microchipNumber?: string;
  species: { name: string };
  breeds: { name: string }[];
  colors: { name: string }[];
  primaryColor: { name: string };
  characteristics: { name: string }[];
  images: string[];
  unitName: string | null;
  archetype: Archetype;
  intakeType: IntakeType;
  healthStatus: AnimalHealthStatus;
  listingStatus: AnimalListingStatus;
  // A minority of open stays run long (90-160 days) so the length-of-stay
  // report's "over 90 days" bucket has real entries.
  longStay?: boolean;
}

// Hand-authored animals, kept so a handful of profiles have real photos.
// All are given the IN_CARE archetype; the generated remainder below fills
// out the other archetypes.
const animalSeedData: AnimalBlueprint[] = [
  {
    name: "Frisco",
    sex: Sex.FEMALE,
    weightKg: 30,
    heightCm: 58,
    microchipNumber: "985141000100001",
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.GOLDEN_RETRIEVER],
    colors: [allColors.GOLDEN, allColors.WHITE],
    primaryColor: allColors.GOLDEN,
    characteristics: [
      allCharacteristics.GOOD_WITH_KIDS,
      allCharacteristics.GOOD_WITH_DOGS,
    ],
    intakeType: IntakeType.OWNER_SURRENDER,
    healthStatus: AnimalHealthStatus.HEALTHY,
    images: [`${baseUrl}/dog1.jpg`, `${baseUrl}/dog1-1.webp`],
    unitName: allLocations.DOG_BLOCK_A.units.A1.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
  },
  {
    name: "Flash",
    sex: Sex.MALE,
    weightKg: 8,
    heightCm: 32,
    microchipNumber: "985141000100002",
    species: allSpecies.DOG,
    breeds: [
      allSpecies.DOG.breeds.AMERICAN_ESKIMO,
      allSpecies.DOG.breeds.MIXED_BREED,
    ],
    colors: [allColors.WHITE, allColors.BROWN],
    primaryColor: allColors.WHITE,
    characteristics: [allCharacteristics.NEEDS_QUIET_HOME],
    intakeType: IntakeType.STRAY,
    healthStatus: AnimalHealthStatus.AWAITING_VET_EXAM,
    images: [`${baseUrl}/dog2.jpg`, `${baseUrl}/dog2-1.webp`],
    unitName: allLocations.DOG_BLOCK_A.units.A2.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
  },
  {
    name: "Fido",
    sex: Sex.MALE,
    weightKg: 18,
    heightCm: 45,
    microchipNumber: "985141000100003",
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.AIREDALE_TERRIER],
    colors: [allColors.BROWN, allColors.BLACK],
    primaryColor: allColors.BROWN,
    characteristics: [allCharacteristics.HOUSEBROKEN],
    intakeType: IntakeType.TRANSFER_IN,
    healthStatus: AnimalHealthStatus.UNDER_VET_CARE,
    images: [`${baseUrl}/dog3.jpg`, `${baseUrl}/dog3-1.jpg`],
    unitName: allLocations.MEDICAL_WING.units.MED1.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
  },
  {
    name: "Whiskers",
    sex: Sex.FEMALE,
    weightKg: 3.5,
    heightCm: 24,
    microchipNumber: "985141000100004",
    species: allSpecies.CAT,
    breeds: [allSpecies.CAT.breeds.SIAMESE],
    colors: [allColors.WHITE, allColors.BROWN],
    primaryColor: allColors.WHITE,
    characteristics: [allCharacteristics.GOOD_WITH_CATS],
    intakeType: IntakeType.OWNER_SURRENDER,
    healthStatus: AnimalHealthStatus.HEALTHY,
    images: [
      `${baseUrl}/cat1.webp`,
      `${baseUrl}/cat1-1.jpg`,
      `${baseUrl}/cat1-2.jpg`,
    ],
    unitName: allLocations.CAT_ROOM.units.C1.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
  },
  {
    name: "Misty",
    sex: Sex.FEMALE,
    weightKg: 3,
    heightCm: 23,
    microchipNumber: "985141000100005",
    species: allSpecies.CAT,
    breeds: [allSpecies.CAT.breeds.DOMESTIC_SHORTHAIR],
    colors: [allColors.GRAY, allColors.TABBY, allColors.WHITE],
    primaryColor: allColors.GRAY,
    characteristics: [],
    intakeType: IntakeType.BORN_IN_CARE,
    healthStatus: AnimalHealthStatus.AWAITING_SPAY_NEUTER,
    images: [
      `${baseUrl}/cat2.webp`,
      `${baseUrl}/cat2-1.jpg`,
      `${baseUrl}/cat2-2.jpg`,
    ],
    unitName: allLocations.CAT_ROOM.units.C1.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
  },
  {
    name: "Godzilla",
    sex: Sex.MALE,
    weightKg: 6,
    heightCm: 40,
    microchipNumber: "985141000100006",
    species: allSpecies.REPTILE,
    breeds: [allSpecies.REPTILE.breeds.IGUANA],
    colors: [allColors.GREEN, allColors.ORANGE],
    primaryColor: allColors.GREEN,
    characteristics: [],
    intakeType: IntakeType.SEIZE,
    healthStatus: AnimalHealthStatus.AWAITING_TRIAGE,
    images: [
      `${baseUrl}/reptile2.webp`,
      `${baseUrl}/reptile2-1.jpg`,
      `${baseUrl}/reptile2-2.jpg`,
    ],
    unitName: allLocations.ISOLATION.units.ISO1.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
  },
  {
    name: "Buddy",
    sex: Sex.MALE,
    weightKg: 32,
    heightCm: 57,
    microchipNumber: "985141000100007",
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.LABRADOR, allSpecies.DOG.breeds.MIXED_BREED],
    colors: [allColors.BLACK, allColors.WHITE],
    primaryColor: allColors.BLACK,
    characteristics: [
      allCharacteristics.GOOD_WITH_KIDS,
      allCharacteristics.HOUSEBROKEN,
    ],
    intakeType: IntakeType.STRAY,
    healthStatus: AnimalHealthStatus.HEALTHY,
    images: [`${baseUrl}/dog3-2.webp`],
    unitName: allLocations.DOG_BLOCK_A.units.A3.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
  },
  {
    name: "Leo",
    sex: Sex.MALE,
    weightKg: 3.2,
    heightCm: 22,
    microchipNumber: "985141000100008",
    species: allSpecies.CAT,
    breeds: [
      allSpecies.CAT.breeds.TABBY,
      allSpecies.CAT.breeds.DOMESTIC_SHORTHAIR,
    ],
    colors: [allColors.TABBY, allColors.ORANGE],
    primaryColor: allColors.TABBY,
    characteristics: [allCharacteristics.GOOD_WITH_CATS],
    intakeType: IntakeType.BORN_IN_CARE,
    healthStatus: AnimalHealthStatus.HEALTHY,
    images: [`${baseUrl}/dog1-3.webp`],
    // Unplaced: not yet assigned to a unit (shows in the "Unplaced" column).
    unitName: null,
    archetype: "IN_CARE",
    // A draft profile — not yet ready for public view.
    listingStatus: AnimalListingStatus.DRAFT,
  },
  {
    name: "Daisy",
    sex: Sex.FEMALE,
    weightKg: 28,
    heightCm: 55,
    microchipNumber: "985141000100009",
    species: allSpecies.DOG,
    breeds: [allSpecies.DOG.breeds.GOLDEN_RETRIEVER],
    colors: [allColors.GOLDEN, allColors.WHITE],
    primaryColor: allColors.GOLDEN,
    characteristics: [allCharacteristics.DEAF],
    intakeType: IntakeType.TRANSFER_IN,
    healthStatus: AnimalHealthStatus.UNDER_VET_CARE,
    images: [`${baseUrl}/dog1-2.jpg`],
    unitName: allLocations.MEDICAL_WING.units.MED2.name,
    archetype: "IN_CARE",
    listingStatus: AnimalListingStatus.PUBLISHED,
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
//                     GENERATION HELPERS                           //
// =================================================================//

function randomFloat(min: number, max: number, decimals = 1): number {
  const value = min + Math.random() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pickWeighted<T>(options: { value: T; weight: number }[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let r = Math.random() * total;
  for (const option of options) {
    if (r < option.weight) return option.value;
    r -= option.weight;
  }
  return options[options.length - 1].value;
}

function pickIntakeType(archetype: Archetype): IntakeType {
  if (archetype === "RETURNED_TO_OWNER") {
    // Reclaims are realistically dominated by owner surrenders/strays.
    return pickWeighted([
      { value: IntakeType.OWNER_SURRENDER, weight: 55 },
      { value: IntakeType.STRAY, weight: 35 },
      { value: IntakeType.ACO_IMPOUND, weight: 10 },
    ]);
  }
  return pickWeighted([
    { value: IntakeType.OWNER_SURRENDER, weight: 28 },
    { value: IntakeType.STRAY, weight: 28 },
    { value: IntakeType.TRANSFER_IN, weight: 16 },
    { value: IntakeType.BORN_IN_CARE, weight: 10 },
    { value: IntakeType.SEIZE, weight: 6 },
    { value: IntakeType.ACO_IMPOUND, weight: 8 },
    { value: IntakeType.SERVICE_IN, weight: 4 },
  ]);
}

function pickHealthStatus(): AnimalHealthStatus {
  return pickWeighted([
    { value: AnimalHealthStatus.HEALTHY, weight: 60 },
    { value: AnimalHealthStatus.AWAITING_VET_EXAM, weight: 10 },
    { value: AnimalHealthStatus.AWAITING_TRIAGE, weight: 5 },
    { value: AnimalHealthStatus.UNDER_VET_CARE, weight: 8 },
    { value: AnimalHealthStatus.HOSPITALISED, weight: 3 },
    { value: AnimalHealthStatus.AWAITING_SPAY_NEUTER, weight: 8 },
    { value: AnimalHealthStatus.AWAITING_OTHER_SURGERY, weight: 3 },
    { value: AnimalHealthStatus.RECOVERING_FROM_SURGERY, weight: 3 },
  ]);
}

function pickBreeds(
  species: (typeof allSpecies)[keyof typeof allSpecies],
): { name: string }[] {
  const breedPool = Object.values(species.breeds);
  const count = Math.random() < 0.7 ? 1 : Math.min(2, breedPool.length);
  const shuffled = [...breedPool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pickColors(): {
  primary: { name: string };
  all: { name: string }[];
} {
  const colorPool = Object.values(allColors);
  const primary = getRandomItem(colorPool);
  const others = colorPool.filter((c) => c.name !== primary.name);
  const additionalCount = Math.random() < 0.6 ? 0 : randomInt(1, 2);
  const shuffled = [...others].sort(() => Math.random() - 0.5);
  return { primary, all: [primary, ...shuffled.slice(0, additionalCount)] };
}

function pickCharacteristics(): { name: string }[] {
  const pool = Object.values(allCharacteristics);
  const count = randomInt(0, 2);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomFoundLocation(): {
  foundAddress: string;
  foundCity: string;
  foundState: string;
} {
  const location = getRandomItem(walkInLocations);
  const street = getRandomItem(walkInStreetNames);
  return {
    foundAddress: `${randomInt(10, 9999)} ${street} St`,
    foundCity: location.city,
    foundState: location.state,
  };
}

// Resolves the type-appropriate Intake relation for one intake event,
// mirroring the real intake write paths: an existing pool person or partner
// is connected, never free-text, never a Person created inline. Shared by
// both an animal's first intake and any later re-intake (return/re-adopt).
function buildIntakeRelations(
  intakeType: IntakeType,
  walkInPersons: { id: string }[],
  allPartners: { id: string }[],
): {
  surrenderingPersonId?: string;
  foundByPersonId?: string;
  sourcePartnerId?: string;
  foundAddress?: string;
  foundCity?: string;
  foundState?: string;
} {
  if (intakeType === IntakeType.OWNER_SURRENDER) {
    return { surrenderingPersonId: getRandomItem(walkInPersons).id };
  }
  if (intakeType === IntakeType.STRAY) {
    const foundLocation = randomFoundLocation();
    return {
      foundByPersonId: getRandomItem(walkInPersons).id,
      foundAddress: foundLocation.foundAddress,
      foundCity: foundLocation.foundCity,
      foundState: foundLocation.foundState,
    };
  }
  if (intakeType === IntakeType.TRANSFER_IN) {
    return { sourcePartnerId: getRandomItem(allPartners).id };
  }
  return {};
}

interface GeneratedWalkInPerson {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

// Generates a walk-in person pool: each has a name, a phone, a full address
// (applications snapshot the applicant address), and a UNIQUE email
// guaranteed by an index suffix (Person.email is unique in the schema).
function generateWalkInPersons(count: number): GeneratedWalkInPerson[] {
  const persons: GeneratedWalkInPerson[] = [];
  for (let i = 0; i < count; i++) {
    const first = getRandomItem(walkInFirstNames);
    const last = getRandomItem(walkInLastNames);
    const location = getRandomItem(walkInLocations);
    const street = getRandomItem(walkInStreetNames);
    persons.push({
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}.${i}@example.com`,
      phone: `212-555-${String(1000 + i).padStart(4, "0")}`,
      address: `${100 + i * 3} ${street} St`,
      city: location.city,
      state: location.state,
      zipCode: location.zipCode,
    });
  }
  return persons;
}

// Procedurally generates `count` animal blueprints for one archetype. Only
// IN_CARE blueprints honor `longStayCount`/`draftCount` (the other
// archetypes are always closed stays with a PUBLISHED-then-ARCHIVED path).
function generateAnimalBlueprints(
  archetype: Archetype,
  count: number,
  opts: { longStayCount?: number; draftCount?: number } = {},
): AnimalBlueprint[] {
  const { longStayCount = 0, draftCount = 0 } = opts;
  const speciesKeys = Object.keys(allSpecies) as (keyof typeof allSpecies)[];

  const blueprints: AnimalBlueprint[] = [];
  for (let i = 0; i < count; i++) {
    const speciesKey = getRandomItem(speciesKeys);
    const species = allSpecies[speciesKey];
    const bodyStats = bodyStatsBySpecies[speciesKey];
    const { primary, all: colors } = pickColors();
    const intakeType = pickIntakeType(archetype);

    const isLongStay = archetype === "IN_CARE" && i < longStayCount;
    const isDraft =
      archetype === "IN_CARE" &&
      i >= longStayCount &&
      i < longStayCount + draftCount;

    blueprints.push({
      name: getRandomItem(generatedNamesBySpecies[speciesKey]),
      sex: getRandomItem([Sex.MALE, Sex.FEMALE]),
      weightKg: randomFloat(bodyStats.weightMin, bodyStats.weightMax),
      heightCm: randomFloat(bodyStats.heightMin, bodyStats.heightMax, 0),
      species,
      breeds: pickBreeds(species),
      colors,
      primaryColor: primary,
      characteristics: pickCharacteristics(),
      images: pickSpeciesImages(species.name, randomInt(1, 3)),
      unitName:
        archetype === "IN_CARE" && Math.random() < 0.5
          ? getRandomItem(allUnitNames)
          : null,
      archetype,
      intakeType,
      healthStatus: pickHealthStatus(),
      listingStatus: isDraft
        ? AnimalListingStatus.DRAFT
        : AnimalListingStatus.PUBLISHED,
      longStay: isLongStay,
    });
  }
  return blueprints;
}

// =================================================================//
//                       ADOPTION HELPERS                           //
// =================================================================//
//
// Everything below replicates the invariants the real write paths enforce
// (`_createMyAdoptionApp`, `_staffUpdateAdoptionApp`, `_createOutcome`) so
// seeded adoption data is a faithful reimplementation, not a shortcut.

type ApplicantPerson = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
};

interface HouseholdProfileData {
  livingSituation: LivingSituation;
  hasYard: boolean | null;
  landlordPermission: boolean | null;
  householdSize: number;
  hasChildren: boolean | null;
  childrenAges: number[];
  otherAnimalsDescription: string | null;
  animalExperience: string | null;
}

interface AppTransition {
  status: ApplicationStatus;
  reason: string;
  changedById: string;
  at: Date;
}

const adoptionReasonPool = [
  "Looking for a loyal companion for our family.",
  "Our kids have been asking for a pet and we're ready.",
  "Recently lost a pet and want to open our home to another animal.",
  "Have the space and experience to give this animal a great home.",
  "Working from home now and want a companion during the day.",
  "Retired and looking for a companion to keep us active.",
];

const rejectionReasonPool = [
  "Home visit revealed insufficient space for the animal's needs.",
  "Unable to verify landlord permission for pet ownership.",
  "Application incomplete after follow-up requests.",
  "Another applicant was a better match for this animal's needs.",
];

const withdrawalReasonPool = [
  "Applicant found another pet elsewhere.",
  "Applicant's circumstances changed.",
  "No longer able to commit to pet ownership at this time.",
];

const animalExperiencePool = [
  "First-time pet owner, eager to learn.",
  "Grew up with dogs and cats.",
  "Currently fosters for a local rescue.",
  "Experienced with senior and special-needs animals.",
  "Has owned multiple pets over the years.",
];

function generateHouseholdProfileData(): HouseholdProfileData {
  const livingSituation = getRandomItem(Object.values(LivingSituation));
  const isRenter =
    livingSituation === LivingSituation.RENT_APARTMENT ||
    livingSituation === LivingSituation.RENT_HOUSE;
  const hasChildren = Math.random() < 0.4;
  return {
    livingSituation,
    hasYard: Math.random() < 0.55,
    landlordPermission: isRenter ? Math.random() < 0.85 : null,
    householdSize: randomInt(1, 5),
    hasChildren,
    childrenAges: hasChildren
      ? Array.from({ length: randomInt(1, 3) }, () => randomInt(1, 17))
      : [],
    otherAnimalsDescription:
      Math.random() < 0.5 ? "One friendly cat already at home." : null,
    animalExperience: getRandomItem(animalExperiencePool),
  };
}

// Snapshots the applicant's own Person record onto the application, exactly
// as `_createMyAdoptionApp` copies form input — never free-text unrelated to
// an existing pool person.
function applicantSnapshot(person: ApplicantPerson) {
  return {
    applicantName: person.name,
    applicantEmail: person.email ?? "",
    applicantPhone: person.phone ?? "",
    applicantAddressLine1: person.address ?? "",
    applicantAddressLine2: null,
    applicantCity: person.city ?? "",
    applicantState: person.state ?? "",
    applicantZipCode: person.zipCode ?? "",
  };
}

function pickDistinct<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, pool.length));
}

// Adds `days` to `base`, clamped to strictly before `notAfter` — keeps
// generated history events ordered and never later than the outcome/now.
function addDaysClamped(base: Date, days: number, notAfter: Date): Date {
  const candidate = new Date(base);
  candidate.setDate(candidate.getDate() + days);
  if (candidate >= notAfter) {
    return new Date(notAfter.getTime() - 60 * 60 * 1000);
  }
  return candidate;
}

// A date `n` days before now — used for the fostering seed's historical dates.
function daysAgo(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

// Creates one AdoptionApplication with its full ApplicationStatusHistory
// trail (initial PENDING submission + each subsequent transition) and
// upserts the applicant's HouseholdProfile, mirroring `_createMyAdoptionApp`'s
// side effects. Returns the new application's id.
async function seedApplicationWithHistory(opts: {
  animalId: string;
  applicant: ApplicantPerson;
  submittedAt: Date;
  reasonForAdoption: string;
  householdProfileData: HouseholdProfileData;
  transitions: AppTransition[];
}): Promise<string> {
  const application = await prisma.adoptionApplication.create({
    data: {
      ...applicantSnapshot(opts.applicant),
      applicantId: opts.applicant.id,
      animalId: opts.animalId,
      ...opts.householdProfileData,
      reasonForAdoption: opts.reasonForAdoption,
      status: ApplicationStatus.PENDING,
      submittedAt: opts.submittedAt,
      history: {
        create: {
          status: ApplicationStatus.PENDING,
          statusChangeReason: "Application submitted by applicant.",
          changedById: opts.applicant.id,
          changedAt: opts.submittedAt,
        },
      },
    },
  });

  await prisma.householdProfile.upsert({
    where: { personId: opts.applicant.id },
    create: { personId: opts.applicant.id, ...opts.householdProfileData },
    update: opts.householdProfileData,
  });

  for (const transition of opts.transitions) {
    await prisma.adoptionApplication.update({
      where: { id: application.id },
      data: { status: transition.status },
    });
    await prisma.applicationStatusHistory.create({
      data: {
        applicationId: application.id,
        status: transition.status,
        statusChangeReason: transition.reason,
        changedById: transition.changedById,
        changedAt: transition.at,
      },
    });
  }

  return application.id;
}

// Rejects every other open application (PENDING/REVIEWING/WAITLISTED/
// APPROVED) on an animal, exactly as `_createOutcome` does when an adoption
// is finalized.
async function rejectOtherOpenApplications(opts: {
  animalId: string;
  excludeApplicationId: string;
  staffMemberId: string;
  at: Date;
}) {
  const others = await prisma.adoptionApplication.findMany({
    where: {
      animalId: opts.animalId,
      id: { not: opts.excludeApplicationId },
      status: {
        in: [
          ApplicationStatus.PENDING,
          ApplicationStatus.REVIEWING,
          ApplicationStatus.WAITLISTED,
          ApplicationStatus.APPROVED,
        ],
      },
    },
    select: { id: true },
  });

  if (others.length === 0) return;

  await prisma.adoptionApplication.updateMany({
    where: { id: { in: others.map((o) => o.id) } },
    data: { status: ApplicationStatus.REJECTED },
  });

  await prisma.applicationStatusHistory.createMany({
    data: others.map((o) => ({
      applicationId: o.id,
      status: ApplicationStatus.REJECTED,
      statusChangeReason:
        "Application rejected as the animal is no longer available.",
      changedById: opts.staffMemberId,
      changedAt: opts.at,
    })),
  });
}

// Produces one full adoption for an animal's stay: a winning application
// that goes PENDING → REVIEWING → APPROVED → ADOPTED, 0-2 other applicants
// left in an open status, the ADOPTION Outcome linked to the winner, and the
// cascade rejecting every other open application — mirroring `_createOutcome`
// exactly (it refuses an ADOPTION outcome without an APPROVED application).
async function seedAdoptionCascade(opts: {
  animalId: string;
  intakeDate: Date;
  outcomeDate: Date;
  staffMembers: { id: string }[];
  applicantPool: ApplicantPerson[];
}) {
  const reviewingStaff = getRandomItem(opts.staffMembers);
  const approvingStaff = getRandomItem(opts.staffMembers);

  const otherCount = randomInt(0, 2);
  const [winner, ...others] = pickDistinct(opts.applicantPool, 1 + otherCount);

  const submittedAt = addDaysClamped(
    opts.intakeDate,
    randomInt(1, 5),
    opts.outcomeDate,
  );
  const reviewedAt = addDaysClamped(submittedAt, randomInt(1, 3), opts.outcomeDate);
  const approvedAt = addDaysClamped(reviewedAt, randomInt(1, 5), opts.outcomeDate);

  const winnerAppId = await seedApplicationWithHistory({
    animalId: opts.animalId,
    applicant: winner,
    submittedAt,
    reasonForAdoption: getRandomItem(adoptionReasonPool),
    householdProfileData: generateHouseholdProfileData(),
    transitions: [
      {
        status: ApplicationStatus.REVIEWING,
        reason: "Application moved to review.",
        changedById: reviewingStaff.id,
        at: reviewedAt,
      },
      {
        status: ApplicationStatus.APPROVED,
        reason: "Approved after a successful home visit.",
        changedById: approvingStaff.id,
        at: approvedAt,
      },
    ],
  });

  for (const other of others) {
    const otherSubmittedAt = addDaysClamped(
      opts.intakeDate,
      randomInt(1, 6),
      opts.outcomeDate,
    );
    const otherStatus = getRandomItem([
      ApplicationStatus.PENDING,
      ApplicationStatus.REVIEWING,
      ApplicationStatus.WAITLISTED,
    ]);
    const transitions: AppTransition[] =
      otherStatus === ApplicationStatus.PENDING
        ? []
        : [
            {
              status: otherStatus,
              reason:
                otherStatus === ApplicationStatus.WAITLISTED
                  ? "Strong application, held as a backup for this animal."
                  : "Application moved to review.",
              changedById: reviewingStaff.id,
              at: addDaysClamped(otherSubmittedAt, randomInt(1, 3), opts.outcomeDate),
            },
          ];

    await seedApplicationWithHistory({
      animalId: opts.animalId,
      applicant: other,
      submittedAt: otherSubmittedAt,
      reasonForAdoption: getRandomItem(adoptionReasonPool),
      householdProfileData: generateHouseholdProfileData(),
      transitions,
    });
  }

  await prisma.outcome.create({
    data: {
      animalId: opts.animalId,
      type: OutcomeType.ADOPTION,
      outcomeDate: opts.outcomeDate,
      staffMemberId: approvingStaff.id,
      adoptionApplicationId: winnerAppId,
    },
  });

  // Mirrors the OUTCOME_PROCESSED log `_createOutcome` writes alongside the
  // Outcome record — without it, the activity feed jumps straight from this
  // stay's intake to the next one with no closing event shown between them.
  await prisma.animalActivityLog.create({
    data: {
      animalId: opts.animalId,
      activityType: "OUTCOME_PROCESSED",
      changedById: approvingStaff.id,
      changedAt: opts.outcomeDate,
      changeSummary: "Animal was processed for outcome: adoption.",
    },
  });

  await prisma.adoptionApplication.update({
    where: { id: winnerAppId },
    data: { status: ApplicationStatus.ADOPTED },
  });
  await prisma.applicationStatusHistory.create({
    data: {
      applicationId: winnerAppId,
      status: ApplicationStatus.ADOPTED,
      statusChangeReason: "Animal adopted by applicant.",
      changedById: approvingStaff.id,
      changedAt: opts.outcomeDate,
    },
  });

  await rejectOtherOpenApplications({
    animalId: opts.animalId,
    excludeApplicationId: winnerAppId,
    staffMemberId: approvingStaff.id,
    at: opts.outcomeDate,
  });
}

// Full lifecycle for a return-and-re-adopt animal: an initial adoption
// cascade (stay 1), then a re-intake mirroring `_createReIntake` (animal
// comes back out of ARCHIVED), then stay 2 which either stays open (back in
// care today) or closes with a second adoption cascade. Because the animal
// moves ARCHIVED → active → (maybe) ARCHIVED again, this seeds an ordered
// sequence of writes rather than a single final state.
async function seedReturnAndReadoptAnimal(opts: {
  blueprint: AnimalBlueprint;
  species: { id: string; name: string };
  connectedBreeds: { id: string }[];
  connectedColors: { id: string }[];
  primaryColor: { id: string };
  connectedChars: { id: string }[];
  processingStaff: { id: string };
  dbUnits: { id: string; name: string }[];
  walkInPersons: ApplicantPerson[];
  allPartners: { id: string }[];
  staffMembers: { id: string }[];
  applicantPool: ApplicantPerson[];
}) {
  const {
    blueprint,
    species,
    connectedBreeds,
    connectedColors,
    primaryColor,
    connectedChars,
    processingStaff,
    dbUnits,
    walkInPersons,
    allPartners,
    staffMembers,
    applicantPool,
  } = opts;

  const stage2EndsOpen = Math.random() < 0.6;
  const [stay1, stay2] = generateOrderedTimeline({
    stayCount: 2,
    endsOpen: stage2EndsOpen,
    windowDays: 180,
    minStayDays: 15,
    maxStayDays: 80,
  });

  const unitName =
    stage2EndsOpen && Math.random() < 0.5 ? getRandomItem(allUnitNames) : null;
  const currentUnit = unitName
    ? dbUnits.find((u) => u.name === unitName)
    : undefined;

  // Create the animal in a neutral interim state — PUBLISHED, no
  // archiveReason. No event has been written yet, so nothing about its
  // final state (archived or still-in-care) is known. The real
  // listingStatus/archiveReason are set via an `update` further below, only
  // once the closing event that justifies them actually exists. State must
  // never precede its events — if the open case (stage2EndsOpen) is what
  // happens, this interim state already IS the correct final state.
  const animal = await prisma.animal.create({
    data: {
      name: blueprint.name,
      birthDate: getRandomDate(),
      sex: blueprint.sex,
      size: getAnimalSize(species.name, blueprint.weightKg),
      weightKg: blueprint.weightKg,
      heightCm: blueprint.heightCm,
      microchipNumber: blueprint.microchipNumber,
      city: "New York",
      state: "NY",
      description: "A wonderful companion looking for a home.",
      listingStatus: AnimalListingStatus.PUBLISHED,
      publishedAt: stay1.intakeDate,
      healthStatus: blueprint.healthStatus,
      species: { connect: { id: species.id } },
      breeds: { connect: connectedBreeds },
      colors: { connect: connectedColors },
      primaryColor: { connect: { id: primaryColor.id } },
      characteristics: { connect: connectedChars },
      animalImages: {
        create: blueprint.images.map((imageUrl) => ({ url: imageUrl })),
      },
      ...(currentUnit ? { currentUnit: { connect: { id: currentUnit.id } } } : {}),
    },
  });

  // Stay 1: the animal's original intake, ending in its first adoption.
  const firstRelations = buildIntakeRelations(
    blueprint.intakeType,
    walkInPersons,
    allPartners,
  );
  await prisma.intake.create({
    data: {
      animalId: animal.id,
      type: blueprint.intakeType,
      intakeDate: stay1.intakeDate,
      staffMemberId: processingStaff.id,
      ...firstRelations,
    },
  });

  await prisma.animalActivityLog.create({
    data: {
      animalId: animal.id,
      activityType: "INTAKE_PROCESSED",
      changedById: processingStaff.id,
      changedAt: stay1.intakeDate,
      changeSummary: `Animal was admitted as ${blueprint.intakeType
        .replace(/_/g, " ")
        .toLowerCase()}.`,
    },
  });

  await prisma.animalNote.create({
    data: {
      animalId: animal.id,
      authorId: processingStaff.id,
      category: NoteCategory.GENERAL,
      createdAt: stay1.intakeDate,
      content: `Initial intake notes. Animal appears to be in ${blueprint.healthStatus} condition.`,
    },
  });

  await seedAdoptionCascade({
    animalId: animal.id,
    intakeDate: stay1.intakeDate,
    outcomeDate: stay1.outcomeDate as Date,
    staffMembers,
    applicantPool,
  });

  // Re-intake: mirrors `_createReIntake` — a new Intake event, the animal's
  // prior archive reason is cleared, and a fresh health status is set.
  const reIntakeType = pickWeighted([
    { value: IntakeType.OWNER_SURRENDER, weight: 70 },
    { value: IntakeType.STRAY, weight: 20 },
    { value: IntakeType.ACO_IMPOUND, weight: 10 },
  ]);
  const reIntakeRelations = buildIntakeRelations(
    reIntakeType,
    walkInPersons,
    allPartners,
  );
  const reIntakeHealthStatus = pickHealthStatus();

  await prisma.intake.create({
    data: {
      animalId: animal.id,
      type: reIntakeType,
      intakeDate: stay2.intakeDate,
      staffMemberId: processingStaff.id,
      ...reIntakeRelations,
    },
  });

  await prisma.animal.update({
    where: { id: animal.id },
    data: {
      healthStatus: reIntakeHealthStatus,
    },
  });

  await prisma.animalActivityLog.create({
    data: {
      animalId: animal.id,
      activityType: "INTAKE_PROCESSED",
      changedById: processingStaff.id,
      changedAt: stay2.intakeDate,
      changeSummary: `Animal was re-intaked as ${reIntakeType
        .replace(/_/g, " ")
        .toLowerCase()}.`,
    },
  });

  await prisma.animalNote.create({
    data: {
      animalId: animal.id,
      authorId: processingStaff.id,
      category: NoteCategory.GENERAL,
      createdAt: stay2.intakeDate,
      content: `Re-intake notes. Animal appears to be in ${reIntakeHealthStatus} condition.`,
    },
  });

  if (!stage2EndsOpen) {
    await seedAdoptionCascade({
      animalId: animal.id,
      intakeDate: stay2.intakeDate,
      outcomeDate: stay2.outcomeDate as Date,
      staffMembers,
      applicantPool,
    });

    // Only now, after stay 2's closing outcome has actually been recorded,
    // finalize the animal as archived — state must never precede its events.
    await prisma.animal.update({
      where: { id: animal.id },
      data: {
        listingStatus: AnimalListingStatus.ARCHIVED,
        archiveReason: OutcomeType.ADOPTION,
      },
    });
  } else if (reIntakeHealthStatus !== AnimalHealthStatus.HEALTHY) {
    await prisma.task.create({
      data: {
        animalId: animal.id,
        createdById: processingStaff.id,
        title: "Schedule Vet Examination",
        category: TaskCategory.MEDICAL,
        priority: TaskPriority.HIGH,
        status: TaskStatus.TODO,
        dueDate: new Date(
          Date.now() +
          (Math.floor(Math.random() * 5) + 3) * 24 * 60 * 60 * 1000,
        ),
      },
    });
  }
}

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
        email: pData.email,
        phone: pData.phone,
        address: pData.address,
        city: pData.city,
        state: pData.state,
        zipCode: pData.zipCode,
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

// A pool of ~40-60 distinct walk-in persons (no User account) for seed
// animals to draw surrenderers/finders/owners from — replacing the old
// reliance on a single shared "External Agency" record.
async function seedWalkInPersons() {
  console.log("Seeding walk-in person pool...");
  const persons = generateWalkInPersons(WALK_IN_PERSON_COUNT);
  for (const p of persons) {
    await prisma.person.create({ data: p });
  }
  console.log(`Seeded ${persons.length} walk-in persons.`);
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

async function seedLocationsAndUnits() {
  console.log("Seeding locations and units...");
  try {
    for (const locationData of Object.values(allLocations)) {
      await prisma.location.create({
        data: {
          name: locationData.name,
          type: locationData.type,
          units: {
            create: Object.values(locationData.units).map((unit) => ({
              name: unit.name,
              capacity: unit.capacity,
            })),
          },
        },
      });
    }
    console.log("Seeded locations and units.");
  } catch (error) {
    console.error("Error seeding locations and units:", error);
    throw error;
  }
}

async function seedAnimalsAndRelations() {
  console.log("Seeding animals and their relations...");

  const staffMembers = await prisma.person.findMany({
    where: { user: { role: Role.STAFF } },
  });
  // The walk-in pool: real persons with no User account, excluding the
  // organizational "External Agency" placeholder. This is the single draw
  // pool for surrenderers/finders/owners (roles overlap on purpose).
  const walkInPersons = await prisma.person.findMany({
    where: { user: null, name: { notIn: ["External Agency", "SYSTEM"] } },
  });
  // USER-role accounts (the public-facing test logins) can also be adopters —
  // applications submitted through their own real profile, same as walk-ins.
  const userRolePersons = await prisma.person.findMany({
    where: { user: { role: Role.USER } },
  });
  const applicantPool: ApplicantPerson[] = [...walkInPersons, ...userRolePersons];
  const allPartners = await prisma.partner.findMany();
  const dbBreeds = await prisma.breed.findMany();
  const dbColors = await prisma.color.findMany();
  const dbChars = await prisma.characteristic.findMany();
  const dbSpecies = await prisma.species.findMany();
  const dbUnits = await prisma.unit.findMany();

  if (staffMembers.length === 0) {
    throw new Error(
      "No staff members found. Please ensure staff are seeded before animals.",
    );
  }
  if (walkInPersons.length === 0) {
    throw new Error(
      "No walk-in persons found. Please ensure the walk-in person pool is seeded before animals.",
    );
  }

  // ~150 animals total across all archetypes.
  const IN_CARE_COUNT = 60;
  const TRANSFERRED_OUT_COUNT = 15;
  const RETURNED_TO_OWNER_COUNT = 12;
  const DECEASED_EUTHANIZED_COUNT = 11;
  const ADOPTED_COUNT = 45;
  const RETURN_READOPT_COUNT = 7;

  const handAuthoredInCareCount = animalSeedData.filter(
    (a) => a.archetype === "IN_CARE",
  ).length;

  const blueprints: AnimalBlueprint[] = [
    ...animalSeedData,
    ...generateAnimalBlueprints(
      "IN_CARE",
      IN_CARE_COUNT - handAuthoredInCareCount,
      { longStayCount: 6, draftCount: 5 },
    ),
    ...generateAnimalBlueprints("TRANSFERRED_OUT", TRANSFERRED_OUT_COUNT),
    ...generateAnimalBlueprints("RETURNED_TO_OWNER", RETURNED_TO_OWNER_COUNT),
    ...generateAnimalBlueprints(
      "DECEASED_EUTHANIZED",
      DECEASED_EUTHANIZED_COUNT,
    ),
    ...generateAnimalBlueprints("ADOPTED", ADOPTED_COUNT),
    ...generateAnimalBlueprints("RETURN_READOPT", RETURN_READOPT_COUNT),
  ];

  // Failures are collected rather than swallowed: a partial/inconsistent
  // animal (e.g. an ARCHIVED row stranded without its closing outcome
  // because a later write in its sequence threw) must never be silently
  // persisted. Every blueprint is still attempted so one bad animal doesn't
  // hide problems with the rest, but the seed aborts loudly at the end if
  // anything failed.
  const failures: { name: string; error: unknown }[] = [];

  for (const blueprint of blueprints) {
    try {
      // Find the DB records based on the names from our seed data objects
      const species = dbSpecies.find((s) => s.name === blueprint.species.name);
      if (!species) {
        console.warn(
          `Skipping animal "${blueprint.name}" because its species "${blueprint.species.name}" was not found.`,
        );
        continue;
      }

      const breedNames = blueprint.breeds.map((b) => b.name);
      const connectedBreeds = dbBreeds
        .filter((dbBreed) => breedNames.includes(dbBreed.name))
        .map((b) => ({ id: b.id }));

      const colorNames = blueprint.colors.map((c) => c.name);
      const connectedColors = dbColors
        .filter((dbColor) => colorNames.includes(dbColor.name))
        .map((c) => ({ id: c.id }));

      const primaryColorName = blueprint.primaryColor.name;
      const primaryColor = dbColors.find((c) => c.name === primaryColorName);
      if (!primaryColor) {
        console.warn(
          `Skipping animal "${blueprint.name}" because its primary color "${primaryColorName}" was not found.`,
        );
        continue;
      }

      const characteristicNames = blueprint.characteristics.map((c) => c.name);
      const connectedChars = dbChars
        .filter((dbChar) => characteristicNames.includes(dbChar.name))
        .map((dbChar) => ({ id: dbChar.id }));

      const processingStaff = getRandomItem(staffMembers);

      // Return-and-re-adopt animals have their own two-stay lifecycle (an
      // adoption, then a re-intake, then a second open-or-closed stay) that
      // doesn't fit the single-stay path below, so it's handled separately.
      if (blueprint.archetype === "RETURN_READOPT") {
        await seedReturnAndReadoptAnimal({
          blueprint,
          species,
          connectedBreeds,
          connectedColors,
          primaryColor,
          connectedChars,
          processingStaff,
          dbUnits,
          walkInPersons,
          allPartners,
          staffMembers,
          applicantPool,
        });
        continue;
      }

      const isInCare = blueprint.archetype === "IN_CARE";

      // Resolve the housing unit for this animal (if any). Only in-care
      // animals are physically present in a unit; archived animals are
      // never placed at seed time.
      const currentUnit =
        isInCare && blueprint.unitName
          ? dbUnits.find((u) => u.name === blueprint.unitName)
          : undefined;
      if (isInCare && blueprint.unitName && !currentUnit) {
        console.warn(
          `Animal "${blueprint.name}" references unit "${blueprint.unitName}" which was not found. Leaving it unplaced.`,
        );
      }

      // Generate this animal's ordered, recent lifecycle timeline. Its
      // listingStatus/archiveReason are derived from this, never hardcoded.
      const [stay] = generateOrderedTimeline({
        stayCount: 1,
        endsOpen: isInCare,
        windowDays: blueprint.longStay ? 160 : 90,
        // Long-stay animals guarantee a stay over 90 days so the
        // length-of-stay report's "over 90 days" bucket has real entries.
        minStayDays: blueprint.longStay ? 95 : 2,
        maxStayDays: blueprint.longStay ? 140 : 60,
      });

      let outcomeType: OutcomeType | undefined;
      if (blueprint.archetype === "TRANSFERRED_OUT") {
        outcomeType = OutcomeType.TRANSFER_OUT;
      } else if (blueprint.archetype === "RETURNED_TO_OWNER") {
        outcomeType = OutcomeType.RETURN_TO_OWNER;
      } else if (blueprint.archetype === "DECEASED_EUTHANIZED") {
        outcomeType = getRandomItem([
          OutcomeType.DECEASED,
          OutcomeType.EUTHANIZED,
        ]);
      } else if (blueprint.archetype === "ADOPTED") {
        outcomeType = OutcomeType.ADOPTION;
      }

      // Non-in-care animals are created in a neutral interim state
      // (PUBLISHED, no archiveReason) — their closing outcome hasn't been
      // written yet at this point. The real ARCHIVED/archiveReason state is
      // set via an `update` further below, only once that outcome (or the
      // full adoption cascade) has actually succeeded. State must never
      // precede its events.
      const interimListingStatus = isInCare
        ? blueprint.listingStatus
        : AnimalListingStatus.PUBLISHED;

      //  Create the Animal record with state derived from the timeline
      const animal = await prisma.animal.create({
        data: {
          name: blueprint.name,
          birthDate: getRandomDate(),
          sex: blueprint.sex,
          // Size is derived from weight (same invariant the app enforces), so
          // seeded animals stay consistent and survive edits.
          size: getAnimalSize(species.name, blueprint.weightKg),
          weightKg: blueprint.weightKg,
          heightCm: blueprint.heightCm,
          microchipNumber: blueprint.microchipNumber,
          city: "New York",
          state: "NY",
          description: "A wonderful companion looking for a home.",
          listingStatus: interimListingStatus,
          publishedAt: stay.intakeDate,
          healthStatus: blueprint.healthStatus,
          species: { connect: { id: species.id } },
          breeds: { connect: connectedBreeds },
          colors: { connect: connectedColors },
          primaryColor: { connect: { id: primaryColor.id } },
          characteristics: { connect: connectedChars },
          animalImages: {
            create: blueprint.images.map((imageUrl) => ({ url: imageUrl })),
          },
          ...(currentUnit
            ? { currentUnit: { connect: { id: currentUnit.id } } }
            : {}),
        },
      });

      // Create the intake with its type-appropriate relation, mirroring the
      // real intake write paths: an existing pool person is connected, never
      // free-text, never a Person created inline.
      const intakeRelations = buildIntakeRelations(
        blueprint.intakeType,
        walkInPersons,
        allPartners,
      );

      await prisma.intake.create({
        data: {
          animalId: animal.id,
          type: blueprint.intakeType,
          intakeDate: stay.intakeDate,
          staffMemberId: processingStaff.id,
          ...intakeRelations,
        },
      });

      // If this archetype ends in an outcome, create it. ADOPTED runs the
      // full application → approval → outcome → reject-others cascade
      // (mirroring `_createOutcome` exactly); the others mirror its simpler
      // relation rules (RETURN_TO_OWNER needs an ownerId, TRANSFER_OUT needs
      // a destinationPartnerId).
      if (!isInCare && outcomeType) {
        if (blueprint.archetype === "ADOPTED") {
          await seedAdoptionCascade({
            animalId: animal.id,
            intakeDate: stay.intakeDate,
            outcomeDate: stay.outcomeDate as Date,
            staffMembers,
            applicantPool,
          });
        } else {
          let ownerId: string | undefined;
          let destinationPartnerId: string | undefined;

          if (blueprint.archetype === "RETURNED_TO_OWNER") {
            // Prefer the animal's own surrenderer — a realistic reclaim.
            ownerId =
              intakeRelations.surrenderingPersonId ??
              getRandomItem(walkInPersons).id;
          } else if (blueprint.archetype === "TRANSFERRED_OUT") {
            destinationPartnerId = getRandomItem(allPartners).id;
          }

          const outcomeStaff = getRandomItem(staffMembers);
          await prisma.outcome.create({
            data: {
              animalId: animal.id,
              type: outcomeType,
              outcomeDate: stay.outcomeDate as Date,
              staffMemberId: outcomeStaff.id,
              ownerId,
              destinationPartnerId,
            },
          });

          // Mirrors the OUTCOME_PROCESSED log `_createOutcome` writes
          // alongside the Outcome record.
          await prisma.animalActivityLog.create({
            data: {
              animalId: animal.id,
              activityType: "OUTCOME_PROCESSED",
              changedById: outcomeStaff.id,
              changedAt: stay.outcomeDate as Date,
              changeSummary: `Animal was processed for outcome: ${outcomeType
                .replace(/_/g, " ")
                .toLowerCase()}.`,
            },
          });
        }

        // Only now, after the outcome (or adoption cascade) has actually
        // been recorded, finalize the animal as archived — state must never
        // precede its events.
        await prisma.animal.update({
          where: { id: animal.id },
          data: {
            listingStatus: AnimalListingStatus.ARCHIVED,
            archiveReason: outcomeType,
          },
        });
      }

      // Log activity and create initial note, dated to the intake.
      await prisma.animalActivityLog.create({
        data: {
          animalId: animal.id,
          activityType: "INTAKE_PROCESSED",
          changedById: processingStaff.id,
          changedAt: stay.intakeDate,
          changeSummary: `Animal was admitted as ${blueprint.intakeType
            .replace(/_/g, " ")
            .toLowerCase()}.`,
        },
      });

      await prisma.animalNote.create({
        data: {
          animalId: animal.id,
          authorId: processingStaff.id,
          category: NoteCategory.GENERAL,
          createdAt: stay.intakeDate,
          content: `Initial intake notes. Animal appears to be in ${blueprint.healthStatus} condition.`,
        },
      });

      // Only in-care animals get an open follow-up — an archived
      // animal has already left the shelter's care.
      if (isInCare && blueprint.healthStatus !== AnimalHealthStatus.HEALTHY) {
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
      failures.push({ name: blueprint.name, error });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Error seeding animal "${failure.name}":`, failure.error);
    }
    throw new Error(
      `Failed to seed ${failures.length} of ${blueprints.length} animals. ` +
        "Aborting — a partial/inconsistent animal must not be silently persisted.",
    );
  }

  console.log(`Seeded ${blueprints.length} animals and their relations.`);
}

// Seeds the fostering feature's three models: a roster of FosterProfiles
// with varied status/capabilities, a couple of in-review FosterApplications,
// and a spread of FosterPlacements — one open (an actual in-care animal with
// its currentUnitId nulled), two closed with varied return reasons, and one
// FOSTER_TO_ADOPT placement fully converted into an adoption (its own animal,
// so the intake -> placement -> adoption cascade is unambiguous).
async function seedFostering() {
  console.log("Seeding foster profiles, applications, and placements...");

  const staffMembers = await prisma.person.findMany({
    where: { user: { role: Role.STAFF } },
  });
  const walkInPersons = await prisma.person.findMany({
    where: { user: null, name: { notIn: ["External Agency", "SYSTEM"] } },
  });
  const volunteerPersons = await prisma.person.findMany({
    where: { user: { role: Role.VOLUNTEER } },
  });
  const userRolePersons = await prisma.person.findMany({
    where: { user: { role: Role.USER } },
  });
  const dbSpecies = await prisma.species.findMany();

  if (staffMembers.length === 0 || walkInPersons.length < 6) {
    console.log(
      "Skipping foster seeding: insufficient staff or walk-in persons.",
    );
    return;
  }

  const dogSpecies = dbSpecies.find((s) => s.name === "Dog");
  const catSpecies = dbSpecies.find((s) => s.name === "Cat");
  const rabbitSpecies = dbSpecies.find((s) => s.name === "Rabbit");
  const approver = getRandomItem(staffMembers);

  const shuffledWalkIns = [...walkInPersons].sort(() => Math.random() - 0.5);
  // The roster: one volunteer, one USER account, and two walk-ins with no
  // account at all — covers "at least one on a Person with no User account".
  const fosterPeople: ApplicantPerson[] = [
    volunteerPersons[0] ?? shuffledWalkIns[0],
    userRolePersons[0] ?? shuffledWalkIns[1],
    shuffledWalkIns[2],
    shuffledWalkIns[3],
  ];
  // Distinct from the roster above, for the standalone application pool.
  const applicantPeople = shuffledWalkIns.slice(4, 6);

  const speciesIds = (species: (typeof dbSpecies)[number] | undefined) =>
    species ? { connect: [{ id: species.id }] } : undefined;

  const [activeGeneralist, activeMedical, paused, activeHighCapacity] =
    await Promise.all([
      prisma.fosterProfile.create({
        data: {
          personId: fosterPeople[0].id,
          status: FosterStatus.ACTIVE,
          maxAnimals: 2,
          canGiveOralMeds: true,
          canTransport: true,
          availabilityNotes: "Available most weekends, prefers dogs.",
          approvedAt: daysAgo(90),
          speciesCapabilities: {
            connect: [dogSpecies, catSpecies]
              .filter((s): s is NonNullable<typeof s> => !!s)
              .map((s) => ({ id: s.id })),
          },
        },
      }),
      prisma.fosterProfile.create({
        data: {
          personId: fosterPeople[1].id,
          status: FosterStatus.ACTIVE,
          maxAnimals: 1,
          hasQuarantineSpace: true,
          canGiveOralMeds: true,
          acceptsMedical: true,
          availabilityNotes: "Experienced with post-surgical recovery cats.",
          approvedAt: daysAgo(150),
          speciesCapabilities: speciesIds(catSpecies),
        },
      }),
      prisma.fosterProfile.create({
        data: {
          personId: fosterPeople[2].id,
          status: FosterStatus.PAUSED,
          maxAnimals: 1,
          canBottleFeed: true,
          acceptsHospice: true,
          availabilityNotes:
            "Currently paused — traveling until further notice.",
          approvedAt: daysAgo(200),
          speciesCapabilities: speciesIds(dogSpecies),
        },
      }),
      prisma.fosterProfile.create({
        data: {
          personId: fosterPeople[3].id,
          status: FosterStatus.ACTIVE,
          maxAnimals: 3,
          hasQuarantineSpace: true,
          canGiveOralMeds: true,
          canTransport: true,
          availabilityNotes: "High-capacity home, happy to take litters.",
          approvedAt: daysAgo(45),
          speciesCapabilities: {
            connect: [dogSpecies, catSpecies, rabbitSpecies]
              .filter((s): s is NonNullable<typeof s> => !!s)
              .map((s) => ({ id: s.id })),
          },
        },
      }),
    ]);
  // `paused` isn't otherwise referenced — it exists purely as roster data.
  void paused;

  // --- Foster applications (PENDING / REVIEWING), same snapshot convention
  // as AdoptionApplication.
  const applicationPlans: { applicant: ApplicantPerson; reviewed: boolean }[] =
    applicantPeople.map((applicant, i) => ({
      applicant,
      reviewed: i === 1,
    }));

  for (const plan of applicationPlans) {
    const submittedAt = daysAgo(randomInt(5, 20));
    const householdData = generateHouseholdProfileData();

    const application = await prisma.fosterApplication.create({
      data: {
        ...applicantSnapshot(plan.applicant),
        personId: plan.applicant.id,
        ...householdData,
        maxAnimals: randomInt(1, 2),
        canGiveOralMeds: Math.random() < 0.5,
        canTransport: Math.random() < 0.5,
        availabilityNotes: "Submitted via the foster application form.",
        status: ApplicationStatus.PENDING,
        submittedAt,
        speciesCapabilities: speciesIds(dogSpecies),
        history: {
          create: {
            status: ApplicationStatus.PENDING,
            statusChangeReason: "Application submitted by applicant.",
            changedById: plan.applicant.id,
            changedAt: submittedAt,
          },
        },
      },
    });

    await prisma.householdProfile.upsert({
      where: { personId: plan.applicant.id },
      create: { personId: plan.applicant.id, ...householdData },
      update: householdData,
    });

    if (plan.reviewed) {
      const reviewedAt = addDaysClamped(
        submittedAt,
        randomInt(1, 4),
        new Date(),
      );
      await prisma.fosterApplication.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.REVIEWING },
      });
      await prisma.fosterApplicationStatusHistory.create({
        data: {
          applicationId: application.id,
          status: ApplicationStatus.REVIEWING,
          statusChangeReason: "Application moved to review.",
          changedById: approver.id,
          changedAt: reviewedAt,
        },
      });
    }
  }

  // --- Placements: one open, two closed with varied return reasons ---

  // Pull real in-care, currently-housed animals so the open placement
  // faithfully seeds "currentUnitId nulled, previousUnitId set".
  const housedInCareAnimals = await prisma.animal.findMany({
    where: {
      listingStatus: {
        in: [AnimalListingStatus.PUBLISHED, AnimalListingStatus.DRAFT],
      },
      currentUnitId: { not: null },
    },
    select: { id: true, currentUnitId: true },
  });

  if (housedInCareAnimals.length >= 3) {
    const [openAnimal, closedAnimal1, closedAnimal2] = pickDistinct(
      housedInCareAnimals,
      3,
    );

    const openStart = daysAgo(6);
    await prisma.fosterPlacement.create({
      data: {
        animalId: openAnimal.id,
        // USER-linked foster profile: the "my foster animals" page
        // needs a seeded USER account with a real open placement to view.
        fosterProfileId: activeMedical.id,
        type: FosterPlacementType.GENERAL,
        startDate: openStart,
        previousUnitId: openAnimal.currentUnitId,
        placedById: approver.id,
      },
    });
    await prisma.animal.update({
      where: { id: openAnimal.id },
      data: { currentUnitId: null },
    });
    await prisma.animalActivityLog.create({
      data: {
        animalId: openAnimal.id,
        activityType: "FOSTER_PLACED",
        changedById: approver.id,
        changedAt: openStart,
        changeSummary: "Animal was placed with a foster.",
      },
    });

    const closedPlans = [
      {
        animal: closedAnimal1,
        reason: FosterReturnReason.RETURNED_TO_SHELTER,
        profile: activeGeneralist,
        notes: "Foster's circumstances changed; animal returned to the shelter.",
      },
      {
        animal: closedAnimal2,
        reason: FosterReturnReason.MEDICAL,
        profile: activeHighCapacity,
        notes:
          "Returned for a vet follow-up the foster couldn't provide at home.",
      },
    ];

    for (const plan of closedPlans) {
      const start = daysAgo(randomInt(90, 150));
      const end = addDaysClamped(start, randomInt(20, 45), new Date());
      const returnStaff = getRandomItem(staffMembers);

      await prisma.fosterPlacement.create({
        data: {
          animalId: plan.animal.id,
          fosterProfileId: plan.profile.id,
          type: FosterPlacementType.GENERAL,
          startDate: start,
          endDate: end,
          previousUnitId: plan.animal.currentUnitId,
          placedById: approver.id,
          returnedById: returnStaff.id,
          returnReason: plan.reason,
          returnNotes: plan.notes,
        },
      });
      await prisma.animalActivityLog.create({
        data: {
          animalId: plan.animal.id,
          activityType: "FOSTER_PLACED",
          changedById: approver.id,
          changedAt: start,
          changeSummary: "Animal was placed with a foster.",
        },
      });
      await prisma.animalActivityLog.create({
        data: {
          animalId: plan.animal.id,
          activityType: "FOSTER_RETURNED",
          changedById: returnStaff.id,
          changedAt: end,
          changeSummary: `Animal was returned from foster: ${plan.reason
            .replace(/_/g, " ")
            .toLowerCase()}.`,
        },
      });
    }
  } else {
    console.log(
      "Skipping open/closed placement seeding: not enough housed in-care animals.",
    );
  }

  // --- Foster-to-adopt conversion: a dedicated animal, so its
  // intake -> placement -> adoption cascade is unambiguous ---
  const dogBreeds = dogSpecies
    ? await prisma.breed.findMany({ where: { speciesId: dogSpecies.id } })
    : [];
  const dbColors = await prisma.color.findMany();
  const dbUnits = await prisma.unit.findMany();

  if (
    dogSpecies &&
    dogBreeds.length > 0 &&
    dbColors.length > 0 &&
    dbUnits.length > 0
  ) {
    const primaryColor = getRandomItem(dbColors);
    const breed = getRandomItem(dogBreeds);
    const startUnit = getRandomItem(dbUnits);

    const fosterAdopter = fosterPeople[0];
    const intakeDate = daysAgo(70);
    const placedAt = daysAgo(45);
    const reviewedAt = daysAgo(30);
    const approvedAt = daysAgo(15);
    const adoptedAt = daysAgo(3);

    const animal = await prisma.animal.create({
      data: {
        name: "Winston",
        birthDate: getRandomDate(2),
        sex: Sex.MALE,
        size: getAnimalSize(dogSpecies.name, 22),
        weightKg: 22,
        heightCm: 48,
        city: "New York",
        state: "NY",
        description: "A wonderful companion looking for a home.",
        listingStatus: AnimalListingStatus.PUBLISHED,
        publishedAt: intakeDate,
        healthStatus: AnimalHealthStatus.HEALTHY,
        species: { connect: { id: dogSpecies.id } },
        breeds: { connect: [{ id: breed.id }] },
        colors: { connect: [{ id: primaryColor.id }] },
        primaryColor: { connect: { id: primaryColor.id } },
        animalImages: { create: [{ url: `${baseUrl}/${PLACEHOLDER_IMAGE}` }] },
        currentUnit: { connect: { id: startUnit.id } },
      },
    });

    const surrenderer = getRandomItem(walkInPersons);
    await prisma.intake.create({
      data: {
        animalId: animal.id,
        type: IntakeType.OWNER_SURRENDER,
        intakeDate,
        staffMemberId: approver.id,
        surrenderingPersonId: surrenderer.id,
      },
    });
    await prisma.animalActivityLog.create({
      data: {
        animalId: animal.id,
        activityType: "INTAKE_PROCESSED",
        changedById: approver.id,
        changedAt: intakeDate,
        changeSummary: "Animal was admitted as owner surrender.",
      },
    });

    const placement = await prisma.fosterPlacement.create({
      data: {
        animalId: animal.id,
        fosterProfileId: activeGeneralist.id,
        type: FosterPlacementType.FOSTER_TO_ADOPT,
        startDate: placedAt,
        previousUnitId: startUnit.id,
        previousListingStatus: AnimalListingStatus.PUBLISHED,
        placedById: approver.id,
      },
    });
    await prisma.animal.update({
      where: { id: animal.id },
      data: {
        currentUnitId: null,
        listingStatus: AnimalListingStatus.PENDING_ADOPTION,
      },
    });
    await prisma.animalActivityLog.create({
      data: {
        animalId: animal.id,
        activityType: "FOSTER_PLACED",
        changedById: approver.id,
        changedAt: placedAt,
        changeSummary: "Animal was placed with a foster (foster-to-adopt).",
      },
    });

    const applicationId = await seedApplicationWithHistory({
      animalId: animal.id,
      applicant: fosterAdopter,
      submittedAt: placedAt,
      reasonForAdoption:
        "Fell in love with this foster placement and decided to make it permanent.",
      householdProfileData: generateHouseholdProfileData(),
      transitions: [
        {
          status: ApplicationStatus.REVIEWING,
          reason: "Application moved to review.",
          changedById: approver.id,
          at: reviewedAt,
        },
        {
          status: ApplicationStatus.APPROVED,
          reason: "Approved — foster-to-adopt conversion.",
          changedById: approver.id,
          at: approvedAt,
        },
      ],
    });

    const outcome = await prisma.outcome.create({
      data: {
        animalId: animal.id,
        type: OutcomeType.ADOPTION,
        outcomeDate: adoptedAt,
        staffMemberId: approver.id,
        adoptionApplicationId: applicationId,
      },
    });
    await prisma.animalActivityLog.create({
      data: {
        animalId: animal.id,
        activityType: "OUTCOME_PROCESSED",
        changedById: approver.id,
        changedAt: adoptedAt,
        changeSummary: "Animal was processed for outcome: adoption.",
      },
    });
    await prisma.adoptionApplication.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.ADOPTED },
    });
    await prisma.applicationStatusHistory.create({
      data: {
        applicationId,
        status: ApplicationStatus.ADOPTED,
        statusChangeReason: "Animal adopted by their foster.",
        changedById: approver.id,
        changedAt: adoptedAt,
      },
    });

    await prisma.fosterPlacement.update({
      where: { id: placement.id },
      data: {
        endDate: adoptedAt,
        returnReason: FosterReturnReason.ADOPTED_BY_FOSTER,
        returnedById: approver.id,
        outcomeId: outcome.id,
        adoptionApplicationId: applicationId,
      },
    });
    await prisma.animalActivityLog.create({
      data: {
        animalId: animal.id,
        activityType: "FOSTER_RETURNED",
        changedById: approver.id,
        changedAt: adoptedAt,
        changeSummary: "Foster-to-adopt placement converted to an adoption.",
      },
    });

    await prisma.animal.update({
      where: { id: animal.id },
      data: {
        listingStatus: AnimalListingStatus.ARCHIVED,
        archiveReason: OutcomeType.ADOPTION,
      },
    });
  } else {
    console.log(
      "Skipping foster-to-adopt conversion seeding: missing species/breed/color/unit data.",
    );
  }

  console.log("Seeded foster profiles, applications, and placements.");
}

// Sprinkles standalone adoption applications (not tied to a completed
// adoption) across still-PUBLISHED animals, spread realistically across
// every ApplicationStatus, so the applications dashboard — and the future
// funnel report — has more than just the adoption-cascade data to show.
async function seedApplicationNoise() {
  console.log("Seeding standalone adoption applications...");

  const staffMembers = await prisma.person.findMany({
    where: { user: { role: Role.STAFF } },
  });
  const walkInPersons = await prisma.person.findMany({
    where: { user: null, name: { notIn: ["External Agency", "SYSTEM"] } },
  });
  const userRolePersons = await prisma.person.findMany({
    where: { user: { role: Role.USER } },
  });
  const applicantPool: ApplicantPerson[] = [...walkInPersons, ...userRolePersons];

  const publishedAnimals = await prisma.animal.findMany({
    where: { listingStatus: AnimalListingStatus.PUBLISHED },
    select: {
      id: true,
      intake: {
        select: { intakeDate: true },
        orderBy: { intakeDate: "desc" },
        take: 1,
      },
    },
  });

  if (publishedAnimals.length === 0 || applicantPool.length === 0) {
    console.log(
      "No published animals or applicants found, skipping application noise.",
    );
    return;
  }

  type NoisePlan = { status: ApplicationStatus; reactivate?: boolean };
  const plans: NoisePlan[] = [
    ...Array(10).fill({ status: ApplicationStatus.PENDING }),
    ...Array(6).fill({ status: ApplicationStatus.REVIEWING }),
    ...Array(4).fill({ status: ApplicationStatus.WAITLISTED }),
    ...Array(6).fill({ status: ApplicationStatus.APPROVED }),
    ...Array(5).fill({ status: ApplicationStatus.REJECTED }),
    { status: ApplicationStatus.WITHDRAWN },
    { status: ApplicationStatus.WITHDRAWN },
    { status: ApplicationStatus.WITHDRAWN, reactivate: true },
    { status: ApplicationStatus.WITHDRAWN, reactivate: true },
  ];

  const shuffledAnimals = [...publishedAnimals].sort(() => Math.random() - 0.5);
  const shuffledApplicants = [...applicantPool].sort(() => Math.random() - 0.5);

  // Avoid pairing the same applicant with the same animal twice — the app
  // allows only one active application per person per animal.
  const usedPairs = new Set<string>();
  let animalIdx = 0;
  let applicantIdx = 0;

  for (const plan of plans) {
    const animal = shuffledAnimals[animalIdx % shuffledAnimals.length];
    let applicant = shuffledApplicants[applicantIdx % shuffledApplicants.length];
    let attempts = 0;
    while (
      usedPairs.has(`${applicant.id}:${animal.id}`) &&
      attempts < shuffledApplicants.length
    ) {
      applicantIdx++;
      applicant = shuffledApplicants[applicantIdx % shuffledApplicants.length];
      attempts++;
    }
    usedPairs.add(`${applicant.id}:${animal.id}`);
    animalIdx++;
    applicantIdx++;

    const now = new Date();
    const intakeDate =
      animal.intake[0]?.intakeDate ??
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const submittedAt = addDaysClamped(intakeDate, randomInt(1, 20), now);
    const staffMember = getRandomItem(staffMembers);

    const transitions: AppTransition[] = [];
    let cursor = submittedAt;

    if (plan.status !== ApplicationStatus.PENDING) {
      cursor = addDaysClamped(cursor, randomInt(1, 5), now);
      transitions.push({
        status: ApplicationStatus.REVIEWING,
        reason: "Application moved to review.",
        changedById: staffMember.id,
        at: cursor,
      });
    }

    if (plan.status === ApplicationStatus.WAITLISTED) {
      cursor = addDaysClamped(cursor, randomInt(1, 5), now);
      transitions.push({
        status: ApplicationStatus.WAITLISTED,
        reason: "Strong application, held as a backup for this animal.",
        changedById: staffMember.id,
        at: cursor,
      });
    } else if (plan.status === ApplicationStatus.APPROVED) {
      cursor = addDaysClamped(cursor, randomInt(1, 7), now);
      transitions.push({
        status: ApplicationStatus.APPROVED,
        reason: "Approved after a successful home visit.",
        changedById: staffMember.id,
        at: cursor,
      });
    } else if (plan.status === ApplicationStatus.REJECTED) {
      cursor = addDaysClamped(cursor, randomInt(1, 7), now);
      transitions.push({
        status: ApplicationStatus.REJECTED,
        reason: getRandomItem(rejectionReasonPool),
        changedById: staffMember.id,
        at: cursor,
      });
    } else if (plan.status === ApplicationStatus.WITHDRAWN) {
      cursor = addDaysClamped(cursor, randomInt(1, 10), now);
      transitions.push({
        status: ApplicationStatus.WITHDRAWN,
        reason: getRandomItem(withdrawalReasonPool),
        changedById: applicant.id,
        at: cursor,
      });
      if (plan.reactivate) {
        cursor = addDaysClamped(cursor, randomInt(1, 5), now);
        transitions.push({
          status: ApplicationStatus.PENDING,
          reason: "Application reactivated by user.",
          changedById: applicant.id,
          at: cursor,
        });
      }
    }

    await seedApplicationWithHistory({
      animalId: animal.id,
      applicant,
      submittedAt,
      reasonForAdoption: getRandomItem(adoptionReasonPool),
      householdProfileData: generateHouseholdProfileData(),
      transitions,
    });

    // A standalone (non-adopted) APPROVED application couples the animal to
    // PENDING_ADOPTION, mirroring `_staffUpdateAdoptionApp`'s approval cascade.
    const finalStatus =
      transitions.length > 0
        ? transitions[transitions.length - 1].status
        : ApplicationStatus.PENDING;
    if (finalStatus === ApplicationStatus.APPROVED) {
      await prisma.animal.updateMany({
        where: { id: animal.id, listingStatus: AnimalListingStatus.PUBLISHED },
        data: { listingStatus: AnimalListingStatus.PENDING_ADOPTION },
      });
    }
  }

  console.log(`Seeded ${plans.length} standalone adoption applications.`);
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

async function clearDatabase() {
  console.log("Clearing existing data...");

  await prisma.medicationLog.deleteMany();
  await prisma.medicationSchedule.deleteMany();
  await prisma.assessmentField.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.animalActivityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.intake.deleteMany();
  await prisma.outcome.deleteMany();
  await prisma.applicationStatusHistory.deleteMany();
  await prisma.adoptionApplication.deleteMany();

  // FosterPlacement restricts deletion of Animal/FosterProfile, so it must go
  // before both. Its links to AdoptionApplication/Outcome are SetNull, so
  // order relative to those doesn't matter.
  await prisma.fosterPlacement.deleteMany();
  // FosterApplicationStatusHistory cascades from FosterApplication.
  await prisma.fosterApplication.deleteMany();

  await prisma.animalNote.deleteMany();
  await prisma.personNote.deleteMany();
  await prisma.partnerNote.deleteMany();
  await prisma.partnerContact.deleteMany();
  await prisma.like.deleteMany();

  await prisma.fosterProfile.deleteMany();
  await prisma.householdProfile.deleteMany();

  await prisma.animalImage.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.animal.deleteMany();

  // Units reference Location; Animal references Unit (SetNull). Animals are
  // already cleared above, so units then locations can be removed safely.
  await prisma.unit.deleteMany();
  await prisma.location.deleteMany();

  await prisma.assessmentTemplate.deleteMany();

  await prisma.partner.deleteMany();

  await prisma.breed.deleteMany();
  await prisma.species.deleteMany();
  await prisma.color.deleteMany();
  await prisma.characteristic.deleteMany();

  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.person.deleteMany();

  console.log("Cleared existing data.");
}

// Defensive final check: derives each animal's presence purely from its
// Intake/Outcome timeline — the same source of truth `computeStays` (in
// stay-utils.ts) uses for the real app — and asserts it matches the Animal
// row's own listingStatus/archiveReason. This is what catches a stranded
// animal (state written before, or without, its justifying event) that a
// swallowed per-animal error could otherwise let through silently.
async function assertAnimalLifecycleConsistency() {
  console.log("Verifying animal lifecycle consistency...");

  const animals = await prisma.animal.findMany({
    select: {
      id: true,
      name: true,
      listingStatus: true,
      archiveReason: true,
      intake: { select: { intakeDate: true } },
      Outcome: {
        select: {
          outcomeDate: true,
          type: true,
          ownerId: true,
          destinationPartnerId: true,
          adoptionApplicationId: true,
        },
      },
    },
  });

  const violations: string[] = [];
  const now = new Date();

  for (const animal of animals) {
    const events = [
      ...animal.intake.map((i) => ({ kind: "intake" as const, date: i.intakeDate })),
      ...animal.Outcome.map((o) => ({ kind: "outcome" as const, date: o.outcomeDate })),
    ];
    const { isInCare, stays } = computeStays(events, now);
    const lastStay = stays[stays.length - 1];
    const isArchived = animal.listingStatus === AnimalListingStatus.ARCHIVED;
    const label = `"${animal.name}" (${animal.id})`;

    // `computeStays` is deliberately forgiving (it silently drops a
    // duplicate intake or an orphan outcome rather than throwing), which is
    // right for the app at runtime but means it alone can't catch a broken
    // seed timeline — it would just quietly re-pair around the gap. So walk
    // the same chronologically-sorted events here and assert they strictly
    // alternate intake -> outcome -> intake -> ..., starting with an intake,
    // with only the final event allowed to be an unclosed intake. Same tie
    // -break as `computeStays` (outcome before intake on equal timestamps).
    const kindRank = (kind: "intake" | "outcome") => (kind === "outcome" ? 0 : 1);
    const sortedEvents = [...events].sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime();
      return byDate !== 0 ? byDate : kindRank(a.kind) - kindRank(b.kind);
    });

    let expectingIntake = true;
    for (const event of sortedEvents) {
      if (expectingIntake && event.kind !== "intake") {
        violations.push(
          `${label} has an outcome (${event.date.toISOString()}) with no preceding open intake.`,
        );
        break;
      }
      if (!expectingIntake && event.kind !== "outcome") {
        violations.push(
          `${label} has two consecutive intakes with no outcome between them (around ${event.date.toISOString()}).`,
        );
        break;
      }
      expectingIntake = !expectingIntake;
    }

    if (isArchived) {
      if (isInCare || !lastStay || lastStay.outcomeDate === null) {
        violations.push(
          `${label} is ARCHIVED but its latest event is not a closing outcome.`,
        );
      }
      if (!animal.archiveReason) {
        violations.push(`${label} is ARCHIVED but has no archiveReason.`);
      }
    } else if (!isInCare) {
      violations.push(
        `${label} is ${animal.listingStatus} but its latest event is a closing outcome with no following intake (it should be ARCHIVED).`,
      );
    }

    // These relations are construction-guaranteed by the write paths above
    // (an empty recipient is exactly the class of bug this branch exists to
    // fix), so assert them rather than trust it.
    for (const outcome of animal.Outcome) {
      if (outcome.type === OutcomeType.RETURN_TO_OWNER && !outcome.ownerId) {
        violations.push(
          `${label} has a RETURN_TO_OWNER outcome with no ownerId.`,
        );
      }
      if (outcome.type === OutcomeType.TRANSFER_OUT && !outcome.destinationPartnerId) {
        violations.push(
          `${label} has a TRANSFER_OUT outcome with no destinationPartnerId.`,
        );
      }
      if (outcome.type === OutcomeType.ADOPTION && !outcome.adoptionApplicationId) {
        violations.push(
          `${label} has an ADOPTION outcome with no adoptionApplicationId.`,
        );
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Animal lifecycle consistency check failed for ${violations.length} of ${animals.length} animal(s):\n` +
        violations.join("\n"),
    );
  }

  console.log(`Verified lifecycle consistency for ${animals.length} animals.`);
}

export async function main() {
  console.log("Start seeding new data...");
  await clearDatabase();
  await seedPersonsAndUsers();
  await seedWalkInPersons();
  await seedLookupTables();
  await seedPartners();
  await seedAssessmentTemplates();
  await seedLocationsAndUnits();
  await seedAnimalsAndRelations();
  await seedFostering();
  await seedApplicationNoise();
  await seedTasks();
  await seedAssessments();
  await assertAnimalLifecycleConsistency();
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
