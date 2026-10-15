// Care episodes, against a real Postgres: opened, recorded already over,
// closed, corrected and voided through the care-episode service, as the
// actions drive it. An animal has at most one open episode, its episodes
// don't overlap, and each starts in its current stay.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import {
  AnimalActivityType,
  AnimalListingStatus,
  CareEpisodeEventAction,
  CareEpisodeType,
  IntakeType,
  LocationType,
  PartnerType,
  Sex,
} from "@/prisma/generated/enums";
import {
  careEpisodeOfferAfterMove,
  careEpisodeOfferInMove,
  closeCareEpisode,
  editCareEpisode,
  openCareEpisode,
  voidCareEpisode,
  type CareEpisodeCorrection,
  type CareEpisodeInput,
} from "@/app/lib/services/care-episode";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry";
import {
  findAnimalReadiness,
  findReadinessForAnimals,
} from "@/app/lib/data/animals/readiness";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { moveAnimal } from "@/app/lib/services/animal-move";
import { ConflictError } from "@/app/lib/utils/errors";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;
const { UNDER_VET_CARE, HOSPITALISED_IN_HOUSE, HOSPITALISED_OFF_SITE } = CareEpisodeType;

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let clinicId: string;
let closedClinicId: string;
let rescueId: string;
const locationIds: string[] = [];

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Episode species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Episode color") },
      select: { id: true },
    })
  ).id;
  const person = async (label: string) =>
    (
      await prisma.person.create({
        data: { name: name(label) },
        select: { id: true },
      })
    ).id;
  staffId = await person("Episode staff");
  editorId = await person("Episode editor");
  const partner = async (label: string, type: PartnerType, isActive = true) =>
    (
      await prisma.partner.create({
        data: { name: name(label), type, isActive },
        select: { id: true },
      })
    ).id;
  clinicId = await partner("Downtown Clinic", PartnerType.VET_CLINIC);
  closedClinicId = await partner("Closed Clinic", PartnerType.VET_CLINIC, false);
  rescueId = await partner("Episode Rescue", PartnerType.RESCUE_GROUP);
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the episodes, their events and activity rows.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.unit.deleteMany({ where: { locationId: { in: locationIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.partner.deleteMany({
    where: { id: { in: [clinicId, closedClinicId, rescueId] } },
  });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, editorId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string, intakeDays: CalendarDay[] = [INTAKE_DAY]) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.MALE,
        speciesId,
        primaryColorId: colorId,
        intake: {
          create: intakeDays.map((intakeDate) => ({
            type: IntakeType.STRAY,
            intakeDate,
            staffMemberId: staffId,
          })),
        },
      },
      select: { id: true },
    })
  ).id;

const episode = (overrides: Partial<CareEpisodeInput> = {}): CareEpisodeInput => ({
  type: HOSPITALISED_IN_HOUSE,
  startDate: day("2026-10-03"),
  reason: "Heartworm treatment: adulticide injections and cage rest.",
  ...overrides,
});

const open = (
  animalId: string,
  input: CareEpisodeInput = episode(),
  options: { timeout?: number } = {},
) =>
  prisma.$transaction(
    (tx) => openCareEpisode(tx, { ...input, animalId }, staffId, TODAY),
    options,
  );

const close = (episodeId: string, endDate: CalendarDay) =>
  prisma.$transaction((tx) => closeCareEpisode(tx, episodeId, endDate, editorId, TODAY));

const edit = (episodeId: string, input: CareEpisodeCorrection) =>
  prisma.$transaction((tx) => editCareEpisode(tx, episodeId, input, editorId, TODAY));

const voidIt = (episodeId: string, reason: string) =>
  prisma.$transaction((tx) => voidCareEpisode(tx, episodeId, reason, editorId));

const stored = (episodeId: string) =>
  prisma.careEpisode.findUniqueOrThrow({ where: { id: episodeId } });

const eventsOf = (episodeId: string) =>
  prisma.careEpisodeEvent.findMany({
    where: { episodeId },
    orderBy: { createdAt: "asc" },
    select: { action: true, actorId: true, before: true, after: true },
  });

