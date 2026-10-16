// Medical documents, against a real Postgres: uploaded (the file stored
// first, then the row), corrected, voided and their files removed through the
// document service, as the upload route and the actions drive it, with the
// in-memory store standing in for Blob. Staff add paperwork to any animal's
// record; a foster adds it only to a waiting report of theirs, for an animal
// they foster now. Then the reads: the Documents page's list, what the file
// route reads, and an entry's row with its paperwork.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  IntakeType,
  MedicalDocumentEventAction,
  MedicalDocumentType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalItemKind,
  Sex,
} from "@/prisma/generated/enums";
import {
  createMedicalDocument,
  editMedicalDocument,
  removeMedicalDocumentFile,
  storeThenRecord,
  voidMedicalDocument,
  type DocumentWriteOptions,
  type MedicalDocumentCorrection,
  type MedicalDocumentInput,
  type StoredDocumentFile,
} from "@/app/lib/services/medical-document";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { NOT_FOSTERING_MESSAGE } from "@/app/lib/data/fosters/foster-access";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  memoryStore,
  newDocumentPathname,
} from "@/app/lib/storage/medical-document-store";
import {
  findAnimalDocuments,
  findDocumentForFile,
} from "@/app/lib/data/animals/medical-document";
import {
  findRecentMedicalEntries,
  findVaccinesAndTests,
} from "@/app/lib/data/animals/medical-entry";
import { ConflictError } from "@/app/lib/utils/errors";
import { calendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-16");
const BIRTH_DAY = "2024-01-01";
const day = calendarDay;
const { LAB_RESULT, VET_RECORD, IMAGING, OTHER } = MedicalDocumentType;

// The first bytes of each kind of file the shelter keeps, padded out.
const PDF = new TextEncoder().encode("%PDF-1.4\n% a lab report\n");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const TEXT = new TextEncoder().encode("Just some notes, saved as report.pdf\n");

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let adminId: string;
let fosterId: string;
let otherFosterId: string;
let itemId: string;
const profileIds: string[] = [];

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({ data: { name: name("Document species") }, select: { id: true } })
  ).id;
  colorId = (
    await prisma.color.create({ data: { name: name("Document color") }, select: { id: true } })
  ).id;
  const person = async (label: string) =>
    (await prisma.person.create({ data: { name: name(label) }, select: { id: true } })).id;
  staffId = await person("Olivia");
  editorId = await person("Benjamin");
  adminId = await person("Admin");
  fosterId = await person("Rosa");
  otherFosterId = await person("Sam");
  for (const personId of [fosterId, otherFosterId]) {
    profileIds.push(
      (
        await prisma.fosterProfile.create({
          data: { personId, maxAnimals: 50 },
          select: { id: true },
        })
      ).id,
    );
  }
  itemId = (
    await prisma.medicalItem.create({
      data: { kind: MedicalItemKind.TEST, name: name("Heartworm antigen") },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  const animals = { animal: { speciesId } };
  await prisma.medicalDocument.deleteMany({ where: animals });
  // An entry recorded from a report holds the report.
  await prisma.medicalEntry.deleteMany({ where: { ...animals, vetReportId: { not: null } } });
  await prisma.vetVisitReport.deleteMany({ where: animals });
  await prisma.fosterPlacement.deleteMany({ where: { fosterProfileId: { in: profileIds } } });
  await prisma.fosterProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { id: itemId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, editorId, adminId, fosterId, otherFosterId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  listingStatus: AnimalListingStatus = AnimalListingStatus.PUBLISHED,
) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: BIRTH_DAY,
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus,
        intake: {
          create: { type: IntakeType.STRAY, intakeDate: "2026-08-01", staffMemberId: staffId },
        },
      },
      select: { id: true },
    })
  ).id;

/** A heartworm test on `animalId`: given on Oct 12 unless told otherwise. */
const makeEntry = async (
  animalId: string,
  overrides: {
    status?: MedicalEntryStatus;
    voided?: boolean;
  } = {},
) => {
  const status = overrides.status ?? MedicalEntryStatus.COMPLETED;
  return (
    await prisma.medicalEntry.create({
      data: {
        animalId,
        kind: MedicalEntryKind.TEST,
        itemId,
        status,
        ...(status === MedicalEntryStatus.COMPLETED
          ? { completedDate: "2026-10-12", source: MedicalEntrySource.IN_HOUSE }
          : { dueDate: "2026-10-20" }),
        ...(status === MedicalEntryStatus.DECLINED ? { declineReason: "Owner refused" } : {}),
        ...(overrides.voided
          ? { voidedAt: new Date(), voidedById: staffId, voidReason: "Wrong animal" }
          : {}),
        createdById: staffId,
      },
      select: { id: true },
    })
  ).id;
};

/** An open placement of `animalId` with the foster `profileIndex` (0 Rosa,
 * 1 Sam), from Oct 1. */
const place = async (animalId: string, profileIndex = 0) =>
  (
    await prisma.fosterPlacement.create({
      data: {
        type: FosterPlacementType.GENERAL,
        startDate: "2026-10-01",
        animalId,
        fosterProfileId: profileIds[profileIndex],
        placedById: staffId,
      },
      select: { id: true },
    })
  ).id;

