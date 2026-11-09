import { test } from "node:test";
import assert from "node:assert/strict";
import { VaccineCredentialsSchema, MicrochipRegistrationSchema, MedicalEntryOutputFactsSchema,
  VETERINARIAN_NAME_MAX_LENGTH, VETERINARIAN_LICENSE_MAX_LENGTH, REGISTRY_NAME_MAX_LENGTH, REGISTRATION_NOTES_MAX_LENGTH,
} from "./medical-output.schemas";
import { MedicalEntryFormSchema } from "./medical-entry.schemas";

test("credentials trim blanks to null, allow either missing fact and bound each field", () => {
  assert.deepEqual(VaccineCredentialsSchema.parse({}), { veterinarianName: null, veterinarianLicenseNumber: null });
  assert.deepEqual(VaccineCredentialsSchema.parse({ veterinarianName: " Dr Vet ", veterinarianLicenseNumber: "  " }), {
    veterinarianName: "Dr Vet", veterinarianLicenseNumber: null,
  });
  assert.equal(VaccineCredentialsSchema.parse({ veterinarianLicenseNumber: " LIC-123 " }).veterinarianLicenseNumber, "LIC-123");
  for (const [field, limit] of [["veterinarianName", VETERINARIAN_NAME_MAX_LENGTH], ["veterinarianLicenseNumber", VETERINARIAN_LICENSE_MAX_LENGTH]] as const) {
    assert.equal(VaccineCredentialsSchema.safeParse({ [field]: ` ${"x".repeat(limit)} ` }).success, true);
    assert.equal(VaccineCredentialsSchema.safeParse({ [field]: "x".repeat(limit + 1) }).success, false);
    assert.equal(VaccineCredentialsSchema.safeParse({ [field]: 123 }).success, false);
  }
});

test("registration schemas require an explicit valid state, trim text and validate calendar days", () => {
  assert.equal(MicrochipRegistrationSchema.safeParse({}).success, false);
  assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "TRANSFERRED" }).success, false);
  assert.deepEqual(MicrochipRegistrationSchema.parse({ registrationStatus: "UNKNOWN", registryName: " ", registrationDate: "", registrationNotes: " " }), {
    registrationStatus: "UNKNOWN", registryName: null, registrationDate: null, registrationNotes: null,
  });
  for (const date of ["2028-02-29", "2026-01-31"]) assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "REGISTERED", registryName: "Registry", registrationDate: date }).success, true);
  for (const date of ["2026-02-29", "2026-04-31", "2026-10-17T12:00:00Z", "10/17/2026"]) assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "REGISTERED", registryName: "Registry", registrationDate: date }).success, false);
  assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "REGISTERED" }).success, false);
  assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "REGISTERED", registryName: "Registry" }).success, true);
  assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "PENDING", registryName: "Registry" }).success, true);
  assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "PENDING", registryName: "Registry", registrationDate: "2026-01-01" }).success, false);
  for (const registrationStatus of ["UNKNOWN", "NOT_REGISTERED"]) assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus, registryName: "Registry" }).success, false);
  for (const [field, limit] of [["registryName", REGISTRY_NAME_MAX_LENGTH], ["registrationNotes", REGISTRATION_NOTES_MAX_LENGTH]] as const) {
    assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "REGISTERED", registryName: "Registry", [field]: "x".repeat(limit) }).success, true);
    assert.equal(MicrochipRegistrationSchema.safeParse({ registrationStatus: "REGISTERED", registryName: "Registry", [field]: "x".repeat(limit + 1) }).success, false);
  }
});

test("output fact contracts reject wrong-kind groups and allow legacy omissions", () => {
  for (const kind of ["VACCINE", "MICROCHIP", "TEST", "TREATMENT", "SURGERY", "EXAM", "EUTHANASIA", "DEATH"]) {
    assert.equal(MedicalEntryOutputFactsSchema.safeParse({ kind }).success, true);
    assert.equal(MedicalEntryOutputFactsSchema.safeParse({ kind, credentials: {} }).success, kind === "VACCINE");
    assert.equal(MedicalEntryOutputFactsSchema.safeParse({ kind, registration: { registrationStatus: "UNKNOWN" } }).success, kind === "MICROCHIP");
  }
});

test("chip recording contracts accept registration without changing legacy omission", () => {
  const result = MedicalEntryFormSchema.parse({ kind: "MICROCHIP", source: "BEFORE_INTAKE", completedDate: null,
    chipNumber: "985141000100003", registrationStatus: "REGISTERED", registryName: "Recorded registry" });
  assert.equal(result.kind, "MICROCHIP");
  if (result.kind === "MICROCHIP") { assert.equal(result.registrationStatus, "REGISTERED"); assert.equal(result.registryName, "Recorded registry"); }
  const legacy = MedicalEntryFormSchema.parse({ kind: "MICROCHIP", source: "BEFORE_INTAKE", completedDate: null, chipNumber: "985141000100003" });
  assert.equal(Object.hasOwn(legacy, "registrationStatus"), false);
  assert.equal(Object.hasOwn(legacy, "registrationDate"), false);
  assert.equal(MedicalEntryFormSchema.safeParse({ kind: "MICROCHIP", source: "BEFORE_INTAKE", completedDate: null, chipNumber: "985141000100003", registrationStatus: "REGISTERED", registryName: null, registrationDate: null, registrationNotes: null }).success, false);
});

 test("recording schemas accept bounded credentials and preserve omitted keys", () => {
  const base = { kind: "VACCINE", itemId: "rabies", source: "IN_HOUSE", completedDate: "2026-10-17" };
  const omitted = MedicalEntryFormSchema.parse(base);
  assert.equal(Object.hasOwn(omitted, "veterinarianName"), false);
  const value = MedicalEntryFormSchema.parse({ ...base, veterinarianName: " Dr Vet ", veterinarianLicenseNumber: " " });
  assert.equal(value.kind, "VACCINE");
  if (value.kind === "VACCINE") { assert.equal(value.veterinarianName, "Dr Vet"); assert.equal(value.veterinarianLicenseNumber, null); }
  assert.equal(MedicalEntryFormSchema.safeParse({ ...base, veterinarianName: "x".repeat(201) }).success, false);
});

test("partial chip corrections preserve omitted group keys for locked validation", () => {
  const result = MedicalEntryFormSchema.parse({ kind: "MICROCHIP", source: "IN_HOUSE", completedDate: "2026-10-17", chipNumber: "985141000100003", registrationStatus: "REGISTERED" });
  assert.equal(Object.hasOwn(result, "registryName"), false);
  assert.equal(Object.hasOwn(result, "registrationDate"), false);
});