const feedOf = async (animalId: string, type?: AnimalActivityType) =>
  (
    await prisma.animalActivityLog.findMany({
      where: { animalId, ...(type ? { activityType: type } : {}) },
      orderBy: { changedAt: "asc" },
      select: { changeSummary: true },
    })
  ).map((row) => row.changeSummary);

/** Runs `write`, expecting it refused on `field` with nothing written. */
const assertRefused = async (
  animalId: string,
  write: () => Promise<unknown>,
  field: string | undefined,
  message?: RegExp,
) => {
  const episodesBefore = await prisma.careEpisode.findMany({
    where: { animalId },
    orderBy: { id: "asc" },
  });
  const feedBefore = await prisma.animalActivityLog.count({ where: { animalId } });
  await assert.rejects(write, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field);
    if (message) assert.match(error.message, message);
    return true;
  });
  assert.deepEqual(
    await prisma.careEpisode.findMany({ where: { animalId }, orderBy: { id: "asc" } }),
    episodesBefore,
  );
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), feedBefore);
};

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

test("opens each kind of episode, with its event and activity text", async () => {
  const inHouseId = await makeAnimal("In house");
  const { episodeId } = await open(
    inHouseId,
    episode({ reason: "  Heartworm treatment. ", notes: " Cage rest. " }),
  );
  const row = await stored(episodeId);
  assert.deepEqual(
    {
      animalId: row.animalId,
      type: row.type,
      startDate: row.startDate,
      endDate: row.endDate,
      reason: row.reason,
      partnerId: row.partnerId,
      notes: row.notes,
      openedById: row.openedById,
      closedById: row.closedById,
      voidedAt: row.voidedAt,
    },
    {
      animalId: inHouseId,
      type: HOSPITALISED_IN_HOUSE,
      startDate: "2026-10-03",
      endDate: null,
      reason: "Heartworm treatment.",
      partnerId: null,
      notes: "Cage rest.",
      openedById: staffId,
      closedById: null,
      voidedAt: null,
    },
  );
  assert.deepEqual(await eventsOf(episodeId), [
    {
      action: CareEpisodeEventAction.OPENED,
      actorId: staffId,
      before: null,
      after: {
        type: HOSPITALISED_IN_HOUSE,
        startDate: "2026-10-03",
        endDate: null,
        reason: "Heartworm treatment.",
        partnerId: null,
        notes: "Cage rest.",
      },
    },
  ]);

  const offSiteId = await makeAnimal("Off site");
  await open(
    offSiteId,
    episode({ type: HOSPITALISED_OFF_SITE, partnerId: clinicId, reason: "Not eating; on IV fluids." }),
  );
  const vetCareId = await makeAnimal("Vet care");
  await open(vetCareId, episode({ type: UNDER_VET_CARE, reason: "Cough under investigation." }));
  const vetCareAtId = await makeAnimal("Vet care at");
  await open(
    vetCareAtId,
    episode({ type: UNDER_VET_CARE, partnerId: clinicId, reason: "Post-op recheck." }),
  );

  const opened = AnimalActivityType.CARE_EPISODE_OPENED;
  assert.deepEqual(await feedOf(inHouseId, opened), [
    "Care episode opened: hospitalised in house from Oct 3, 2026. Reason: Heartworm treatment.",
  ]);
  assert.deepEqual(await feedOf(offSiteId, opened), [
    `Care episode opened: hospitalised at ${name("Downtown Clinic")} from Oct 3, 2026. Reason: Not eating; on IV fluids.`,
  ]);
  assert.deepEqual(await feedOf(vetCareId, opened), [
    "Care episode opened: under vet care from Oct 3, 2026. Reason: Cough under investigation.",
  ]);
  assert.deepEqual(await feedOf(vetCareAtId, opened), [
    `Care episode opened: under vet care at ${name("Downtown Clinic")} from Oct 3, 2026. Reason: Post-op recheck.`,
  ]);
});

