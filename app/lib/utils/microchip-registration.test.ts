import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MICROCHIP_REGISTRATION_LABELS, normaliseMicrochipRegistration,
  microchipRegistrationIssue, microchipRegistrationDayIssue,
  microchipRegistrationReplacementIssue, type MicrochipRegistration,
} from "./microchip-registration";
import { calendarDay as day } from "./shelter-day";

const unknown = normaliseMicrochipRegistration({});
const registered: MicrochipRegistration = { registrationStatus: "REGISTERED", registryName: "Registry",
  registrationDate: day("2026-09-01"), registrationNotes: "Staff note" };

test("registration normalization preserves truthful unknowns and trims text", () => {
  assert.deepEqual(unknown, { registrationStatus: "UNKNOWN", registryName: null, registrationDate: null, registrationNotes: null });
  assert.deepEqual(normaliseMicrochipRegistration({ registrationStatus: "PENDING", registryName: "  Registry  ", registrationNotes: "  " }), {
    registrationStatus: "PENDING", registryName: "Registry", registrationDate: null, registrationNotes: null,
  });
  assert.deepEqual(Object.values(MICROCHIP_REGISTRATION_LABELS), ["Unknown", "Not registered", "Pending", "Registered"]);
});

test("registration group consistency for every state", () => {
  for (const registrationStatus of ["UNKNOWN", "NOT_REGISTERED", "PENDING", "REGISTERED"] as const) {
    const base = { ...unknown, registrationStatus };
    assert.equal(microchipRegistrationIssue(base)?.field ?? null, registrationStatus === "REGISTERED" ? "registryName" : null);
    const withRegistry = { ...base, registryName: "Registry" };
    assert.equal(microchipRegistrationIssue(withRegistry)?.field ?? null,
      ["PENDING", "REGISTERED"].includes(registrationStatus) ? null : "registryName");
    assert.equal(microchipRegistrationIssue({ ...withRegistry, registrationDate: day("2026-09-01") })?.field ?? null,
      registrationStatus === "REGISTERED" ? null : "registrationDate");
    assert.equal(microchipRegistrationIssue({ ...base, registrationNotes: "Staff-only note" })?.field ?? null,
      registrationStatus === "REGISTERED" ? "registryName" : null);
  }
  assert.equal(microchipRegistrationIssue(registered), null);
});

test("registration date allows equal bounds and before-intake care without inventing dates", () => {
  const context = { today: day("2026-10-17"), birthDate: day("2020-01-01"), implantationDate: day("2024-02-29") };
  assert.equal(microchipRegistrationDayIssue(null, context), null);
  assert.equal(microchipRegistrationDayIssue(day("2024-02-29"), context), null);
  assert.equal(microchipRegistrationDayIssue(context.today, context), null);
  assert.match(microchipRegistrationDayIssue(day("2026-10-18"), context)!.message, /future/);
  assert.match(microchipRegistrationDayIssue(day("2019-12-31"), context)!.message, /birth/);
  assert.match(microchipRegistrationDayIssue(day("2024-02-28"), context)!.message, /implantation/);
  assert.equal(microchipRegistrationDayIssue(context.birthDate, { ...context, implantationDate: null }), null);
  assert.equal(microchipRegistrationDayIssue(day("1900-01-01"), { ...context, birthDate: null, implantationDate: null }), null);
});

test("changing a normalized chip with any registration data requires the explicit full replacement group", () => {
  const stored = { chipNumber: "985141000100003", ...registered };
  assert.equal(microchipRegistrationReplacementIssue(stored, { chipNumber: "985-141 000100003" }), null);
  const changed = { chipNumber: "985141000100004" };
  assert.equal(microchipRegistrationReplacementIssue(stored, changed)?.field, "registrationStatus");
  assert.equal(microchipRegistrationReplacementIssue(stored, { ...changed, registrationStatus: "UNKNOWN" })?.field, "registrationStatus");
  assert.equal(microchipRegistrationReplacementIssue(stored, { ...changed, ...unknown }), null);
  assert.equal(microchipRegistrationReplacementIssue(stored, { ...changed, ...registered }), null);
  assert.equal(microchipRegistrationReplacementIssue(stored, { ...changed, ...unknown, registryName: undefined })?.field, "registrationStatus");
  for (const facts of [unknown, { ...unknown, registrationStatus: "NOT_REGISTERED" as const },
    { ...unknown, registrationStatus: "PENDING" as const }, { ...unknown, registrationNotes: "note" },
    { ...unknown, registryName: "legacy data" }, { ...unknown, registrationDate: day("2026-09-01") }]) {
    assert.equal(microchipRegistrationReplacementIssue({ chipNumber: stored.chipNumber, ...facts }, changed)?.field ?? null,
      facts === unknown ? null : "registrationStatus");
  }
  assert.equal(microchipRegistrationReplacementIssue({ ...unknown, chipNumber: "AbC123456" }, { chipNumber: "abc-123 456" }), null);
});
