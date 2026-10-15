// Medical protocols' rules, against a real Postgres: the name and overlap
// checks run behind advisory locks, steps are retired rather than updated,
// and the Restrict keys to species and items only exist there.
// `medical-protocol.ts` is the whole of each protocol action bar the session
// check and the cache invalidation.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  ExamType,
  MedicalItemKind,
  MedicalProtocolStepKind,
} from "@/prisma/generated/enums";
import {
  createMedicalItem,
  retireMedicalItem,
  unretireMedicalItem,
  updateMedicalItem,
} from "@/app/lib/services/medical-catalog";
import {
  createMedicalProtocol,
  MedicalProtocolRefusal,
  retireMedicalProtocol,
  unretireMedicalProtocol,
  updateMedicalProtocol,
  type MedicalProtocolInput,
  type MedicalProtocolStepInput,
} from "@/app/lib/services/medical-protocol";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";

// Random, not the time: the files run in parallel, and each cleans up the
// species, items and protocols whose names end in its own runId.
const runId = randomUUID().slice(0, 8);

let counter = 0;
const uniqueName = (label: string) => `${label} ${++counter} ${runId}`;

let dogId: string;
let catId: string;
let dhppId: string;
let fecalId: string;
let pyrantelId: string;
let felvId: string;

const newSpecies = async (label = "Species") =>
  (
    await prisma.species.create({
      data: { name: uniqueName(label) },
      select: { id: true },
    })
  ).id;

const newItem = async (
  kind: MedicalItemKind,
  speciesIds: string[] = [],
  label: string = kind,
) =>
  (
    await prisma.$transaction((tx) =>
      createMedicalItem(tx, {
        kind,
        name: uniqueName(label),
        speciesIds,
        analytes: kind === MedicalItemKind.TEST ? [{ name: "Result" }] : [],
      }),
    )
  ).id;

before(async () => {
  dogId = await newSpecies("Dog");
  catId = await newSpecies("Cat");
  dhppId = await newItem(MedicalItemKind.VACCINE, [dogId], "DHPP");
  fecalId = await newItem(MedicalItemKind.TEST, [], "Fecal");
  pyrantelId = await newItem(MedicalItemKind.TREATMENT, [], "Pyrantel");
  felvId = await newItem(MedicalItemKind.TEST, [catId], "FeLV");
});

after(async () => {
  const protocols = { name: { endsWith: runId } };
  await prisma.medicalProtocolStep.deleteMany({ where: { protocol: protocols } });
  await prisma.medicalProtocol.deleteMany({ where: protocols });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.species.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.$disconnect();
});

const vaccineStep = (
  overrides: Partial<MedicalProtocolStepInput> = {},
): MedicalProtocolStepInput => ({
  kind: MedicalProtocolStepKind.VACCINE,
  itemId: dhppId,
  offsetDays: 0,
  ...overrides,
});

const examStep = (
  overrides: Partial<MedicalProtocolStepInput> = {},
): MedicalProtocolStepInput => ({
  kind: MedicalProtocolStepKind.EXAM,
  examType: ExamType.INTAKE,
  offsetDays: 0,
  ...overrides,
});

// Each default protocol covers its own band of ages, so protocols that share
// a species don't overlap unless a test sets their ages.
const input = (overrides: Partial<MedicalProtocolInput> = {}): MedicalProtocolInput => {
  const band = 10_000 + ++counter * 100;
  return {
    name: uniqueName("Protocol"),
    speciesId: dogId,
    minAgeDays: band,
    maxAgeDays: band + 100,
    steps: [examStep()],
    ...overrides,
  };
};

const create = (values: MedicalProtocolInput) =>
  prisma.$transaction((tx) => createMedicalProtocol(tx, values));
const update = (protocolId: string, values: MedicalProtocolInput) =>
  prisma.$transaction((tx) => updateMedicalProtocol(tx, protocolId, values));
const retire = (protocolId: string) =>
  prisma.$transaction((tx) => retireMedicalProtocol(tx, protocolId));
const unretire = (protocolId: string) =>
  prisma.$transaction((tx) => unretireMedicalProtocol(tx, protocolId));

const STEP_SELECT = {
  id: true,
  kind: true,
  itemId: true,
  examType: true,
  offsetDays: true,
  notBeforeAgeDays: true,
  repeatIntervalDays: true,
  repeatCount: true,
  untilAgeDays: true,
  notes: true,
  sortOrder: true,
  retiredAt: true,
  updatedAt: true,
} as const;

