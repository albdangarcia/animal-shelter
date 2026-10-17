import prisma from "@/app/lib/prisma";
import type { MedicalDocumentType } from "@/prisma/generated/enums";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { medicalDocumentTypesParam } from "../../zod-schemas/medical-document.schemas";
import { calendarDay, shelterDayKey, type CalendarDay } from "../../utils/shelter-day";
import { getShelterSettings, getShelterToday } from "../shelter-settings.data";
import { documentEntryText } from "../../services/medical-document-text";
import {
  findAnimalDocuments,
  findDocumentEntryChoices,
  findDocumentEventNames,
  type DocumentEntryChoice,
  type MedicalDocumentDisplay,
} from "./medical-document";

export type { DocumentEntryChoice, MedicalDocumentDisplay } from "./medical-document";

const parseAnimalId = (animalId: string) => {
  const parsed = cuidSchema.safeParse(animalId);
  if (!parsed.success) {
    throw new Error("Invalid animal ID format.");
  }
  return parsed.data;
};

/** A document as the Documents page lists it. */
export type MedicalDocumentRow = MedicalDocumentDisplay & {
  /** The shelter's day it was uploaded on. */
  uploadedDate: CalendarDay;
  /** The entry it belongs to, as a line reads it: "Heartworm antigen test on
   * Jul 23, 2026". */
  entryLine: string | null;
};

export interface AnimalDocuments {
  /** Newest upload first, voided ones included. */
  documents: MedicalDocumentRow[];
  /** The types the list is filtered to; empty for every type. */
  types: MedicalDocumentType[];
  /** What the entries named in the documents' change histories read as. */
  names: Record<string, string>;
}

const _fetchAnimalDocuments = async (
  animalId: string,
  typesInput?: string | string[],
): Promise<AnimalDocuments> => {
  const id = parseAnimalId(animalId);
  const types = medicalDocumentTypesParam.parse(typesInput);
  try {
    const [documents, { timezone }] = await Promise.all([
      findAnimalDocuments(prisma, id, { types, includeVoided: true }),
      getShelterSettings(),
    ]);
    return {
      documents: documents.map((document) => ({
        ...document,
        uploadedDate: shelterDayKey(document.createdAt, timezone),
        entryLine: document.entry ? documentEntryText(document.entry) : null,
      })),
      types,
      names: await findDocumentEventNames(prisma, documents),
    };
  } catch (error) {
    console.error("Failed to fetch the animal's medical documents:", error);
    throw new Error("Could not fetch the medical documents.");
  }
};

export const fetchAnimalDocuments = RequirePermission(
  AppPermissions.MEDICAL_READ,
)(_fetchAnimalDocuments);

/** What the document form offers for one animal. */
export interface DocumentFormChoices {
  /** The entries a document can be linked to. */
  entries: DocumentEntryChoice[];
  /** A document's day can't be before the animal was born. */
  birthDate: CalendarDay;
  /** Nor after the shelter's today. */
  today: CalendarDay;
}

const _fetchDocumentFormChoices = async (
  animalId: string,
): Promise<DocumentFormChoices> => {
  const id = parseAnimalId(animalId);
  try {
    const [animal, entries, today] = await Promise.all([
      prisma.animal.findUniqueOrThrow({ where: { id }, select: { birthDate: true } }),
      findDocumentEntryChoices(prisma, id),
      getShelterToday(),
    ]);
    return { entries, birthDate: calendarDay(animal.birthDate), today };
  } catch (error) {
    console.error("Failed to fetch the medical document form's choices:", error);
    throw new Error("Could not fetch the medical document form's choices.");
  }
};

export const fetchDocumentFormChoices = RequirePermission(
  AppPermissions.MEDICAL_MANAGE,
)(_fetchDocumentFormChoices);
