// Same reasoning as outcome-reversal.test.ts for living under prisma/ and
// running via `npm run test:db`. The Shelter Animals Count report reads every
// animal of a reported species, its intakes, its outcomes that are not
// reversed and its foster placements; these tests show it reads the right
// rows. How the rows are counted is unit-tested in
// app/lib/utils/sac-report.test.ts.
//
// The test files share one database and run at once, and the report counts a
// whole SAC category. So the animals here are of a species of their own in
// the Equines category, which nothing else uses, and in months long before
// any other record. The foster test has a goat in Farm animals of its own, so
// its counts start from nothing.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  FosterPlacementType,
  IntakeType,
  OutcomeType,
  PartnerType,
  SacSpeciesCategory,
  Sex,
} from "@/prisma/generated/enums";
import { querySacReport } from "@/app/lib/data/reports/sac-report-query";
import type { SacMonth, SacReport } from "@/app/lib/utils/sac-report";

const runId = Date.now().toString(36);
const JUNE = "2015-06" as SacMonth;
const AUGUST = "2015-08" as SacMonth;

let speciesId: string;
let goatSpeciesId: string;
let colorId: string;
let staffId: string;
let fosterProfileId: string;
const partners: Record<"ny" | "nj" | "canada" | "nowhere", string> = {
  ny: "",
  nj: "",
  canada: "",
  nowhere: "",
};
const animalIds = new Set<string>();

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: {
        name: `SAC horse ${runId}`,
        sacCategory: SacSpeciesCategory.EQUINE,
      },
      select: { id: true },
    })
  ).id;
  goatSpeciesId = (
    await prisma.species.create({
      data: {
        name: `SAC goat ${runId}`,
        sacCategory: SacSpeciesCategory.FARM_ANIMAL,
      },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: `SAC color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: `SAC staff ${runId}` },
      select: { id: true },
    })
  ).id;
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: staffId },
      select: { id: true },
    })
  ).id;
  const partner = async (
    name: string,
    place: { state?: string; country?: string },
  ) =>
    (
      await prisma.partner.create({
        data: { name: `${name} ${runId}`, type: PartnerType.RESCUE_GROUP, ...place },
        select: { id: true },
      })
    ).id;
  partners.ny = await partner("SAC NY rescue", { state: "NY" });
  partners.nj = await partner("SAC NJ rescue", { state: "NJ" });
  partners.canada = await partner("SAC Toronto rescue", { country: "CA" });
  partners.nowhere = await partner("SAC Nowhere rescue", {});
});

after(async () => {
  const species = { speciesId: { in: [speciesId, goatSpeciesId] } };
  const mine = { animal: species };
  await prisma.fosterPlacement.deleteMany({ where: mine });
  await prisma.outcome.deleteMany({ where: mine });
  await prisma.intake.deleteMany({ where: mine });
  await prisma.animal.deleteMany({ where: species });
  await prisma.partner.deleteMany({
    where: { id: { in: Object.values(partners) } },
  });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({
    where: { id: { in: [speciesId, goatSpeciesId] } },
  });
  await prisma.$disconnect();
});

type IntakeSpec = { date: string; type: IntakeType; partnerId?: string };
type OutcomeSpec = {
  date: string;
  type: OutcomeType;
  partnerId?: string;
  reversed?: boolean;
};

const horse = async (
  name: string,
  {
    birthDate = "2010-04-01",
    intakes,
    outcomes = [],
    fosters = [],
    species = speciesId,
  }: {
    species?: string;
    birthDate?: string;
    intakes: IntakeSpec[];
    outcomes?: OutcomeSpec[];
    fosters?: { startDate: string; endDate: string | null }[];
  },
) => {
  const animal = await prisma.animal.create({
    data: {
      name: `${name} ${runId}`,
      birthDate,
      sex: Sex.FEMALE,
      speciesId: species,
      primaryColorId: colorId,
      listingStatus: AnimalListingStatus.DRAFT,
    },
    select: { id: true },
  });
  animalIds.add(animal.id);
  for (const intake of intakes) {
    await prisma.intake.create({
      data: {
        animalId: animal.id,
        intakeDate: intake.date,
        type: intake.type,
        sourcePartnerId: intake.partnerId,
        staffMemberId: staffId,
      },
    });
  }
  for (const outcome of outcomes) {
    await prisma.outcome.create({
      data: {
        animalId: animal.id,
        outcomeDate: outcome.date,
        type: outcome.type,
        destinationPartnerId: outcome.partnerId,
        staffMemberId: staffId,
        ...(outcome.reversed && {
          reversedAt: new Date(),
          reversedById: staffId,
          reversalReason: "Recorded for the wrong animal.",
        }),
      },
    });
  }
  for (const foster of fosters) {
    await prisma.fosterPlacement.create({
      data: {
        type: FosterPlacementType.GENERAL,
        animalId: animal.id,
        fosterProfileId,
        placedById: staffId,
        ...foster,
      },
    });
  }
  return animal.id;
};

const equines = (report: SacReport) => {
  const table = report.tables.find(
    (t) => t.category === SacSpeciesCategory.EQUINE,
  );
  assert.ok(table, "The Equines category has a table.");
  return table;
};

// Only this file's animals: the warnings list the whole shelter's.
const myWarnings = (report: SacReport) => ({
  breaks: report.warnings.timelineBreaks.filter((w) => animalIds.has(w.animalId)),
  transfers: report.warnings.transfers.filter((w) => animalIds.has(w.animalId)),
});

test("a month reads intakes, outcomes, transfers and foster placements, and balances", async () => {
  // In care throughout, in foster across the month.
  await horse("Steady", {
    intakes: [{ date: "2015-01-10", type: IntakeType.STRAY }],
    fosters: [{ startDate: "2015-05-01", endDate: null }],
  });
  // Born in care and adopted in June, under 5 months both times.
  await horse("Foal", {
    birthDate: "2015-03-01",
    intakes: [{ date: "2015-06-05", type: IntakeType.BORN_IN_CARE }],
    outcomes: [{ date: "2015-06-20", type: OutcomeType.ADOPTION }],
  });
  // Both adoptions were reversed: still in care, and adopted in no row. Its
  // foster placement ended inside the month.
  await horse("Reversed", {
    intakes: [{ date: "2015-04-01", type: IntakeType.OWNER_SURRENDER }],
    outcomes: [
      { date: "2015-05-01", type: OutcomeType.ADOPTION, reversed: true },
      { date: "2015-06-10", type: OutcomeType.ADOPTION, reversed: true },
    ],
    fosters: [{ startDate: "2015-06-01", endDate: "2015-06-15" }],
  });
  // Boarders: neither their intakes, their stays nor their outcomes count.
  await horse("Boarder", {
    intakes: [{ date: "2015-05-20", type: IntakeType.SERVICE_IN }],
    outcomes: [{ date: "2015-06-03", type: OutcomeType.RETURN_TO_OWNER }],
  });
  await horse("New boarder", {
    intakes: [{ date: "2015-06-15", type: IntakeType.SERVICE_IN }],
  });
  // Transfers in and out, by their partners' places against New York.
  await horse("In state, out of state", {
    intakes: [
      { date: "2015-06-02", type: IntakeType.TRANSFER_IN, partnerId: partners.ny },
    ],
    outcomes: [
      { date: "2015-06-25", type: OutcomeType.TRANSFER_OUT, partnerId: partners.nj },
    ],
  });
  await horse("International, nowhere", {
    intakes: [
      {
        date: "2015-06-03",
        type: IntakeType.TRANSFER_IN,
        partnerId: partners.canada,
      },
    ],
    outcomes: [
      {
        date: "2015-06-28",
        type: OutcomeType.TRANSFER_OUT,
        partnerId: partners.nowhere,
      },
    ],
  });
  await horse("No partner", {
    intakes: [{ date: "2015-06-04", type: IntakeType.TRANSFER_IN }],
  });

  const report = await querySacReport(prisma, { month: JUNE, shelterState: "NY" });
  const table = equines(report);

  // Steady and Reversed; the boarder is not counted.
  assert.deepEqual(table.beginning, { inCare: 2, inFoster: 1 });
  // Steady, Reversed and No partner.
  assert.deepEqual(table.ending, { inCare: 3, inFoster: 1 });

  assert.deepEqual(table.rows.otherIntakes, {
    adult: 0,
    young: 1,
    unknown: 0,
    total: 1,
  });
  assert.equal(table.rows.transferInInState.total, 2);
  assert.equal(table.rows.transferInInternational.total, 1);
  assert.equal(table.rows.relinquishedByOwner.total, 0);
  assert.equal(table.totals.liveIntakes.total, 4);

  assert.deepEqual(table.rows.adoption, {
    adult: 0,
    young: 1,
    unknown: 0,
    total: 1,
  });
  assert.equal(table.rows.returnedToOwner.total, 0);
  assert.equal(table.rows.transferOutOutOfState.total, 1);
  assert.equal(table.rows.transferOutInState.total, 1);
  assert.equal(table.totals.outcomes.total, 3);

  // 2 + 4 − 3 = 3.
  assert.equal(table.expectedEnding, 3);
  assert.equal(table.difference, 0);

  const warnings = myWarnings(report);
  assert.deepEqual(warnings.breaks, []);
  assert.deepEqual(
    warnings.transfers.map((w) => [w.direction, w.date, w.problem]),
    [
      ["in", "2015-06-04", "missing-partner"],
      ["out", "2015-06-28", "no-location"],
    ],
  );
  assert.equal(report.warnings.shelterStateMissing, false);
});

test("with no shelter state, every US partner is in state", async () => {
  const report = await querySacReport(prisma, { month: JUNE, shelterState: null });
  const table = equines(report);
  assert.equal(report.warnings.shelterStateMissing, true);
  assert.equal(table.rows.transferOutOutOfState.total, 0);
  assert.equal(table.rows.transferOutInState.total, 2);
  assert.equal(table.rows.transferInInternational.total, 1);
});

test("a timeline break is listed and the month doesn't balance", async () => {
  // A second intake with no outcome between: it counts as an intake in
  // August but opens no stay.
  await horse("Twice in", {
    intakes: [
      { date: "2015-07-01", type: IntakeType.STRAY },
      { date: "2015-08-10", type: IntakeType.STRAY },
    ],
  });

  const report = await querySacReport(prisma, { month: AUGUST, shelterState: "NY" });
  const table = equines(report);
  assert.equal(table.difference, -1);
  assert.deepEqual(
    myWarnings(report).breaks.map((w) => [w.kind, w.dates]),
    [["repeated-intake", ["2015-07-01", "2015-08-10"]]],
  );

  // June ended before the second intake: no break yet, and June still balances.
  const june = await querySacReport(prisma, { month: JUNE, shelterState: "NY" });
  assert.deepEqual(myWarnings(june).breaks, []);
  assert.equal(equines(june).difference, 0);
});

test("a species with no SAC category is left out", async () => {
  const unreported = await prisma.species.create({
    data: { name: `SAC unreported ${runId}` },
    select: { id: true },
  });
  try {
    const animal = await prisma.animal.create({
      data: {
        name: `Unreported ${runId}`,
        birthDate: "2010-01-01",
        sex: Sex.MALE,
        speciesId: unreported.id,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.DRAFT,
        intake: {
          create: {
            intakeDate: "2015-06-12",
            type: IntakeType.STRAY,
            staffMemberId: staffId,
          },
        },
      },
      select: { id: true },
    });
    const report = await querySacReport(prisma, { month: JUNE, shelterState: "NY" });
    assert.equal(equines(report).totals.liveIntakes.total, 4);
    assert.equal(
      report.warnings.timelineBreaks.some((w) => w.animalId === animal.id),
      false,
    );
    await prisma.intake.deleteMany({ where: { animalId: animal.id } });
    await prisma.animal.deleteMany({ where: { id: animal.id } });
  } finally {
    await prisma.species.deleteMany({ where: { id: unreported.id } });
  }
});

test("in foster is counted only while in care; an open placement outside care is a warning", async () => {
  const goat = (name: string, fields: Parameters<typeof horse>[1]) =>
    horse(name, { ...fields, species: goatSpeciesId });
  // Boarding, and with a foster: in neither count.
  const boarder = await goat("Boarding goat", {
    intakes: [{ date: "2015-09-01", type: IntakeType.SERVICE_IN }],
    fosters: [{ startDate: "2015-09-10", endDate: null }],
  });
  // Adopted on Oct 20 from foster, the placement never ended.
  const leftOpen = await goat("Adopted goat", {
    intakes: [{ date: "2015-09-01", type: IntakeType.STRAY }],
    outcomes: [{ date: "2015-10-20", type: OutcomeType.ADOPTION }],
    fosters: [{ startDate: "2015-09-15", endDate: null }],
  });
  // In care and in foster throughout: counted in both.
  await goat("Fostered goat", {
    intakes: [{ date: "2015-09-05", type: IntakeType.OWNER_SURRENDER }],
    fosters: [{ startDate: "2015-09-20", endDate: null }],
  });

  const report = await querySacReport(prisma, {
    month: "2015-10" as SacMonth,
    shelterState: "NY",
  });
  const table = report.tables.find(
    (t) => t.category === SacSpeciesCategory.FARM_ANIMAL,
  );
  assert.ok(table, "The Farm animals category has a table.");
  // Counting every open placement would give 3 in foster against 2 in care
  // at the start, and 2 against 1 at the end.
  assert.deepEqual(table.beginning, { inCare: 2, inFoster: 2 });
  assert.deepEqual(table.ending, { inCare: 1, inFoster: 1 });
  assert.equal(table.difference, 0);
  assert.deepEqual(
    report.warnings.fosters
      .filter((w) => w.category === SacSpeciesCategory.FARM_ANIMAL)
      .map((w) => [w.animalId, w.date]),
    // By day, then name.
    [
      [boarder, "2015-09-30"],
      [leftOpen, "2015-10-31"],
      [boarder, "2015-10-31"],
    ],
  );
});
