// Saving the dose times, against a real Postgres: the settings row may be
// missing, and saving creates it. Most cases run in a transaction that is
// rolled back, so the one shared settings row other files read never
// changes. The two that need real commits (saves overlapping each other, and
// a save behind the phone index's lock) put the row back as they found it;
// meanwhile it holds the fallbacks other files would read anyway, and only
// the dose times and the phone index marker differ.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { updateDoseSlotEnds } from "@/app/lib/services/shelter-dose-times";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import {
  DEFAULT_DOSE_SLOT_ENDS,
  fallbackShelterSettings,
  resolveShelterSettings,
  shelterSettingsColumns,
} from "@/app/lib/utils/shelter-settings";

// The row as this file found it, put back at the end (null: there was none).
let foundRow: Awaited<ReturnType<typeof prisma.shelterSettings.findUnique>> = null;

before(async () => {
  foundRow = await prisma.shelterSettings.findUnique({ where: { id: "shelter" } });
});

// An upsert, not an update: a test that deleted the row may have failed
// before writing it back.
const restoreRow = async () => {
  if (foundRow) {
    const { id: _id, updatedAt: _updatedAt, ...columns } = foundRow;
    await prisma.shelterSettings.upsert({
      where: { id: "shelter" },
      create: { id: "shelter", ...columns },
      update: columns,
    });
  } else {
    await prisma.shelterSettings.deleteMany();
  }
};

after(async () => {
  try {
    await restoreRow();
  } finally {
    await prisma.$disconnect();
  }
});

class RolledBack extends Error {}

/** Runs `body` in a transaction, then rolls it back. */
const rolledBack = async (body: (tx: TransactionClient) => Promise<void>) => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await body(tx);
      throw new RolledBack();
    }),
    RolledBack,
  );
};

const readRow = (tx: TransactionClient) =>
  tx.shelterSettings.findUnique({ where: { id: "shelter" } });

/** A settings row whose every column is known. */
const storeRow = (tx: TransactionClient) =>
  tx.shelterSettings.upsert({
    where: { id: "shelter" },
    create: {
      id: "shelter",
      timezone: "Pacific/Auckland",
      weightUnitSystem: "imperial",
      defaultPhoneCountry: "GB",
      phoneIndexCountry: "GB",
    },
    update: {
      timezone: "Pacific/Auckland",
      weightUnitSystem: "imperial",
      defaultPhoneCountry: "GB",
      phoneIndexCountry: "GB",
      amDoseEndTime: DEFAULT_DOSE_SLOT_ENDS.AM,
      middayDoseEndTime: DEFAULT_DOSE_SLOT_ENDS.MIDDAY,
      pmDoseEndTime: DEFAULT_DOSE_SLOT_ENDS.PM,
    },
  });

test("a save writes the three times and leaves the other settings alone", async () => {
  await rolledBack(async (tx) => {
    await storeRow(tx);
    const saved = await updateDoseSlotEnds(tx, {
      AM: "09:00",
      MIDDAY: "13:30",
      PM: "21:00",
    });
    assert.deepEqual(saved, { AM: "09:00", MIDDAY: "13:30", PM: "21:00" });

    const row = await readRow(tx);
    assert.ok(row);
    assert.equal(row.amDoseEndTime, "09:00");
    assert.equal(row.middayDoseEndTime, "13:30");
    assert.equal(row.pmDoseEndTime, "21:00");
    assert.equal(row.timezone, "Pacific/Auckland");
    assert.equal(row.weightUnitSystem, "imperial");
    assert.equal(row.defaultPhoneCountry, "GB");
    assert.equal(row.phoneIndexCountry, "GB");
    assert.deepEqual(resolveShelterSettings(row).doseSlotEnds, saved);
  });
});

test("with no settings row, a save creates it from the fallbacks", async () => {
  await rolledBack(async (tx) => {
    await tx.shelterSettings.deleteMany();
    await updateDoseSlotEnds(tx, { AM: "08:00", MIDDAY: "12:00", PM: "18:00" });

    const fallback = fallbackShelterSettings();
    const row = await readRow(tx);
    assert.ok(row);
    assert.equal(row.timezone, fallback.timezone);
    assert.equal(row.weightUnitSystem, fallback.weightUnitSystem);
    assert.equal(row.defaultPhoneCountry, fallback.defaultPhoneCountry);
    // The phone lookups assume the index is built for the fallback country
    // while there is no row; the new row says so.
    assert.equal(row.phoneIndexCountry, fallback.defaultPhoneCountry);
    assert.deepEqual(resolveShelterSettings(row).doseSlotEnds, {
      AM: "08:00",
      MIDDAY: "12:00",
      PM: "18:00",
    });
  });
});