test("a stay at a clinic names an active vet clinic, and a stay in house names none", async () => {
  const animalId = await makeAnimal("Clinics");
  await assertRefused(
    animalId,
    () => open(animalId, episode({ type: HOSPITALISED_OFF_SITE })),
    "partnerId",
    /Pick the clinic/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ partnerId: clinicId })),
    "partnerId",
    /in house has no clinic/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ type: HOSPITALISED_OFF_SITE, partnerId: closedClinicId })),
    "partnerId",
    /Pick a vet clinic from the partner directory/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ type: UNDER_VET_CARE, partnerId: rescueId })),
    "partnerId",
    /Pick a vet clinic from the partner directory/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ reason: "  " })),
    "reason",
    /Say why/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ reason: "x".repeat(1001) })),
    "reason",
    /1000 characters/,
  );

  // A clinic made inactive after it was picked stays on the episode through
  // a correction of something else.
  const { episodeId } = await open(
    animalId,
    episode({ type: HOSPITALISED_OFF_SITE, partnerId: clinicId }),
  );
  await prisma.partner.update({ where: { id: clinicId }, data: { isActive: false } });
  try {
    await edit(episodeId, { notes: "Visited on day two." });
  } finally {
    await prisma.partner.update({ where: { id: clinicId }, data: { isActive: true } });
  }
  assert.equal((await stored(episodeId)).partnerId, clinicId);
});

test("the start is in the current stay and not in the future; an episode can be recorded already over", async () => {
  // Returned on Sep 20: the latest intake is the one that counts.
  const animalId = await makeAnimal("Days", [INTAKE_DAY, day("2026-09-20")]);
  await assertRefused(
    animalId,
    () => open(animalId, episode({ startDate: day("2026-09-19") })),
    "startDate",
    /^The start date can't be before the animal's intake on Sep 20, 2026\.$/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ startDate: day("2026-10-11") })),
    "startDate",
    /^The start date can't be in the future\.$/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ endDate: day("2026-10-11") })),
    "endDate",
    /^The end date can't be in the future\.$/,
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ endDate: day("2026-10-02") })),
    "endDate",
    /before the start date/,
  );

  const { episodeId } = await open(
    animalId,
    episode({
      type: HOSPITALISED_OFF_SITE,
      partnerId: clinicId,
      startDate: day("2026-09-20"),
      endDate: day("2026-09-22"),
    }),
  );
  const row = await stored(episodeId);
  assert.equal(row.endDate, "2026-09-22");
  // Recording it over is closing it too.
  assert.equal(row.closedById, staffId);
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.CARE_EPISODE_OPENED), [
    `Care episode recorded: hospitalised at ${name("Downtown Clinic")}, Sep 20 to Sep 22, 2026. Reason: Heartworm treatment: adulticide injections and cage rest.`,
  ]);
  // It doesn't count as open, so another opens.
  await open(animalId, episode({ startDate: TODAY }));
});