const report = async (
  animalId: string,
  placementId: string,
  reportedById: string,
  reviewed = false,
) =>
  (
    await prisma.vetVisitReport.create({
      data: {
        animalId,
        placementId,
        reportedById,
        visitDate: "2026-10-14",
        vetName: "Dr. Patel",
        summary: "Limping on the left front leg; a torn nail was trimmed.",
        ...(reviewed ? { reviewedAt: new Date(), reviewedById: staffId } : {}),
      },
      select: { id: true },
    })
  ).id;

let fileCount = 0;
const fileOf = (animalId: string): StoredDocumentFile => ({
  pathname: `${newDocumentPathname(animalId)}-${++fileCount}`,
  contentType: "application/pdf",
  sizeBytes: PDF.byteLength,
});

const documentInput = (
  animalId: string,
  overrides: Partial<MedicalDocumentInput> = {},
): MedicalDocumentInput => ({
  animalId,
  name: "Heartworm antigen panel",
  type: LAB_RESULT,
  ...overrides,
});

const create = (
  animalId: string,
  overrides: Partial<MedicalDocumentInput> = {},
  options: DocumentWriteOptions = {},
  actorId = options.foster?.personId ?? staffId,
) =>
  prisma.$transaction((tx) =>
    createMedicalDocument(
      tx,
      { ...documentInput(animalId, overrides), ...fileOf(animalId) },
      actorId,
      TODAY,
      options,
    ),
  );

const edit = (documentId: string, correction: MedicalDocumentCorrection) =>
  prisma.$transaction((tx) => editMedicalDocument(tx, documentId, correction, editorId, TODAY));

const voidIt = (documentId: string, reason = "Uploaded to the wrong animal") =>
  prisma.$transaction((tx) => voidMedicalDocument(tx, documentId, reason, editorId));

const stored = (documentId: string) =>
  prisma.medicalDocument.findUniqueOrThrow({ where: { id: documentId } });

const eventsOf = (documentId: string) =>
  prisma.medicalDocumentEvent.findMany({
    where: { documentId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { action: true, actorId: true, before: true, after: true },
  });

const feedOf = async (animalId: string, type?: AnimalActivityType) =>
  (
    await prisma.animalActivityLog.findMany({
      where: { animalId, ...(type ? { activityType: type } : {}) },
      orderBy: { changedAt: "asc" },
      select: { changeSummary: true, changedById: true },
    })
  ).map((row) => row.changeSummary);

const isRefusal =
  (field: string | undefined, message?: RegExp | string) => (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field);
    if (typeof message === "string") assert.equal(error.message, message);
    else if (message) assert.match(error.message, message);
    return true;
  };

/** Runs `write`, expecting it refused on `field` with nothing written. */
const assertRefused = async (
  animalId: string,
  write: () => Promise<unknown>,
  field: string | undefined,
  message?: RegExp | string,
) => {
  const documentsBefore = await prisma.medicalDocument.findMany({
    where: { animalId },
    orderBy: { id: "asc" },
  });
  const feedBefore = await prisma.animalActivityLog.count({ where: { animalId } });
  await assert.rejects(write, isRefusal(field, message));
  assert.deepEqual(
    await prisma.medicalDocument.findMany({ where: { animalId }, orderBy: { id: "asc" } }),
    documentsBefore,
  );
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), feedBefore);
};

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

test("a document is written with its file's facts, a CREATED event of the whole row, and a feed row", async () => {
  const animalId = await makeAnimal("Fido");
  const file = fileOf(animalId);
  const { documentId } = await prisma.$transaction((tx) =>
    createMedicalDocument(
      tx,
      {
        ...documentInput(animalId, {
          name: "  Heartworm antigen panel  ",
          documentDate: day("2026-10-12"),
          notes: " Faint positive band. ",
        }),
        ...file,
      },
      staffId,
      TODAY,
    ),
  );

  const row = await stored(documentId);
  assert.equal(row.animalId, animalId);
  assert.equal(row.name, "Heartworm antigen panel");
  assert.equal(row.type, LAB_RESULT);
  assert.equal(row.documentDate, "2026-10-12");
  assert.equal(row.notes, "Faint positive band.");
  assert.equal(row.entryId, null);
  assert.equal(row.vetReportId, null);
  assert.equal(row.pathname, file.pathname);
  assert.equal(row.contentType, "application/pdf");
  assert.equal(row.sizeBytes, PDF.byteLength);
  assert.equal(row.uploadedById, staffId);
  assert.equal(row.voidedAt, null);
  assert.equal(row.fileRemovedAt, null);

  assert.deepEqual(await eventsOf(documentId), [
    {
      action: MedicalDocumentEventAction.CREATED,
      actorId: staffId,
      before: null,
      after: {
        name: "Heartworm antigen panel",
        type: LAB_RESULT,
        documentDate: "2026-10-12",
        notes: "Faint positive band.",
        entryId: null,
        vetReportId: null,
        contentType: "application/pdf",
        sizeBytes: PDF.byteLength,
      },
    },
  ]);
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICAL_DOCUMENT_ADDED), [
    'Lab result "Heartworm antigen panel" added.',
  ]);
});