const stepsOf = (protocolId: string) =>
  prisma.medicalProtocolStep.findMany({
    where: { protocolId },
    orderBy: [{ createdAt: "asc" }, { sortOrder: "asc" }],
    select: STEP_SELECT,
  });

const liveStepsOf = (protocolId: string) =>
  prisma.medicalProtocolStep.findMany({
    where: { protocolId, retiredAt: null },
    orderBy: { sortOrder: "asc" },
    select: STEP_SELECT,
  });

/** A refusal on `field`, with a message matching `message` when given. */
const refusedOn =
  (field: string | undefined, message?: RegExp | string) => (error: Error) => {
    assert.ok(error instanceof MedicalProtocolRefusal, `${error.name}: ${error.message}`);
    assert.equal(error.field, field, error.message);
    if (typeof message === "string") assert.equal(error.message, message);
    else if (message) assert.match(error.message, message);
    return true;
  };

const protocolCount = () =>
  prisma.medicalProtocol.count({ where: { name: { endsWith: runId } } });

// --- Create --------------------------------------------------------------

test("create: every step kind, stored in the order given", async () => {
  const name = uniqueName("Puppy");
  const { id, stepIds } = await create(
    input({
      name: `  ${name.replace(" ", "   ")} `,
      minAgeDays: 0,
      maxAgeDays: 140,
      steps: [
        examStep({ notes: "  Weigh on arrival.  " }),
        vaccineStep({ notBeforeAgeDays: 42, repeatIntervalDays: 14, untilAgeDays: 140 }),
        { kind: MedicalProtocolStepKind.TEST, itemId: fecalId, offsetDays: 3 },
        {
          kind: MedicalProtocolStepKind.TREATMENT,
          itemId: pyrantelId,
          offsetDays: 0,
          repeatIntervalDays: 14,
          repeatCount: 2,
        },
        { kind: MedicalProtocolStepKind.MICROCHIP, offsetDays: 0, notes: " " },
        { kind: MedicalProtocolStepKind.SPAY_NEUTER, offsetDays: 7, notBeforeAgeDays: 56 },
        // A one-off dose for the young: an age to stop at, with no repeats.
        vaccineStep({ untilAgeDays: 120 }),
      ],
    }),
  );

  const protocol = await prisma.medicalProtocol.findUniqueOrThrow({
    where: { id },
    select: { name: true, speciesId: true, minAgeDays: true, maxAgeDays: true, retiredAt: true },
  });
  assert.deepEqual(protocol, {
    name,
    speciesId: dogId,
    minAgeDays: 0,
    maxAgeDays: 140,
    retiredAt: null,
  });

  const steps = await liveStepsOf(id);
  assert.deepEqual(steps.map((step) => step.id), stepIds);
  assert.deepEqual(
    steps.map(({ id: _id, updatedAt: _updatedAt, ...step }) => step),
    [
      { kind: "EXAM", itemId: null, examType: "INTAKE", offsetDays: 0, notBeforeAgeDays: null, repeatIntervalDays: null, repeatCount: null, untilAgeDays: null, notes: "Weigh on arrival.", sortOrder: 0, retiredAt: null },
      { kind: "VACCINE", itemId: dhppId, examType: null, offsetDays: 0, notBeforeAgeDays: 42, repeatIntervalDays: 14, repeatCount: null, untilAgeDays: 140, notes: null, sortOrder: 1, retiredAt: null },
      { kind: "TEST", itemId: fecalId, examType: null, offsetDays: 3, notBeforeAgeDays: null, repeatIntervalDays: null, repeatCount: null, untilAgeDays: null, notes: null, sortOrder: 2, retiredAt: null },
      { kind: "TREATMENT", itemId: pyrantelId, examType: null, offsetDays: 0, notBeforeAgeDays: null, repeatIntervalDays: 14, repeatCount: 2, untilAgeDays: null, notes: null, sortOrder: 3, retiredAt: null },
      { kind: "MICROCHIP", itemId: null, examType: null, offsetDays: 0, notBeforeAgeDays: null, repeatIntervalDays: null, repeatCount: null, untilAgeDays: null, notes: null, sortOrder: 4, retiredAt: null },
      { kind: "SPAY_NEUTER", itemId: null, examType: null, offsetDays: 7, notBeforeAgeDays: 56, repeatIntervalDays: null, repeatCount: null, untilAgeDays: null, notes: null, sortOrder: 5, retiredAt: null },
      { kind: "VACCINE", itemId: dhppId, examType: null, offsetDays: 0, notBeforeAgeDays: null, repeatIntervalDays: null, repeatCount: null, untilAgeDays: 120, notes: null, sortOrder: 6, retiredAt: null },
    ],
  );
});

