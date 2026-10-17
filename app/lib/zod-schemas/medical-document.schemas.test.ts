import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  MedicalDocumentCorrectionSchema,
  MedicalDocumentUploadSchema,
  RemoveMedicalDocumentFileSchema,
  VoidMedicalDocumentSchema,
  medicalDocumentTypesParam,
  type MedicalDocumentUploadInput,
} from "./medical-document.schemas";

const ANIMAL_ID = "ckanimal0000000000000001";
const ENTRY_ID = "ckentry00000000000000001";
const REPORT_ID = "ckreport0000000000000001";

const upload: MedicalDocumentUploadInput = {
  animalId: ANIMAL_ID,
  name: "Heartworm antigen panel",
  type: "LAB_RESULT",
  documentDate: "",
  notes: "",
  entryId: "",
  vetReportId: "",
};

const fieldErrorsOf = (schema: z.ZodType, values: unknown) => {
  const result = schema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
};

test("MedicalDocumentUploadSchema: text is trimmed, and blanks read as none", () => {
  assert.deepEqual(
    MedicalDocumentUploadSchema.parse({
      ...upload,
      name: "  Heartworm antigen panel ",
      documentDate: "2026-10-12",
      notes: "   ",
      entryId: ENTRY_ID,
    }),
    {
      animalId: ANIMAL_ID,
      name: "Heartworm antigen panel",
      type: "LAB_RESULT",
      documentDate: "2026-10-12",
      notes: null,
      entryId: ENTRY_ID,
      vetReportId: null,
    },
  );
  // A form field left out of the request reads as none too.
  const required = { animalId: ANIMAL_ID, name: "Heartworm antigen panel", type: "LAB_RESULT" };
  assert.deepEqual(MedicalDocumentUploadSchema.parse(required), {
    animalId: ANIMAL_ID,
    name: "Heartworm antigen panel",
    type: "LAB_RESULT",
    documentDate: null,
    notes: null,
    entryId: null,
    vetReportId: null,
  });
  assert.equal(
    MedicalDocumentUploadSchema.parse({ ...upload, vetReportId: REPORT_ID }).vetReportId,
    REPORT_ID,
  );
});

test("MedicalDocumentUploadSchema: the name is required and at most 200 characters", () => {
  assert.deepEqual(fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, name: "  " }).name, [
    "Give the document a name.",
  ]);
  assert.deepEqual(
    fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, name: "x".repeat(201) }).name,
    ["The name can't be longer than 200 characters."],
  );
  assert.equal(
    MedicalDocumentUploadSchema.safeParse({ ...upload, name: "x".repeat(200) }).success,
    true,
  );
});

test("MedicalDocumentUploadSchema: the type, the day and the ids", () => {
  assert.deepEqual(fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, type: "" }).type, [
    "Pick the document type.",
  ]);
  assert.deepEqual(
    fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, type: "INVOICE" }).type,
    ["Pick the document type."],
  );
  assert.deepEqual(
    fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, documentDate: "2026-02-30" })
      .documentDate,
    ["The document date isn't a valid date."],
  );
  assert.ok(fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, animalId: "" }).animalId);
  assert.ok(
    fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, entryId: "not an id!" }).entryId,
  );
  assert.ok(
    fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, vetReportId: "../x" }).vetReportId,
  );
  assert.ok(
    fieldErrorsOf(MedicalDocumentUploadSchema, { ...upload, notes: "x".repeat(2001) }).notes,
  );
});

test("MedicalDocumentCorrectionSchema: the upload's fields, without the animal, file or report", () => {
  assert.deepEqual(
    MedicalDocumentCorrectionSchema.parse({
      name: " Dental radiograph ",
      type: "IMAGING",
      documentDate: "",
      notes: "Upper left",
      entryId: "",
      // Keys the correction doesn't take are dropped, never applied.
      animalId: ANIMAL_ID,
      vetReportId: REPORT_ID,
    }),
    {
      name: "Dental radiograph",
      type: "IMAGING",
      documentDate: null,
      notes: "Upper left",
      entryId: null,
    },
  );
  assert.deepEqual(
    fieldErrorsOf(MedicalDocumentCorrectionSchema, {
      name: "",
      type: "IMAGING",
      documentDate: "",
      notes: "",
      entryId: "",
    }).name,
    ["Give the document a name."],
  );
});

test("VoidMedicalDocumentSchema and RemoveMedicalDocumentFileSchema need a reason", () => {
  assert.deepEqual(VoidMedicalDocumentSchema.parse({ reason: "  Wrong animal " }), {
    reason: "Wrong animal",
  });
  assert.deepEqual(fieldErrorsOf(VoidMedicalDocumentSchema, { reason: "  " }).reason, [
    "A reason for voiding this document is required.",
  ]);
  assert.deepEqual(
    RemoveMedicalDocumentFileSchema.parse({ reason: "Holds the owner's bank details" }),
    { reason: "Holds the owner's bank details" },
  );
  assert.deepEqual(fieldErrorsOf(RemoveMedicalDocumentFileSchema, { reason: "" }).reason, [
    "A reason for removing this file is required.",
  ]);
  assert.deepEqual(
    fieldErrorsOf(RemoveMedicalDocumentFileSchema, { reason: "x".repeat(1001) }).reason,
    ["The reason cannot exceed 1000 characters."],
  );
});

test("the type filter reads the types picked, however the URL carries them", () => {
  assert.deepEqual(medicalDocumentTypesParam.parse(undefined), []);
  assert.deepEqual(medicalDocumentTypesParam.parse(""), []);
  assert.deepEqual(medicalDocumentTypesParam.parse("LAB_RESULT"), ["LAB_RESULT"]);
  // The shared filter writes one comma-separated value; a link can repeat it.
  assert.deepEqual(medicalDocumentTypesParam.parse("LAB_RESULT,IMAGING"), [
    "LAB_RESULT",
    "IMAGING",
  ]);
  assert.deepEqual(medicalDocumentTypesParam.parse(["IMAGING", "OTHER,IMAGING"]), [
    "IMAGING",
    "OTHER",
  ]);
  // An unknown type is ignored, not refused.
  assert.deepEqual(medicalDocumentTypesParam.parse("lab_result,X-RAY,VET_RECORD"), [
    "VET_RECORD",
  ]);
});
