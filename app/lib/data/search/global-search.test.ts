import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/prisma/generated/enums";
import { nonAdminPersonFilter } from "../people-directory/person-search";
import {
  animalSearchWhere,
  GLOBAL_SEARCH_GROUP_LIMIT,
  GLOBAL_SEARCH_GROUPS,
  runGlobalSearch,
  type GlobalSearchDb,
} from "./global-search";

type Call = { model: string; args: Record<string, unknown> };

// Records every findMany call and answers with the canned rows for its model.
const fakeDb = (rows: Record<string, unknown[]> = {}) => {
  const calls: Call[] = [];
  const delegate = (model: string) => ({
    findMany: async (args: Record<string, unknown>) => {
      calls.push({ model, args });
      return rows[model] ?? [];
    },
  });
  const db = {
    animal: delegate("animal"),
    person: delegate("person"),
    partner: delegate("partner"),
    adoptionApplication: delegate("adoptionApplication"),
    fosterApplication: delegate("fosterApplication"),
    outcome: delegate("outcome"),
  } as unknown as GlobalSearchDb;
  return { db, calls };
};

test("a group that isn't allowed returns null and runs no query", async () => {
  const { db, calls } = fakeDb();
  const results = await runGlobalSearch(db, "bella", ["animals", "partners"]);

  assert.deepEqual(results, {
    animals: [],
    people: null,
    partners: [],
    adoptionApplications: null,
    fosterApplications: null,
  });
  assert.deepEqual(
    calls.map((c) => c.model),
    ["animal", "partner"],
  );
});

test("every group takes at most 5, most recently updated first", async () => {
  const { db, calls } = fakeDb();
  await runGlobalSearch(db, "bella", GLOBAL_SEARCH_GROUPS);

  assert.equal(calls.length, 5);
  assert.equal(GLOBAL_SEARCH_GROUP_LIMIT, 5);
  for (const { model, args } of calls) {
    assert.equal(args.take, 5, model);
    assert.deepEqual(args.orderBy, { updatedAt: "desc" }, model);
  }
});

test("a query under 2 characters runs no query and returns empty allowed groups", async () => {
  const { db, calls } = fakeDb();
  const results = await runGlobalSearch(db, "b", ["people"]);

  assert.equal(calls.length, 0);
  assert.deepEqual(results.people, []);
  assert.equal(results.animals, null);
});

test("people search excludes ADMIN accounts", async () => {
  const { db, calls } = fakeDb();
  await runGlobalSearch(db, "jane", ["people"]);

  const where = calls[0].args.where as { AND: unknown[] };
  assert.ok(where.AND.includes(nonAdminPersonFilter));
  assert.deepEqual(nonAdminPersonFilter, {
    OR: [{ user: null }, { user: { role: { not: Role.ADMIN } } }],
  });
});

test("microchip matches exactly, and only for a single token of 9+ characters", () => {
  const microchipClause = (query: string) =>
    (animalSearchWhere(query).OR ?? []).find((c) => "microchipNumber" in c);

  assert.deepEqual(microchipClause("985141000100001"), {
    microchipNumber: { equals: "985141000100001" },
  });
  assert.ok(microchipClause("123456789"));
  assert.equal(microchipClause("12345678"), undefined);
  assert.equal(microchipClause("98514 1000100001"), undefined);
  assert.deepEqual(
    (animalSearchWhere("bella").OR ?? []).find((c) => "name" in c),
    { name: { contains: "bella", mode: "insensitive" } },
  );
});

test("rows are flattened to the fields the palette needs", async () => {
  const { db } = fakeDb({
    animal: [
      {
        id: "a1",
        name: "Bella",
        listingStatus: "PUBLISHED",
        species: { name: "Dog" },
        breeds: [{ name: "Beagle" }, { name: "Boxer" }],
      },
    ],
    person: [
      { id: "p1", name: "Jane Doe", email: "jane@example.com", phone: null, user: { id: "u1" } },
      { id: "p2", name: "Jane Roe", email: null, phone: "555-0100", user: null },
    ],
    adoptionApplication: [
      {
        id: "ap1",
        applicantName: "Jane Doe",
        status: "PENDING",
        submittedAt: new Date("2026-09-01T10:00Z"),
        animalId: "a1",
        animal: { name: "Bella" },
      },
    ],
  });
  const results = await runGlobalSearch(db, "bella", GLOBAL_SEARCH_GROUPS);

  assert.deepEqual(results.animals, [
    { id: "a1", name: "Bella", species: "Dog", breeds: ["Beagle", "Boxer"], listingStatus: "PUBLISHED" },
  ]);
  assert.deepEqual(
    results.people?.map((p) => p.hasAccount),
    [true, false],
  );
  assert.deepEqual(results.adoptionApplications, [
    { id: "ap1", applicantName: "Jane Doe", animalName: "Bella", status: "PENDING" },
  ]);
});

// The column holds only the review decision, so a hit read straight off it
// would badge an adopted or closed application with whatever it was decided
// before the animal left.
test("an adoption application hit shows its effective status", async () => {
  const { db } = fakeDb({
    adoptionApplication: [
      {
        id: "adopter",
        applicantName: "Jane Doe",
        status: "APPROVED",
        submittedAt: new Date("2026-09-01T10:00Z"),
        animalId: "a1",
        animal: { name: "Bella" },
      },
      {
        id: "other",
        applicantName: "Jane Roe",
        status: "REVIEWING",
        submittedAt: new Date("2026-09-02T10:00Z"),
        animalId: "a1",
        animal: { name: "Bella" },
      },
    ],
    outcome: [
      {
        animalId: "a1",
        createdAt: new Date("2026-09-10T10:00Z"),
        type: "ADOPTION",
        adoptionApplicationId: "adopter",
        reversedAt: null,
      },
    ],
  });
  const results = await runGlobalSearch(db, "bella", ["adoptionApplications"]);

  assert.deepEqual(
    results.adoptionApplications?.map((hit) => [hit.id, hit.status]),
    [
      ["adopter", "ADOPTED"],
      ["other", "CLOSED"],
    ],
  );
});

test("a reversed outcome neither adopts nor closes a hit", async () => {
  const { db } = fakeDb({
    adoptionApplication: [
      {
        id: "adopter",
        applicantName: "Jane Doe",
        status: "APPROVED",
        submittedAt: new Date("2026-09-01T10:00Z"),
        animalId: "a1",
        animal: { name: "Bella" },
      },
      {
        id: "other",
        applicantName: "Jane Roe",
        status: "REVIEWING",
        submittedAt: new Date("2026-09-02T10:00Z"),
        animalId: "a1",
        animal: { name: "Bella" },
      },
    ],
    outcome: [
      {
        animalId: "a1",
        createdAt: new Date("2026-09-10T10:00Z"),
        type: "ADOPTION",
        adoptionApplicationId: "adopter",
        reversedAt: new Date("2026-09-11T10:00Z"),
      },
    ],
  });
  const results = await runGlobalSearch(db, "bella", ["adoptionApplications"]);

  assert.deepEqual(
    results.adoptionApplications?.map((hit) => [hit.id, hit.status]),
    [
      ["adopter", "APPROVED"],
      ["other", "REVIEWING"],
    ],
  );
});