test("a document can belong to one of the animal's entries, given or scheduled, and an entry can have several", async () => {
  const animalId = await makeAnimal("Daisy");
  const given = await makeEntry(animalId);
  const scheduled = await makeEntry(animalId, { status: MedicalEntryStatus.SCHEDULED });

  const first = await create(animalId, { entryId: given });
  const second = await create(animalId, {
    entryId: given,
    name: "Dental radiograph",
    type: IMAGING,
  });
  const third = await create(animalId, {
    entryId: scheduled,
    name: "Consent for the test",
    type: OTHER,
  });

  for (const { documentId } of [first, second]) {
    assert.equal((await stored(documentId)).entryId, given);
  }
  assert.equal((await stored(third.documentId)).entryId, scheduled);
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICAL_DOCUMENT_ADDED), [
    `Lab result "Heartworm antigen panel" added for ${name("Heartworm antigen")} test on Oct 12, 2026.`,
    `Imaging "Dental radiograph" added for ${name("Heartworm antigen")} test on Oct 12, 2026.`,
    `Document "Consent for the test" added for ${name("Heartworm antigen")} test due Oct 20, 2026.`,
  ]);
});

test("staff add paperwork to an animal that has left the shelter's care", async () => {
  const animalId = await makeAnimal("Adopted", AnimalListingStatus.ARCHIVED);
  const { documentId } = await create(animalId, { name: "Spay certificate", type: VET_RECORD });
  assert.equal((await stored(documentId)).type, VET_RECORD);
});

test("an entry of another animal, a voided entry and declined care are refused", async () => {
  const animalId = await makeAnimal("Linked");
  const otherAnimal = await makeAnimal("Other animal");
  const othersEntry = await makeEntry(otherAnimal);
  const voided = await makeEntry(animalId, { voided: true });
  const declined = await makeEntry(animalId, { status: MedicalEntryStatus.DECLINED });

  await assertRefused(
    animalId,
    () => create(animalId, { entryId: othersEntry }),
    "entryId",
    "Pick an entry from this animal's record.",
  );
  await assertRefused(
    animalId,
    () => create(animalId, { entryId: "c00000000000000000000000" }),
    "entryId",
    "Pick an entry from this animal's record.",
  );
  await assertRefused(
    animalId,
    () => create(animalId, { entryId: voided }),
    "entryId",
    /was voided/,
  );
  await assertRefused(
    animalId,
    () => create(animalId, { entryId: declined }),
    "entryId",
    /was declined/,
  );
});

test("the document day is neither before the animal's birth nor after today, and may be left out", async () => {
  const animalId = await makeAnimal("Dated");
  await assertRefused(
    animalId,
    () => create(animalId, { documentDate: day("2023-12-31") }),
    "documentDate",
    /can't be before the animal's birth on Jan 1, 2024/,
  );
  await assertRefused(
    animalId,
    () => create(animalId, { documentDate: day("2026-10-17") }),
    "documentDate",
    /can't be in the future/,
  );
  // The bounds themselves are allowed.
  for (const documentDate of [day(BIRTH_DAY), TODAY, null]) {
    const { documentId } = await create(animalId, { documentDate });
    assert.equal((await stored(documentId)).documentDate, documentDate);
  }
});

test("a name is required, at most 200 characters", async () => {
  const animalId = await makeAnimal("Named");
  await assertRefused(animalId, () => create(animalId, { name: "   " }), "name", "Give the document a name.");
  await assertRefused(
    animalId,
    () => create(animalId, { name: "x".repeat(201) }),
    "name",
    "The name can't be longer than 200 characters.",
  );
  const { documentId } = await create(animalId, { name: "x".repeat(200) });
  assert.equal((await stored(documentId)).name.length, 200);
});

test("the stored file's type and size are checked again by the service", async () => {
  const animalId = await makeAnimal("Rechecked");
  const write = (file: Partial<StoredDocumentFile>) =>
    prisma.$transaction((tx) =>
      createMedicalDocument(
        tx,
        { ...documentInput(animalId), ...fileOf(animalId), ...file } as MedicalDocumentInput &
          StoredDocumentFile,
        staffId,
        TODAY,
      ),
    );
  await assertRefused(
    animalId,
    () => write({ contentType: "text/plain" as StoredDocumentFile["contentType"] }),
    "file",
    "Upload a PDF, JPEG, PNG or WebP file.",
  );
  await assertRefused(
    animalId,
    () => write({ sizeBytes: 4 * 1024 * 1024 + 1 }),
    "file",
    "This file is larger than 4 MB.",
  );
});

// ---------------------------------------------------------------------------
// Storing the file, then the row
// ---------------------------------------------------------------------------

const upload = (
  store: ReturnType<typeof memoryStore>,
  animalId: string,
  bytes: Uint8Array,
  overrides: Partial<MedicalDocumentInput> = {},
) =>
  storeThenRecord(store, { pathname: newDocumentPathname(animalId), bytes, fresh: true }, (file) =>
    prisma.$transaction((tx) =>
      createMedicalDocument(tx, { ...documentInput(animalId, overrides), ...file }, staffId, TODAY),
    ),
  );

