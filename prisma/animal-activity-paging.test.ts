// Lives under prisma/ so `npm run test:db` runs it against its throwaway
// docker-compose Postgres (see scripts/test-db.ts), never the dev DB.
//
// The feed itself is wrapped in RequirePermission, which needs a Next request
// to read the session and builds the auth instance on import, so this runs the
// feed's own page arguments against a real table instead. Only paging is
// asserted here: rows whose order means something are stamped apart by their
// writers, and the tests for those read by changedAt alone.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "@/app/lib/prisma";
import {
  ACTIVITIES_PER_PAGE,
  animalActivityLogPageArgs,
} from "@/app/lib/data/animals/animal-activity-page";
import { AnimalActivityType, Sex } from "@/prisma/generated/enums";

after(() => prisma.$disconnect());

test("rows that share a changedAt across a page boundary each show on exactly one page, newest first then by id", async () => {
  const tag = randomUUID().slice(0, 8);
  const actor = await prisma.person.create({
    data: { name: `Paging Actor ${tag}` },
    select: { id: true },
  });
  const species = await prisma.species.create({
    data: { name: `Paging Species ${tag}` },
    select: { id: true },
  });
  const color = await prisma.color.create({
    data: { name: `Paging Color ${tag}` },
    select: { id: true },
  });
  const animal = await prisma.animal.create({
    data: {
      name: `Paging Animal ${tag}`,
      birthDate: "2020-01-01",
      sex: Sex.UNKNOWN,
      speciesId: species.id,
      primaryColorId: color.id,
    },
    select: { id: true },
  });

  try {
    // Seven newer rows, eight rows on one shared instant (feed positions 8
    // to 15, across the end of page 1), then eight older rows.
    const tied = new Date("2026-03-01T12:00:00.000Z");
    const minutesFrom = (minutes: number) =>
      new Date(tied.getTime() + minutes * 60_000);
    const stamps = [
      ...Array.from({ length: 7 }, (_, i) => minutesFrom(7 - i)),
      ...Array.from({ length: 8 }, () => tied),
      ...Array.from({ length: 8 }, (_, i) => minutesFrom(-1 - i)),
    ];
    assert.ok(stamps.length > 2 * ACTIVITIES_PER_PAGE);
    assert.ok(7 < ACTIVITIES_PER_PAGE && ACTIVITIES_PER_PAGE < 15);

    await prisma.animalActivityLog.createMany({
      data: stamps.map((changedAt, i) => ({
        animalId: animal.id,
        changedById: actor.id,
        activityType: AnimalActivityType.NOTE_ADDED,
        changeSummary: `row ${i}`,
        changedAt,
      })),
    });

    const written = await prisma.animalActivityLog.findMany({
      where: { animalId: animal.id },
      select: { id: true, changedAt: true },
    });
    const expected = [...written]
      .sort(
        (a, b) =>
          b.changedAt.getTime() - a.changedAt.getTime() ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      )
      .map((row) => row.id);

    const pageCount = Math.ceil(written.length / ACTIVITIES_PER_PAGE);
    const paged: string[] = [];
    for (let page = 1; page <= pageCount; page++) {
      const rows = await prisma.animalActivityLog.findMany({
        ...animalActivityLogPageArgs(animal.id, page),
        select: { id: true },
      });
      paged.push(...rows.map((row) => row.id));
    }

    assert.equal(new Set(paged).size, paged.length, "a row showed on two pages");
    assert.deepEqual(paged, expected);
  } finally {
    await prisma.animalActivityLog.deleteMany({ where: { animalId: animal.id } });
    await prisma.animal.delete({ where: { id: animal.id } });
    await prisma.species.delete({ where: { id: species.id } });
    await prisma.color.delete({ where: { id: color.id } });
    await prisma.person.delete({ where: { id: actor.id } });
  }
});