test("create: a new protocol's steps can't name ids", async () => {
  const other = await create(input());
  const before = await protocolCount();
  await assert.rejects(
    create(input({ steps: [examStep({ id: other.stepIds[0] })] })),
    refusedOn("steps", "A new protocol has no steps yet."),
  );
  assert.equal(await protocolCount(), before);
});

// --- Names ---------------------------------------------------------------

test("name: required, at most 80 characters", async () => {
  await assert.rejects(create(input({ name: "   " })), refusedOn("name", "A name is required."));
  const long = `${"x".repeat(81 - runId.length)}${runId}`;
  await assert.rejects(create(input({ name: long })), refusedOn("name", /80 characters/));
  const { id } = await create(input({ name: `${"y".repeat(80 - runId.length)}${runId}` }));
  assert.ok(id);
});

test("name: unique ignoring case, and a retired protocol keeps its name", async () => {
  const name = uniqueName("Kitten");
  const { id } = await create(input({ name }));
  const before = await protocolCount();
  await assert.rejects(
    create(input({ name: name.toUpperCase(), speciesId: catId })),
    refusedOn("name", `A protocol named "${name}" already exists.`),
  );
  await retire(id);
  await assert.rejects(
    create(input({ name: name.toLowerCase(), speciesId: catId })),
    refusedOn("name", `A retired protocol named "${name}" already exists. Unretire it instead.`),
  );
  assert.equal(await protocolCount(), before);

  // Renaming another onto it is refused too; renaming itself in another case
  // isn't.
  const other = await create(input({ speciesId: catId }));
  await assert.rejects(
    update(other.id, input({ name: name.toLowerCase(), speciesId: catId })),
    refusedOn("name", /Unretire it instead/),
  );
  await unretire(id);
  await update(id, input({ name: name.toLowerCase() }));
  assert.equal(
    (await prisma.medicalProtocol.findUniqueOrThrow({ where: { id }, select: { name: true } })).name,
    name.toLowerCase(),
  );
});

test("name: underscores, percent signs and backslashes are letters, not patterns", async () => {
  const named = (value: string) => `${value} ${runId}`;
  await create(input({ name: named("T4 low"), speciesId: await newSpecies() }));
  await create(input({ name: named("100 blind"), speciesId: await newSpecies() }));
  await create(input({ name: named("Ab"), speciesId: await newSpecies() }));
  for (const value of ["T4_low", "100% blind", "A\\b"]) {
    await create(input({ name: named(value), speciesId: await newSpecies() }));
    await assert.rejects(
      create(input({ name: named(value.toUpperCase()), speciesId: await newSpecies() })),
      refusedOn("name", `A protocol named "${named(value)}" already exists.`),
    );
  }
});

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;