test("an upload stores the file under its pathname, with the type its bytes say, then writes the row", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Stored");
  const { documentId } = await upload(store, animalId, PNG, { type: IMAGING, name: "Radiograph" });

  const row = await stored(documentId);
  assert.equal(row.contentType, "image/png");
  assert.equal(row.sizeBytes, PNG.byteLength);
  assert.match(row.pathname, new RegExp(`^medical-documents/${animalId}/[0-9a-f-]{36}$`));
  assert.deepEqual(store.pathnames(), [row.pathname]);
  assert.deepEqual(store.read(row.pathname), { bytes: PNG, contentType: "image/png" });
});

test("a file the shelter doesn't keep is refused before anything is stored", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Text file");
  await assertRefused(
    animalId,
    () => upload(store, animalId, TEXT),
    "file",
    "Upload a PDF, JPEG, PNG or WebP file.",
  );
  await assertRefused(animalId, () => upload(store, animalId, new Uint8Array()), "file", "Choose a file to upload.");
  assert.deepEqual(store.pathnames(), []);
});

test("a refused row removes the file it stored, and a failed store writes no row", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Refused upload");
  await assertRefused(animalId, () => upload(store, animalId, PDF, { name: "" }), "name");
  assert.deepEqual(store.pathnames(), []);

  store.failNextPut(new Error("The store is down."));
  let wrote = false;
  await assert.rejects(
    storeThenRecord(store, { pathname: newDocumentPathname(animalId), bytes: PDF, fresh: true }, async () => {
      wrote = true;
    }),
    /The store is down\./,
  );
  assert.equal(wrote, false);
  assert.equal(await prisma.medicalDocument.count({ where: { animalId } }), 0);
  assert.deepEqual(store.pathnames(), []);
});

/** A store that writes the file, then fails as if its answer were lost. */
const writesThenFails = (store: ReturnType<typeof memoryStore>) => ({
  ...store,
  put: async (pathname: string, bytes: Uint8Array, contentType: string) => {
    await store.put(pathname, bytes, contentType);
    throw new Error("The store's answer was lost.");
  },
});

test("a store that writes the file and then fails has the file removed again at a fresh pathname", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Lost answer");
  let wrote = false;
  await assert.rejects(
    storeThenRecord(
      writesThenFails(store),
      { pathname: newDocumentPathname(animalId), bytes: PDF, fresh: true },
      async () => {
        wrote = true;
      },
    ),
    /The store's answer was lost\./,
  );
  assert.equal(wrote, false);
  assert.deepEqual(store.pathnames(), []);

  // A removal that fails too is logged, and the store's own error is what
  // the caller gets.
  const logged: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    await assert.rejects(
      storeThenRecord(
        {
          ...writesThenFails(store),
          remove: async () => {
            throw new Error("The store is down.");
          },
        },
        { pathname: newDocumentPathname(animalId), bytes: PDF, fresh: true },
        async () => {},
      ),
      /The store's answer was lost\./,
    );
  } finally {
    console.error = consoleError;
  }
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][0]), /after its store failed/);
});

test("at a fixed pathname, a failed store leaves the file already there", async () => {
  const store = memoryStore();
  const pathname = `medical-documents/seed/${runId}.pdf`;
  await store.put(pathname, PDF, "application/pdf");
  await assert.rejects(
    storeThenRecord(store, { pathname, bytes: PNG, fresh: false }, async () => {}),
    /already stored/,
  );
  assert.deepEqual(store.read(pathname), { bytes: PDF, contentType: "application/pdf" });
});

test("a failed removal after a refused row is logged, and the refusal is what the caller gets", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Stuck file");
  const failing = {
    ...store,
    remove: async () => {
      throw new Error("The store is down.");
    },
  };
  const logged: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    await assert.rejects(
      storeThenRecord(failing, { pathname: newDocumentPathname(animalId), bytes: PDF, fresh: true }, (file) =>
        prisma.$transaction((tx) =>
          createMedicalDocument(tx, { ...documentInput(animalId, { name: "" }), ...file }, staffId, TODAY),
        ),
      ),
      isRefusal("name"),
    );
  } finally {
    console.error = consoleError;
  }
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][0]), /Failed to remove a medical document's file/);
  // The file is left behind, with no row pointing at it.
  assert.equal(store.pathnames().length, 1);
  assert.equal(await prisma.medicalDocument.count({ where: { animalId } }), 0);
});

// ---------------------------------------------------------------------------
// Correcting
// ---------------------------------------------------------------------------