test("one open episode at a time, backed by the partial unique index", async () => {
  const animalId = await makeAnimal("Fido");
  const { episodeId } = await open(animalId);
  await assertRefused(
    animalId,
    () => open(animalId, episode({ type: UNDER_VET_CARE, startDate: day("2026-10-05") })),
    "startDate",
    new RegExp(
      `^${name("Fido")} already has an open care episode \\(hospitalised in house since Oct 3, 2026\\)\\. Close it first\\.$`,
    ),
  );

  // Written past the service, a second open episode is refused by the index.
  await assert.rejects(
    prisma.careEpisode.create({
      data: {
        animalId,
        type: UNDER_VET_CARE,
        startDate: "2026-10-05",
        reason: "Straight to the table.",
        openedById: staffId,
      },
    }),
    (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
  );

  // A change of type closes one episode and opens another, on the same day.
  await close(episodeId, day("2026-10-06"));
  await open(animalId, episode({ type: UNDER_VET_CARE, startDate: day("2026-10-06") }));
});

test("episodes don't overlap, though one may start on the day another ended", async () => {
  const animalId = await makeAnimal("Overlap");
  await open(
    animalId,
    episode({ startDate: day("2026-09-01"), endDate: day("2026-09-10") }),
  );
  await assertRefused(
    animalId,
    () => open(animalId, episode({ startDate: day("2026-09-05") })),
    "startDate",
    /^This overlaps another care episode \(hospitalised in house, Sep 1 to Sep 10, 2026\)\./,
  );
  // An earlier episode reaching into it is refused on its end.
  await assertRefused(
    animalId,
    () =>
      open(
        animalId,
        episode({ startDate: day("2026-08-20"), endDate: day("2026-09-02") }),
      ),
    "endDate",
    /overlaps another care episode/,
  );
  // An open episode starting before a closed one would reach over it.
  await assertRefused(
    animalId,
    () => open(animalId, episode({ startDate: day("2026-08-25") })),
    "endDate",
    /overlaps another care episode/,
  );
  // Touching on either side is allowed.
  await open(
    animalId,
    episode({ startDate: day("2026-08-25"), endDate: day("2026-09-01") }),
  );
  await open(animalId, episode({ startDate: day("2026-09-10") }));
});

// ---------------------------------------------------------------------------
// Closing and correcting
// ---------------------------------------------------------------------------

test("closing sets the end day and who closed it, once", async () => {
  const animalId = await makeAnimal("Close");
  const { episodeId } = await open(animalId);
  await assertRefused(
    animalId,
    () => close(episodeId, day("2026-10-02")),
    "endDate",
    /before the start date/,
  );
  await assertRefused(
    animalId,
    () => close(episodeId, day("2026-10-11")),
    "endDate",
    /in the future/,
  );

  await close(episodeId, day("2026-10-09"));
  const row = await stored(episodeId);
  assert.equal(row.endDate, "2026-10-09");
  assert.equal(row.closedById, editorId);
  assert.deepEqual((await eventsOf(episodeId)).at(-1), {
    action: CareEpisodeEventAction.CLOSED,
    actorId: editorId,
    before: { endDate: null },
    after: { endDate: "2026-10-09" },
  });
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.CARE_EPISODE_CLOSED), [
    "Care episode closed: hospitalised in house, Oct 3 to Oct 9, 2026.",
  ]);

  await assert.rejects(() => close(episodeId, TODAY), /already closed/);
  assert.equal((await eventsOf(episodeId)).length, 2);
});

test("a correction runs every rule again, and clearing the end day reopens the episode", async () => {
  const animalId = await makeAnimal("Correct");
  const { episodeId } = await open(
    animalId,
    episode({ type: UNDER_VET_CARE, startDate: day("2026-09-01"), endDate: day("2026-09-10") }),
  );

  // A type correction, which then needs its clinic.
  await assertRefused(
    animalId,
    () => edit(episodeId, { type: HOSPITALISED_OFF_SITE }),
    "partnerId",
    /Pick the clinic/,
  );
  const corrected = await edit(episodeId, {
    type: HOSPITALISED_OFF_SITE,
    partnerId: clinicId,
    reason: "Not eating.",
  });
  assert.equal(
    corrected.status === "edited" && corrected.changeSummary,
    `Care episode was corrected: the type changed from under vet care to hospitalised off site, the clinic was set to ${name("Downtown Clinic")} and the reason was edited.`,
  );
  assert.deepEqual((await eventsOf(episodeId)).at(-1), {
    action: CareEpisodeEventAction.EDITED,
    actorId: editorId,
    before: {
      type: UNDER_VET_CARE,
      partnerId: null,
      reason: "Heartworm treatment: adulticide injections and cage rest.",
    },
    after: { type: HOSPITALISED_OFF_SITE, partnerId: clinicId, reason: "Not eating." },
  });

  // A day change is checked again.
  await assertRefused(
    animalId,
    () => edit(episodeId, { startDate: day("2026-07-31") }),
    "startDate",
    /before the animal's intake/,
  );
  await edit(episodeId, { startDate: day("2026-09-02") });

  // A no-op writes nothing.
  const updatedAt = (await stored(episodeId)).updatedAt;
  const events = (await eventsOf(episodeId)).length;
  const noOp = await edit(episodeId, {
    type: HOSPITALISED_OFF_SITE,
    startDate: day("2026-09-02"),
    endDate: day("2026-09-10"),
    reason: " Not eating. ",
    partnerId: clinicId,
    notes: "",
  });
  assert.equal(noOp.status, "unchanged");
  assert.equal((await stored(episodeId)).updatedAt.getTime(), updatedAt.getTime());
  assert.equal((await eventsOf(episodeId)).length, events);

  // Clearing the end day reopens it, and nobody has closed it.
  await edit(episodeId, { endDate: null });
  let row = await stored(episodeId);
  assert.equal(row.endDate, null);
  assert.equal(row.closedById, null);
  assert.equal(
    (await feedOf(animalId, AnimalActivityType.CARE_EPISODE_EDITED)).at(-1),
    "Care episode was corrected: the end date was cleared (was Sep 10, 2026).",
  );

  // Ending it by a correction records who did.
  await edit(episodeId, { endDate: day("2026-09-12") });
  row = await stored(episodeId);
  assert.equal(row.closedById, editorId);

  // Reopening while another is open is refused.
  await open(animalId, episode({ startDate: day("2026-10-01") }));
  await assertRefused(
    animalId,
    () => edit(episodeId, { endDate: null }),
    "startDate",
    /already has an open care episode/,
  );
});

