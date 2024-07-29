const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const species = [
  {
    id: "134aadd0-2436-4f5c-bdd6-c7245cf3e3a2",
    name: "Dog",
  },
  {
    id: "16fbe716-4b15-4fec-8f11-2a6ab543e886",
    name: "Cat",
  },
  {
    id: "2c791ce7-33b0-49cd-8e2c-93dca66d845d",
    name: "Bird",
  },
  {
    id: "f73842fa-2769-4b6d-8763-774cbd8ab109",
    name: "Rabbit",
  },
  {
    id: "da1d8d4e-3e10-4adf-a9c6-f009eb93812c",
    name: "Reptile",
  },
  {
    id: "bb48b4bb-ee0d-464a-a1ad-0479bead3812",
    name: "Other",
  },
];

const petData = [
  {
    name: "Max",
    age: 5,
    gender: "Female",
    species: {
      connect: { id: "134aadd0-2436-4f5c-bdd6-c7245cf3e3a2" },
    },
    breed: "Golden Retriever",
    weight: 30,
    height: 60,
    city: "New York",
    state: "NY",
    description: "Friendly and playful",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
  {
    name: "Whiskers",
    age: 3,
    gender: "Male",
    species: {
      connect: { id: "134aadd0-2436-4f5c-bdd6-c7245cf3e3a2" },
    },
    breed: "Golden Retriever",
    weight: 10,
    height: 5,
    city: "New York",
    state: "NY",
    description: "Independent and curious",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
  {
    name: "Fido",
    age: 5,
    gender: "Male",
    species: {
      connect: { id: "2c791ce7-33b0-49cd-8e2c-93dca66d845d" },
    },
    breed: "Golden Retriever",
    weight: 20,
    height: 15,
    city: "New York",
    state: "NY",
    description: "Friendly and playful",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
  {
    name: "Tweety",
    age: 2,
    gender: "female",
    species: {
      connect: { id: "2c791ce7-33b0-49cd-8e2c-93dca66d845d" },
    },
    breed: "Golden Retriever",
    weight: 3,
    height: 1,
    city: "New York",
    state: "NY",
    description: "Vocal and charming",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
  {
    name: "Nemo",
    age: 1,
    gender: "Male",
    species: {
      connect: { id: "2c791ce7-33b0-49cd-8e2c-93dca66d845d" },
    },
    breed: "Golden Retriever",
    weight: 1,
    height: 2,
    city: "New York",
    state: "NY",
    description: "Colorful and adventurous",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
  {
    name: "Nemower",
    age: 1,
    gender: "Male",
    species: {
      connect: { id: "2c791ce7-33b0-49cd-8e2c-93dca66d845d" },
    },
    breed: "Golden Retriever",
    weight: 6,
    height: 3,
    city: "New York",
    state: "NY",
    description: "Colorful and adventurous",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
  {
    name: "fkjshakfh",
    age: 1,
    gender: "Male",
    species: {
      connect: { id: "2c791ce7-33b0-49cd-8e2c-93dca66d845d" },
    },
    breed: "Golden Retriever",
    weight: 7,
    height: 2,
    city: "New York",
    state: "NY",
    description: "Colorful and adventurous",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
  {
    name: "Tweetysfadfsaf",
    age: 2,
    gender: "Male",
    species: {
      connect: { id: "2c791ce7-33b0-49cd-8e2c-93dca66d845d" },
    },
    breed: "Golden Retriever",
    weight: 1,
    height: 1,
    city: "New York",
    state: "NY",
    description: "Vocal and charming",
    published: true,
    adoptionStatus: {
      connect: { id: "640566d8-2619-4764-8660-61a39baf075e" },
    },
    petImages: {
      create: [{ url: "/pets/cat.jpg" }],
    },
  },
];

const adoptionStatus = [
  {
    id: "2609d1ce-f62b-42e3-a649-0129ace0152b",
    name: "Adopted",
  },
  {
    id: "640566d8-2619-4764-8660-61a39baf075e",
    name: "Available",
  },
  {
    id: "09fe1188-741e-4a97-a9ad-0cfd094ee247",
    name: "Pending",
  },
];

async function seedSpecies() {
  console.log("Seeding species ...");
  try {
    for (const s of species) {
      await prisma.species.create({
        data: s,
      });
    }
  } catch (error) {
    console.error("Error seeding species:", error);
    throw error;
  }
  console.log("Seeded species");
}

async function seedAdoptionStatus() {
  console.log("Seeding adoption status ...");
  try {
    for (const status of adoptionStatus) {
      await prisma.adoptionStatus.create({
        data: status,
      });
    }
  } catch (error) {
    console.error("Error seeding adoption status:", error);
    throw error;
  }
  console.log("Seeded adoption status");
}
const users = [
  {
    name: "admin",
    email: "admin@mail.com",
    image: "https://avatars.githubusercontent.com/u/106351230?v=4",
    role: "ADMIN",
    createdAt: new Date("2024-06-02T07:34:56.465Z"),
    updatedAt: new Date("2024-06-02T07:34:56.465Z"),
  },
];

async function seedUsers() {
  console.log("Seeding users ...");
  try {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: {
        name: "admin",
        password: hashedPassword,
        email: "admin@example.com",
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Error seeding users:", error);
    throw error;
  }
  console.log("Seeded users");
}

async function seedPets() {
  console.log("Seeding pets ...");
  for (const pet of petData) {
    try {
      await prisma.pet.create({
        data: pet,
      });
    } catch (error) {
      console.error("Error seeding pets:", error);
      throw error;
    }
  }
  console.log("Seeded pets");
}

async function main() {
  // Clear existing data
  console.log("Deleting existing data ...");
  await prisma.petImage.deleteMany();
  await prisma.pet.deleteMany();
  await prisma.adoptionStatus.deleteMany();
  await prisma.species.deleteMany();
  await prisma.user.deleteMany();

  // Seed data
  console.log("Start seeding ...");
  await seedSpecies();
  await seedAdoptionStatus();
  await seedUsers();
  await seedPets();
  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