test("each field is corrected with an EDITED event of what changed and a feed row naming it", async () => {
  const animalId = await makeAnimal("Corrected");
  const entryId = await makeEntry(animalId);
  const { documentId } = await create(animalId);
  const testLine = `${name("Heartworm antigen")} test on Oct 12, 2026`;

  const steps: {
    correction: MedicalDocumentCorrection;
    before: object;
    after: object;
    text: string;
  }[] = [
    {
      correction: { name: "Heartworm panel" },
      before: { name: "Heartworm antigen panel" },
      after: { name: "Heartworm panel" },
      text: 'Lab result "Heartworm antigen panel" was corrected: the name changed from "Heartworm antigen panel" to "Heartworm panel".',
    },
    {
      correction: { type: VET_RECORD },
      before: { type: LAB_RESULT },
      after: { type: VET_RECORD },
      text: 'Lab result "Heartworm panel" was corrected: the type changed from lab result to vet record.',
    },
    {
      correction: { documentDate: day("2026-10-12") },
      before: { documentDate: null },
      after: { documentDate: "2026-10-12" },
      text: 'Vet record "Heartworm panel" was corrected: the document date was set to Oct 12, 2026.',
    },
    {
      correction: { entryId },
      before: { entryId: null },
      after: { entryId },
      text: `Vet record "Heartworm panel" was corrected: the entry was set to ${testLine}.`,
    },
    {
      correction: { notes: "From the outside lab." },
      before: { notes: null },
      after: { notes: "From the outside lab." },
      text: 'Vet record "Heartworm panel" was corrected: notes were added.',
    },
    {
      correction: { documentDate: null, entryId: null, notes: null },
      before: { documentDate: "2026-10-12", entryId, notes: "From the outside lab." },
      after: { documentDate: null, entryId: null, notes: null },
      text: `Vet record "Heartworm panel" was corrected: the document date was cleared (was Oct 12, 2026), the entry was cleared (was ${testLine}) and notes were removed.`,
    },
  ];
  for (const step of steps) {
    const result = await edit(documentId, step.correction);
    assert.equal(result.status, "edited");
    const events = await eventsOf(documentId);
    assert.deepEqual(events[events.length - 1], {
      action: MedicalDocumentEventAction.EDITED,
      actorId: editorId,
      before: step.before,
      after: step.after,
    });
    const feed = await feedOf(animalId, AnimalActivityType.MEDICAL_DOCUMENT_EDITED);
    assert.equal(feed[feed.length - 1], step.text);
  }

  const row = await stored(documentId);
  assert.equal(row.name, "Heartworm panel");
  assert.equal(row.type, VET_RECORD);
  assert.equal(row.documentDate, null);
  assert.equal(row.entryId, null);
  assert.equal(row.notes, null);
});

test("a correction that changes nothing writes nothing, and a left-out field keeps what is stored", async () => {
  const animalId = await makeAnimal("Unchanged");
  const { documentId } = await create(animalId, {
    documentDate: day("2026-10-12"),
    notes: "Kept",
  });
  const feedBefore = await feedOf(animalId);

  assert.equal(
    (await edit(documentId, { name: " Heartworm antigen panel ", notes: "Kept" })).status,
    "unchanged",
  );
  assert.equal((await edit(documentId, {})).status, "unchanged");
  assert.equal((await eventsOf(documentId)).length, 1);
  assert.deepEqual(await feedOf(animalId), feedBefore);

  await edit(documentId, { type: IMAGING });
  const row = await stored(documentId);
  assert.equal(row.documentDate, "2026-10-12");
  assert.equal(row.notes, "Kept");
});

test("a correction is refused on the field it breaks, and checks only what changed", async () => {
  const animalId = await makeAnimal("Refused correction");
  const otherAnimal = await makeAnimal("Not this one");
  const othersEntry = await makeEntry(otherAnimal);
  const entryId = await makeEntry(animalId);
  const { documentId } = await create(animalId, { entryId });

  await assertRefused(animalId, () => edit(documentId, { name: "" }), "name");
  await assertRefused(animalId, () => edit(documentId, { documentDate: day("2026-10-17") }), "documentDate");
  await assertRefused(animalId, () => edit(documentId, { entryId: othersEntry }), "entryId");

  // The entry was voided after the document was linked: a correction of
  // something else keeps the link.
  await prisma.medicalEntry.update({
    where: { id: entryId },
    data: { voidedAt: new Date(), voidedById: staffId, voidReason: "Wrong animal" },
  });
  assert.equal((await edit(documentId, { name: "Still linked" })).status, "edited");
  assert.equal((await stored(documentId)).entryId, entryId);
});

test("a voided document isn't corrected", async () => {
  const animalId = await makeAnimal("Voided correction");
  const { documentId } = await create(animalId);
  await voidIt(documentId);
  await assert.rejects(edit(documentId, { name: "Too late" }), (error: unknown) => {
    assert.ok(error instanceof ConflictError);
    assert.match(error.message, /was voided, so it can't be corrected/);
    return true;
  });
});

// ---------------------------------------------------------------------------
// Voiding and removing the file
// ---------------------------------------------------------------------------

test("a void is written once, with its reason, keeping the row and the file", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Voided");
  const { documentId } = await upload(store, animalId, PDF, {
    name: "Intake paperwork (wrong animal)",
    type: OTHER,
  });

  await assertRefused(animalId, () => voidIt(documentId, "  "), "reason", /reason for voiding/);
  await voidIt(documentId, " Uploaded to the wrong animal ");

  const row = await stored(documentId);
  assert.ok(row.voidedAt);
  assert.equal(row.voidedById, editorId);
  assert.equal(row.voidReason, "Uploaded to the wrong animal");
  assert.equal(row.fileRemovedAt, null);
  assert.deepEqual(store.pathnames(), [row.pathname]);
  const events = await eventsOf(documentId);
  assert.deepEqual(events[events.length - 1], {
    action: MedicalDocumentEventAction.VOIDED,
    actorId: editorId,
    before: null,
    after: { voidReason: "Uploaded to the wrong animal" },
  });
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICAL_DOCUMENT_VOIDED), [
    'Document "Intake paperwork (wrong animal)" was voided. Reason: Uploaded to the wrong animal',
  ]);

  await assert.rejects(voidIt(documentId), (error: unknown) => {
    assert.ok(error instanceof ConflictError);
    assert.match(error.message, /already been voided/);
    return true;
  });
});