test("a correction that moves an episode into another is refused; touching is allowed", async () => {
  const animalId = await makeAnimal("Correct overlap");
  const { episodeId: firstId } = await open(
    animalId,
    episode({ startDate: day("2026-09-01"), endDate: day("2026-09-05") }),
  );
  const { episodeId: secondId } = await open(
    animalId,
    episode({
      type: UNDER_VET_CARE,
      startDate: day("2026-09-07"),
      endDate: day("2026-09-09"),
    }),
  );

  // The first's end reaching into the second.
  await assertRefused(
    animalId,
    () => edit(firstId, { endDate: day("2026-09-08") }),
    "endDate",
    /^This overlaps another care episode \(under vet care, Sep 7 to Sep 9, 2026\)\./,
  );
  // The second's start falling inside the first.
  await assertRefused(
    animalId,
    () => edit(secondId, { startDate: day("2026-09-04") }),
    "startDate",
    /^This overlaps another care episode \(hospitalised in house, Sep 1 to Sep 5, 2026\)\./,
  );
  // Reopening the first would reach over the second.
  await assertRefused(
    animalId,
    () => edit(firstId, { endDate: null }),
    "endDate",
    /overlaps another care episode/,
  );

  // Touching on one day, from either side.
  await edit(firstId, { endDate: day("2026-09-07") });
  await edit(secondId, { startDate: day("2026-09-07") });
  await edit(firstId, { endDate: day("2026-09-06") });
  await edit(secondId, { startDate: day("2026-09-06") });
  assert.equal((await stored(firstId)).endDate, "2026-09-06");
  assert.equal((await stored(secondId)).startDate, "2026-09-06");
});

test("whoever last sets the end day closed the episode", async () => {
  const animalId = await makeAnimal("Closer");
  // Recorded already over by one person.
  const { episodeId } = await open(
    animalId,
    episode({ startDate: day("2026-10-01"), endDate: day("2026-10-05") }),
  );
  assert.equal((await stored(episodeId)).closedById, staffId);

  // Corrected to another end day by someone else.
  await edit(episodeId, { endDate: day("2026-10-06") });
  assert.equal((await stored(episodeId)).closedById, editorId);

  // A correction that leaves the end day alone leaves who closed it.
  await prisma.$transaction((tx) =>
    editCareEpisode(tx, episodeId, { notes: "Discharged home." }, staffId, TODAY),
  );
  assert.equal((await stored(episodeId)).closedById, editorId);
});

// ---------------------------------------------------------------------------
// Voiding, and the animal leaving
// ---------------------------------------------------------------------------

test("a void is written once, with its text, and a voided episode no longer counts as open", async () => {
  const animalId = await makeAnimal("Void");
  const { episodeId } = await open(animalId);

  await assert.rejects(() => voidIt(episodeId, "  "), (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal);
    assert.equal(error.field, "reason");
    return true;
  });
  await voidIt(episodeId, " Recorded on the wrong animal. ");
  const row = await stored(episodeId);
  assert.ok(row.voidedAt);
  assert.equal(row.voidedById, editorId);
  assert.equal(row.voidReason, "Recorded on the wrong animal.");
  assert.deepEqual((await eventsOf(episodeId)).at(-1), {
    action: CareEpisodeEventAction.VOIDED,
    actorId: editorId,
    before: null,
    after: { voidReason: "Recorded on the wrong animal." },
  });
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.CARE_EPISODE_VOIDED), [
    "Care episode (hospitalised in house from Oct 3, 2026) was voided. Reason: Recorded on the wrong animal.",
  ]);

  await assert.rejects(() => voidIt(episodeId, "Again."), ConflictError);
  await assert.rejects(() => edit(episodeId, { notes: "Late." }), ConflictError);
  await assert.rejects(() => close(episodeId, TODAY), ConflictError);

  // The same days again, open: the voided one neither blocks nor overlaps.
  await open(animalId);
});