// The only proof a statement reached the lock and is blocked there, rather
// than not having started yet. Asking which sessions `holderPid` blocks keeps
// another test file's wait (the files run in parallel) from passing for this
// one.
const waitForSessionBlockedBy = async (holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session was seen waiting on backend ${holderPid}.`);
};

/**
 * Creates `first` and holds its transaction open, uncommitted, so the second
 * can't see its row: only a lock stops a second row. Then creates `second`,
 * which must be seen waiting on that lock. Returns the second's outcome once
 * both have finished.
 */
const createTwoAtOnce = async (first: MedicalProtocolInput, second: MedicalProtocolInput) => {
  // Longer than the five seconds the wait below may take, so a slow machine
  // fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let created!: (pid: number) => void;
  const isCreated = new Promise<number>((resolve) => (created = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await createMedicalProtocol(tx, first);
      created(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isCreated, holder as Promise<never>]);

  const later = prisma.$transaction((tx) => createMedicalProtocol(tx, second), { timeout });
  // Observed as soon as it starts, so a failed wait is not followed by an
  // unhandled rejection. Awaiting it below still sees any rejection.
  void later.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    // Released even when the wait fails, and both seen to their end, so
    // neither transaction outlives the test.
    release();
    await Promise.allSettled([holder, later]);
  }
  await holder;
  return later;
};

test("name: two creates of one name in different case at once: the second waits, then is refused", async () => {
  const name = uniqueName("Raced");
  await assert.rejects(
    createTwoAtOnce(
      input({ name, speciesId: await newSpecies() }),
      input({ name: name.toLowerCase(), speciesId: await newSpecies() }),
    ),
    refusedOn("name"),
  );
  assert.equal(
    await prisma.medicalProtocol.count({ where: { name: { in: [name, name.toLowerCase()] } } }),
    1,
  );
});

// JavaScript lowercases a dotted capital I to "i" and a combining dot, but
// Postgres to a plain "i", so the database counts these two as one name. The
// name lock has to agree with it.
test("name: two creates of names only the database counts as one: the second waits, then is refused", async () => {
  const first = `İnitial ${runId}`;
  const second = `initial ${runId}`;
  await assert.rejects(
    createTwoAtOnce(
      input({ name: first, speciesId: await newSpecies() }),
      input({ name: second, speciesId: await newSpecies() }),
    ),
    refusedOn("name"),
  );
  assert.equal(
    await prisma.medicalProtocol.count({ where: { name: { in: [first, second] } } }),
    1,
  );
});

// --- Species and ages ----------------------------------------------------

test("species: must exist and not be deleted", async () => {
  await assert.rejects(
    create(input({ speciesId: "ckq1a2b3c4d5e6f7g8h9i0j1k" })),
    refusedOn("speciesId", "That species no longer exists."),
  );
  const gone = await newSpecies();
  await prisma.species.update({ where: { id: gone }, data: { deletedAt: new Date() } });
  await assert.rejects(create(input({ speciesId: gone })), refusedOn("speciesId"));
});

test("ages: whole days, the oldest after the youngest", async () => {
  const speciesId = await newSpecies();
  await assert.rejects(
    create(input({ speciesId, minAgeDays: 140, maxAgeDays: 140 })),
    refusedOn("maxAgeDays", /older than the youngest age/),
  );
  await assert.rejects(
    create(input({ speciesId, minAgeDays: 140, maxAgeDays: 56 })),
    refusedOn("maxAgeDays"),
  );
  await assert.rejects(create(input({ speciesId, minAgeDays: -1 })), refusedOn("minAgeDays"));
  await assert.rejects(create(input({ speciesId, maxAgeDays: 0 })), refusedOn("maxAgeDays"));
  await assert.rejects(create(input({ speciesId, minAgeDays: 1.5 })), refusedOn("minAgeDays"));
});

test("overlap: refused against a live protocol of the species, allowed when touching or retired", async () => {
  const speciesId = await newSpecies("Dog");
  const speciesName = (
    await prisma.species.findUniqueOrThrow({ where: { id: speciesId }, select: { name: true } })
  ).name.toLowerCase();
  const puppy = await create(
    input({ name: uniqueName("Puppy"), speciesId, minAgeDays: null, maxAgeDays: 140 }),
  );
  const puppyName = (
    await prisma.medicalProtocol.findUniqueOrThrow({ where: { id: puppy.id }, select: { name: true } })
  ).name;
  const before = await protocolCount();

  await assert.rejects(
    create(input({ speciesId, minAgeDays: 100, maxAgeDays: null })),
    refusedOn("minAgeDays", `${puppyName} already covers ${speciesName}s from birth to 139 days.`),
  );
  await assert.rejects(
    create(input({ speciesId, minAgeDays: null, maxAgeDays: 1 })),
    refusedOn("minAgeDays"),
  );
  await assert.rejects(
    create(input({ speciesId, minAgeDays: null, maxAgeDays: null })),
    refusedOn("minAgeDays"),
  );
  assert.equal(await protocolCount(), before);

  // Touching: the adult range starts where the puppy's stops.
  const adult = await create(input({ speciesId, minAgeDays: 140, maxAgeDays: null }));
  // Another species is its own.
  await create(input({ speciesId: await newSpecies(), minAgeDays: null, maxAgeDays: 140 }));

  // A retired protocol covers nothing.
  await retire(puppy.id);
  const replacement = await create(input({ speciesId, minAgeDays: 0, maxAgeDays: 120 }));

  // Unretiring into an overlap is refused, and leaves it retired.
  await assert.rejects(unretire(puppy.id), refusedOn("minAgeDays", /already covers/));
  assert.ok(
    (await prisma.medicalProtocol.findUniqueOrThrow({ where: { id: puppy.id }, select: { retiredAt: true } }))
      .retiredAt,
  );

  // An edit is checked against the others, not against itself.
  await update(adult.id, input({ speciesId, minAgeDays: 120, maxAgeDays: null }));
  await assert.rejects(
    update(adult.id, input({ speciesId, minAgeDays: 119, maxAgeDays: null })),
    refusedOn("minAgeDays"),
  );
  await retire(replacement.id);
  await assert.rejects(unretire(puppy.id), refusedOn("minAgeDays"));
});

test("overlap: two overlapping creates for one species at once: the second waits, then is refused", async () => {
  const speciesId = await newSpecies();
  await assert.rejects(
    createTwoAtOnce(
      input({ speciesId, minAgeDays: null, maxAgeDays: 140 }),
      input({ speciesId, minAgeDays: 56, maxAgeDays: null }),
    ),
    refusedOn("minAgeDays", /already covers/),
  );
  assert.equal(await prisma.medicalProtocol.count({ where: { speciesId } }), 1);
});

// --- Steps ---------------------------------------------------------------

test("steps: an item must be of the step's kind, live, and for the species", async () => {
  const before = await protocolCount();
  await assert.rejects(
    create(input({ steps: [examStep(), vaccineStep({ itemId: fecalId })] })),
    refusedOn("steps.1.itemId", /is a test, not a vaccine\.$/),
  );
  await assert.rejects(
    create(input({ steps: [vaccineStep({ kind: MedicalProtocolStepKind.TREATMENT })] })),
    refusedOn("steps.0.itemId", /is a vaccine, not a treatment\.$/),
  );
  const retired = await newItem(MedicalItemKind.VACCINE);
  await prisma.$transaction((tx) => retireMedicalItem(tx, retired));
  await assert.rejects(
    create(input({ steps: [vaccineStep({ itemId: retired })] })),
    refusedOn("steps.0.itemId", /has been retired from the catalog\.$/),
  );
  await assert.rejects(
    create(input({ steps: [vaccineStep({ kind: MedicalProtocolStepKind.TEST, itemId: felvId })] })),
    refusedOn("steps.0.itemId", /isn't for dog \d+ [0-9a-f]+s\.$/),
  );
  await assert.rejects(
    create(input({ steps: [vaccineStep({ itemId: "ckq1a2b3c4d5e6f7g8h9i0j1k" })] })),
    refusedOn("steps.0.itemId", "That catalog item no longer exists."),
  );
  assert.equal(await protocolCount(), before);
});

test("steps: each kind's own fields", async () => {
  await assert.rejects(
    create(input({ steps: [vaccineStep({ itemId: null })] })),
    refusedOn("steps.0.itemId", "Pick the vaccine."),
  );
  await assert.rejects(
    create(input({ steps: [examStep({ examType: null })] })),
    refusedOn("steps.0.examType", "Pick the exam type."),
  );
  await assert.rejects(
    create(input({ steps: [examStep({ itemId: fecalId })] })),
    refusedOn("steps.0.itemId", "An exam step has no catalog item."),
  );
  await assert.rejects(
    create(input({ steps: [vaccineStep({ examType: ExamType.VET })] })),
    refusedOn("steps.0.examType"),
  );
  await assert.rejects(
    create(
      input({
        steps: [{ kind: MedicalProtocolStepKind.MICROCHIP, offsetDays: 0, examType: ExamType.VET }],
      }),
    ),
    refusedOn("steps.0.examType"),
  );
});

test("steps: offsets, ages, repeats and notes", async () => {
  const refused = (step: MedicalProtocolStepInput, field: string, message?: RegExp | string) =>
    assert.rejects(create(input({ steps: [examStep(), step] })), refusedOn(`steps.1.${field}`, message));

  await refused(vaccineStep({ offsetDays: 366 }), "offsetDays", "The offset must be from 0 to 365 days.");
  await refused(vaccineStep({ offsetDays: -1 }), "offsetDays");
  await refused(vaccineStep({ offsetDays: 1.5 }), "offsetDays", /whole number/);
  await refused(vaccineStep({ notBeforeAgeDays: 1826 }), "notBeforeAgeDays");
  await refused(
    vaccineStep({ repeatIntervalDays: 14 }),
    "repeatCount",
    "A repeating step needs a number of repeats, an age to stop at, or both.",
  );
  await refused(vaccineStep({ repeatCount: 2 }), "repeatIntervalDays", "Repeats need an interval.");
  await refused(vaccineStep({ repeatIntervalDays: 14, repeatCount: 12 }), "repeatCount");
  await refused(vaccineStep({ repeatIntervalDays: 0, repeatCount: 1 }), "repeatIntervalDays");
  await refused(vaccineStep({ repeatIntervalDays: 1826, repeatCount: 1 }), "repeatIntervalDays");
  await refused(vaccineStep({ untilAgeDays: 0 }), "untilAgeDays");
  await refused(
    vaccineStep({ notBeforeAgeDays: 56, untilAgeDays: 56 }),
    "untilAgeDays",
    "The age to stop at must be after the earliest age.",
  );
  await refused(
    { kind: MedicalProtocolStepKind.SPAY_NEUTER, offsetDays: 7, repeatIntervalDays: 14, repeatCount: 1 },
    "repeatIntervalDays",
    "A spay/neuter step doesn't repeat.",
  );
  await refused(examStep({ untilAgeDays: 140 }), "untilAgeDays", "An exam step doesn't repeat.");
  await refused(vaccineStep({ notes: "n".repeat(2001) }), "notes");

  // The edges are allowed.
  await create(
    input({
      steps: [
        vaccineStep({ offsetDays: 365, notBeforeAgeDays: 1825, repeatIntervalDays: 1825, repeatCount: 11 }),
        vaccineStep({ notes: "n".repeat(2000) }),
      ],
    }),
  );
});

test("steps: at least one, each listed once", async () => {
  await assert.rejects(
    create(input({ steps: [] })),
    refusedOn("steps", "A protocol needs at least one step."),
  );
  const { id, stepIds } = await create(input());
  await assert.rejects(
    update(id, input({ steps: [examStep({ id: stepIds[0] }), examStep({ id: stepIds[0] })] })),
    refusedOn("steps", "A step is listed twice."),
  );
});

// --- Saving steps --------------------------------------------------------

test("saving steps: an unchanged step keeps its id, and reordering moves only its place", async () => {
  const { id, stepIds } = await create(
    input({
      steps: [
        examStep(),
        vaccineStep({ repeatIntervalDays: 14, repeatCount: 2, notes: "Left shoulder." }),
        { kind: MedicalProtocolStepKind.MICROCHIP, offsetDays: 0 },
      ],
    }),
  );
  const [exam, vaccine, chip] = await liveStepsOf(id);

  const saved = await update(
    id,
    input({
      steps: [
        { id: chip.id, kind: MedicalProtocolStepKind.MICROCHIP, offsetDays: 0 },
        examStep({ id: exam.id }),
        // Notes tidied to what is stored count as unchanged.
        vaccineStep({ id: vaccine.id, repeatIntervalDays: 14, repeatCount: 2, notes: " Left shoulder. " }),
      ],
    }),
  );
  assert.deepEqual(saved.stepIds, [stepIds[2], stepIds[0], stepIds[1]]);

  const after = await stepsOf(id);
  assert.equal(after.length, 3, "no step was added");
  const byId = new Map(after.map((step) => [step.id, step]));
  assert.deepEqual(
    [chip, exam, vaccine].map((step) => byId.get(step.id)!.sortOrder),
    [0, 1, 2],
  );
  for (const step of [chip, exam, vaccine]) {
    const { sortOrder: _a, updatedAt: _b, ...care } = byId.get(step.id)!;
    const { sortOrder: _c, updatedAt: _d, ...before } = step;
    assert.deepEqual(care, before);
  }
});

test("saving steps: a changed step is retired and added anew; a step left out is retired", async () => {
  const { id } = await create(
    input({
      steps: [
        examStep(),
        vaccineStep({ repeatIntervalDays: 14, repeatCount: 2 }),
        { kind: MedicalProtocolStepKind.TEST, itemId: fecalId, offsetDays: 3 },
      ],
    }),
  );
  const [exam, vaccine, fecal] = await liveStepsOf(id);

  const saved = await update(
    id,
    input({
      steps: [
        examStep({ id: exam.id }),
        // One more repeat: a change.
        vaccineStep({ id: vaccine.id, repeatIntervalDays: 14, repeatCount: 3 }),
        { kind: MedicalProtocolStepKind.MICROCHIP, offsetDays: 0 },
      ],
    }),
  );

  const all = await stepsOf(id);
  assert.equal(all.length, 5, "two added, none deleted");
  const byId = new Map(all.map((step) => [step.id, step]));
  assert.equal(byId.get(exam.id)!.retiredAt, null);
  assert.ok(byId.get(vaccine.id)!.retiredAt, "the changed step is retired");
  assert.equal(byId.get(vaccine.id)!.repeatCount, 2, "and keeps what it was");
  assert.ok(byId.get(fecal.id)!.retiredAt, "the step left out is retired");

  assert.equal(saved.stepIds[0], exam.id);
  assert.notEqual(saved.stepIds[1], vaccine.id);
  const live = await liveStepsOf(id);
  assert.deepEqual(live.map((step) => step.id), saved.stepIds);
  assert.deepEqual(
    live.map((step) => [step.kind, step.repeatCount, step.sortOrder]),
    [
      ["EXAM", null, 0],
      ["VACCINE", 3, 1],
      ["MICROCHIP", null, 2],
    ],
  );
});

test("saving steps: changing only a step's notes retires it and adds a new one", async () => {
  const { id } = await create(input({ steps: [examStep(), vaccineStep({ notes: "Left shoulder." })] }));
  const [exam, vaccine] = await liveStepsOf(id);

  const saved = await update(
    id,
    input({ steps: [examStep({ id: exam.id }), vaccineStep({ id: vaccine.id, notes: "Right shoulder." })] }),
  );
  assert.equal(saved.stepIds[0], exam.id);
  assert.notEqual(saved.stepIds[1], vaccine.id);
  const byId = new Map((await stepsOf(id)).map((step) => [step.id, step]));
  assert.ok(byId.get(vaccine.id)!.retiredAt, "the old step is retired");
  assert.equal(byId.get(vaccine.id)!.notes, "Left shoulder.", "and keeps its notes");
  assert.equal(byId.get(saved.stepIds[1])!.notes, "Right shoulder.");
  assert.equal(byId.get(saved.stepIds[1])!.retiredAt, null);

  // Clearing them is a change too.
  const cleared = await update(
    id,
    input({ steps: [examStep({ id: exam.id }), vaccineStep({ id: saved.stepIds[1], notes: " " })] }),
  );
  assert.notEqual(cleared.stepIds[1], saved.stepIds[1]);
  assert.equal(
    (await liveStepsOf(id)).find((step) => step.id === cleared.stepIds[1])!.notes,
    null,
  );
});

test("saving steps: an id from another protocol, or a retired step, is refused and nothing changes", async () => {
  const mine = await create(input({ steps: [examStep(), vaccineStep()] }));
  const theirs = await create(input({ speciesId: catId }));
  await assert.rejects(
    update(mine.id, input({ steps: [examStep({ id: theirs.stepIds[0] })] })),
    refusedOn("steps", "One of the steps isn't a live step of this protocol."),
  );

  await update(mine.id, input({ steps: [examStep({ id: mine.stepIds[0] })] }));
  const before = await stepsOf(mine.id);
  await assert.rejects(
    update(mine.id, input({ steps: [examStep({ id: mine.stepIds[0] }), vaccineStep({ id: mine.stepIds[1] })] })),
    refusedOn("steps"),
  );
  assert.deepEqual(await stepsOf(mine.id), before);
});

test("saving steps: an unchanged step's item isn't checked again, unless the species changes", async () => {
  const speciesId = await newSpecies("Dog");
  const otherSpecies = await newSpecies("Cat");
  const itemId = await newItem(MedicalItemKind.VACCINE, [speciesId]);
  const protocolInput = (overrides: Partial<MedicalProtocolInput>, stepId?: string) =>
    input({
      name: `Narrowed ${runId}`,
      speciesId,
      minAgeDays: null,
      maxAgeDays: null,
      steps: [vaccineStep({ id: stepId, itemId })],
      ...overrides,
    });
  const { id, stepIds } = await create(protocolInput({}));

  // The item is retired after the protocol was saved: the step stays, and the
  // protocol can still be edited around it.
  await prisma.$transaction((tx) => retireMedicalItem(tx, itemId));
  await update(id, protocolInput({ maxAgeDays: 400 }, stepIds[0]));
  assert.deepEqual((await liveStepsOf(id)).map((step) => step.id), stepIds);

  // Listing it as a changed step checks it.
  await assert.rejects(
    update(id, protocolInput({ steps: [vaccineStep({ id: stepIds[0], itemId, offsetDays: 1 })] })),
    refusedOn("steps.0.itemId", /retired/),
  );

  // Moving the protocol to another species checks every live step's item.
  await prisma.$transaction((tx) => unretireMedicalItem(tx, itemId));
  await assert.rejects(
    update(id, protocolInput({ speciesId: otherSpecies }, stepIds[0])),
    refusedOn("steps.0.itemId", /isn't for cat/),
  );
  // Widened to every species, it moves.
  const item = await prisma.medicalItem.findUniqueOrThrow({ where: { id: itemId }, select: { name: true } });
  await prisma.$transaction((tx) =>
    updateMedicalItem(tx, itemId, { kind: MedicalItemKind.VACCINE, name: item.name, speciesIds: [], analytes: [] }),
  );
  await update(id, protocolInput({ speciesId: otherSpecies }, stepIds[0]));
  assert.deepEqual((await liveStepsOf(id)).map((step) => step.id), stepIds);
});

// --- The catalog --------------------------------------------------------

test("catalog: an item a protocol step names keeps its kind, even once the step is retired", async () => {
  const itemId = await newItem(MedicalItemKind.VACCINE);
  const item = await prisma.medicalItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { name: true },
  });
  const protocolName = uniqueName("Uses it");
  const { id, stepIds } = await create(
    input({ name: protocolName, steps: [examStep(), vaccineStep({ itemId })] }),
  );
  const asTreatment = {
    kind: MedicalItemKind.TREATMENT,
    name: item.name,
    speciesIds: [],
    analytes: [],
  };
  const refused = (error: Error) =>
    error instanceof ConflictError &&
    error.message ===
      `This vaccine is a step of the ${protocolName} protocol, so it can't become a treatment. Retire it and add a new item instead.`;

  // No entry uses the item: only the step holds its kind.
  assert.equal(await prisma.medicalEntry.count({ where: { itemId } }), 0);
  await assert.rejects(prisma.$transaction((tx) => updateMedicalItem(tx, itemId, asTreatment)), refused);

  // The step retired by an edit still cites the item as a vaccine.
  await update(id, input({ name: protocolName, steps: [examStep({ id: stepIds[0] })] }));
  await assert.rejects(prisma.$transaction((tx) => updateMedicalItem(tx, itemId, asTreatment)), refused);
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id: itemId }, select: { kind: true } })).kind,
    MedicalItemKind.VACCINE,
  );

  // The rest of the item can still be corrected.
  await prisma.$transaction((tx) =>
    updateMedicalItem(tx, itemId, { ...asTreatment, kind: MedicalItemKind.VACCINE, manufacturer: "Zoetis" }),
  );
});

// --- Retiring ------------------------------------------------------------

test("retire and unretire; a retired protocol can't be edited", async () => {
  const values = input({ speciesId: await newSpecies() });
  const { id, stepIds } = await create(values);

  await retire(id);
  await assert.rejects(retire(id), (error: Error) =>
    error instanceof ConflictError && error.message === "This protocol is already retired.",
  );
  await assert.rejects(
    update(id, { ...values, steps: [examStep({ id: stepIds[0] })] }),
    (error: Error) =>
      error instanceof ConflictError &&
      error.message === "This protocol is retired. Unretire it to edit it.",
  );
  // Its steps are left as they were.
  assert.equal((await liveStepsOf(id)).length, 1);

  await unretire(id);
  await assert.rejects(unretire(id), (error: Error) =>
    error instanceof ConflictError && error.message === "This protocol isn't retired.",
  );
  await update(id, { ...values, minAgeDays: 10, steps: [examStep({ id: stepIds[0] })] });

  for (const call of [retire, unretire]) {
    await assert.rejects(call("ckq1a2b3c4d5e6f7g8h9i0j1k"), NotFoundError);
  }
  await assert.rejects(update("ckq1a2b3c4d5e6f7g8h9i0j1k", values), NotFoundError);
});