test("only a voided document's file is removed, once, and the row stays saying who removed it and why", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Removed");
  const { documentId } = await upload(store, animalId, PDF, { name: "Someone's ID card", type: OTHER });
  const { pathname } = await stored(documentId);
  const remove = (reason = "Holds a person's private details") =>
    prisma.$transaction((tx) => removeMedicalDocumentFile(tx, documentId, reason, adminId, store));

  await assert.rejects(remove(), (error: unknown) => {
    assert.ok(error instanceof ConflictError);
    assert.match(error.message, /Void the document first/);
    return true;
  });
  assert.deepEqual(store.pathnames(), [pathname]);

  await voidIt(documentId, "Not a medical record");
  await assertRefused(animalId, () => remove(" "), "reason", /reason for removing/);
  assert.deepEqual(store.pathnames(), [pathname]);

  await remove();
  assert.deepEqual(store.pathnames(), []);
  assert.equal(await store.get(pathname), null);
  const row = await stored(documentId);
  assert.ok(row.fileRemovedAt);
  assert.equal(row.fileRemovedById, adminId);
  assert.equal(row.fileRemovalReason, "Holds a person's private details");
  assert.equal(row.pathname, pathname);
  assert.equal(row.voidReason, "Not a medical record");
  const events = await eventsOf(documentId);
  assert.deepEqual(events[events.length - 1], {
    action: MedicalDocumentEventAction.FILE_REMOVED,
    actorId: adminId,
    before: null,
    after: { fileRemovalReason: "Holds a person's private details" },
  });
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICAL_DOCUMENT_FILE_REMOVED), [
    `The file of Document "Someone's ID card" was removed. Reason: Holds a person's private details`,
  ]);

  await assert.rejects(remove(), (error: unknown) => {
    assert.ok(error instanceof ConflictError);
    assert.match(error.message, /already been removed/);
    return true;
  });
});

test("a store that can't delete the file leaves the row as it was", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Undeletable");
  const { documentId } = await upload(store, animalId, PDF);
  await voidIt(documentId);
  const failing = {
    ...store,
    remove: async () => {
      throw new Error("The store is down.");
    },
  };
  await assert.rejects(
    prisma.$transaction((tx) => removeMedicalDocumentFile(tx, documentId, "Private", adminId, failing)),
    /The store is down\./,
  );
  const row = await stored(documentId);
  assert.equal(row.fileRemovedAt, null);
  assert.equal((await eventsOf(documentId)).length, 2);
});

test("the file goes first: a row that then can't be written leaves the file removed", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Removed first");
  const { documentId } = await upload(store, animalId, PDF);
  await voidIt(documentId);
  // No such person, so writing who removed it fails after the file is gone.
  await assert.rejects(
    prisma.$transaction((tx) =>
      removeMedicalDocumentFile(tx, documentId, "Private", "c00000000000000000000000", store),
    ),
  );
  assert.deepEqual(store.pathnames(), []);
  assert.equal((await stored(documentId)).fileRemovedAt, null);
});

// ---------------------------------------------------------------------------
// Two transactions at once
// ---------------------------------------------------------------------------

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;

// The proof that `waiterPid` reached a lock and is blocked there by
// `holderPid`.
const waitForBlockedBy = async (waiterPid: number, holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ blocked }] = await prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT ${holderPid}::int = ANY (pg_blocking_pids(${waiterPid}::int)) AS blocked`;
    if (blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Backend ${waiterPid} was never seen waiting on backend ${holderPid}.`);
};

/**
 * Runs `hold` in a transaction kept open, uncommitted, until `second` (in a
 * transaction of its own) is seen waiting on it; then lets it commit. Returns
 * once both have finished, rethrowing either's error.
 */