test("no episode opens for an animal that has left, but an open one is still closed", async () => {
  const animalId = await makeAnimal("Archived");
  const { episodeId } = await open(animalId);
  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });
  await close(episodeId, day("2026-10-05"));
  await assertRefused(
    animalId,
    () => open(animalId, episode({ startDate: day("2026-10-06") })),
    undefined,
    /left the shelter's care/,
  );
  await edit(episodeId, { notes: "Left with the episode open; closed after." });
  await voidIt(episodeId, "Wrong animal.");
});

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

test("readiness holds an animal under care from the open episode's start, and not for a closed or voided one", async () => {
  const inHouse = await makeAnimal("Readiness in house");
  const inHouseEpisode = await open(inHouse);
  const offSite = await makeAnimal("Readiness off site");
  const offSiteEpisode = await open(
    offSite,
    episode({ type: HOSPITALISED_OFF_SITE, startDate: day("2026-10-08"), partnerId: clinicId }),
  );
  const closed = await makeAnimal("Readiness closed");
  await close((await open(closed)).episodeId, day("2026-10-06"));
  const voided = await makeAnimal("Readiness voided");
  await voidIt((await open(voided)).episodeId, "Wrong animal.");

  const shelterDay = { timezone: "America/Los_Angeles", today: TODAY };
  const animalIds = [inHouse, offSite, closed, voided];
  const underCareOf = (blockers: { kind: string }[]) =>
    blockers.filter((blocker) => blocker.kind === "UNDER_CARE");
  const one = new Map<string, unknown>();
  for (const animalId of animalIds) {
    const readiness = await findAnimalReadiness(prisma, animalId, shelterDay);
    one.set(animalId, underCareOf(readiness!.blockers));
  }
  // Narrowed to this test's animals, so other files deleting theirs mid-read
  // can't reach it.
  const board = new Map<string, unknown>();
  for (const readiness of await findReadinessForAnimals(prisma, shelterDay, {
    animalIds,
  })) {
    board.set(readiness.animal.id, underCareOf(readiness.blockers));
  }

  // Midnight in Los Angeles, on daylight time.
  const expected = new Map<string, unknown>([
    [
      inHouse,
      [
        {
          kind: "UNDER_CARE",
          episodeId: inHouseEpisode.episodeId,
          episodeType: HOSPITALISED_IN_HOUSE,
          startDate: "2026-10-03",
          partnerName: null,
          since: new Date("2026-10-03T07:00:00Z"),
        },
      ],
    ],
    [
      offSite,
      [
        {
          kind: "UNDER_CARE",
          episodeId: offSiteEpisode.episodeId,
          episodeType: HOSPITALISED_OFF_SITE,
          startDate: "2026-10-08",
          partnerName: name("Downtown Clinic"),
          since: new Date("2026-10-08T07:00:00Z"),
        },
      ],
    ],
    [closed, []],
    [voided, []],
  ]);
  assert.deepEqual(one, expected);
  assert.deepEqual(board, expected);
});

// ---------------------------------------------------------------------------
// After a move
// ---------------------------------------------------------------------------

/** A location of `type` with units of the names given, by name. */
const makeLocation = async (label: string, type: LocationType, unitNames: string[]) => {
  const location = await prisma.location.create({
    data: { name: name(label), type },
    select: { id: true },
  });
  locationIds.push(location.id);
  const units: Record<string, string> = {};
  for (const unitName of unitNames) {
    units[unitName] = (
      await prisma.unit.create({
        data: { name: unitName, capacity: 2, locationId: location.id },
        select: { id: true },
      })
    ).id;
  }
  return units;
};

/**
 * Moves an animal as the board does, and reads the offer behind the move's
 * lock. `offerTx` stands in for the transaction the offer is read on.
 */
