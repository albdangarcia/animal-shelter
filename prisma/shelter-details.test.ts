// Saving the shelter's state, against a real Postgres: the settings row may
// be missing, and saving creates it. Each case runs in a transaction that is
// rolled back, so the one shared settings row other files read never
// changes.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  ShelterDetailsRefusal,
  updateShelterState,
} from "@/app/lib/services/shelter-details";
import { updateDoseSlotEnds } from "@/app/lib/services/shelter-dose-times";
import {
  fallbackShelterSettings,
  resolveShelterSettings,
} from "@/app/lib/utils/shelter-settings";

after(async () => {
  await prisma.$disconnect();
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
  tx.shelterSettings.findUniqueOrThrow({ where: { id: "shelter" } });

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
      amDoseEndTime: "09:00",
      middayDoseEndTime: "13:00",
      pmDoseEndTime: "19:00",
      state: null,
    },
    update: {
      timezone: "Pacific/Auckland",
      weightUnitSystem: "imperial",
      defaultPhoneCountry: "GB",
      phoneIndexCountry: "GB",
      amDoseEndTime: "09:00",
      middayDoseEndTime: "13:00",
      pmDoseEndTime: "19:00",
      state: null,
    },
  });

test("a save writes the state and leaves the other settings alone", async () => {
  await rolledBack(async (tx) => {
    await storeRow(tx);
    assert.equal(await updateShelterState(tx, "VT"), "VT");

    const row = await readRow(tx);
    assert.equal(row.state, "VT");
    assert.equal(row.timezone, "Pacific/Auckland");
    assert.equal(row.weightUnitSystem, "imperial");
    assert.equal(row.defaultPhoneCountry, "GB");
    assert.equal(row.phoneIndexCountry, "GB");
    assert.deepEqual(
      [row.amDoseEndTime, row.middayDoseEndTime, row.pmDoseEndTime],
      ["09:00", "13:00", "19:00"],
    );
    assert.equal(resolveShelterSettings(row).state, "VT");

    // A second save changes it. A territory is a state here, as SAC counts it.
    await updateShelterState(tx, "ME");
    assert.equal((await readRow(tx)).state, "ME");
    await updateShelterState(tx, "PR");
    assert.equal((await readRow(tx)).state, "PR");
  });
});

test("a dose times save leaves the state alone", async () => {
  await rolledBack(async (tx) => {
    await storeRow(tx);
    await updateShelterState(tx, "NY");
    await updateDoseSlotEnds(tx, { AM: "08:00", MIDDAY: "12:00", PM: "18:00" });
    assert.equal((await readRow(tx)).state, "NY");
  });
});

test("with no settings row, a save creates it from the fallbacks", async () => {
  await rolledBack(async (tx) => {
    await tx.shelterSettings.deleteMany();
    await updateShelterState(tx, "NY");

    const fallback = fallbackShelterSettings();
    const row = await readRow(tx);
    assert.equal(row.state, "NY");
    assert.equal(row.timezone, fallback.timezone);
    assert.equal(row.defaultPhoneCountry, fallback.defaultPhoneCountry);
    assert.equal(row.phoneIndexCountry, fallback.defaultPhoneCountry);
    assert.deepEqual(resolveShelterSettings(row).doseSlotEnds, fallback.doseSlotEnds);
  });
});

test("anything but a US state code is refused under State, and nothing is written", async () => {
  for (const state of ["", "ny", "UM", "ON", "New York"]) {
    await rolledBack(async (tx) => {
      await storeRow(tx);
      await tx.shelterSettings.update({ where: { id: "shelter" }, data: { state: "NY" } });
      await assert.rejects(updateShelterState(tx, state), (error: unknown) => {
        assert.ok(error instanceof ShelterDetailsRefusal, state);
        assert.equal(error.field, "state");
        assert.equal(error.message, "Select the state the shelter is in.");
        return true;
      });
      assert.equal((await readRow(tx)).state, "NY", state);
    });
  }
});