const overlap = async (
  hold: (tx: TransactionClient) => Promise<unknown>,
  second: (tx: TransactionClient) => Promise<unknown>,
) => {
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const isHeld = new Promise<number>((resolve) => (held = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await hold(tx);
      held(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  const holderPid = await Promise.race([isHeld, holder as Promise<never>]);
  let started!: (pid: number) => void;
  const isStarted = new Promise<number>((resolve) => (started = resolve));
  const later = prisma.$transaction(
    async (tx) => {
      started(await backendPid(tx));
      return second(tx);
    },
    { timeout },
  );
  void later.catch(() => {});
  try {
    const laterPid = await Promise.race([isStarted, later as Promise<never>]);
    await waitForBlockedBy(laterPid, holderPid);
  } finally {
    release();
    await Promise.allSettled([holder, later]);
  }
  await holder;
  await later;
};

test("a void made while another void of the document is being written waits for it, then is refused", async () => {
  const animalId = await makeAnimal("Voided at once");
  const { documentId } = await create(animalId);

  // Stands in for a void in flight: the service takes the animal's lock,
  // then writes.
  await assert.rejects(
    overlap(
      async (tx) => {
        await lockAnimal(tx, animalId);
        await tx.medicalDocument.update({
          where: { id: documentId },
          data: { voidedAt: new Date(), voidedById: staffId, voidReason: "First" },
        });
      },
      (tx) => voidMedicalDocument(tx, documentId, "Second", editorId),
    ),
    (error: unknown) => error instanceof ConflictError && /already been voided/.test(error.message),
  );
  assert.equal((await stored(documentId)).voidReason, "First");
});

test("a file removal made while another is being written waits for it, then is refused", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Removed at once");
  const { documentId } = await upload(store, animalId, PDF);
  await voidIt(documentId);
  let removals = 0;
  const counting = {
    ...store,
    remove: async (pathname: string) => {
      removals += 1;
      await store.remove(pathname);
    },
  };

  await assert.rejects(
    overlap(
      (tx) => removeMedicalDocumentFile(tx, documentId, "First", adminId, counting),
      (tx) => removeMedicalDocumentFile(tx, documentId, "Second", editorId, counting),
    ),
    (error: unknown) => error instanceof ConflictError && /already been removed/.test(error.message),
  );
  assert.equal(removals, 1);
  const row = await stored(documentId);
  assert.equal(row.fileRemovedById, adminId);
  assert.equal(row.fileRemovalReason, "First");
  assert.equal(
    (await eventsOf(documentId)).filter(
      (event) => event.action === MedicalDocumentEventAction.FILE_REMOVED,
    ).length,
    1,
  );
});

// ---------------------------------------------------------------------------
// A foster's paperwork
// ---------------------------------------------------------------------------

test("a foster adds paperwork to their own waiting report, for an animal they foster now", async () => {
  const animalId = await makeAnimal("Fostered");
  const placementId = await place(animalId);
  const reportId = await report(animalId, placementId, fosterId);

  const { documentId } = await create(
    animalId,
    { name: "Clinic invoice", type: VET_RECORD, vetReportId: reportId },
    { foster: { personId: fosterId } },
  );
  const row = await stored(documentId);
  assert.equal(row.vetReportId, reportId);
  assert.equal(row.uploadedById, fosterId);
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICAL_DOCUMENT_ADDED), [
    'Vet record "Clinic invoice" added to a foster\'s report of the visit on Oct 14, 2026.',
  ]);
  const [feedRow] = await prisma.animalActivityLog.findMany({
    where: { animalId, activityType: AnimalActivityType.MEDICAL_DOCUMENT_ADDED },
    select: { changedById: true },
  });
  assert.equal(feedRow.changedById, fosterId);
});

test("a foster's paperwork without a report, on another foster's report, on an entry, or after the placement ended is refused", async () => {
  const animalId = await makeAnimal("Fostered refusals");
  const placementId = await place(animalId);
  const reportId = await report(animalId, placementId, fosterId);
  const othersReport = await report(animalId, placementId, otherFosterId);
  const entryId = await makeEntry(animalId);
  const asFoster = { foster: { personId: fosterId } };

  await assertRefused(
    animalId,
    () => create(animalId, {}, asFoster),
    undefined,
    "A foster's paperwork goes with their report of an outside vet visit.",
  );
  await assertRefused(
    animalId,
    () => create(animalId, { vetReportId: othersReport }, asFoster),
    undefined,
    "Paperwork can be added only to your own reports.",
  );
  await assertRefused(
    animalId,
    () => create(animalId, { vetReportId: reportId, entryId }, asFoster),
    "entryId",
  );
  // Someone who doesn't foster the animal, even with a report of theirs on it.
  await assertRefused(
    animalId,
    () => create(animalId, { vetReportId: othersReport }, { foster: { personId: otherFosterId } }),
    undefined,
    NOT_FOSTERING_MESSAGE,
  );

  await prisma.fosterPlacement.update({ where: { id: placementId }, data: { endDate: "2026-10-15" } });
  await assertRefused(
    animalId,
    () => create(animalId, { vetReportId: reportId }, asFoster),
    undefined,
    NOT_FOSTERING_MESSAGE,
  );
  // Staff still add paperwork to the waiting report.
  const { documentId } = await create(animalId, { vetReportId: reportId });
  assert.equal((await stored(documentId)).vetReportId, reportId);
});

test("paperwork goes only with a waiting report of the same animal", async () => {
  const animalId = await makeAnimal("Reported");
  const otherAnimal = await makeAnimal("Other reported");
  const placementId = await place(animalId);
  const otherPlacement = await place(otherAnimal);
  const reviewed = await report(animalId, placementId, fosterId, true);
  const othersReport = await report(otherAnimal, otherPlacement, fosterId);

  for (const options of [{}, { foster: { personId: fosterId } }]) {
    await assertRefused(
      animalId,
      () => create(animalId, { vetReportId: reviewed }, options),
      undefined,
      /already reviewed/,
    );
    await assertRefused(
      animalId,
      () => create(animalId, { vetReportId: othersReport }, options),
      undefined,
      "That report isn't one of this animal's.",
    );
  }
});

// ---------------------------------------------------------------------------
// The reads
// ---------------------------------------------------------------------------