const moveAndOffer = (
  animalId: string,
  unitId: string | null,
  offerTx: (tx: TransactionClient) => TransactionClient = (tx) => tx,
) =>
  prisma.$transaction(async (tx) => {
    const moved = await moveAnimal(tx, animalId, unitId, staffId);
    return careEpisodeOfferInMove(
      offerTx(tx),
      animalId,
      moved.fromUnitId,
      moved.unit?.id ?? null,
    );
  });

test("a move into a medical unit offers to open a stay in house, and a move out offers to close one", async () => {
  const medical = await makeLocation("Medical wing", LocationType.MEDICAL, ["MED-1", "MED-2"]);
  const kennels = await makeLocation("Kennels", LocationType.KENNEL, ["K-1", "K-2"]);
  const placeName = `${name("Medical wing")} · MED-1`;
  const placed = async (label: string, unitId: string | null) => {
    const animalId = await makeAnimal(label);
    if (unitId) await moveAndOffer(animalId, unitId);
    return animalId;
  };
  const openEpisodeOf = async (animalId: string, input: Partial<CareEpisodeInput> = {}) =>
    (await open(animalId, episode(input))).episodeId;

  // Into the wing, from a kennel or from no unit, with nothing open.
  const fromKennel = await placed("Into the wing", kennels["K-1"]);
  assert.deepEqual(await moveAndOffer(fromKennel, medical["MED-1"]), {
    kind: "OPEN",
    animalId: fromKennel,
    animalName: name("Into the wing"),
    placeName,
  });
  const fromNowhere = await placed("Into the wing unplaced", null);
  assert.deepEqual(await moveAndOffer(fromNowhere, medical["MED-1"]), {
    kind: "OPEN",
    animalId: fromNowhere,
    animalName: name("Into the wing unplaced"),
    placeName,
  });
  // With an episode already open, of any type, nothing.
  const alreadyUnderCare = await placed("Into the wing under care", kennels["K-1"]);
  await openEpisodeOf(alreadyUnderCare, { type: UNDER_VET_CARE });
  assert.equal(await moveAndOffer(alreadyUnderCare, medical["MED-1"]), null);

  // Out of the wing, to a kennel or to no unit, with a stay in house open.
  const toKennel = await placed("Out of the wing", medical["MED-1"]);
  const toKennelEpisode = await openEpisodeOf(toKennel);
  assert.deepEqual(await moveAndOffer(toKennel, kennels["K-2"]), {
    kind: "CLOSE",
    animalId: toKennel,
    animalName: name("Out of the wing"),
    episode: {
      id: toKennelEpisode,
      type: HOSPITALISED_IN_HOUSE,
      startDate: "2026-10-03",
      clinicName: null,
    },
  });
  const toNowhere = await placed("Out of the wing unplaced", medical["MED-2"]);
  const toNowhereEpisode = await openEpisodeOf(toNowhere);
  assert.deepEqual(await moveAndOffer(toNowhere, null), {
    kind: "CLOSE",
    animalId: toNowhere,
    animalName: name("Out of the wing unplaced"),
    episode: {
      id: toNowhereEpisode,
      type: HOSPITALISED_IN_HOUSE,
      startDate: "2026-10-03",
      clinicName: null,
    },
  });
  // A stay at a clinic, vet care, a closed or voided stay, or none: nothing.
  const offSite = await placed("Out of the wing off site", medical["MED-1"]);
  await openEpisodeOf(offSite, { type: HOSPITALISED_OFF_SITE, partnerId: clinicId });
  assert.equal(await moveAndOffer(offSite, kennels["K-1"]), null);
  const vetCare = await placed("Out of the wing vet care", medical["MED-1"]);
  await openEpisodeOf(vetCare, { type: UNDER_VET_CARE });
  assert.equal(await moveAndOffer(vetCare, kennels["K-1"]), null);
  const closedStay = await placed("Out of the wing closed", medical["MED-1"]);
  await close(await openEpisodeOf(closedStay), day("2026-10-05"));
  assert.equal(await moveAndOffer(closedStay, kennels["K-1"]), null);
  const voidedStay = await placed("Out of the wing voided", medical["MED-1"]);
  await voidIt(await openEpisodeOf(voidedStay), "Wrong animal.");
  assert.equal(await moveAndOffer(voidedStay, kennels["K-1"]), null);
  const noStay = await placed("Out of the wing nothing open", medical["MED-1"]);
  assert.equal(await moveAndOffer(noStay, kennels["K-1"]), null);

  // Within the wing, or between kennels: nothing, whatever is open.
  const withinWing = await placed("Within the wing", medical["MED-1"]);
  assert.equal(await moveAndOffer(withinWing, medical["MED-2"]), null);
  await openEpisodeOf(withinWing);
  assert.equal(await moveAndOffer(withinWing, medical["MED-1"]), null);
  const betweenKennels = await placed("Between kennels", kennels["K-1"]);
  assert.equal(await moveAndOffer(betweenKennels, kennels["K-2"]), null);

  // An animal that has left: its stay is still offered to close, and nothing
  // is offered to open (the move itself refuses to place it).
  const left = await placed("Left with a stay open", medical["MED-1"]);
  const leftEpisode = await openEpisodeOf(left);
  await prisma.animal.update({
    where: { id: left },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });
  assert.equal((await moveAndOffer(left, null))?.kind, "CLOSE");
  await close(leftEpisode, day("2026-10-09"));
  assert.equal(
    await careEpisodeOfferAfterMove(prisma, left, null, medical["MED-1"]),
    null,
  );

  // Only an offer: no move above opened or closed anything.
  assert.equal(
    await prisma.careEpisode.count({ where: { animalId: { in: [fromKennel, fromNowhere, noStay] } } }),
    0,
  );
  assert.equal((await stored(toKennelEpisode)).endDate, null);
  assert.equal((await stored(toNowhereEpisode)).endDate, null);
});