test("times out of order or malformed are refused under their slot, and nothing is written", async () => {
  const cases = [
    [{ AM: "10:00", MIDDAY: "10:00", PM: "20:00" }, "MIDDAY", "Midday doses must end after AM doses."],
    [{ AM: "10:00", MIDDAY: "14:00", PM: "13:00" }, "PM", "PM doses must end after Midday doses."],
    [{ AM: "9:00", MIDDAY: "14:00", PM: "20:00" }, "AM", "Enter a time of day, such as 10:00."],
    [{ AM: "10:00", MIDDAY: "14:00", PM: "24:00" }, "PM", "Enter a time of day, such as 10:00."],
    [{ AM: "10:00", MIDDAY: "", PM: "20:00" }, "MIDDAY", "Enter a time of day, such as 10:00."],
  ] as const;

  await rolledBack(async (tx) => {
    await storeRow(tx);
    const before = await readRow(tx);
    for (const [ends, field, message] of cases) {
      await assert.rejects(
        updateDoseSlotEnds(tx, { ...ends }),
        (error: Error) =>
          error instanceof MedicalEntryRefusal &&
          error.field === field &&
          error.message === message,
      );
    }
    assert.deepEqual(await readRow(tx), before);
  });

  // Nor is a missing row created.
  await rolledBack(async (tx) => {
    await tx.shelterSettings.deleteMany();
    await assert.rejects(
      updateDoseSlotEnds(tx, { AM: "10:00", MIDDAY: "09:00", PM: "20:00" }),
      MedicalEntryRefusal,
    );
    assert.equal(await tx.shelterSettings.count(), 0);
  });
});

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;

// The only proof a statement reached a lock and is blocked there, rather than
// not having started yet: `waiterPid` itself must be blocked by `holderPid`,
// so another session waiting on the holder (another file's, or anything else
// that writes the row) can't pass for it. A session queued on a row lock
// behind an earlier waiter is reported as blocked by that waiter, not the
// holder, so a waiter blocked by one of the holder's waiters counts too.
const waitForBlockedBy = async (waiterPid: number, holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ blocked }] = await prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT ${holderPid}::int = ANY (pg_blocking_pids(${waiterPid}::int))
        OR EXISTS (
          SELECT 1 FROM unnest(pg_blocking_pids(${waiterPid}::int)) AS ahead(pid)
          WHERE ${holderPid}::int = ANY (pg_blocking_pids(ahead.pid))
        ) AS blocked`;
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
  // Longer than the five seconds the wait may take, so a slow machine fails
  // on the wait, not on a timeout.
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
  // `holder` settles first only when it threw before handing back its pid.
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
    // `later` settles first only when it threw before handing back its pid.
    // One that finishes without waiting is never seen blocked, and fails.
    const laterPid = await Promise.race([isStarted, later as Promise<never>]);
    await waitForBlockedBy(laterPid, holderPid);
  } finally {
    release();
    await Promise.allSettled([holder, later]);
  }
  await holder;
  await later;
};

test("two first saves at once: the second waits for the first's new row, then saves over it", async () => {
  try {
    await prisma.shelterSettings.deleteMany();
    const first = { AM: "09:00", MIDDAY: "13:00", PM: "19:00" };
    const second = { AM: "08:00", MIDDAY: "12:00", PM: "18:00" };
    await overlap(
      (tx) => updateDoseSlotEnds(tx, first),
      (tx) => updateDoseSlotEnds(tx, second),
    );

    const rows = await prisma.shelterSettings.findMany();
    assert.equal(rows.length, 1);
    // The whole of the last save, never a mix of the two.
    assert.deepEqual(resolveShelterSettings(rows[0]).doseSlotEnds, second);
    assert.equal(rows[0].phoneIndexCountry, fallbackShelterSettings().defaultPhoneCountry);
  } finally {
    await restoreRow();
  }
});

test("a save waits behind the phone index's lock on the row, and keeps the marker it set", async () => {
  try {
    await prisma.shelterSettings.upsert({
      where: { id: "shelter" },
      create: { id: "shelter", ...shelterSettingsColumns(fallbackShelterSettings()) },
      update: { phoneIndexCountry: null },
    });
    const country = fallbackShelterSettings().defaultPhoneCountry;
    const ends = { AM: "09:15", MIDDAY: "13:15", PM: "21:15" };
    // What a phone index rebuild does: lock the row, then set the marker.
    await overlap(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM shelter_settings WHERE id = 'shelter' FOR UPDATE`;
        await tx.shelterSettings.update({
          where: { id: "shelter" },
          data: { phoneIndexCountry: country },
        });
      },
      (tx) => updateDoseSlotEnds(tx, ends),
    );

    const row = await prisma.shelterSettings.findUniqueOrThrow({ where: { id: "shelter" } });
    assert.equal(row.phoneIndexCountry, country);
    assert.deepEqual(resolveShelterSettings(row).doseSlotEnds, ends);
  } finally {
    await restoreRow();
  }
});