test("an animal's documents read newest upload first, by type, voided ones only when asked, a removed file marked", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Listed");
  const entryId = await makeEntry(animalId);
  const placementId = await place(animalId);
  const reportId = await report(animalId, placementId, fosterId);
  const lab = await upload(store, animalId, PDF, { entryId, documentDate: day("2026-10-12") });
  const radiograph = await upload(store, animalId, PNG, { name: "Radiograph", type: IMAGING });
  const invoice = await upload(store, animalId, PDF, {
    name: "Clinic invoice",
    type: VET_RECORD,
    vetReportId: reportId,
  });
  const wrong = await upload(store, animalId, PDF, { name: "Wrong animal", type: OTHER });
  await voidIt(wrong.documentId, "Uploaded to the wrong animal");
  await prisma.$transaction((tx) =>
    removeMedicalDocumentFile(tx, wrong.documentId, "Private", adminId, store),
  );
  // Another animal's document is never listed.
  await upload(store, await makeAnimal("Not listed"), PDF);

  const ids = (documents: { id: string }[]) => documents.map((document) => document.id);
  const all = await findAnimalDocuments(prisma, animalId, { includeVoided: true });
  assert.deepEqual(ids(all), [
    wrong.documentId,
    invoice.documentId,
    radiograph.documentId,
    lab.documentId,
  ]);
  assert.deepEqual(ids(await findAnimalDocuments(prisma, animalId, { includeVoided: false })), [
    invoice.documentId,
    radiograph.documentId,
    lab.documentId,
  ]);
  assert.deepEqual(
    ids(await findAnimalDocuments(prisma, animalId, { type: LAB_RESULT, includeVoided: true })),
    [lab.documentId],
  );
  assert.deepEqual(
    ids(await findAnimalDocuments(prisma, animalId, { type: OTHER, includeVoided: false })),
    [],
  );

  const [removed, sent, , labRow] = all;
  assert.equal(removed.fileHeld, false);
  assert.equal(removed.voidReason, "Uploaded to the wrong animal");
  assert.equal(removed.voidedBy?.name, name("Benjamin"));
  assert.equal(removed.fileRemovedBy?.name, name("Admin"));
  assert.equal(removed.fileRemovalReason, "Private");
  assert.equal(sent.fileHeld, true);
  assert.deepEqual(sent.vetReport, { visitDate: "2026-10-14" });
  assert.equal(sent.entry, null);
  assert.equal(labRow.uploadedBy.name, name("Olivia"));
  assert.equal(labRow.contentType, "application/pdf");
  assert.equal(labRow.sizeBytes, PDF.byteLength);
  assert.deepEqual(labRow.entry, {
    kind: MedicalEntryKind.TEST,
    status: MedicalEntryStatus.COMPLETED,
    completedDate: "2026-10-12",
    dueDate: null,
    procedure: null,
    examType: null,
    chipNumber: null,
    voidedAt: null,
    item: { name: name("Heartworm antigen") },
  });
});

test("the file route's read says where the file is and whether it can be served", async () => {
  const store = memoryStore();
  const animalId = await makeAnimal("Served");
  const { documentId } = await upload(store, animalId, PNG, { name: "Radiograph", type: IMAGING });
  const { pathname } = await stored(documentId);

  assert.deepEqual(await findDocumentForFile(prisma, documentId), {
    animalId,
    pathname,
    contentType: "image/png",
    name: "Radiograph",
    voided: false,
    fileRemoved: false,
  });
  await voidIt(documentId);
  assert.equal((await findDocumentForFile(prisma, documentId))?.voided, true);
  await prisma.$transaction((tx) =>
    removeMedicalDocumentFile(tx, documentId, "Private", adminId, store),
  );
  assert.equal((await findDocumentForFile(prisma, documentId))?.fileRemoved, true);
  assert.equal(await findDocumentForFile(prisma, "c00000000000000000000000"), null);
});

test("an entry's row lists its live documents, oldest upload first, and says where it came from", async () => {
  const animalId = await makeAnimal("Entry row");
  const entryId = await makeEntry(animalId);
  const first = await create(animalId, { entryId });
  const second = await create(animalId, { entryId, name: "Lab invoice", type: OTHER });
  const voided = await create(animalId, { entryId, name: "Wrong animal" });
  await voidIt(voided.documentId);
  // A document not linked to the entry isn't on its row.
  await create(animalId, { name: "Unlinked" });

  const [row] = await findVaccinesAndTests(prisma, animalId);
  assert.equal(row.id, entryId);
  assert.deepEqual(row.documents, [
    { id: first.documentId, name: "Heartworm antigen panel", type: LAB_RESULT },
    { id: second.documentId, name: "Lab invoice", type: OTHER },
  ]);
  assert.equal(row.reportedByFoster, false);
  assert.equal(row.vetReport, null);

  const placementId = await place(animalId);
  const reportId = await report(animalId, placementId, fosterId);
  await prisma.medicalEntry.update({
    where: { id: entryId },
    data: { reportedByFoster: true, vetReportId: reportId },
  });
  const [fromReport] = await findRecentMedicalEntries(prisma, animalId, 5);
  assert.equal(fromReport.reportedByFoster, true);
  assert.deepEqual(fromReport.vetReport, { visitDate: "2026-10-14" });
});