test("an offer that can't be read gives none, and the move still commits", async (t) => {
  const medical = await makeLocation("Faulty wing", LocationType.MEDICAL, ["F-1"]);
  const animalId = await makeAnimal("Moved despite the offer");
  const logged = t.mock.method(console, "error", () => {});
  // Every episode read fails in Postgres itself, which aborts the whole
  // transaction unless the offer's read is rolled back on its own.
  const failingEpisodeReads = (tx: TransactionClient) =>
    new Proxy(tx, {
      get: (target, property, receiver) =>
        property === "careEpisode"
          ? { findMany: () => target.$queryRaw`SELECT 1 / 0` }
          : Reflect.get(target, property, receiver),
    });

  assert.equal(
    await moveAndOffer(animalId, medical["F-1"], failingEpisodeReads),
    null,
  );
  assert.equal(logged.mock.callCount(), 1);
  // The move and its activity row committed.
  assert.equal(
    (
      await prisma.animal.findUniqueOrThrow({
        where: { id: animalId },
        select: { currentUnitId: true },
      })
    ).currentUnitId,
    medical["F-1"],
  );
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.LOCATION_CHANGE), [
    `Moved to ${name("Faulty wing")} · F-1.`,
  ]);
});

// ---------------------------------------------------------------------------
// The lock
// ---------------------------------------------------------------------------

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

test("two opens at once: the second waits for the lock, then is refused", async () => {
  const animalId = await makeAnimal("At once");

  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: (pid: number) => void;
  const isLocked = new Promise<number>((resolve) => (locked = resolve));
  // Stands in for another open for the same animal, holding the lock while
  // it writes.
  const holder = prisma.$transaction(
    async (tx) => {
      await lockAnimal(tx, animalId);
      locked(await backendPid(tx));
      await released;
      return openCareEpisode(tx, { ...episode(), animalId }, staffId, TODAY);
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  const second = open(animalId, episode({ type: UNDER_VET_CARE }), { timeout });
  // Observed as soon as it starts, so a failed wait is not followed by an
  // unhandled rejection. Awaiting it below still sees any rejection.
  void second.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    // Released even when the wait fails, and both seen to their end, so
    // neither transaction outlives the test.
    release();
    await Promise.allSettled([holder, second]);
  }
  await holder;
  await assert.rejects(second, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal);
    assert.equal(error.field, "startDate");
    assert.match(error.message, /already has an open care episode/);
    return true;
  });
  assert.equal(await prisma.careEpisode.count({ where: { animalId } }), 1);
});
